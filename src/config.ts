/**
 * Configuración por entorno. Sin archivos ni flags: el `mcp.json` del usuario
 * es la única fuente (plan §4.3).
 */

/** Key pública del repo open source. Sirve Radar Alpha solo para BTC y ETH. */
export const DEMO_API_KEY = 'demo_btc_eth_public';

const DEFAULT_BASE_URL = 'https://api.cryptocapi.com/v1';

/** Presupuesto por request. Ninguna espera es infinita (plan §11.4). */
const DEFAULT_TIMEOUT_MS = 15_000;

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
  const timeoutMs = timeoutExplicit ? rawTimeout : DEFAULT_TIMEOUT_MS;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    timeoutMs,
    timeoutExplicit,
    usingDemoKey: apiKey === DEMO_API_KEY,
  };
}
