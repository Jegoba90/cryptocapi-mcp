# Pendientes

Lo que se encontró y **no** se arregló, con el porqué y lo suficiente para
retomarlo sin volver a investigarlo. Nada de acá bloquea una release; si alguno
lo hiciera, no estaría en este archivo.

Revisión del 2026-09-22, ampliada y barrida el 2026-09-23. Lo que se arregló está
en el historial: el mensaje de timeout y tres fallos de traducción de errores
salieron en la 0.2.4, y la tanda de higiene vino después.

**Lo que queda abierto vive casi todo fuera de este repo.** Está al final.

---

## Cerrado el 2026-09-23

Se deja la constancia en vez de borrar las entradas: quien lea el historial de
estas ramas va a ver los ítems y merece saber cómo terminaron.

| Qué era | Cómo cerró |
| :--- | :--- |
| Falta el archivo `LICENSE` | Ya no falta: lo agregó `1fcd7b9` en `main` mientras la revisión corría sobre un clon desactualizado |
| `get_insight` no normaliza `coin_id` | **No era un bug.** Medido contra producción: la API es case-insensitive, `bitcoin`, `Bitcoin` y `BITCOIN` dan 200. Sin acción |
| El `setTimeout` desborda 32 bits | Clamp en `config.ts` a `2_147_483_647`, con test |
| `stdio.test.ts` simula una ruta retirada | Ahora apunta a `/v1/market/insights/bitcoin`, la que el handshake realmente pide |
| `server.json` sin reja de versión | `release.yml` valida el tag contra sus **dos** declaraciones de versión |
| `contract/audit-trail.ts` es código muerto | Dejó de serlo: es el schema con el que el chequeo de contrato valida los sellos reales |
| No existe el chequeo automático del contrato | `npm run contrato` + workflow diario. Era la deuda abierta desde F3 |
| Actions sobre Node 20 deprecado | `checkout@v5` y `setup-node@v5` |
| `ubuntu-latest` migra a Ubuntu 26 | Imagen fija en `ubuntu-24.04` |
| `zod` desactualizada | 4.4.3 → 4.6.5 |

---

## Decidido: `main` va adelante de npm, y está bien

**Revisar la semana del lunes 2026-09-28.**

La última versión publicada es la **0.2.4**. Desde su tag, `main` tiene un solo
cambio que llega al paquete instalado: el clamp del `setTimeout` en
[`src/config.ts`](src/config.ts). Todo lo demás —el chequeo de contrato, los
workflows, los tests, esta documentación— **no viaja en el tarball**.

Se decidió el 2026-09-23 **no publicar una 0.2.5** por eso solo. Para que el
clamp cambie algo, el usuario tiene que haber puesto `CRYPTOCAPI_TIMEOUT_MS` por
encima de 2.147.483.647 ms, o sea más de 24 días de presupuesto para una
request. Nadie lo reportó y nadie lo pone por accidente. Publicar una versión
cuyo único efecto práctico es un caso que no le pasa a nadie suma una entrada de
changelog sin ganancia para ningún usuario.

El cambio de `zod` en el manifiesto (`^4.3.6` → `^4.6.5`) tampoco mueve nada: el
rango viejo **ya permitía** la 4.6.5, así que quien instala la 0.2.4 hoy la
recibe igual. Solo sube el piso.

Esto queda escrito para que quien mire el repo dentro de unos meses no se
pregunte por qué `main` difiere de lo que está en npm. **No es un olvido.**

### Qué dispara la 0.2.5

Cualquiera de estas tres, sin esperar a la revisión:

1. **El chequeo diario de contrato se pone rojo.** Si el backend mueve el
   contrato, el arreglo cae en `src/` y ahí sí hay que publicar. El workflow abre
   un issue solo, así que no hace falta vigilarlo.
2. **Alguien reporta un bug real** en cualquiera de los cuatro motores.
3. **Cualquier otro cambio de comportamiento** que amerite llegar al usuario. El
   clamp viaja con él.

Si llega el 2026-09-28 y no pasó ninguna, la decisión razonable es volver a
dejarlo esperando y correr esta fecha, no publicar por cumplir.

**Salvo que se hagan las `annotations`** de la sección siguiente. Ésas viven en
`src/tools.ts`, o sea que **sí viajan en el tarball**, y son una mejora medible
para los agentes. Si se hacen, ése es el contenido de la 0.2.5 y el clamp del
`setTimeout` viaja con ellas: deja de haber que decidir entre publicar por
cumplir o no publicar nada.

---

## Usabilidad para agentes

Medido el 2026-09-23 contra el binario construido y contra los tipos del SDK
instalado. El diagnóstico corto: **el servidor está al día y le falta una cosa
concreta.**

Lo que ya está bien, para no tocarlo sin querer: los tools no son 1:1 con los
endpoints y absorben la trampa de formato, las descripciones nombran el motor en
vez de un «PRO» genérico, y los errores terminan en `code: <CODE>` para que el
agente ramifique sin adivinar.

| Qué | Medido |
| :--- | :--- |
| Protocolo MCP | negocia `2025-11-25`, la última que soporta el SDK |
| SDK | `1.30.0` instalado, `1.30.1` disponible — un patch atrás |
| Costo fijo de `tools/list` | ~4.200 bytes (~1.050 tokens) por sesión |
| Costo por respuesta | ~500 tokens (Radar alpha), ~880 (Quant Plus) |

### Ningún tool declara `annotations`

El SDK las soporta —`readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`— y **las cuatro herramientas son read-only, no destructivas,
idempotentes y open-world**: leen de una API externa y no cambian nada.

Sin esas señales, un cliente MCP estricto no puede auto-aprobar las llamadas y le
pregunta al usuario cada vez. **Es fricción, no rotura**: el agente puede llamar
a las cuatro igual. Por eso no bloqueó el go de la 0.2.4.

El arreglo es declararlas en los cuatro `registerTool` de
[`src/tools.ts`](src/tools.ts). Conviene sumar un test que falle si alguna se
pierde, como el que ya fija la superficie de cuatro motores.

### `outputSchema` / `structuredContent`: NO va, y hay que dejarlo escrito

Es la feature que un lector desprevenido va a echar de menos, porque es «lo
moderno» y el SDK la soporta. **Ponerla rompería la única promesa del producto.**

`structuredContent` viaja como objeto JSON que el cliente re-serializa. Este
paquete existe para reenviar el cuerpo **byte a byte**, porque reformatear un solo
número alcanza para que el `protocol_hash` deje de verificar. Un agente que
calculara el sello desde `structuredContent` obtendría un hash que no verifica,
y el fallo sería silencioso: no hay error, solo dos hashes que no coinciden.

O sea que la omisión es **correcta y deliberada**. Lo que falta es que esté dicha
en el código, para que nadie la lea como un olvido y la «arregle». El lugar es el
comentario de cabecera de [`src/tools.ts`](src/tools.ts), donde ya está escrito el
principio de reenvío verbatim.

### El patch del SDK

`1.30.0` → `1.30.1`. Trivial, va con lo anterior cuando se toque el paquete.

---

## Sigue abierto, dentro del repo

### Las dos advisories `moderate` del `npm audit`

`hono` y `qs`, heredadas de `@modelcontextprotocol/sdk` vía `express` y
`@hono/node-server`. Quedan bajo la reja de `--audit-level=high`, así que el CI
está en verde legítimamente: **este paquete solo importa `server/mcp.js` y
`server/stdio.js`, de modo que el código vulnerable nunca se carga.**

Más que una acción pendiente es contexto: vale saberlo para no asustarse al leer
el `npm audit`, y sobre todo para **no "arreglarlo"** forzando resoluciones que
romperían el SDK. Se cierra solo cuando el SDK actualice su árbol.

No hay `dependabot.yml`. Si se quiere que esto se vigile solo, es el lugar.

### Lo que el chequeo de contrato no alcanza

`npm run contrato` corre con la demo key, así que `get_signal` y `scan_market`
solo se verifican en su forma 403, y del enum de sellos queda sin ver
`output_seal`.

Cubrir los caminos felices de esos dos motores requiere pasarle una key paga en
`CRYPTOCAPI_API_KEY`. Se puede, con un secret del repo y una rama del workflow,
pero mete una credencial de pago en CI para verificar un camino que hoy nadie
reportó roto. **La decisión queda escrita, no tomada.**

---

## Fuera de este repo: cryptocapi.com

Lo más valioso que quedó abierto, y no se arregla acá.

### `llms.txt` dice que `/v1/quant/*` pide key PRO, y `batch` no

El texto publicado en https://www.cryptocapi.com/llms.txt afirma:

> Demo key (no signup): `demo_btc_eth_public` — works ONLY on
> `/v1/market/insights/{bitcoin|ethereum}` (…; `/v1/quant/*` requires a real PRO key).

Medido contra producción el 2026-09-23, la última parte es falsa para `batch`:

```
POST /v1/quant/batch  {"symbols":["bitcoin","ethereum"]}  con demo_btc_eth_public
  -> HTTP 200, señales reales de bitcoin y ethereum
```

Para `get_signal` y `scan_market` la frase **sí** es correcta: las dos devuelven
403 `PRODUCT_NOT_INCLUDED`.

El backend abrió `batch` a la demo key y este paquete lo documentó en la 0.2.2
(commit `08b5077`). El `llms.txt` no se actualizó con ese cambio.

**Por qué importa más que un typo:** `llms.txt` es lo que leen los agentes. Uno
que lo lea concluye que `batch_signals` está cerrado con la demo key y no lo
intenta — exactamente el fallo que la 0.2.2 arregló del lado del MCP, reaparecido
del lado del sitio.

Desde el 2026-09-23 el chequeo de contrato de este repo verifica esa afirmación
todos los días, así que si el backend revierte la excepción nos enteramos. Lo que
no puede hacer es corregir el texto del sitio.

Hay además un desajuste menor y sin consecuencias: `llms.txt` recomienda «a client
timeout of at least 15 s» y el paquete usa 20 s y 45 s según la herramienta. No se
contradicen; la guía del sitio es la más floja de las dos.

### El front no ofrece el MCP, solo la documentación

Decisión de producto, no defecto. Queda anotada porque el argumento es concreto.

El MCP es **el único camino al producto que funciona sin registro**: seis líneas
de JSON y el visitante tiene un análisis firmado de Bitcoin dentro de su agente.
Verificado de punta a punta el 2026-09-23 contra la 0.2.4 publicada, con hash
idéntico al de la API.

La documentación la lee quien ya decidió integrar; el front lo lee quien todavía
está decidiendo si le importa. Dejar la demo de fricción cero detrás de la docu
hace que **la prueba más fuerte solo la vea quien ya está convencido.**

Y el diferenciador es difícil de explicar en prosa —«un checksum que prueba que el
cálculo es reproducible y no lo escribió un LLM»— pero fácil de mostrar. El MCP es
el mecanismo para mostrarlo.

Hay un contraargumento real: si el cliente ideal es el integrador que compra REST,
el MCP es un canal lateral y el front tiene que quedarse enfocado. Las home mueren
por exceso de llamadas a la acción. El `<title>` del sitio ya dice «señales cripto
verificables para apps y agentes», así que el posicionamiento no falta: falta la
rampa concreta.

Propuesta mínima, si se decide hacerlo: no una sección sino **un bloque**, con el
mismo JSON que ya vive en el `llms.txt` y en el README, cerca del CTA principal y
con una línea encima del estilo «Pegá esto en tu agente y pedile el análisis de
Bitcoin. Sin cuenta.»

> No se pudo verificar desde el repo qué muestra hoy el front: `cryptocapi.com` y
> `/docs/agentes` devuelven el mismo HTML byte a byte, porque es una SPA y el
> contenido se arma en el cliente. Lo de arriba asume lo que reportó el autor.
