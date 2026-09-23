# @cryptocapi/mcp

[![npm](https://img.shields.io/npm/v/@cryptocapi/mcp)](https://www.npmjs.com/package/@cryptocapi/mcp)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.Jegoba90%2Fcryptocapi-blue)](https://registry.modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Análisis de mercado cripto **con sello verificable**, como herramientas nativas
para cualquier agente que hable MCP. Cada respuesta viaja con el SHA-256 de sus
inputs, así que el análisis se puede **recalcular y comprobar** — no hay que
creerle al modelo.

## Pegá esto y ya funciona

Sin cuenta, sin registrarte, sin clave. Va en el archivo de configuración de tu
cliente MCP:

```json
{
  "mcpServers": {
    "cryptocapi": {
      "command": "npx",
      "args": ["-y", "@cryptocapi/mcp"]
    }
  }
}
```

Con eso ya podés preguntarle a tu agente por Bitcoin o Ethereum y recibir el
análisis firmado por los dos motores que lo firman. El detalle de hasta dónde
llega la demo está [más abajo](#probarlo-sin-registrarte).

## Cuatro herramientas, cuatro motores

| Herramienta | Motor | Qué devuelve | Qué requiere |
|---|---|---|---|
| `get_insight` | **Radar** | Análisis de un activo. La vista `alpha` trae el sello | `pulse` libre · `alpha` requiere pase **Radar Alpha** |
| `get_insight` con `engine="quant_plus"` | **Quant Plus** | El mismo activo firmado por el motor determinista, con sello `reproducible` | Pase **Quant Plus** |
| `batch_signals` | **Quant Plus** | Señales de varios activos en una llamada | Pase **Quant Plus** |
| `get_signal` | **Quant Pro** | Señal cuantitativa de un par de trading | Pase **Quant Pro** |
| `scan_market` | **Market Scan** | Ranking del mercado según una estrategia | Pase **Market Scan** |

Son cinco filas para cuatro herramientas porque **`get_insight` es la puerta de dos motores**, y cada uno pide su propio pase. Tener Radar Alpha no abre Quant Plus por ese mismo tool: cambia el parámetro `engine` y cambia el pase que se exige.

**Hasta el 2026-08-30 había tres herramientas más** (`get_market_summary`, `get_prices`, `get_macro`) que devolvían dato de terceros: capitalización y miedo y codicia, precios de CoinGecko y series macro de FRED. Se retiraron porque CryptoCapi no es un agregador: sus motores firman inteligencia derivada y el dato ajeno es insumo interno. Un agente que preguntaba «¿cómo está el mercado?» agarraba el resumen y se iba con dato de terceros sin tocar un motor. Esos endpoints siguen existiendo en la API REST; lo que se retiró es que el agente los vea como herramientas.

**Cada motor se compra por separado, así que tener uno no habilita los otros.** Las descripciones nombran el motor que hace falta, no un «PRO» genérico, para que el agente no gaste intentos en herramientas que su clave no abre. Cuando igual las intenta, el error le dice qué pase falta y cuál sí tiene, en vez de un 403 pelado.

Ojo con un detalle de formato que hace fallar a los agentes: `get_signal` toma un **par de trading** (`BTCUSDT`) y `batch_signals` toma **identificadores de moneda** (`bitcoin`). Es el mismo motor con dos formatos, y cada campo lo aclara en su esquema.

## Probarlo sin registrarte

La configuración por defecto usa la key pública de demostración. No hace falta cuenta.

```json
{
  "mcpServers": {
    "cryptocapi": {
      "command": "npx",
      "args": ["-y", "@cryptocapi/mcp"],
      "env": { "CRYPTOCAPI_API_KEY": "demo_btc_eth_public" }
    }
  }
}
```

La `env` es opcional: **sin ninguna variable el paquete cae solo en la key pública de demostración**, así que alcanza con `command` y `args`.

**Qué alcanza con la demo key, medido el 2026-08-30 contra la versión publicada:**

| Motor | Herramienta | Con la demo key |
|---|---|---|
| Radar | `get_insight` | ✅ **solo bitcoin y ethereum**, `pulse` y `alpha` con sello |
| Quant Plus | `get_insight?engine=quant_plus` | ✅ **solo bitcoin y ethereum**, sello reproducible con `input_vector` |
| Quant Plus | `batch_signals` | ✅ **solo bitcoin y ethereum**, mismo alcance que `get_insight` |
| Quant Pro | `get_signal` | ❌ cerrado, para cualquier par |
| Market Scan | `scan_market` | ❌ cerrado, para cualquier estrategia |

Las tres cerradas **no fallan por la moneda, fallan siempre**: `get_signal` con `BTCUSDT`, que es el par de Bitcoin, también devuelve 403. La restricción a bitcoin y ethereum aplica a `get_insight` y nada más.

O sea que en la primera sesión responde **una de las cuatro herramientas**, y es la que muestra el producto: el análisis firmado, sobre Bitcoin, con los dos motores que lo firman.

**Para probar los cuatro motores sin límite de moneda** hace falta el trial de 14 días, gratis, en https://cryptocapi.com. Esa key abre todo mientras dura.

## Qué lo diferencia

La respuesta de los motores viaja con un `audit_trail` que incluye un `protocol_hash`: un sello del cálculo determinista que produjo el análisis. Este paquete **reenvía esos valores tal como llegaron de la API, sin volver a serializarlos**, porque reformatear un solo número bastaría para que el hash dejara de verificar.

No hace falta creernos: pedile a tu agente el análisis con `get_insight(coin_id="bitcoin", view="alpha")` y compará el `protocol_hash` de esa salida con el de la misma consulta hecha directo contra la API.

```bash
curl -H "x-api-key: demo_btc_eth_public" \
  "https://api.cryptocapi.com/v1/market/insights/bitcoin?view=alpha"
```

Tienen que ser idénticos. Si algún día no lo son, es un fallo de este paquete y merece un issue.

**El límite, dicho también:** el sello prueba que el cálculo es reproducible y que no lo escribió un modelo de lenguaje. No prueba que el análisis acierte, y hoy es un checksum sin firma criptográfica, así que acredita integridad, no origen.

### Y el paquete también se verifica

El sello cubre los datos. Que el tarball que te bajás sea el que salió de este código lo cubre otra cosa: se publica **desde CI con procedencia de npm**, así que cada versión queda ligada al commit y al workflow que la construyeron.

```bash
npm audit signatures
```

En la página del paquete en npm aparece además el enlace al commit exacto. Es el mismo principio que el `protocol_hash`, aplicado a la cadena de suministro en vez de a los datos: no hace falta creernos, se comprueba.

## Configuración

| Variable | Para qué | Por defecto |
|---|---|---|
| `CRYPTOCAPI_API_KEY` | Tu API key | `demo_btc_eth_public` |
| `CRYPTOCAPI_API_BASE` | Base de la API, para desarrollo | `https://api.cryptocapi.com/v1` |
| `CRYPTOCAPI_TIMEOUT_MS` | Presupuesto por request, en ms. Ver abajo | según la herramienta |

**El presupuesto de tiempo no es uno solo.** Cada herramienta pide el suyo, porque
no cuestan lo mismo: 20 s para un motor sobre un activo (`get_insight`,
`get_signal`) y 45 s para los que recorren varios (`batch_signals`, `scan_market`).
Cortar un recorrido del mercado con el presupuesto de una lectura da un timeout
falso, y el agente concluye que la API está caída cuando en realidad estaba
trabajando.

`CRYPTOCAPI_TIMEOUT_MS` **reemplaza** esos presupuestos, no se suma a ellos: el
número que pongas rige para las cuatro herramientas. Ponerlo en `30000` para
darle más aire a `scan_market` en realidad se lo recorta, de 45 s a 30. Si se toca,
conviene que sea por encima del más alto.

Cuando una herramienta se corta, el error dice el presupuesto que efectivamente
rigió, así que ese número es el que hay que superar.

Conseguir una key con prueba de 14 días: [cryptocapi.com](https://cryptocapi.com)

## Desarrollo

```bash
npm install
npm run check      # tipos + tests + auditoría de dependencias
npm run contrato   # verifica contra la API real que el contrato copiado sigue vigente
```

Los tests corren con el runner nativo de Node y **no tienen una sola dependencia de test ni tocan la red**: la API se levanta falsa con `node:http`. Prueban el paquete, no el servicio, que es lo que los hace rápidos y estables.

Ese runner carga TypeScript sin transpilar, así que **para desarrollar hace falta
Node 22.18 o superior**, aunque el paquete publicado corra en 20 —que es lo que
declara `engines`, y lo que el CI verifica arrancando el artefacto construido en
20, 22 y 24—. Es un requisito de desarrollo, no de uso.

Eso deja afuera a propósito una mitad: si el paquete publicado se porta bien contra la API real y dentro de un agente. Para eso está [PRUEBAS.md](PRUEBAS.md), catorce comprobaciones manuales que se corren después de cada release.

`npm run contrato` cubre una parte de esa mitad sin intervención humana. Los tests
no tocan la red a propósito, y ese aislamiento tiene un punto ciego: en septiembre
de 2026 se encontraron cuatro bugs y **tres eran sobre qué manda la API de verdad
contra qué asumía el paquete**, invisibles para un servidor falso que solo devuelve
lo que el test escribió. El chequeo de contrato mira justo eso, corre solo una vez
por día y abre un issue si algo se movió.

Lo que se encontró y todavía no se arregló vive en [PENDIENTES.md](PENDIENTES.md), con el porqué de cada cosa y lo suficiente para retomarla sin volver a investigarla.

### Publicar

Se dispara con un tag y publica desde CI con procedencia:

```bash
npm version <patch|minor|major>   # y commitear
git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z
```

El workflow comprueba primero que el tag coincida con la versión del `package.json`, porque **en npm una versión no se puede reusar** y ese error no se deshace. La autenticación es *trusted publishing* por OIDC, sin token: está atada al nombre de `release.yml`, así que renombrar ese archivo rompe la publicación.

`npm version` es la única fuente de la versión: el servidor lee el `package.json` publicado para declarar su `serverInfo.version`, y un test del handshake falla si los dos números se separan. No hay ningún literal que actualizar a mano.

## Licencia

MIT
