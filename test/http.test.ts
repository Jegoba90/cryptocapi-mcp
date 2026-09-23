/**
 * El presupuesto de tiempo (§11.4), que es lo único que el paquete promete
 * sobre la espera.
 *
 * Hasta la 0.2.3 el mensaje de timeout informaba SIEMPRE el default de 15 000 ms
 * aunque el corte lo hubiera hecho el presupuesto del tool: `scan_market`
 * abortaba a los 45 000 ms y decía 15 000. Como los cuatro tools pasan su propio
 * presupuesto, el número estaba mal en los cuatro casos, siempre.
 *
 * Y el número no era el daño. `explainRequestError` invita a ampliar con
 * CRYPTOCAPI_TIMEOUT_MS, pero esa variable REEMPLAZA el presupuesto de todas las
 * herramientas en vez de sumarse: quien leía 15 000 y ponía 30 000 creyendo que
 * duplicaba, recortaba `scan_market` de 45 000 a 30 000. El consejo se volvía en
 * contra de quien lo seguía.
 *
 * Nada de esto tenía cobertura: el único test de timeout construía el error a
 * mano y nunca pasaba por `http.ts`. Por eso estos van contra el cliente de
 * verdad, con el `AbortController` real y una ruta que no contesta nunca.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startFakeApi } from './helpers/fake-api.ts';
import { loadConfig } from '../dist/config.js';
import { CryptoCapiClient, ApiRequestError } from '../dist/http.js';

/** Presupuestos chicos para que el test tarde milisegundos y no 45 segundos. */
const CORTO_MS = 300;

function clienteContra(url: string, env: Record<string, string> = {}): CryptoCapiClient {
  return new CryptoCapiClient(
    loadConfig({
      CRYPTOCAPI_API_BASE: `${url}/v1`,
      CRYPTOCAPI_API_KEY: 'sk_test_fake',
      ...env,
    } as NodeJS.ProcessEnv)
  );
}

async function fallo(llamada: () => Promise<unknown>): Promise<ApiRequestError> {
  try {
    await llamada();
  } catch (error: unknown) {
    assert.ok(error instanceof ApiRequestError, 'se esperaba un ApiRequestError');
    return error;
  }
  assert.fail('se esperaba un timeout y la llamada resolvió');
}

test('el timeout informa el presupuesto que cortó, no el default del paquete', async () => {
  const api = await startFakeApi({ '/v1/quant/market-scan': { hang: true } });
  try {
    const empezo = Date.now();
    const error = await fallo(() =>
      clienteContra(api.url).get('/quant/market-scan', undefined, CORTO_MS)
    );
    const tardo = Date.now() - empezo;

    assert.equal(error.kind, 'timeout');
    assert.ok(tardo < 5_000, `tardó ${tardo} ms: el presupuesto del tool ni se aplicó`);

    // El corazón del asunto: el número informado es el que de verdad cortó.
    assert.match(error.message, /300 ms/);
    assert.doesNotMatch(
      error.message,
      /15000|15 000/,
      'informar el default manda al usuario a "ampliar" con un número que en realidad recorta'
    );
  } finally {
    await api.close();
  }
});

test('CRYPTOCAPI_TIMEOUT_MS gana sobre el presupuesto del tool, y el mensaje dice ese número', async () => {
  const api = await startFakeApi({ '/v1/quant/market-scan': { hang: true } });
  try {
    // El tool pide 45 000 y el usuario dijo 250. Manda el usuario: tocar esa
    // variable es decir algo sobre SU red, y no corresponde ignorarlo. Esta
    // precedencia estaba documentada en config.ts y no la probaba nadie.
    const error = await fallo(() =>
      clienteContra(api.url, { CRYPTOCAPI_TIMEOUT_MS: '250' }).get(
        '/quant/market-scan',
        undefined,
        45_000
      )
    );

    assert.equal(error.kind, 'timeout');
    assert.match(error.message, /250 ms/);
    assert.doesNotMatch(error.message, /45000|45 000/, 'el override del tool no puede pisar al usuario');
  } finally {
    await api.close();
  }
});

test('sin override ni variable, el timeout es el default y lo dice', async () => {
  const api = await startFakeApi({ '/v1/market/insights/bitcoin': { hang: true } });
  try {
    const error = await fallo(() =>
      clienteContra(api.url, { CRYPTOCAPI_TIMEOUT_MS: '200' }).get('/market/insights/bitcoin')
    );
    assert.match(error.message, /200 ms/);
  } finally {
    await api.close();
  }
});

test('una ruta que contesta no se ve afectada por el presupuesto', async () => {
  // La contracara: al arreglar el mensaje no se puede haber roto el camino
  // feliz ni el reenvío verbatim, que es la promesa del producto.
  const api = await startFakeApi({
    '/v1/market/insights/bitcoin': { status: 200, body: '{"data":{"x":1.50}}' },
  });
  try {
    const respuesta = await clienteContra(api.url).get('/market/insights/bitcoin', undefined, CORTO_MS);
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.raw, '{"data":{"x":1.50}}');
  } finally {
    await api.close();
  }
});

test('un CRYPTOCAPI_TIMEOUT_MS que desborda 32 bits se corta en el maximo real', async () => {
  // Pasarse del entero de 32 bits no da un timer mas largo: Node lo fija en 1 ms
  // y avisa con TimeoutOverflowWarning. Quien pedia el presupuesto mas grande
  // posible obtenia el mas chico, y el mensaje le decia que habia esperado 25 dias.
  const cfg = loadConfig({
    CRYPTOCAPI_API_KEY: 'sk_test_fake',
    CRYPTOCAPI_TIMEOUT_MS: '2147483648',
  });
  assert.equal(cfg.timeoutMs, 2_147_483_647, 'el presupuesto se corta en el borde de setTimeout');
  assert.equal(cfg.timeoutExplicit, true, 'sigue siendo una decision del usuario');
});

test('un CRYPTOCAPI_TIMEOUT_MS normal no se toca', () => {
  assert.equal(loadConfig({ CRYPTOCAPI_TIMEOUT_MS: '30000' }).timeoutMs, 30_000);
  assert.equal(loadConfig({}).timeoutMs, 15_000);
});
