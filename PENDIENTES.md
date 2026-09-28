# Pendientes

Lo que se encontró y **no** se arregló, con el porqué y lo suficiente para
retomarlo sin volver a investigarlo. Nada de acá bloquea una release; si alguno
lo hiciera, no estaría en este archivo.

Revisión del 2026-09-22, ampliada y barrida el 2026-09-23 y el 2026-09-28. Lo que
se arregló está en el historial: el mensaje de timeout y tres fallos de traducción
de errores salieron en la 0.2.4, la tanda de higiene vino después, y la
usabilidad para agentes cierra con la 0.2.5.

**Lo que queda abierto vive casi todo fuera de este repo.** Está al final.

---

## Cerrado el 2026-09-28

| Qué era | Cómo cerró |
| :--- | :--- |
| Ningún tool declara `annotations` | Los cuatro declaran solo lectura (`SOLO_LECTURA` en `src/tools.ts`), con un test que compara el objeto entero. Suma ~410 bytes a `tools/list`, unos 100 tokens por sesión |
| No estaba dicho por qué no hay `structuredContent` | Dicho en la cabecera de `src/tools.ts`, y un test falla si alguien agrega `outputSchema` |
| SDK un patch atrás | `1.30.0` → `1.31.0`. El rango `^1.30.0` ya se la instalaba a los usuarios: ahora los tests corren contra lo mismo |
| El MCP Registry anunciaba la 0.2.3 | La 0.2.4 se publicó a mano, y desde `440f617` el tag publica en el Registry desde `release.yml` |
| La descripción del Registry decía «PRO» | Cambiada en `server.json`; llega al Registry con la 0.2.5 |

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

## La 0.2.5 salió el 2026-09-28

La revisión de ese día se resolvió publicando, no corriendo la fecha: las
`annotations` viajan en el tarball, que era la condición que había quedado
escrita. La versión lleva las `annotations` de los cuatro tools, el clamp del
`setTimeout` que esperaba desde el 2026-09-23, el piso del SDK en `^1.31.0`, el
README con el logo y la descripción nueva del Registry. Salió a npm con
procedencia, atada al commit `8154167`, y al Registry por primera vez desde
`release.yml`.

**El job del Registry falló en el primer intento.** npm aceptó el publish
avisando que el paquete «may take a few minutes to become available», y tardó
unos cuatro minutos y medio en servirlo: los tres reintentos de 20 s se agotaron
mucho antes. Se relanzó solo ese job, como estaba previsto, y publicó. El arreglo
de fondo es que el job espere a que npm sirva la versión antes de publicar.

### Decidido: en el modo oscuro de npm el logo se ve gris, y se deja así

Visto con la 0.2.5 ya publicada. En GitHub el logo cambia bien de variante; en
npm sale siempre la gris `#333333`, y con el modo oscuro de la página apenas se
ve sobre el fondo `#1a1a1a`.

**No tiene arreglo con el `<picture>`, y vale saberlo antes de intentarlo.** El
renderer de npm lo desarma: deja el `<source>` solo, dentro de un `<picture>`
vacío, y saca el `<img>` afuera, envuelto en un link a GitHub. La variante
oscura no se usa nunca, con ningún tema. Pasar el `srcset` a URL absoluta no
cambia nada, porque el `<source>` ya no tiene `<img>` al que aplicarse. Además,
el modo oscuro de npm es un botón de la página y no sigue el tema del sistema,
que es lo único que puede mirar un `<picture>`.

Lo único que funciona en npm es una imagen que se vea sobre cualquier fondo, como
el logo blanco sobre una tarjeta oscura propia. Se probó y se descartó el
2026-09-28: el autor prefiere la portada actual en GitHub, que es donde se ve el
repo, a cambiar su aspecto por el modo oscuro de npm.

### Qué dispara una versión

Cualquiera de estas tres, sin esperar a una revisión:

1. **El chequeo diario de contrato se pone rojo.** Si el backend mueve el
   contrato, el arreglo cae en `src/` y ahí sí hay que publicar. El workflow abre
   un issue solo, así que no hace falta vigilarlo.
2. **Alguien reporta un bug real** en cualquiera de los cuatro motores.
3. **Cualquier otro cambio de comportamiento** que amerite llegar al usuario.

Lo que no viaja en el tarball —workflows, tests, esta documentación— no dispara
nada. Que `main` vaya adelante de npm por eso no es un olvido.

---

## Sigue abierto, dentro del repo

### `get_insight` dice que la vista `pulse` es libre, y con la demo no lo es

Visto el 2026-09-28, contrastando el `llms.txt` con el backend. La descripción
que recibe el agente dice que `pulse` «es de acceso libre» y que con la key de
demostración **alpha** funciona solo para bitcoin y ethereum. Se lee como que
`pulse`, con la demo, sirve cualquier moneda. No es así, y por dos lados:

- **La restricción es por moneda, no por vista.** Con la demo key, `pulse` de
  solana da 403 `DEMO_COIN_RESTRICTED`, igual que alpha. Medido en producción.
- **Con la demo, `pulse` no existe.** El backend fuerza la vista alpha para ese
  plan, pida lo que pida (`insight.controller.ts`, rama `req.plan === 'demo'`):
  `pulse` de bitcoin devuelve la respuesta alpha entera.

«Libre» es cierto en otro sentido: con una key del plan free, `pulse` no exige
pase. Sin ninguna key la ruta da 401.

No rompe nada, porque el 403 llega traducido y nombra la restricción. Le cuesta
un intento al agente que pide `pulse` de otra moneda confiando en la
descripción. El arreglo es de texto: la descripción de `get_insight` y el
`.describe` de `view` en [`src/tools.ts`](src/tools.ts), y la celda «`pulse`
libre» de la tabla del README. Viaja en el tarball, así que sale con la próxima
versión, y no la justifica por sí solo.

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

### Dos promesas de la API que el backend no cumple

Encontradas el 2026-09-28 y anotadas donde se arreglan, en
`docs/CORRECCIONES_ABIERTAS.md` del repo del sitio. Acá, lo que tocan del MCP:

- **§3.24: el 403 de alpha para el plan free sale sin `code`.** Es muy
  probablemente lo que recibe una key de trial vencida. El paquete no inventa
  un código cuando falta, así que el agente recibe la frase sin la línea
  `code:` de la que se le pide ramificar. Se arregla en el backend; acá no hay
  nada que tocar.
- **§3.25: un límite global de 1.000 pedidos cada 15 minutos por IP.** Corta a
  4.000 por hora a un integrador PRO al que se le prometen 10.000. El MCP ya
  traduce bien el 429; lo que falta es que el límite exista en la documentación
  o deje de aplicarse a las keys autenticadas.

### La portada nombra el MCP, pero no trae el JSON para instalarlo

Decisión de producto, no defecto. Queda anotada porque el argumento es concreto.

Esta nota decía antes que el front no ofrecía el MCP, sin haberlo podido
verificar: la SPA devuelve el mismo HTML en todas las rutas. **Era falso en
parte.** Leído en `frontend/src/features/home/home.html` del repo del sitio el
2026-09-28, la portada hoy:

- dice en el hero «REST y MCP nativo, gratis para empezar»;
- explica el MCP nativo en la sección «Conectalo vos, o que lo haga tu agente»,
  con un chip «MCP nativo» que lleva a `/docs/agentes#mcp`;
- trae un bloque para pegarle a un agente de código, que le pide leer el
  `llms.txt` y usar la demo key.

**Lo que falta es el JSON.** Para instalar el MCP hay que ir hasta la guía, así
que la decisión que queda es chica: si vale ahorrar ese clic con el bloque de
configuración en la portada.

A favor: el MCP es **el único camino al producto que funciona sin registro**.
Seis líneas de JSON y el visitante tiene un análisis firmado de Bitcoin dentro de
su agente; verificado de punta a punta el 2026-09-23 contra la 0.2.4, con hash
idéntico al de la API. La documentación la lee quien ya decidió integrar, y la
portada quien todavía está decidiendo. El sello cuesta explicarlo en prosa y se
entiende al verlo funcionar.

En contra: si el cliente ideal es el integrador que compra REST, el MCP es un
canal lateral, y las portadas se mueren por exceso de llamadas a la acción. La
portada ya tiene dos rampas para agentes, el chip y el bloque del prompt; una
tercera compite con ellas.

Propuesta mínima, si se decide hacerlo: no una sección nueva sino el JSON
**dentro** de la sección de integración que ya existe, junto al chip, con una
línea del estilo «Pegá esto en tu agente y pedile el análisis de Bitcoin. Sin
cuenta.»

Y un motivo más para cuidar el `llms.txt`: el bloque del prompt de la portada
manda a leerlo, así que lo que diga mal la portada lo multiplica.
