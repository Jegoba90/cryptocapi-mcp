#!/usr/bin/env node
/**
 * Chequeo de contrato contra la API REAL.
 *
 * Por qué existe
 * --------------
 * Los tests de `test/` no tocan la red a propósito: levantan una API falsa para
 * que el CI sea rápido y determinista. Esa decisión está bien y se queda, pero
 * tiene un punto ciego enorme, y en septiembre de 2026 se cobró cuatro bugs de
 * una sentada. **Tres de los cuatro eran sobre qué manda la API de verdad contra
 * qué asumía el paquete**, y ninguno podía fallar contra un servidor falso que
 * solo devuelve lo que el propio test escribió:
 *
 * - el `code` se descartaba si el cuerpo no traía `status: "error"` literal;
 * - `Retry-After` con fecha HTTP se leía como si fueran segundos;
 * - un 403 que hablaba de un pase vencido culpaba a la API key.
 *
 * A eso se suma que `src/contract/` es una **copia a mano** del contrato del
 * backend: si el origen cambia, acá no rompe nada y nadie se entera. El README
 * de esa carpeta lo declaraba como deuda abierta desde F3.
 *
 * Este script es esa reja. No reemplaza a los tests: los complementa por el lado
 * que ellos no pueden mirar.
 *
 * Por qué está en TypeScript
 * --------------------------
 * Nació en `.mjs` por inercia y fue, por un rato, el único archivo del repo que
 * ningún typecheck miraba: 265 líneas sin tipos en un proyecto que corre con
 * `strict`, `noUncheckedIndexedAccess` y cero `any`. La reja del contrato sin la
 * reja de tipos.
 *
 * Pasarlo a `.ts` no fue solo consistencia. Acá abajo **las respuestas se leen
 * con los mismos schemas que el paquete usa en producción**, así que navegar el
 * cuerpo no requiere un solo cast: si el contrato se mueve, se nota al leerlo y
 * no tres accesos más abajo con un `undefined` inexplicable.
 *
 * Node lo ejecuta directo, sin transpilar, igual que a los tests.
 *
 * Cómo se corre
 * -------------
 *   npm run contrato
 *
 * Usa la key pública de demostración, así que no hace falta credencial. Eso
 * limita lo que se puede verificar —`get_signal` y `scan_market` solo se ven en
 * su forma 403— y está asumido: el 403 ES parte del contrato que el paquete
 * traduce, así que verificarlo tiene valor propio.
 *
 * Con una key paga en `CRYPTOCAPI_API_KEY` cubre además los caminos felices de
 * esos dos motores, pero no es requisito y el workflow programado no la usa.
 *
 * Códigos de salida
 * -----------------
 *   0  el contrato se cumple
 *   1  el contrato se movió — hay que mirar antes de publicar
 *   2  no se pudo verificar (rate limit o red), que NO es lo mismo que 1
 *
 * La diferencia entre 1 y 2 es el punto. La primera versión reportaba un 429
 * como «el contrato del backend se movió»: un mensaje que culpa a la causa
 * equivocada, que es justo el defecto que este paquete existe para no cometer.
 * Un workflow programado que abre un issue cada vez que lo limitan, diciendo que
 * cambió el contrato, se vuelve ruido y se ignora.
 */
import { z } from 'zod';
import { DEMO_API_KEY } from '../dist/config.js';
import { ApiErrorBodySchema, KNOWN_ERROR_CODES } from '../dist/contract/errors.js';
import { AuditTrailSchema } from '../dist/contract/audit-trail.js';

const BASE = process.env['CRYPTOCAPI_API_BASE']?.trim() || 'https://api.cryptocapi.com/v1';
const KEY = process.env['CRYPTOCAPI_API_KEY']?.trim() || DEMO_API_KEY;
const TIMEOUT_MS = 30_000;

/**
 * Pausa entre llamadas. La demo key es compartida y tiene límite: este script
 * corre programado, así que no puede ser el que lo agota para todos los demás.
 */
const PAUSA_MS = 600;

/**
 * El sobre de una respuesta con sello.
 *
 * Se navega con zod y no con accesos encadenados: así «el audit_trail cambió de
 * lugar» es un error con nombre, y no un `undefined` que aparece tres líneas
 * después. `.loose()` porque solo importa el camino hasta el sello; el resto del
 * cuerpo puede crecer sin que esto se queje.
 */
const SobreConSelloSchema = z
  .object({
    data: z
      .object({
        math_diagnostics: z
          .object({ audit_trail: z.record(z.string(), z.unknown()) })
          .loose(),
      })
      .loose(),
  })
  .loose();

/** El sobre de `/quant/batch`: solo interesa que traiga filas. */
const SobreBatchSchema = z
  .object({
    data: z
      .object({
        signals: z.array(z.unknown()).optional(),
        results: z.array(z.unknown()).optional(),
      })
      .loose(),
  })
  .loose();

/** El sobre de un insight, para el caso en que `data` puede ser `null`. */
const SobreInsightSchema = z.object({ status: z.string(), data: z.unknown() }).loose();

interface Respuesta {
  readonly status: number;
  readonly data: unknown;
}

type Estado = 'ok' | 'falla' | 'skip';

interface Resultado {
  readonly estado: Estado;
  readonly nombre: string;
  readonly detalle: string;
}

const resultados: Resultado[] = [];

/** No se pudo verificar. No es una falla del contrato. */
class NoVerificable extends Error {}

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function pedir(path: string, body?: unknown): Promise<Respuesta> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-api-key': KEY,
        accept: 'application/json',
        'user-agent': 'cryptocapi-mcp-contrato',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    const causa = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'red';
    throw new NoVerificable(`no se pudo llegar a la API (${causa})`);
  } finally {
    clearTimeout(timer);
  }

  // 429 no dice nada sobre el contrato: dice que pegamos demasiado seguido.
  if (res.status === 429) {
    const espera = res.headers.get('retry-after');
    throw new NoVerificable(`rate limit${espera ? ` — Retry-After: ${espera}` : ''}`);
  }
  // Un 5xx tampoco: la API está caída, no cambió de forma.
  if (res.status >= 500) {
    throw new NoVerificable(`la API devolvió ${res.status}`);
  }

  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = undefined;
  }
  return { status: res.status, data };
}

/** Una afirmación del contrato. `fn` tira si no se cumple. */
async function check(nombre: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detalle = await fn();
    resultados.push({ estado: 'ok', nombre, detalle });
    console.log(`  ok        ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  } catch (error: unknown) {
    if (error instanceof NoVerificable) {
      resultados.push({ estado: 'skip', nombre, detalle: error.message });
      console.log(`  sin ver.  ${nombre}\n            ${error.message}`);
      return;
    }
    const motivo = error instanceof Error ? error.message : String(error);
    resultados.push({ estado: 'falla', nombre, detalle: motivo });
    console.log(`  FALLA     ${nombre}\n            ${motivo}`);
  } finally {
    await dormir(PAUSA_MS);
  }
}

function assert(cond: boolean, mensaje: string): asserts cond {
  if (!cond) throw new Error(mensaje);
}

/** Saca el `audit_trail` del sobre, o explica que el sobre cambió de forma. */
function selloDe(data: unknown): Record<string, unknown> {
  const sobre = SobreConSelloSchema.safeParse(data);
  assert(sobre.success, 'no hay data.math_diagnostics.audit_trail — el sobre cambió de forma');
  return sobre.data.data.math_diagnostics.audit_trail;
}

/** Lee un cuerpo de error con el MISMO schema que usa el paquete en producción. */
function errorDe(data: unknown): z.infer<typeof ApiErrorBodySchema> {
  const cuerpo = ApiErrorBodySchema.safeParse(data);
  assert(cuerpo.success, 'el cuerpo de error no encaja en ApiErrorBodySchema');
  return cuerpo.data;
}

// ---------------------------------------------------------------------------

console.log(`Contrato contra ${BASE}`);
console.log(
  `Key: ${KEY === DEMO_API_KEY ? 'demo pública' : 'propia (cubre además los caminos felices de quant)'}\n`
);

console.log('Sellos — la promesa del producto');

await check('Radar alpha trae un audit_trail que valida contra el schema copiado', async () => {
  const r = await pedir('/market/insights/bitcoin?view=alpha');
  assert(r.status === 200, `se esperaba 200 y vino ${r.status}`);
  const sello = selloDe(r.data);
  const v = AuditTrailSchema.safeParse(sello);
  assert(v.success, `el schema lo rechaza: ${JSON.stringify(v.error?.issues)}`);
  assert(v.data.seal_type === 'process_seal', `seal_type inesperado: ${String(v.data.seal_type)}`);
  assert(v.data.protocol_hash.length > 0, 'protocol_hash vacío');
  return `seal_type=${v.data.seal_type}`;
});

await check('Quant Plus trae el sello reproducible con su vector de entrada', async () => {
  const r = await pedir('/market/insights/bitcoin?view=alpha&engine=quant_plus');
  assert(r.status === 200, `se esperaba 200 y vino ${r.status}`);
  const v = AuditTrailSchema.safeParse(selloDe(r.data));
  assert(v.success, `el schema lo rechaza: ${JSON.stringify(v.error?.issues)}`);
  assert(v.data.seal_type === 'reproducible', `seal_type inesperado: ${String(v.data.seal_type)}`);
  // Es la forma que permite recomputar la matemática por fuera; sin esto el
  // sello deja de ser reproducible y pasa a ser solo un checksum.
  const vector = v.data.input_vector;
  assert(vector !== undefined, 'falta input_vector, que es lo que hace reproducible al sello');
  return `input_vector de ${vector.length} valores`;
});

console.log('\nErrores — lo que el paquete traduce');

await check('El 403 de moneda restringida trae el code PLANO', async () => {
  const r = await pedir('/market/insights/solana?view=alpha');
  assert(r.status === 403, `se esperaba 403 y vino ${r.status}`);
  // Plano y no anidado adentro de `message`: es el camino rápido de
  // normalizeErrorBody, y lo que `llms.txt` le promete al agente.
  const cuerpo = errorDe(r.data);
  assert(
    cuerpo.code === KNOWN_ERROR_CODES.DEMO_COIN_RESTRICTED,
    `code esperado DEMO_COIN_RESTRICTED, vino ${JSON.stringify(cuerpo.code)}`
  );
  return 'code plano';
});

await check('get_signal cerrado nombra el motor que falta', async () => {
  const r = await pedir('/quant/BTCUSDT/signal');
  if (r.status === 200) return 'key con Quant Pro: camino feliz, no hay 403 que verificar';
  assert(r.status === 403, `se esperaba 403 o 200 y vino ${r.status}`);
  const cuerpo = errorDe(r.data);
  assert(
    cuerpo.code === KNOWN_ERROR_CODES.PRODUCT_NOT_INCLUDED,
    `code esperado PRODUCT_NOT_INCLUDED, vino ${JSON.stringify(cuerpo.code)}`
  );
  // Sin esto el tool no puede decir QUÉ pase falta, que es su razón de ser.
  assert(
    cuerpo.required_product === 'quant',
    `required_product esperado 'quant', vino ${JSON.stringify(cuerpo.required_product)}`
  );
  return `required_product=${cuerpo.required_product}`;
});

await check('scan_market cerrado nombra su propio motor', async () => {
  const r = await pedir('/quant/market-scan');
  if (r.status === 200) return 'key con Market Scan: camino feliz';
  assert(r.status === 403, `se esperaba 403 o 200 y vino ${r.status}`);
  const cuerpo = errorDe(r.data);
  assert(
    cuerpo.code === KNOWN_ERROR_CODES.PRODUCT_NOT_INCLUDED,
    `code inesperado: ${JSON.stringify(cuerpo.code)}`
  );
  assert(
    cuerpo.required_product === 'market_scan',
    `required_product esperado 'market_scan', vino ${JSON.stringify(cuerpo.required_product)}`
  );
  return `required_product=${cuerpo.required_product}`;
});

console.log('\nAlcance de la demo key — lo que la documentación promete');

await check('batch responde con la demo key para bitcoin y ethereum', async () => {
  const r = await pedir('/quant/batch', { symbols: ['bitcoin', 'ethereum'] });
  // Es la excepción que la 0.2.2 documentó en la descripción del tool. Si el
  // backend la revierte, esa descripción pasa a mentir y hay que sacarla.
  assert(r.status === 200, `se esperaba 200 y vino ${r.status}: la excepción de la demo key cambió`);
  const sobre = SobreBatchSchema.safeParse(r.data);
  assert(sobre.success, 'el sobre de batch cambió de forma');
  const filas = sobre.data.data.signals ?? sobre.data.data.results;
  assert(filas !== undefined && filas.length > 0, 'no vinieron filas de señales');
  return `${filas.length} señales`;
});

await check('data puede ser null y eso es una respuesta válida, no un error', async () => {
  // El tool se lo advierte al agente. Si la API dejara de poder devolverlo, esa
  // advertencia sobraría; si lo devuelve, tiene que ser con status success.
  const r = await pedir('/market/insights/bitcoin');
  assert(r.status === 200, `se esperaba 200 y vino ${r.status}`);
  const sobre = SobreInsightSchema.safeParse(r.data);
  assert(sobre.success, 'el sobre del insight cambió de forma');
  assert(sobre.data.status === 'success', `status inesperado: ${JSON.stringify(sobre.data.status)}`);
  return sobre.data.data === null ? 'hoy vino null' : 'hoy vino con datos';
});

// ---------------------------------------------------------------------------

const ok = resultados.filter((r) => r.estado === 'ok');
const fallas = resultados.filter((r) => r.estado === 'falla');
const skips = resultados.filter((r) => r.estado === 'skip');

console.log(
  `\n${ok.length}/${resultados.length} afirmaciones verificadas` +
    (skips.length ? `, ${skips.length} sin verificar` : '') +
    (fallas.length ? `, ${fallas.length} incumplidas` : '')
);

if (fallas.length > 0) {
  console.log('\nEl contrato del backend se movió respecto de la copia en src/contract/.');
  console.log('Mirar esto antes de publicar: el paquete asume algo que dejó de ser cierto.');
  for (const f of fallas) console.log(`  - ${f.nombre}: ${f.detalle}`);
  // `process.exitCode` y no `process.exit()`: salir a la fuerza con sockets
  // keep-alive todavía abiertos dispara una aserción de libuv en Windows, y el
  // código de salida deja de ser fiable. Un chequeo cuyo exit code no se puede
  // creer no sirve para hacer fallar un workflow.
  process.exitCode = 1;
} else if (skips.length === resultados.length) {
  console.log('\nNo se verificó NADA: la API no estuvo disponible en toda la corrida.');
  console.log('Esto no dice nada sobre el contrato. Reintentar más tarde.');
  process.exitCode = 2;
} else if (skips.length > 0) {
  console.log('\nLo verificado se cumple. Lo que quedó sin verificar no acusa al contrato:');
  for (const s of skips) console.log(`  - ${s.nombre}: ${s.detalle}`);
  process.exitCode = 2;
}
