/**
 * API falsa, local y en memoria.
 *
 * Los tests no le pegan a la API viva (§11.6): el CI tiene que ser determinista
 * y correr sin red ni API key. Esto levanta un `node:http` en un puerto
 * efímero y se le apunta el paquete con `CRYPTOCAPI_API_BASE`, así que ejercita
 * el camino HTTP real en vez de parchear `fetch`.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeRoute {
  status: number;
  /** Cuerpo **como texto**, no como objeto: los tests de verbatim comparan bytes. */
  body: string;
  headers?: Record<string, string>;
}

export interface FakeApi {
  url: string;
  /** Requests recibidas, para comprobar qué mandó el cliente. */
  received: { method: string; path: string; apiKey: string | undefined; body: string }[];
  close: () => Promise<void>;
}

export async function startFakeApi(routes: Record<string, FakeRoute>): Promise<FakeApi> {
  const received: FakeApi['received'] = [];

  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += String(chunk)));
    req.on('end', () => {
      const path = req.url ?? '';
      const apiKey = req.headers['x-api-key'];
      received.push({
        method: req.method ?? '',
        path,
        apiKey: typeof apiKey === 'string' ? apiKey : undefined,
        body,
      });

      const route = routes[path] ?? routes['*'];
      if (!route) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: `ruta no simulada: ${path}` }));
        return;
      }
      res.writeHead(route.status, { 'content-type': 'application/json', ...route.headers });
      res.end(route.body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
