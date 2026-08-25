/**
 * Cliente HTTP delgado contra la API de CryptoCapi.
 *
 * Dos reglas del plan mandan sobre el diseño de este archivo:
 *
 * §11.2 — No re-serializar lo que ya vino bien. El cuerpo se conserva **como
 * texto crudo** además de parseado. Los tools devuelven el texto tal como cruzó
 * el cable, porque volver a serializar un float del `math_diagnostics` alcanza
 * para que el `protocol_hash` deje de verificar, y ahí el producto incumple su
 * única promesa. El `data` parseado existe solo para inspeccionar y decidir,
 * nunca para reemitir.
 *
 * §11.5 — La salida es dato sensible. La API key no aparece jamás en un error.
 * El lugar donde siempre se escapa es el mensaje que hace eco de los headers,
 * así que acá los headers de la request no se adjuntan nunca al error.
 */
import { log } from './log.js';
import type { Config } from './config.js';

export interface ApiResponse {
  readonly status: number;
  /** Cuerpo verbatim. Es lo que se reenvía al agente (§11.2). */
  readonly raw: string;
  /** Cuerpo parseado, solo para decidir. `undefined` si no era JSON. */
  readonly data: unknown;
  /**
   * Headers de la RESPUESTA, en minúsculas. Hacen falta para leer `Retry-After`
   * al traducir un 429.
   *
   * Son los de la respuesta y nunca los de la request: esos llevan la API key
   * y no pueden salir de este archivo (§11.5).
   */
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Falla que el tool tiene que traducir a lenguaje de agente (§4.4).
 *
 * Los campos se declaran y asignan a mano en vez de usar *parameter properties*
 * (`constructor(readonly kind: ...)`). No es estilo: el runner de tests es el
 * nativo de Node, que quita los tipos sin transpilar, y esa azúcar sintáctica
 * necesita transformación. Escribirlo así deja los tests corriendo sin sumar un
 * transpilador, que sería una dependencia más (§11.7).
 */
export class ApiRequestError extends Error {
  readonly kind: 'timeout' | 'network' | 'http';
  readonly status: number | undefined;
  readonly body: unknown;

  constructor(message: string, kind: 'timeout' | 'network' | 'http', status?: number, body?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.kind = kind;
    this.status = status;
    this.body = body;
  }
}

export class CryptoCapiClient {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async get(
    path: string,
    query?: Record<string, string | number | undefined>,
    timeoutMs?: number
  ): Promise<ApiResponse> {
    const url = new URL(`${this.config.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return this.send(url, { method: 'GET' }, timeoutMs);
  }

  async post(path: string, body: unknown, timeoutMs?: number): Promise<ApiResponse> {
    return this.send(
      new URL(`${this.config.baseUrl}${path}`),
      { method: 'POST', body: JSON.stringify(body) },
      timeoutMs
    );
  }

  private async send(
    url: URL,
    init: { method: string; body?: string },
    timeoutOverride?: number
  ): Promise<ApiResponse> {
    // Presupuesto de tiempo propio: ninguna espera sin límite (§11.4).
    //
    // El override por tool existe porque no todos los endpoints cuestan lo
    // mismo: los de cuantitativa el backend los sirve en hilos con su propio
    // límite, y cortarlos con el presupuesto de un endpoint de lectura daría un
    // timeout falso. Si el usuario fijó CRYPTOCAPI_TIMEOUT_MS a mano, esa
    // decisión gana sobre el override.
    const budget = this.config.timeoutExplicit
      ? this.config.timeoutMs
      : (timeoutOverride ?? this.config.timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);

    const headers: Record<string, string> = {
      'x-api-key': this.config.apiKey,
      accept: 'application/json',
      'user-agent': 'cryptocapi-mcp',
    };
    if (init.body !== undefined) headers['content-type'] = 'application/json';

    try {
      const response = await fetch(url, {
        method: init.method,
        headers,
        ...(init.body !== undefined ? { body: init.body } : {}),
        signal: controller.signal,
      });

      const raw = await response.text();
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        data = undefined;
      }

      // La URL se loguea sin la key porque la key va en un header, no en la
      // query. Si algún día se moviera a la query, esto la filtraría por stderr.
      log.info(`${init.method} ${url.pathname} -> ${response.status}`);

      // Nombre distinto de los headers de la request a propósito: son los de la
      // RESPUESTA. Confundirlos es como se filtra la API key (§11.5), y de hecho
      // llamarlos igual hacía que este bloque tapara al otro.
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      return { status: response.status, raw, data, headers: responseHeaders };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiRequestError(
          `La API de CryptoCapi no respondió en ${this.config.timeoutMs} ms.`,
          'timeout'
        );
      }
      // Ojo: el mensaje describe la falla, NUNCA la request (§11.5).
      throw new ApiRequestError('No se pudo contactar a la API de CryptoCapi.', 'network');
    } finally {
      clearTimeout(timer);
    }
  }
}
