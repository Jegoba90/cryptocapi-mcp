/**
 * Los cuatro tools de la superficie MCP: uno por motor.
 *
 * Eran siete hasta el 2026-08-30. Los tres retirados devolvían dato de terceros
 * y el motivo está escrito en `registerTools`, donde vivían.
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
  // Acá vivían `get_market_summary`, `get_prices` y `get_macro`, retirados el
  // 2026-08-30. Devolvían dato de terceros: capitalización y miedo y codicia,
  // precios de CoinGecko, y series macro de FRED. CryptoCapi no es un agregador:
  // sus motores firman inteligencia derivada y el dato ajeno es insumo interno.
  // Con siete herramientas, un agente que preguntaba «¿cómo está el mercado?»
  // agarraba `get_market_summary` y se iba con dato de terceros sin tocar un
  // motor. Con cuatro, todas llevan a lo que el producto vende.
  //
  // El argumento para tenerlos era que la primera sesión sin API key no fuera
  // una pared. Ese argumento sigue cubierto sin ellos: `get_insight` en vista
  // `pulse` responde sin credencial, y es una puerta mejor, porque lo que
  // devuelve es un motor propio y no el precio de CoinGecko.
  //
  // Los endpoints siguen existiendo en la API REST para el front y para quien
  // los integre; lo que se retira es que el agente los vea como herramientas.
  // ---------------------------------------------------------------------------

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
        'alpha funciona solo para bitcoin y ethereum. ' +
        'Al leer la respuesta: `z_score` mide el MOVIMIENTO de hoy contra los movimientos ' +
        'pasados, y la posición en Bandas de Bollinger mide el NIVEL de precio contra su ' +
        'rango. Son ejes distintos: precio en el tercio superior con z_score negativo no es ' +
        'una contradicción, es un nivel alto que hoy cayó fuerte. No las mezcles en una sola ' +
        'frase. ' +
        'Si la moneda todavía no tiene análisis, la respuesta es ' +
        '`{"status":"success","data":null}`: no es un error ni un fallo de la ' +
        'consulta, es que ningún motor calculó nada para ese activo. Decilo así, ' +
        '«no hay análisis disponible», y no completes el hueco por tu cuenta.',
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
        'Quant Plus, con una excepción: con la key pública de demostración funciona para ' +
        'bitcoin y ethereum, igual que get_insight. Ojo con el formato: acá van ' +
        'identificadores de moneda ("bitcoin"), ' +
        'no pares de trading, al revés que en get_signal. Solo un universo curado tiene ' +
        'señal, bastante más chico que el conjunto de activos que CryptoCapi sigue: un ' +
        'activo fuera de él vuelve con `available: false`, y eso es la respuesta ' +
        'correcta, no un error.',
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
        'bastante más chico que el conjunto de activos que CryptoCapi sigue, así que ' +
        'pedir 50 puede devolver bastante menos. Eso no es un fallo.',
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
