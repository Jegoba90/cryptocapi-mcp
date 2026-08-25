/**
 * Tests de los tools contra la API falsa (§11.6): sin red, sin API key real y
 * deterministas.
 *
 * El más importante es el de verbatim. El fixture está armado como trampa: lleva
 * `1.50`, `1e2` y un entero mayor que `Number.MAX_SAFE_INTEGER`, tres valores
 * que **no sobreviven** un `JSON.parse` + `JSON.stringify`. Si alguien reemplaza
 * el reenvío de texto por un objeto re-serializado, este test se pone rojo antes
 * de que el `protocol_hash` empiece a fallar en la cara de un usuario.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { startFakeApi, type FakeApi } from './helpers/fake-api.ts';
// Se importa el artefacto CONSTRUIDO, no el fuente: es lo que se publica en npm
// y lo que va a correr en la máquina del usuario. Probar el fuente dejaría sin
// cubrir el paso de compilación.
import { loadConfig } from '../dist/config.js';
import { CryptoCapiClient } from '../dist/http.js';
import { registerTools } from '../dist/tools.js';

const INSIGHT_FIXTURE = readFileSync(
  new URL('./fixtures/insight-alpha.json', import.meta.url),
  'utf8'
);

/** Levanta el servidor con la API falsa detrás y un cliente MCP en memoria. */
async function withServer(
  routes: Parameters<typeof startFakeApi>[0],
  env: Record<string, string> = {}
): Promise<{ client: Client; api: FakeApi; close: () => Promise<void> }> {
  const api = await startFakeApi(routes);
  const config = loadConfig({
    CRYPTOCAPI_API_BASE: `${api.url}/v1`,
    CRYPTOCAPI_API_KEY: 'sk_test_fake',
    ...env,
  } as NodeJS.ProcessEnv);

  const server = new McpServer({ name: 'cryptocapi', version: 'test' });
  registerTools(server, new CryptoCapiClient(config));

  const client = new Client({ name: 'test', version: '0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    api,
    close: async () => {
      await client.close();
      await server.close();
      await api.close();
    },
  };
}

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  const first = content[0];
  assert.ok(first && first.type === 'text', 'el tool tiene que devolver texto');
  return first.text ?? '';
}

test('expone exactamente los siete tools de la superficie', async () => {
  const { client, close } = await withServer({});
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'batch_signals',
      'get_insight',
      'get_macro',
      'get_market_summary',
      'get_prices',
      'get_signal',
      'scan_market',
    ]);
  } finally {
    await close();
  }
});

test('el cuerpo se reenvía verbatim: ni un byte distinto', async () => {
  const { client, close } = await withServer({
    '/v1/market/insights/bitcoin?view=alpha': { status: 200, body: INSIGHT_FIXTURE },
  });
  try {
    const result = await client.callTool({
      name: 'get_insight',
      arguments: { coin_id: 'bitcoin', view: 'alpha' },
    });
    const text = textOf(result);

    // La comprobación fuerte: idéntico byte a byte.
    assert.equal(text, INSIGHT_FIXTURE);

    // Y las tres trampas, por separado, para que el diagnóstico sea obvio
    // cuando esto falle.
    assert.ok(text.includes('1.50'), 're-serializar convierte 1.50 en 1.5');
    assert.ok(text.includes('1e2'), 're-serializar convierte 1e2 en 100');
    assert.ok(
      text.includes('12345678901234567890'),
      're-serializar pierde precisión en enteros grandes'
    );
  } finally {
    await close();
  }
});

test('el protocol_hash de la salida es el mismo que dio la API', async () => {
  const { client, close } = await withServer({
    '/v1/market/insights/bitcoin?view=alpha': { status: 200, body: INSIGHT_FIXTURE },
  });
  try {
    const result = await client.callTool({
      name: 'get_insight',
      arguments: { coin_id: 'bitcoin', view: 'alpha' },
    });

    const fromTool = JSON.parse(textOf(result)) as {
      data: { math_diagnostics: { audit_trail: { protocol_hash: string; seal_type: string } } };
    };
    const fromApi = JSON.parse(INSIGHT_FIXTURE) as typeof fromTool;

    assert.equal(
      fromTool.data.math_diagnostics.audit_trail.protocol_hash,
      fromApi.data.math_diagnostics.audit_trail.protocol_hash
    );
    assert.equal(fromTool.data.math_diagnostics.audit_trail.seal_type, 'process_seal');
  } finally {
    await close();
  }
});

test('la API key viaja por header y nunca en la URL', async () => {
  const { client, api, close } = await withServer({
    '/v1/market/market-summary': { status: 200, body: '{"ok":true}' },
  });
  try {
    await client.callTool({ name: 'get_market_summary', arguments: {} });
    const request = api.received[0];
    assert.ok(request, 'la API falsa tiene que haber recibido algo');
    assert.equal(request.apiKey, 'sk_test_fake');
    assert.ok(
      !request.path.includes('sk_test_fake'),
      'la key en la query terminaría en logs y proxies ajenos'
    );
  } finally {
    await close();
  }
});

test('get_signal manda el par en mayúsculas, get_signal y batch no se confunden', async () => {
  const { client, api, close } = await withServer({
    '/v1/quant/BTCUSDT/signal': { status: 200, body: '{"signal":"hold"}' },
    '/v1/quant/batch': { status: 200, body: '{"results":[]}' },
  });
  try {
    await client.callTool({ name: 'get_signal', arguments: { symbol: 'btcusdt' } });
    await client.callTool({ name: 'batch_signals', arguments: { symbols: ['bitcoin'] } });

    assert.equal(api.received[0]?.path, '/v1/quant/BTCUSDT/signal');
    assert.equal(api.received[1]?.method, 'POST');
    assert.equal(api.received[1]?.body, '{"symbols":["bitcoin"]}');
  } finally {
    await close();
  }
});

test('los argumentos opcionales ausentes no viajan como "undefined"', async () => {
  const { client, api, close } = await withServer({
    '/v1/quant/market-scan': { status: 200, body: '{"results":[]}' },
  });
  try {
    await client.callTool({ name: 'scan_market', arguments: {} });
    const path = api.received[0]?.path ?? '';
    assert.equal(path, '/v1/quant/market-scan');
    assert.ok(!path.includes('undefined'), 'un "undefined" en la query rompe la validación del backend');
  } finally {
    await close();
  }
});

test('un motor que la key no incluye explica qué pase falta, y no reintenta', async () => {
  const { client, close } = await withServer({
    '/v1/quant/market-scan': {
      status: 403,
      body: JSON.stringify({
        status: 'error',
        message: 'Tu plan no incluye este motor.',
        code: 'PRODUCT_NOT_INCLUDED',
        required_product: 'market_scan',
        your_product: 'quant_plus',
      }),
    },
  });
  try {
    const result = await client.callTool({ name: 'scan_market', arguments: {} });
    const text = textOf(result);

    assert.equal((result as { isError?: boolean }).isError, true);
    assert.ok(text.includes('Market Scan'), 'tiene que nombrar el motor que falta');
    assert.ok(text.includes('Quant Plus'), 'y el que la key sí incluye');
    assert.ok(text.includes('No reintentes'), 'el agente no debe insistir con la misma key');
  } finally {
    await close();
  }
});
