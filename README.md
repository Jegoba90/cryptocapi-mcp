# @cryptocapi/mcp

Servidor MCP de **CryptoCapi**: análisis de mercado cripto con sello verificable, expuesto como herramientas nativas para agentes.

## Las cuatro herramientas

| Herramienta | Qué devuelve | Qué requiere |
|---|---|---|
| `get_insight` | Análisis de un activo. La vista `alpha` trae el sello | `pulse` libre · `alpha` requiere pase |
| `batch_signals` | Señales de varios activos en una llamada | Pase **Quant Plus** |
| `get_signal` | Señal cuantitativa de un par de trading | Pase **Quant Pro** |
| `scan_market` | Ranking del mercado según una estrategia | Pase **Market Scan** |

**Las cuatro son motores de CryptoCapi.** Hasta el 2026-08-30 había tres más (`get_market_summary`, `get_prices`, `get_macro`) que devolvían dato de terceros: capitalización y miedo y codicia, precios de CoinGecko y series macro de FRED. Se retiraron porque CryptoCapi no es un agregador: sus motores firman inteligencia derivada y el dato ajeno es insumo interno. Un agente que preguntaba «¿cómo está el mercado?» agarraba el resumen y se iba con dato de terceros sin tocar un motor. Esos endpoints siguen existiendo en la API REST; lo que se retiró es que el agente los vea como herramientas.

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
| Quant Plus | `batch_signals` | ❌ cerrado, para cualquier moneda |
| Quant Pro | `get_signal` | ❌ cerrado, para cualquier par |
| Market Scan | `scan_market` | ❌ cerrado, para cualquier estrategia |

Las tres cerradas **no fallan por la moneda, fallan siempre**: `get_signal` con `BTCUSDT`, que es el par de Bitcoin, también devuelve 403. La restricción a bitcoin y ethereum aplica a `get_insight` y nada más.

O sea que en la primera sesión responde **una de las cuatro herramientas**, y es la que muestra el producto: el análisis firmado, sobre Bitcoin, con los dos motores que lo firman.

> **Una rareza conocida, y está sin resolver:** Quant Plus contesta por `get_insight?engine=quant_plus` y se cierra por `batch_signals`, que es el mismo motor. Son dos decisiones deliberadas que se cruzan (el plan `demo` tiene acceso completo por producto, y las rutas quant lo rechazan por plan), pero para un agente el efecto es contradictorio.

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
| `CRYPTOCAPI_TIMEOUT_MS` | Presupuesto por request | `15000` |

Conseguir una key con prueba de 14 días: [cryptocapi.com](https://cryptocapi.com)

## Desarrollo

```bash
npm install
npm run check   # tipos + tests + auditoría de dependencias
```

Los tests corren con el runner nativo de Node y **no tienen una sola dependencia de test ni tocan la red**: la API se levanta falsa con `node:http`. Prueban el paquete, no el servicio, que es lo que los hace rápidos y estables.

Eso deja afuera a propósito una mitad: si el paquete publicado se porta bien contra la API real y dentro de un agente. Para eso está [PRUEBAS.md](PRUEBAS.md), catorce comprobaciones manuales que se corren después de cada release.

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
