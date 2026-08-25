/**
 * Mapeo de errores a lenguaje de agente (§4.4).
 *
 * El bloque que más importa es el de las dos formas del cuerpo: hasta que el
 * commit `e21dc4c2` esté desplegado, producción sigue mandando el objeto
 * estructurado serializado adentro de `message`. Escribir el tool solo contra la
 * forma nueva ya rompió una vez el caso de la moneda restringida.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainHttpError, explainRequestError } from '../dist/errors.js';
import { ApiRequestError, type ApiResponse } from '../dist/http.js';

function response(status: number, body: unknown, headers: Record<string, string> = {}): ApiResponse {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = undefined;
  }
  return { status, raw, data, headers };
}

test('401 dice cómo conseguir una key y menciona la pública', () => {
  const text = explainHttpError(response(401, { status: 'error', message: 'Unauthorized' }));
  assert.match(text, /CRYPTOCAPI_API_KEY/);
  assert.match(text, /demo_btc_eth_public/);
  assert.match(text, /cryptocapi\.com/);
});

test('403 por motor faltante nombra el que falta y el que hay', () => {
  const text = explainHttpError(
    response(403, {
      status: 'error',
      message: 'no incluido',
      code: 'PRODUCT_NOT_INCLUDED',
      required_product: 'quant',
      your_product: 'alpha',
    })
  );
  assert.match(text, /Quant Pro/);
  assert.match(text, /Radar Alpha/);
  assert.match(text, /No reintentes/);
});

test('un producto desconocido no rompe el mensaje, se muestra tal cual', () => {
  const text = explainHttpError(
    response(403, {
      status: 'error',
      message: 'no incluido',
      code: 'PRODUCT_NOT_INCLUDED',
      required_product: 'motor_del_futuro',
    })
  );
  assert.match(text, /motor_del_futuro/);
});

test('403 de moneda restringida habla de la moneda, no del plan', () => {
  const text = explainHttpError(
    response(403, {
      status: 'error',
      message: 'The public demo key only supports bitcoin and ethereum.',
      code: 'DEMO_COIN_RESTRICTED',
    })
  );
  assert.match(text, /bitcoin y ethereum/);
  assert.ok(
    !/cuantitativa/.test(text),
    'el problema es la moneda; hablar de motores manda al agente por el camino equivocado'
  );
});

test('entiende la forma VIEJA: el code serializado adentro de message', () => {
  // Es lo que devuelve api.cryptocapi.com hasta que se despliegue e21dc4c2.
  const text = explainHttpError(
    response(403, {
      status: 'error',
      message: JSON.stringify({
        code: 'DEMO_COIN_RESTRICTED',
        message: 'The public demo key only supports bitcoin and ethereum.',
      }),
    })
  );
  assert.match(text, /bitcoin y ethereum/);
  assert.ok(!/cuantitativa/.test(text), 'la forma vieja tiene que dar el MISMO mensaje que la nueva');
});

test('la forma vieja también resuelve el motor faltante', () => {
  const text = explainHttpError(
    response(403, {
      status: 'error',
      message: JSON.stringify({
        code: 'PRODUCT_NOT_INCLUDED',
        message: 'no incluido',
        required_product: 'market_scan',
        your_product: 'quant_plus',
      }),
    })
  );
  assert.match(text, /Market Scan/);
  assert.match(text, /Quant Plus/);
});

test('un message que es texto común no se intenta desanidar', () => {
  const text = explainHttpError(
    response(403, { status: 'error', message: 'Quantitative signals require a PRO plan.' })
  );
  assert.match(text, /Quantitative signals require a PRO plan/);
});

test('429 dice cuántos segundos esperar y desalienta el bucle', () => {
  const text = explainHttpError(
    response(429, { status: 'error', message: 'Too Many Requests' }, { 'retry-after': '42' })
  );
  assert.match(text, /42 segundos/);
  assert.match(text, /No reintentes en bucle/);
});

test('429 sin Retry-After sigue siendo accionable', () => {
  const text = explainHttpError(response(429, { status: 'error', message: 'Too Many Requests' }));
  assert.match(text, /un momento/);
});

test('5xx aclara que no es culpa de la key ni de los argumentos', () => {
  const text = explainHttpError(response(503, 'no soy json'));
  assert.match(text, /error interno/);
  assert.match(text, /No es un problema de la key/);
});

test('el timeout apunta a la variable que lo controla', () => {
  const text = explainRequestError(new ApiRequestError('tardó demasiado', 'timeout'));
  assert.match(text, /CRYPTOCAPI_TIMEOUT_MS/);
});

test('ningún mensaje de error filtra la API key', () => {
  // §11.5: la salida del tool termina en el contexto del agente y en el
  // transcript del usuario. El lugar por donde se escapa es siempre el mensaje
  // que hace eco de la request.
  const secret = 'sk_live_deadbeef.supersecreto';
  const casos = [
    explainHttpError(response(401, { status: 'error', message: 'Unauthorized' })),
    explainHttpError(response(403, { status: 'error', message: 'nope', code: 'PRODUCT_NOT_INCLUDED' })),
    explainHttpError(response(429, { status: 'error', message: 'slow down' })),
    explainHttpError(response(500, { status: 'error', message: 'boom' })),
    explainRequestError(new ApiRequestError('cayó', 'network')),
    explainRequestError(new ApiRequestError('tardó', 'timeout')),
  ];
  for (const texto of casos) {
    assert.ok(!texto.includes(secret), 'un mensaje de error no puede contener la API key');
    assert.ok(!texto.includes('sk_live_'), 'ni siquiera el prefijo de una key');
  }
});
