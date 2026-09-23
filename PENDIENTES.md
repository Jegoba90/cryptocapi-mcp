# Pendientes

Lo que se encontró y **no** se arregló, con el porqué y lo suficiente para
retomarlo sin volver a investigarlo. Nada de acá bloquea una release; si alguno
lo hiciera, no estaría en este archivo.

Revisión del 2026-09-22, ampliada el 2026-09-23. Lo que sí se arregló en esa
pasada fue el mensaje de timeout y tres fallos de traducción de errores; están en
el historial y salieron publicados en la 0.2.4.

Lo del 23 salió de verificar el paquete publicado contra la API de producción, y
está al final: dos cosas que viven en `cryptocapi.com` y dos de mantenimiento del
CI.

> La revisión también anotó que faltaba el archivo `LICENSE`. **Ya no falta:** lo
> agregó `1fcd7b9` en `main`, mientras esta revisión corría sobre un `main`
> desactualizado. Verificado: está en el repo y npm lo mete en el tarball aunque
> no figure en `files`.

---

## Bugs chicos

### El `setTimeout` desborda el entero de 32 bits

`CRYPTOCAPI_TIMEOUT_MS=2147483648` (~24,8 días) hace que Node fije el timer en
**1 ms**. Medido:

```
TimeoutOverflowWarning: 2147483648 does not fit into a 32-bit signed integer.
    cortó a los 5 ms -> timeout | La API de CryptoCapi no respondió en 2147483648 ms.
```

El usuario pidió el presupuesto más grande posible y obtuvo el más chico, con un
mensaje que le dice que esperó 25 días. Es el mismo pecado que se corrigió en el
mensaje de timeout: **el número informado no es el que rigió.**

Arreglo: clamp en [`src/config.ts`](src/config.ts) a `2_147_483_647`, donde ya se
valida `rawTimeout`. Dos líneas y un test. No se hizo en la misma pasada para no
mezclarlo con el fix del mensaje, que tenía otra causa.

La advertencia sale por stderr, así que el stream del protocolo no corre riesgo.

### `get_insight` no normaliza `coin_id`, `get_signal` sí normaliza `symbol`

[`tools.ts`](src/tools.ts) hace `symbol.toUpperCase()` para el par de trading,
pero no baja `coin_id` a minúsculas. El archivo declara como principio de diseño
«absorber las trampas de formato de la API», y lo cumple para una de las dos.

Si la API es case-sensitive en el identificador de moneda, un agente que mande
`"Bitcoin"` se come un 404 evitable. **Sin red no se pudo confirmar qué hace la
API**, así que antes de tocarlo hay que verificarlo contra producción.

---

## Higiene

### `src/contract/audit-trail.ts` es código muerto

Exporta `AuditTrailSchema` y `AuditTrail`, y **no lo importa nadie**: `grep` no
encuentra una sola referencia fuera del propio archivo. Igual viaja en el tarball
(`dist/contract/audit-trail.js` + `.d.ts`).

Es el mismo argumento con el que se apagaron los source maps en
[`tsconfig.json`](tsconfig.json): peso que promete una capacidad que no existe.

Decidir una de dos, y ninguna es obvia:

- **Borrarlo.** Es lo consistente con el criterio del tarball.
- **Usarlo.** Su existencia insinúa una intención que nunca se cumplió: hoy
  **nadie valida el `audit_trail`**, que es la promesa del producto. Validarlo
  tiene un costo: si el schema se queda viejo respecto del backend, rechazaría
  sellos válidos. Por eso no es una decisión de limpieza sino de diseño.

Ese costo se midió el 2026-09-23 contra producción, y hoy no existe: el schema
**valida los dos sellos** que la demo key alcanza, con sus formas distintas.

| Sello | Ruta | Claves que trae | Valida |
| :--- | :--- | :--- | :--- |
| `process_seal` | `insights/bitcoin?view=alpha` | `filters_applied`, `fields_overridden`, `sentiment_override` | ✅ |
| `reproducible` | `…&engine=quant_plus` | `data_source`, `input_timestamps`, `input_vector`, `zscore_window_size`, `daily_change_pct` | ✅ |

O sea que la copia no está vieja y la rama de «usarlo» no arrancaría rechazando
sellos buenos. Queda sin comprobar el tercer valor del enum, `output_seal`, que no
se alcanza con la demo key.

### `test/stdio.test.ts` simula una ruta de un tool retirado

[`stdio.test.ts:78`](test/stdio.test.ts#L78) registra
`/v1/market/market-summary`, de `get_market_summary`, retirado el 2026-08-30. El
handshake del test llama `get_insight`, que pega a otra ruta y cae al 404 por
defecto de la API falsa.

El test pasa y lo que afirma sigue siendo cierto (stdout limpio), pero **nunca
ejercita un 200 como parece creer**. Cambiar la ruta por
`/v1/market/insights/bitcoin` le devuelve el alcance que dice tener.

---

## Release y dependencias

### `server.json` no tiene reja de versión, y quedó adelantado al tag

[`release.yml`](.github/workflows/release.yml) valida que el tag coincida con la
versión de `package.json`, pero **no mira `server.json`**: son dos lugares para
bumpear y una sola puerta.

Además, hoy el commit que corrigió `server.json` es posterior al tag `v0.2.3`, así
que lo publicado no lo incluye. Y **no hay ningún workflow que publique en el MCP
Registry**: el archivo está committeado y nada lo consume.

Decidir si el registry entra en el pipeline o si `server.json` se mantiene a mano;
en cualquier caso, sumar la comprobación de versión al workflow.

### El chequeo automático del contrato copiado sigue sin existir

Ya está dicho en [`src/contract/README.md`](src/contract/README.md): el plan lo
daba por F3 y F3 cerró sin él. La tabla de sincronizaciones manuales es el
sustituto pobre.

**Con más razón ahora**, porque el schema de errores diverge del backend a
propósito y esa divergencia es lo único que impide reintroducir un fallo. Está
documentada en ese mismo archivo, pero un chequeo la protegería mejor que un
párrafo.

### Dependencias

`zod` 4.4.3 → 4.6.5 disponible. `@types/node` y `typescript` tienen mayores
nuevas, que no urgen.

Dos advisories **moderate** (`hono`, `qs`), heredadas de
`@modelcontextprotocol/sdk` vía `express` y `@hono/node-server`. Quedan bajo la
reja de `--audit-level=high`, así que el CI está en verde legítimamente: **este
paquete solo importa `server/mcp.js` y `server/stdio.js`, así que el código
vulnerable nunca se carga.** Vale saberlo para no asustarse al leer el `npm
audit`, y para no "arreglarlo" forzando resoluciones que romperían el SDK.

No hay `dependabot.yml`. Si se quiere que esto se vigile solo, es el lugar.

---

## Fuera de este repo: cryptocapi.com

Dos cosas que se descubrieron auditando este paquete pero que **no se arreglan
acá**. Quedan anotadas igual porque afectan directo la adopción del MCP, y el
lugar donde se ven es este.

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

---

## Mantenimiento del CI

Los dos salieron como avisos del runner en el CI del PR #2. Ninguno rompe nada
hoy y los dos tienen fecha.

### Las actions corren sobre un Node deprecado

```
Node.js 20 is deprecated. The following actions target Node.js 20 but are being
forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4
```

Subirlas a `v5` en [`ci.yml`](.github/workflows/ci.yml) y
[`release.yml`](.github/workflows/release.yml) es el arreglo.

De ahí sale también un `DEP0169 DeprecationWarning: url.parse()` que aparece en el
log y asusta a primera vista. **No es nuestro:** lo emite el paso de caché de
`setup-node`, y `src/` no usa `url.parse` en ningún lado — el paquete usa `new URL()`.

### `ubuntu-latest` migra a Ubuntu 26 el 19 de octubre de 2026

Aviso del runner. Probablemente no pase nada, pero es el tipo de cosa que aparece
como un fallo raro un lunes. Si se quiere control, fijar la imagen en vez de usar
la etiqueta móvil.
