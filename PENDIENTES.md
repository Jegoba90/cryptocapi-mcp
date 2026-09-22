# Pendientes

Lo que se encontró y **no** se arregló, con el porqué y lo suficiente para
retomarlo sin volver a investigarlo. Nada de acá bloquea una release; si alguno
lo hiciera, no estaría en este archivo.

Revisión del 2026-09-22. Lo que sí se arregló en esa pasada fue el mensaje de
timeout y tres fallos de traducción de errores; están en el historial.

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
