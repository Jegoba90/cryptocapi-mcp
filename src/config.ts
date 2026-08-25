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
  const timeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_TIMEOUT_MS;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    timeoutMs,
    usingDemoKey: apiKey === DEMO_API_KEY,
  };
}
