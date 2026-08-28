/**
 * Traduce las fallas de la API a lenguaje de agente.
 *
 * Un 403 crudo hace que el agente invente una explicación, que es justo lo que
 * este producto existe para evitar. Cada caso tiene que decir qué pasó y qué
 * hacer al respecto (plan §4.4).
 *
 * Regla que manda acá: **la API key no aparece nunca** (§11.5). El lugar donde
 * siempre se escapa es el mensaje que hace eco de la request, así que ningún
 * mensaje de este archivo toca los headers.
 */
import { ApiRequestError, type ApiResponse } from './http.js';
import { ApiErrorBodySchema, KNOWN_ERROR_CODES, type ApiErrorBody } from './contract/errors.js';

const TRIAL_URL = 'https://cryptocapi.com';

/** Los nombres comerciales, iguales a los que ve el cliente al comprar. */
const PRODUCT_LABELS: Record<string, string> = {
  pulse: 'Radar Pulse',
  alpha: 'Radar Alpha',
  quant: 'Quant Pro',
  quant_plus: 'Quant Plus',
  market_scan: 'Market Scan',
};

function label(product: string | undefined): string {
  if (!product) return 'otro motor';
  return PRODUCT_LABELS[product] ?? product;
}

/**
 * Normaliza el cuerpo de error, porque hay **dos formas en la calle**.
 *
 * El commit `e21dc4c2` hizo que `code`, `required_product` y `your_product`
 * viajen planos, fuera de `message`. Antes iban *serializados adentro de
 * `message`*, y escribir el tool solo contra la forma nueva ya rompió una vez:
 * el caso de la moneda restringida caía al mensaje genérico y le hablaba al
 * agente de motores de cuantitativa cuando el problema era la moneda.
 *
 * **`api.cryptocapi.com` se desplegó el 2026-08-25 y ya manda la forma plana**,
 * verificado en vivo. Aun así la rama que desanida **se queda**, por dos razones
 * que no caducan: este paquete corre en la máquina de terceros y no controla
 * contra qué versión de la API lo apuntan, y `CRYPTOCAPI_API_BASE` existe justo
 * para apuntarlo a otra. Un entorno viejo o un despliegue revertido devuelven la
 * forma anidada, y entender las dos no cuesta nada.
 */
function normalizeErrorBody(data: unknown): ApiErrorBody | undefined {
  const parsed = ApiErrorBodySchema.safeParse(data);
  if (!parsed.success) return undefined;
  const body = parsed.data;

  // Forma nueva: el código ya viene plano.
  if (body.code) return body;

  // Forma vieja: `message` es el JSON del error. Un mensaje de texto normal no
  // parsea, así que intentarlo es inocuo.
  try {
    const nested: unknown = JSON.parse(body.message);
    if (nested !== null && typeof nested === 'object') {
      const reparsed = ApiErrorBodySchema.safeParse({ status: 'error', ...nested });
      if (reparsed.success && reparsed.data.code) return reparsed.data;
    }
  } catch {
    // No era JSON: el mensaje ya está bien como está.
  }
  return body;
}

/**
 * Convierte una respuesta de error en un texto que el agente pueda usar para
 * decidir, no para adivinar.
 */
export function explainHttpError(response: ApiResponse): string {
  const body = normalizeErrorBody(response.data);
  const apiMessage = body?.message ?? 'La API respondió un error.';

  switch (response.status) {
    case 401:
      return (
        `${apiMessage}\n\n` +
        'Falta una API key válida. Se configura en la variable de entorno ' +
        `CRYPTOCAPI_API_KEY del mcp.json. Prueba gratuita de 14 días en ${TRIAL_URL}. ` +
        'Sin registro, la key pública demo_btc_eth_public sirve Radar Alpha para bitcoin y ethereum.'
      );

    case 403:
      // El caso con más información: la API dice qué motor falta y cuál sí
      // incluye la key, planos y fuera de `message`.
      if (body?.code === KNOWN_ERROR_CODES.PRODUCT_NOT_INCLUDED) {
        const need = label(body.required_product);
        const have = body.your_product ? label(body.your_product) : undefined;
        return (
          `Esta herramienta necesita el pase ${need}, y la API key configurada ` +
          (have ? `incluye ${have}.` : 'no lo incluye.') +
          '\n\nCada motor de CryptoCapi se compra por separado, así que tener uno no ' +
          `habilita los otros. No reintentes esta herramienta con la misma key. ` +
          `Para sumar ${need}: ${TRIAL_URL}`
        );
      }

      // Compró este motor y el pase dejó de estar activo. Separado de
      // PRODUCT_NOT_INCLUDED porque la salida del usuario es la contraria:
      // renovar lo que ya tiene, no comprarlo de nuevo. Decirle "no lo incluye"
      // a quien lo pagó es falso y lo manda a la página equivocada.
      if (body?.code === KNOWN_ERROR_CODES.PRODUCT_NOT_ACTIVE) {
        const need = label(body.required_product);
        return (
          `El pase ${need} de esta API key ya no está activo: venció o se dio de baja. ` +
          'La key sigue siendo válida, y los motores que tenga vigentes siguen respondiendo.' +
          '\n\nNo es un problema de los argumentos y reintentar no lo cambia. Lo que ' +
          `corresponde es renovar ${need}, no comprarlo otra vez: ${TRIAL_URL}`
        );
      }

      if (body?.code === KNOWN_ERROR_CODES.DEMO_COIN_RESTRICTED) {
        return (
          `${apiMessage}\n\n` +
          'La key pública de demostración sirve análisis solo para bitcoin y ethereum. ' +
          'Para cualquier otro activo hace falta una key propia, con prueba de 14 días en ' +
          `${TRIAL_URL}. Reintentar con otra moneda va a fallar igual.`
        );
      }

      // 403 sin código máquina. Hasta el 2026-08-28 las tres rutas de quant
      // caían acá con un texto único, y por eso este fallback hablaba de
      // motores de cuantitativa: era el caso que más lo pisaba. Desde que el
      // backend emite PRODUCT_NOT_INCLUDED y PRODUCT_NOT_ACTIVE ya no llegan,
      // y lo que queda son los 403 en que el problema es LA KEY: inválida, mal
      // copiada o revocada. A ese usuario el texto viejo lo mandaba a comprar
      // un plan que no le iba a arreglar nada.
      //
      // Acá no hay `code` que mirar, así que la detección va por texto. Es
      // frágil y está asumido: si no acierta, el mensaje neutro de más abajo
      // sigue siendo cierto, que es lo que no se puede perder.
      if (/invalid api key|revoked|inactive/i.test(apiMessage)) {
        return (
          `${apiMessage}\n\n` +
          'El problema es la API key en sí, no el plan: puede estar mal copiada, ' +
          'revocada o dada de baja. Se configura en la variable CRYPTOCAPI_API_KEY ' +
          `del mcp.json del agente. Para sacar una nueva: ${TRIAL_URL}. Sin registro, ` +
          'la key pública demo_btc_eth_public sirve Radar Alpha para bitcoin y ethereum.'
        );
      }

      return (
        `${apiMessage}\n\n` +
        'La API rechazó esta herramienta para la key configurada. No es un problema de ' +
        `los argumentos, así que reintentar tal cual no cambia el resultado: ${TRIAL_URL}`
      );

    case 429: {
      const retryAfter = response.headers?.['retry-after'];
      const wait = retryAfter ? `${retryAfter} segundos` : 'un momento';
      return (
        `Se alcanzó el límite de peticiones de la API key. Esperá ${wait} antes de ` +
        'volver a intentar. No reintentes en bucle: cada intento fallido cuenta igual.'
      );
    }

    case 404:
      return `${apiMessage}\n\nRevisá el identificador: puede no existir o estar escrito distinto.`;

    default:
      if (response.status >= 500) {
        return (
          'La API de CryptoCapi devolvió un error interno. No es un problema de la key ' +
          'ni de los argumentos. Reintentar más tarde es razonable; reintentar ya, no.'
        );
      }
      return apiMessage;
  }
}

/** Fallas que no llegaron a tener respuesta HTTP. */
export function explainRequestError(error: ApiRequestError): string {
  if (error.kind === 'timeout') {
    return (
      `${error.message}\n\n` +
      'Se puede ampliar el presupuesto con la variable CRYPTOCAPI_TIMEOUT_MS del mcp.json.'
    );
  }
  return (
    `${error.message}\n\n` +
    'Puede ser falta de conexión o que la API esté caída. No es un problema de la API key.'
  );
}
