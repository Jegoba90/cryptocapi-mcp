# @cryptocapi/mcp

Servidor MCP de **CryptoCapi**: análisis de mercado cripto con sello verificable, expuesto como herramientas nativas para agentes.

> 🚧 **En construcción.** F1 del [plan](https://github.com/jegoba/CryptoCapi-Portfolio) está en curso: el servidor levanta y habla el protocolo, pero de los 7 tools previstos hoy sólo existe uno. No publicado en npm todavía.

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

**Qué alcanza con la demo key, dicho de frente:** los endpoints públicos responden sin límite de moneda, y el análisis Radar Alpha, que es donde se ve el sello, funciona sólo para **bitcoin** y **ethereum**. Los motores de cuantitativa requieren un plan de pago. Cada herramienta declara en su descripción qué plan necesita, para que el agente no intente las que no puede usar.

## Qué lo diferencia

La respuesta de los motores viaja con un `audit_trail` que incluye un `protocol_hash`: un sello del cálculo determinista que produjo el análisis. Este paquete **reenvía esos valores tal como llegaron de la API, sin volver a serializarlos**, porque reformatear un solo número bastaría para que el hash dejara de verificar.

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
