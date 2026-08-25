# @cryptocapi/mcp

Servidor MCP de **CryptoCapi**: análisis de mercado cripto con sello verificable, expuesto como herramientas nativas para agentes.

> 🚧 **En construcción.** Las siete herramientas funcionan contra la API de producción, pero **el paquete todavía no está publicado en npm**, así que el `npx` de abajo aún no resuelve. Falta la tanda de pruebas automatizadas y el CI.

## Las siete herramientas

| Herramienta | Qué devuelve | Qué requiere |
|---|---|---|
| `get_market_summary` | Capitalización, volumen 24h, dominancia, miedo y codicia | Nada |
| `get_prices` | Últimos precios de los activos seguidos | Nada |
| `get_macro` | Indicadores macro que el motor usa de contexto | Nada |
| `get_insight` | Análisis de un activo. La vista `alpha` trae el sello | `pulse` libre · `alpha` requiere pase |
| `get_signal` | Señal cuantitativa de un par de trading | Pase **Quant Pro** |
| `batch_signals` | Señales de varios activos en una llamada | Pase **Quant Plus** |
| `scan_market` | Ranking del mercado según una estrategia | Pase **Market Scan** |

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

**Qué alcanza con la demo key, dicho de frente:** las tres herramientas públicas responden sin restricción, y `get_insight` con `view="alpha"`, que es donde se ve el sello, funciona **sólo para bitcoin y ethereum**. Las tres de cuantitativa quedan fuera. O sea que en la primera sesión responden cuatro de siete, y el gancho real, el sello, se ve en Bitcoin.

## Qué lo diferencia

La respuesta de los motores viaja con un `audit_trail` que incluye un `protocol_hash`: un sello del cálculo determinista que produjo el análisis. Este paquete **reenvía esos valores tal como llegaron de la API, sin volver a serializarlos**, porque reformatear un solo número bastaría para que el hash dejara de verificar.

No hace falta creernos: pedile a tu agente el análisis con `get_insight(coin_id="bitcoin", view="alpha")` y compará el `protocol_hash` de esa salida con el de la misma consulta hecha directo contra la API.

```bash
curl -H "x-api-key: demo_btc_eth_public" \
  "https://api.cryptocapi.com/v1/market/insights/bitcoin?view=alpha"
```

Tienen que ser idénticos. Si algún día no lo son, es un fallo de este paquete y merece un issue.

**El límite, dicho también:** el sello prueba que el cálculo es reproducible y que no lo escribió un modelo de lenguaje. No prueba que el análisis acierte, y hoy es un checksum sin firma criptográfica, así que acredita integridad, no origen.

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
npm run typecheck
npm run build
```

## Licencia

MIT
