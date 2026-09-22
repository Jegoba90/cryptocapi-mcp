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

test('403 por pase vencido manda a renovar, no a comprar', () => {
  const text = explainHttpError(
    response(403, {
      status: 'error',
      message: "Your 'quant' pass is no longer active.",
      code: 'PRODUCT_NOT_ACTIVE',
      required_product: 'quant',
      your_product: 'quant',
    })
  );
  assert.match(text, /Quant Pro/);
  assert.match(text, /renovar/);
  // El punto entero de separar este código del de motor no incluido: a un
  // cliente que pagó no se le puede decir que nunca compró el motor.
  assert.ok(
    !/no lo incluye|no incluye/.test(text),
    'la key SÍ compró este motor; negarlo es falso y lo manda a comprar de nuevo'
  );
});

test('403 de key inválida habla de la key, no de planes ni de motores', () => {
  // La API devuelve esto como 403 y no como 401, así que cae en el fallback.
  // Antes el fallback hablaba de motores de cuantitativa y el agente le decía
  // al usuario "no tenés el plan" cuando la key estaba mal copiada.
  for (const message of ['Invalid API Key', 'API Key is revoked or inactive']) {
    const text = explainHttpError(response(403, { status: 'error', message }));
    assert.match(text, /CRYPTOCAPI_API_KEY/);
    // Descartar el plan explícitamente vale más que callarlo: el agente lo lee
    // y deja de ofrecerle una compra a alguien que copió mal la key.
    assert.match(text, /no el plan/);
    assert.ok(
      !/cuantitativa|no habilita esta herramienta/i.test(text),
      `"${message}" no es un problema de motores: atribuirlo manda al usuario a comprar de gusto`
    );
  }
});

test('403 desconocido no inventa una causa', () => {
  const text = explainHttpError(response(403, { status: 'error', message: 'Forbidden' }));
  // Sin `code` y sin pistas en el texto, lo único honesto es decir que no se
  // pudo y que reintentar igual no ayuda.
  assert.match(text, /reintentar/i);
  assert.ok(
    !/cuantitativa/.test(text),
    'no se puede atribuir a los motores de pago un 403 que no dijo por qué'
  );
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

test('el timeout apunta a la variable, y avisa que REEMPLAZA en vez de sumarse', () => {
  // El mensaje llega con el presupuesto que de verdad cortó (ver http.test.ts).
  const text = explainRequestError(
    new ApiRequestError('La API de CryptoCapi no respondió en 45000 ms.', 'timeout')
  );
  assert.match(text, /CRYPTOCAPI_TIMEOUT_MS/);
  assert.match(text, /45000 ms/, "el consejo no sirve sin el número contra el que compararse");

  // Sin este aviso el consejo se vuelve en contra: la variable pisa el
  // presupuesto de las cuatro herramientas, así que quien lee "45000 ms" y pone
  // 30000 creyendo que amplía, en realidad recorta.
  assert.match(text, /REEMPLAZA/);
  assert.match(text, /por encima/);
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

/**
 * El `code` viaja en el texto (§3.15 de CORRECCIONES_ABIERTAS).
 *
 * `llms.txt` le dice al agente «branch on `code`, not on the prose». Por el
 * camino REST el código está plano en el cuerpo; por MCP, hasta la 0.2.0, no
 * estaba en ninguna parte: el cliente lo leía para elegir la explicación y
 * después lo descartaba, así que la instrucción del manifiesto era imposible de
 * cumplir desde un agente MCP. La prosa se puede reescribir sin aviso; el código
 * es el contrato.
 */
test('cada 403 con código lo publica al final, para que el agente ramifique', () => {
  const casos = [
    { code: 'PRODUCT_NOT_INCLUDED', required_product: 'quant_plus' },
    { code: 'PRODUCT_NOT_ACTIVE', required_product: 'quant', your_product: 'quant' },
    { code: 'DEMO_COIN_RESTRICTED' },
  ];
  for (const caso of casos) {
    const text = explainHttpError(response(403, { status: 'error', message: 'x', ...caso }));
    assert.match(text, new RegExp(`code: ${caso.code}$`), `falta el code en ${caso.code}`);
  }
});

// El código se agrega, no reemplaza: la explicación en prosa es lo que el agente
// le muestra a la persona, y perderla para ganar un token sería un mal negocio.
test('el código se suma a la explicación, no la reemplaza', () => {
  const text = explainHttpError(
    response(403, {
      status: 'error',
      message: 'no incluido',
      code: 'PRODUCT_NOT_INCLUDED',
      required_product: 'market_scan',
    })
  );
  assert.match(text, /Market Scan/);
  assert.match(text, /No reintentes/);
  assert.match(text, /code: PRODUCT_NOT_INCLUDED$/);
});

// Un 403 sin código no debe inventarse uno: si la API no lo mandó, el agente
// tiene que ver que no lo hay, no un `code: undefined` que parezca un valor.
test('un error sin código no inventa la línea', () => {
  const text = explainHttpError(response(403, { status: 'error', message: 'Forbidden' }));
  assert.doesNotMatch(text, /code:/);
});

// ===========================================================================
// Tolerancia de lectura del cuerpo de error.
//
// El `code` es lo único que el agente puede comparar sin adivinar: `llms.txt` le
// dice «branch on `code`, not on the prose». Hasta la 0.2.3 el schema exigía
// `status: "error"` y `message`, así que un cuerpo que no los trajera tal cual se
// descartaba ENTERO y con él se iba el `code`: un 403 perfectamente informativo
// le llegaba al agente como un 403 pelado.
//
// El backend manda las cinco claves. El que no las manda es cualquier gateway
// delante de la API, y `CRYPTOCAPI_API_BASE` existe justo para apuntar el
// paquete a otro lado.
// ===========================================================================

test('el code sobrevive aunque el cuerpo no traiga status ni message', () => {
  const text = explainHttpError(
    response(403, {
      error: 'Forbidden',
      code: 'PRODUCT_NOT_INCLUDED',
      required_product: 'quant',
      your_product: 'alpha',
    })
  );
  assert.match(text, /Quant Pro/, 'tiene que nombrar el motor que falta');
  assert.match(text, /Radar Alpha/, 'y el que la key sí incluye');
  assert.match(text, /code: PRODUCT_NOT_INCLUDED$/, 'sin el code, el manifiesto no se puede cumplir');
});

test('el code sobrevive aunque status venga con otro valor', () => {
  const text = explainHttpError(
    response(403, { status: 'fail', message: 'nope', code: 'DEMO_COIN_RESTRICTED' })
  );
  assert.match(text, /bitcoin y ethereum/);
  assert.match(text, /code: DEMO_COIN_RESTRICTED$/);
});

test('`error` vale como alias de `message`', () => {
  // Es la convención de los proxies que reescriben el cuerpo. Sin leerla, se
  // pierde la única frase que el agente le puede mostrar a la persona.
  const text = explainHttpError(response(404, { error: 'Coin not found: dogecoinn' }));
  assert.match(text, /Coin not found: dogecoinn/);
});

// ===========================================================================
// Retry-After: RFC 9110 admite segundos O fecha HTTP.
// ===========================================================================

test('Retry-After como fecha HTTP se traduce a segundos', () => {
  // Concatenar el header crudo con «segundos» daba «Esperá Wed, 21 Oct 2026
  // 07:28:00 GMT segundos». El agente se queda sin número contra el cual
  // esperar, y sin número reintenta: el bucle que el mensaje quiere cortar.
  const dentroDeUnMinuto = new Date(Date.now() + 60_000).toUTCString();
  const text = explainHttpError(
    response(429, { status: 'error', message: 'slow down' }, { 'retry-after': dentroDeUnMinuto })
  );
  assert.match(text, /\d+ segundos/);
  assert.doesNotMatch(text, /GMT/, 'la fecha cruda no le sirve de nada al agente');
});

test('Retry-After con una fecha ya pasada no promete una espera negativa', () => {
  const haceUnRato = new Date(Date.now() - 60_000).toUTCString();
  const text = explainHttpError(
    response(429, { status: 'error', message: 'slow down' }, { 'retry-after': haceUnRato })
  );
  assert.match(text, /un momento/);
  assert.doesNotMatch(text, /-\d/, 'una espera negativa es peor que no decir nada');
});

test('Retry-After en segundos sigue funcionando igual', () => {
  const text = explainHttpError(
    response(429, { status: 'error', message: 'slow down' }, { 'retry-after': '42' })
  );
  assert.match(text, /42 segundos/);
});

// ===========================================================================
// El sniffing por texto del 403 sin code.
// ===========================================================================

test('un 403 sin code que habla de un pase vencido no culpa a la key', () => {
  // La detección atribuía cualquier «inactive» a la credencial, así que a un
  // cliente con el pase vencido le decía que había copiado mal la key. Es el
  // error exacto que PRODUCT_NOT_ACTIVE existe para no cometer, colado de nuevo
  // por la puerta de atrás del fallback.
  for (const message of ["Your 'quant' pass is inactive.", 'Your subscription is inactive.']) {
    const text = explainHttpError(response(403, { status: 'error', message }));
    assert.match(text, /renovar/, `"${message}" habla del pase, no de la credencial`);
    assert.ok(
      !/mal copiada|revocada o dada de baja/.test(text),
      `"${message}": la key está bien, el que venció es el pase`
    );
  }
});

test('Retry-After que no promete espera da la misma respuesta que una fecha pasada', () => {
  // «0» significa «ya podés reintentar», pero la frase que lo envuelve
  // desaconseja el bucle: «Esperá 0 segundos [...] No reintentes en bucle» se
  // contradice sola. Es el mismo significado que una fecha ya pasada, así que
  // tiene que dar la misma salida: dos caminos para lo mismo no pueden
  // contestar distinto.
  for (const ra of ['0', '-5']) {
    const text = explainHttpError(
      response(429, { status: 'error', message: 'slow down' }, { 'retry-after': ra })
    );
    assert.match(text, /un momento/, `Retry-After "${ra}" no debería prometer una espera`);
    assert.doesNotMatch(text, /0 segundos|-5/);
  }
});

test('un Retry-After que no es ninguna de las dos formas del RFC no se inventa un número', () => {
  // `Number('0x10')` da 16 y `Number('1e3')` da 1000. Ninguno es un Retry-After
  // válido, y contestarlos manda al agente a esperar cualquier cosa.
  for (const ra of ['0x10', '1e3', 'abc', 'Infinity']) {
    const text = explainHttpError(
      response(429, { status: 'error', message: 'slow down' }, { 'retry-after': ra })
    );
    assert.match(text, /un momento/, `"${ra}" no es una espera y no puede leerse como tal`);
    assert.doesNotMatch(text, /\d+ segundos/, `"${ra}" no puede volverse un número`);
  }
});
