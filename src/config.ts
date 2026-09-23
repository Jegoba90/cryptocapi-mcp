/**
 * Configuración por entorno. Sin archivos ni flags: el `mcp.json` del usuario
 * es la única fuente (plan §4.3).
 */

/** Key pública del repo open source. Sirve Radar Alpha solo para BTC y ETH. */
export const DEMO_API_KEY = 'demo_btc_eth_public';

const DEFAULT_BASE_URL = 'https://api.cryptocapi.com/v1';

/** Presupuesto por request. Ninguna espera es infinita (plan §11.4). */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Techo del presupuesto: el entero de 32 bits con signo, que es el maximo que
 * admite `setTimeout`.
 *
 * Pasarse no da un timer mas largo: Node lo fija en **1 ms** y escupe un
 * `TimeoutOverflowWarning`. O sea que quien pedia el presupuesto mas grande
 * posible obtenia el mas chico. Medido con 2147483648 (~24,8 dias): abortaba a
 * los 5 ms informando que habia esperado 25 dias.
 *
 * Es la misma clase de fallo que el mensaje de timeout corregido en la 0.2.4: el
 * numero que rige no es el que el usuario cree. Acá se corta en el borde real en
 * vez de dejar que la plataforma lo convierta en su opuesto.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface Config {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
  /**
   * true si el usuario fijó `CRYPTOCAPI_TIMEOUT_MS` a mano. Cuando lo hizo, su
   * número manda sobre el presupuesto que cada tool pide para sí: quien toca esa
   * variable está diciendo algo sobre SU red, y no corresponde ignorarlo.
   */
  readonly timeoutExplicit: boolean;
  /** true cuando el usuario no puso key y caímos en la demo pública. */
  readonly usingDemoKey: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env['CRYPTOCAPI_API_KEY']?.trim() || DEMO_API_KEY;

  // `CRYPTOCAPI_API_BASE` existe para desarrollo y para los tests contra
  // fixtures. No hay rama de mock adentro del paquete, igual que el backend
  // resuelve el stub de PayPal solo por configuración.
  const baseUrl = env['CRYPTOCAPI_API_BASE']?.trim() || DEFAULT_BASE_URL;

  const rawTimeout = Number(env['CRYPTOCAPI_TIMEOUT_MS']);
  const timeoutExplicit = Number.isFinite(rawTimeout) && rawTimeout > 0;
  // El clamp va acá y no en el `setTimeout`: así el numero que se informa en el
  // mensaje de error es el mismo que rige, que es la promesa que se arreglo en la
  // 0.2.4. Clampear mas abajo la volveria a romper.
  const timeoutMs = timeoutExplicit
    ? Math.min(rawTimeout, MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    timeoutMs,
    timeoutExplicit,
    usingDemoKey: apiKey === DEMO_API_KEY,
  };
}
