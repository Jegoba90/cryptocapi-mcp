# Pruebas en vivo del MCP

Los 21 tests automáticos corren **sin red y sin API real**, a propósito: prueban el paquete, no el servicio. Este documento es la otra mitad, la que no se puede automatizar sin volverla frágil: ¿el paquete publicado, contra la API de producción y dentro de un agente de verdad, hace lo que promete?

Se corre a mano después de cada release. Toma unos diez minutos.

---

## Antes de empezar

### Opción A — sin registrarte (demo key)

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

### Opción B — con tu key

Igual, cambiando `CRYPTOCAPI_API_KEY` por la tuya. Necesaria para los checks **9** y **10**, que son los únicos que no se pueden hacer con la demo.

> **Reiniciá el agente después de tocar el `mcp.json`.** Casi todos los clientes leen esa configuración solo al arrancar, y editarla con el agente abierto no cambia nada. Es la causa número uno de "no me aparecen las herramientas".

---

## Bloque 1 — Que el servidor exista

### 1. Las siete herramientas aparecen

Preguntale al agente: **«¿qué herramientas de CryptoCapi tenés disponibles?»**

Tienen que salir las siete: `get_market_summary`, `get_prices`, `get_macro`, `get_insight`, `get_signal`, `batch_signals`, `scan_market`.

*Si no aparece ninguna:* no es la API, es el arranque. Ver el check 11.

### 2. Sin agente, si querés descartar al cliente

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"prueba","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | npx -y @cryptocapi/mcp 2>/dev/null
```

Tres respuestas JSON, la última con las siete herramientas. Sirve para separar un problema del paquete de uno de la configuración del agente.

---

## Bloque 2 — Lo que anda sin pagar nada

### 3. Las tres públicas

**«dame el resumen de mercado»**, **«los últimos precios»**, **«los indicadores macro»**.

Las tres responden con la demo key. Si alguna da 401 o 403, el problema es de la API o de la key, no del MCP.

### 4. El insight básico

**«dame el insight de bitcoin»** → responde con la vista `pulse`.

### 5. El sello, que es el gancho

**«dame el insight alpha de bitcoin y mostrame el `protocol_hash`»**

Tiene que traer un `audit_trail` con `protocol_hash` y `seal_type`.

---

## Bloque 3 — Que los límites se expliquen, no que fallen

Esta es la parte que más importa y la que más fácil se rompe sin que nadie lo note: **cuando algo no se puede, el agente tiene que entender por qué.** Un 403 pelado hace que reintente en loop o que le invente al usuario una explicación.

### 6. La demo key fuera de BTC y ETH

**«dame el insight alpha de solana»**

Esperado: un error que diga que la demo key solo cubre bitcoin y ethereum. **No** un 403 sin texto, y **no** un reintento.

### 7. Un motor que la key no incluye

Con la demo key: **«dame la señal cuantitativa de BTCUSDT»**

Esperado: el error nombra el motor que hace falta (**Quant Pro**), no un «PRO» genérico. Con una key de pago, el mensaje además dice qué pase sí tenés.

Probá también **«escaneá el mercado»** y **«dame las señales de bitcoin y ethereum»**: tienen que nombrar **Market Scan** y **Quant Plus** respectivamente. Son tres pases que se venden por separado, así que tres mensajes distintos.

> **Este check falló la primera vez que se corrió, el 2026-08-28.** Las tres rutas devolvían el mismo texto —«Quantitative signals require a PRO plan subscription»— sin `code` ni `required_product`, así que el MCP no tenía con qué nombrar el motor. Se arregló en el backend, no en el paquete. Si vuelve a fallar, mirá primero si la API está emitiendo el código: `curl -i -H "x-api-key: demo_btc_eth_public" https://api.cryptocapi.com/v1/quant/BTCUSDT/signal` tiene que traer `"code":"PRODUCT_NOT_INCLUDED"`.

### 7 bis. Un pase que compraste y se venció

Necesita una key de pago **vencida**, así que va con las de bloque 4 si la tenés a mano.

Esperado: el error dice que el pase **venció** y que hay que **renovarlo**. Lo que no puede decir, bajo ninguna forma, es que la key «no incluye» el motor: lo compró. Ese texto manda a un cliente que pagó a comprar de nuevo algo que ya tiene.

Es el caso `PRODUCT_NOT_ACTIVE`, y existe justamente para no confundirlo con el 7.

### 8. Que el agente no gaste intentos

Después del 6 y el 7, preguntá: **«¿qué de todo esto no pudiste hacer y por qué?»**

Tiene que poder explicarlo con las palabras del error. Si contesta algo vago tipo «no tengo permiso», el mensaje de error no está cumpliendo su función aunque el código esté bien.

---

## Bloque 4 — Con una key de pago

### 9. El motor que compraste

Pedile lo que corresponda a tu pase (`get_signal`, `batch_signals` o `scan_market`). Responde con datos.

### 10. La trampa de formato, que es la que hace fallar a los agentes

`get_signal` toma un **par de trading** (`BTCUSDT`) y `batch_signals` toma **identificadores de moneda** (`bitcoin`). Mismo motor, dos formatos.

Pedí las dos cosas en la misma conversación: **«dame la señal de BTCUSDT y después las señales de bitcoin y ethereum»**.

Esperado: el agente usa el formato correcto en cada una **sin que se lo aclares**. Si se confunde, el problema está en la descripción del esquema, no en el usuario.

---

## Bloque 5 — Lo que nunca puede pasar

### 11. La API key nunca aparece en un error

Configurá el MCP con una key inventada (`sk_live_loquesea.malformada`) y pedile cualquier cosa.

El mensaje de error **no puede contener la key, ni siquiera el prefijo**. Hay un test automático que lo cubre, y este check confirma lo mismo de punta a punta contra la API real.

Aprovechá y mirá **qué** dice, no solo qué no dice: tiene que señalar la key, no un plan. La API devuelve este caso como `403` en vez de `401`, así que hasta el 2026-08-28 el mensaje hablaba de motores de pago y mandaba a comprar a alguien que solo había copiado mal la key.

### 11 bis. La versión que declara el servidor

En el handshake, `serverInfo.version` tiene que coincidir con la versión publicada del paquete.

La 0.1.0 salió declarando `0.0.0`, y eso vuelve inútil cualquier reporte de bug: el cliente muestra una versión que no existe. Se ve en la primera respuesta del check 2.

### 12. El sello sobrevive el viaje

Es la prueba más valiosa del conjunto, porque es la única que verifica **la promesa del producto** y no el funcionamiento del software.

Pedile al agente `get_insight(coin_id="bitcoin", view="alpha")` y anotá el `protocol_hash`. Después, la misma consulta directo a la API:

```bash
curl -H "x-api-key: demo_btc_eth_public" \
  "https://api.cryptocapi.com/v1/market/insights/bitcoin?view=alpha"
```

**Los dos hashes tienen que ser idénticos.** Si no lo son, el paquete está tocando la respuesta al reenviarla, y eso es un fallo grave: alcanza con reformatear un número para romper la verificación.

> Corré los dos en el mismo minuto. El insight se recalcula cada tanto, y si cambia entre una consulta y la otra los hashes van a diferir por un motivo legítimo. Si sospechás de eso, repetilo: un fallo real es reproducible, uno de sincronización no.

---

## Bloque 6 — Que lo que se instala sea lo que se publicó

### 13. Procedencia

```bash
npm audit signatures
```

En la página del paquete en npm figura además el commit exacto del que salió. Es el mismo principio del `protocol_hash`, aplicado a la cadena de suministro.

### 14. Nada fuera del protocolo por stdout

El comando del check 2 ya lo cubre: **toda** línea de stdout tiene que ser JSON-RPC válido. El diagnóstico va por stderr. Un `console.log` suelto rompe a cualquier cliente MCP, y no siempre con un error claro.

---

## Cuando algo falla

| Síntoma | Dónde mirar primero |
| :--- | :--- |
| No aparece ninguna herramienta | ¿Reiniciaste el agente? Después, el check 2 |
| Todas dan 401 | La key, o que `CRYPTOCAPI_API_KEY` no esté llegando al proceso |
| Solo las de cuantitativa dan 403 | Es lo esperado con la demo key. Ver checks 6 y 7 |
| Los hashes no coinciden | Repetir en el mismo minuto. Si persiste, es un bug del paquete y merece un issue |
| Funciona con `npx` pero no en el agente | Configuración del cliente, no del servidor |
