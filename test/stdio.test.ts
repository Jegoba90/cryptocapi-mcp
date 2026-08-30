/**
 * stdout es del protocolo y de nadie más (§11.1).
 *
 * Este es el test que más barato paga. En Node el riesgo es mayor que en Go:
 * `console.log` es el reflejo natural, y cualquier dependencia que imprima un
 * banner al arrancar corrompe el stream JSON-RPC. Cuando eso pasa, la sesión
 * muere **sin dejar un error entendible**: el cliente MCP ve JSON inválido y se
 * desconecta, y nadie sabe por qué.
 *
 * Arranca el binario construido de verdad, como proceso hijo, igual que lo haría
 * Claude Code, y falla si stdout lleva un solo byte que no sea protocolo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startFakeApi } from './helpers/fake-api.ts';

const ENTRYPOINT = fileURLToPath(new URL('../dist/index.js', import.meta.url));

const HANDSHAKE = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'get_insight', arguments: { coin_id: 'bitcoin' } },
  },
];

interface Corrida {
  stdout: string;
  stderr: string;
  code: number | null;
}

async function correrServidor(apiBase: string): Promise<Corrida> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRYPOINT], {
      env: {
        ...process.env,
        CRYPTOCAPI_API_BASE: apiBase,
        CRYPTOCAPI_API_KEY: 'sk_test_fake',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));

    for (const mensaje of HANDSHAKE) child.stdin.write(`${JSON.stringify(mensaje)}\n`);
    child.stdin.end();

    // Red de seguridad: si el servidor se cuelga, el test falla por timeout del
    // runner en vez de quedarse esperando para siempre.
    setTimeout(() => child.kill(), 15_000).unref();
  });
}

test('stdout lleva SOLO JSON-RPC, y el diagnóstico sale por stderr', async () => {
  const api = await startFakeApi({
    '/v1/market/market-summary': { status: 200, body: '{"total_market_cap":"1.50"}' },
  });
  try {
    const { stdout, stderr } = await correrServidor(`${api.url}/v1`);

    const lineas = stdout.split('\n').filter((l) => l.trim() !== '');
    assert.ok(lineas.length >= 3, `se esperaban al menos 3 respuestas, llegaron ${lineas.length}`);

    for (const [i, linea] of lineas.entries()) {
      let mensaje: unknown;
      try {
        mensaje = JSON.parse(linea);
      } catch {
        assert.fail(
          `la línea ${i + 1} de stdout no es JSON y corrompe el stream: ${linea.slice(0, 120)}`
        );
      }
      assert.equal(
        (mensaje as { jsonrpc?: string }).jsonrpc,
        '2.0',
        `la línea ${i + 1} de stdout no es un mensaje JSON-RPC`
      );
    }

    // Y la contracara: el diagnóstico existe, pero del otro lado.
    assert.match(stderr, /cryptocapi-mcp/, 'el log de arranque tiene que salir por stderr');
  } finally {
    await api.close();
  }
});

test('el servidor se presenta con la versión publicada, no con una inventada', async () => {
  // La 0.1.0 salió declarando '0.0.0' porque la versión era un literal en
  // index.ts. Todo cliente MCP muestra ese número, así que un reporte de bug no
  // permitía saber qué código corría del otro lado. Este test ata las dos puntas.
  const manifiesto: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  );
  const esperada = (manifiesto as { version: string }).version;

  const { stdout } = await correrServidor('http://127.0.0.1:1/v1');
  const inicializacion = stdout
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as { id?: number; result?: { serverInfo?: { version?: string } } })
    .find((r) => r.id === 1);

  assert.ok(inicializacion, 'el handshake tiene que responder');
  assert.equal(inicializacion.result?.serverInfo?.version, esperada);
  assert.notEqual(esperada, '0.0.0', 'el manifiesto no puede quedar en la versión de plantilla');
});

test('el servidor arranca aunque la API esté caída: el fallo es del tool, no del proceso', async () => {
  // Puerto cerrado a propósito. Un servidor MCP que muere al arrancar porque su
  // API no responde deja al usuario sin ninguna herramienta y sin explicación.
  const { stdout } = await correrServidor('http://127.0.0.1:1/v1');

  const lineas = stdout.split('\n').filter((l) => l.trim() !== '');
  const respuestas = lineas.map((l) => JSON.parse(l) as { id?: number; result?: unknown });

  assert.ok(
    respuestas.some((r) => r.id === 2 && r.result),
    'tools/list tiene que responder aunque la API no conteste'
  );

  const llamada = respuestas.find((r) => r.id === 3);
  assert.ok(llamada, 'tools/call tiene que responder, con error adentro y no cayéndose');
  const resultado = llamada.result as { isError?: boolean; content: { text: string }[] };
  assert.equal(resultado.isError, true);
  assert.match(resultado.content[0]?.text ?? '', /No es un problema de la API key/);
});
