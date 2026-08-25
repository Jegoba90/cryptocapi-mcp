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
}

/** Falla que el tool tiene que traducir a lenguaje de agente (§4.4). */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'network' | 'http',
    readonly status?: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export class CryptoCapiClient {
  constructor(private readonly config: Config) {}

  async get(path: string, query?: Record<string, string | number | undefined>): Promise<ApiResponse> {
    const url = new URL(`${this.config.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return this.send(url, { method: 'GET' });
  }

  async post(path: string, body: unknown): Promise<ApiResponse> {
    return this.send(new URL(`${this.config.baseUrl}${path}`), {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async send(url: URL, init: { method: string; body?: string }): Promise<ApiResponse> {
    // Presupuesto de tiempo propio: ninguna espera sin límite (§11.4).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

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

      return { status: response.status, raw, data };
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
