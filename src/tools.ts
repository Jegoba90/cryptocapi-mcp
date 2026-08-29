/**
 * Los siete tools de la superficie MCP (plan §4.1).
 *
 * Tres decisiones de diseño que atraviesan todo el archivo:
 *
 * 1. **No son 1:1 con los endpoints.** Se modelan para el agente, y eso incluye
 *    absorber las trampas de formato de la API, que son la causa más probable de
 *    que un agente falle: `get_signal` toma un par de trading (`BTCUSDT`) y
 *    `batch_signals` toma identificadores de moneda (`bitcoin`). Mismo motor,
 *    formatos distintos. Los input schemas lo dicen en el texto de cada campo.
 *
 * 2. **La descripción nombra el motor que hace falta, no «PRO»** (§5.1). Desde
 *    el entitlement por motor, una key paga abre UNO de los tres tools de quant.
 *    Decir «requiere PRO» haría que el agente intente los tres teniendo uno solo,
 *    que es exactamente el fallo que esto quiere evitar.
 *
 * 3. **La respuesta se reenvía verbatim** (§11.2). Se manda `response.raw`, el
 *    texto tal como cruzó el cable, nunca un objeto re-serializado: reformatear
 *    un float del `math_diagnostics` alcanza para que el `protocol_hash` deje de
 *    verificar, y ahí el producto incumple su única promesa.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CryptoCapiClient, ApiRequestError, type ApiResponse } from './http.js';
import { explainHttpError, explainRequestError } from './errors.js';

/**
 * Presupuestos de tiempo por tool (§11.4).
 *
 * No todos los endpoints cuestan lo mismo: los de cuantitativa el backend los
 * sirve en hilos con su propio límite, así que cortarlos con el presupuesto de
 * una lectura daría un timeout falso y el agente concluiría que la API está
 * caída cuando en realidad estaba trabajando.
 *
 * Un usuario que fija `CRYPTOCAPI_TIMEOUT_MS` gana sobre esto: está diciendo
 * algo sobre su propia red y no corresponde ignorarlo.
 */
const BUDGET_MS = {
  /** Lecturas de tablas ya calculadas. */
  lectura: 10_000,
  /** Un motor, un activo. */
  motor: 20_000,
  /** Varios activos, o un recorrido del mercado entero. */
  motorPesado: 45_000,
} as const;

/**
 * Envuelve una llamada a la API en el contrato de salida del tool.
 *
 * Éxito: el cuerpo verbatim y nada más. Error: el texto traducido, nunca el
 * cuerpo crudo, porque un 403 sin explicar es lo que dispara la alucinación.
 */
async function respond(call: () => Promise<ApiResponse>): Promise<CallToolResult> {
  try {
    const response = await call();
    if (response.status >= 400) {
      return { content: [{ type: 'text', text: explainHttpError(response) }], isError: true };
    }
    return { content: [{ type: 'text', text: response.raw }] };
  } catch (error: unknown) {
    if (error instanceof ApiRequestError) {
      return { content: [{ type: 'text', text: explainRequestError(error) }], isError: true };
    }
    throw error;
  }
}

export function registerTools(server: McpServer, client: CryptoCapiClient): void {
  // ---------------------------------------------------------------------------
  // Públicos: responden sin API key. Son los que hacen que la primera sesión no
  // sea una pared (§5).
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_market_summary',
    {
      title: 'Resumen de mercado',
      description:
        'Resumen del mercado cripto: capitalización total, volumen de 24 horas, dominancia ' +
        'de Bitcoin y Ethereum e índice de miedo y codicia. Endpoint público: no requiere ' +
        'plan ni API key.',
      inputSchema: {},
    },
    async () => respond(() => client.get('/market/market-summary', undefined, BUDGET_MS.lectura))
  );

  server.registerTool(
    'get_prices',
    {
      title: 'Precios más recientes',
      description:
        'Últimos precios registrados de los activos que sigue CryptoCapi, ordenados por ' +
        'capitalización. Endpoint público: no requiere plan ni API key. Ojo: sin `limit` ' +
        'NO llega el universo entero, sino los primeros de la lista. Para saber cuántos ' +
        'activos se siguen hay que pedir un límite alto y contar lo que vuelve.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(250)
          .optional()
          .describe(
            'Cuántos activos devolver. Omitirlo NO los trae todos: la API responde con 50. ' +
              'Pedir 250 para el universo completo.'
          ),
      },
    },
    async ({ limit }) => respond(() => client.get('/market/prices/latest', { limit }, BUDGET_MS.lectura))
  );

  server.registerTool(
    'get_macro',
    {
      title: 'Indicadores macroeconómicos',
      description:
        'Indicadores macro que el motor usa como contexto: inflación, tasas y series ' +
        'relacionadas. Endpoint público: no requiere plan ni API key.',
      inputSchema: {},
    },
    async () => respond(() => client.get('/market/macro', undefined, BUDGET_MS.lectura))
  );

  // ---------------------------------------------------------------------------
  // Radar: la vista pulse es libre; alpha es la que trae el sello y exige pase.
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_insight',
    {
      title: 'Análisis de un activo',
      description:
        'Análisis de un activo con el motor determinista de CryptoCapi. La vista "pulse" ' +
        'es de acceso libre. La vista "alpha" trae el análisis profundo con el audit_trail ' +
        'y su protocol_hash, que es el sello del cálculo, y requiere el pase Radar Alpha ' +
        '(o Quant Plus si se pide engine="quant_plus"). Con la key pública de demostración, ' +
        'alpha funciona solo para bitcoin y ethereum.',
      inputSchema: {
        coin_id: z
          .string()
          .min(1)
          .describe('Identificador de la moneda, en minúsculas: "bitcoin", "ethereum", "solana".'),
        view: z
          .enum(['pulse', 'alpha'])
          .optional()
          .describe('"pulse" es libre; "alpha" trae el sello y requiere pase. Por defecto "pulse".'),
        engine: z
          .enum(['radar', 'quant_plus'])
          .optional()
          .describe('Motor que firma el análisis. Por defecto "radar".'),
      },
    },
    async ({ coin_id, view, engine }) =>
      respond(() => client.get(`/market/insights/${encodeURIComponent(coin_id)}`, { view, engine }, BUDGET_MS.motor))
  );

  // ---------------------------------------------------------------------------
  // Cuantitativa: cada ruta exige SU motor. Tener uno no habilita los otros.
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_signal',
    {
      title: 'Señal de Quant Pro',
      description:
        'Señal cuantitativa para un par de trading. Requiere el pase Quant Pro: ningún otro ' +
        'motor lo habilita. Ojo con el formato, que no es el mismo que en las otras ' +
        'herramientas: acá va el par ("BTCUSDT"), no el identificador de moneda ("bitcoin").',
      inputSchema: {
        symbol: z
          .string()
          .min(2)
          .max(20)
          .describe('Par de trading, por ejemplo "BTCUSDT" o "ETHUSDT". No "bitcoin".'),
      },
    },
    async ({ symbol }) =>
      respond(() => client.get(`/quant/${encodeURIComponent(symbol.toUpperCase())}/signal`, undefined, BUDGET_MS.motor))
  );

  server.registerTool(
    'batch_signals',
    {
      title: 'Señales de Quant Plus en lote',
      description:
        'Señales de Quant Plus para varios activos en una sola llamada. Requiere el pase ' +
        'Quant Plus. Ojo con el formato: acá van identificadores de moneda ("bitcoin"), ' +
        'no pares de trading, al revés que en get_signal. Solo un universo curado tiene ' +
        'señal, mucho más chico que el listado de precios: un activo fuera de él vuelve ' +
        'con `available: false`, y eso es la respuesta correcta, no un error.',
      inputSchema: {
        symbols: z
          .array(z.string().min(1).max(20))
          .min(1)
          .max(50)
          .describe(
            'Identificadores de moneda, de 1 a 50: ["bitcoin", "ethereum"]. El tope de 50 ' +
              'es del pedido, no de las señales disponibles.'
          ),
      },
    },
    async ({ symbols }) => respond(() => client.post('/quant/batch', { symbols }, BUDGET_MS.motorPesado))
  );

  server.registerTool(
    'scan_market',
    {
      title: 'Ranking de Market Scan',
      description:
        'Recorre el mercado y devuelve los activos mejor rankeados según una estrategia. ' +
        'Requiere el pase Market Scan, que se vende aparte de Quant Plus aunque el ranking ' +
        'se arme sobre sus señales. El ranking cubre el universo curado de Quant Plus, ' +
        'mucho más chico que el listado de precios, así que pedir 50 puede devolver ' +
        'bastante menos. Eso no es un fallo.',
      inputSchema: {
        strategy: z
          .enum(['balanced', 'aggressive', 'conservative'])
          .optional()
          .describe('Perfil del ranking. Por defecto "balanced".'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe(
            'Cuántos activos devolver, de 1 a 50. Por defecto 10. Es un techo del pedido: ' +
              'si el universo rankeado es menor, vuelven menos.'
          ),
      },
    },
    async ({ strategy, limit }) =>
      respond(() => client.get('/quant/market-scan', { strategy, limit }, BUDGET_MS.motorPesado))
  );
}
