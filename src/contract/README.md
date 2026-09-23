# Contrato copiado, no importado

Estos schemas son una **copia** de `shared/schemas/` del repo de CryptoCapi
(`cryptocapi-refactor`). No se importan por path a propósito: este paquete se
publica en npm y tiene que quedar autocontenido, así que los tipos hay que
empaquetarlos igual. Ese fue el argumento que decidió el repo aparte
(MCP_NATIVO_PLAN §3.2).

**La deuda que esto crea, dicha de frente:** una copia puede quedar vieja en
silencio. Un cambio en el contrato del backend no rompe la compilación acá,
que es exactamente el riesgo que el plan quería evitar al elegir TypeScript
sobre Go (§3.4).

**Cómo se mitiga:** cada archivo declara de qué archivo fuente salió, y desde el
2026-09-23 **existe el chequeo automático** que el plan daba por F3 y que F3
cerró sin hacer.

```bash
npm run contrato
```

[`scripts/contrato.ts`](../../scripts/contrato.ts) pega a la API **real** con la
key pública de demostración y verifica que lo copiado acá siga siendo cierto: que
los dos sellos validen contra `AuditTrailSchema`, que los 403 traigan su `code`
**plano** y su `required_product`, y que el alcance de la demo key sea el que la
documentación promete. Corre además solo, una vez por día, desde
[`.github/workflows/contrato.yml`](../../.github/workflows/contrato.yml), y abre un
issue si algo se movió.

Distingue «el contrato se movió» (sale con 1) de «no se pudo verificar por rate
limit o red» (sale con 2). No es un detalle: una reja que acusa al backend cada
vez que la limitan se vuelve ruido y se deja de leer.

**Lo que el chequeo no alcanza:** con la demo key, `get_signal` y `scan_market`
solo se ven en su forma 403. Eso igual tiene valor —ese 403 ES parte del contrato
que el paquete traduce— pero sus caminos felices quedan sin cubrir salvo que se le
pase una key paga en `CRYPTOCAPI_API_KEY`. Y del enum de sellos queda sin ver
`output_seal`, que la demo key no produce.

Al tocar `shared/schemas` o los códigos de error del backend sigue conviniendo
venir a mirar acá; la diferencia es que ahora, si nadie mira, el chequeo avisa.

Sólo se copia lo que el paquete necesita para decidir, no el contrato entero.

## Sincronizaciones hechas a mano

| Fecha | Qué cambió en el origen | Qué se copió acá |
| :--- | :--- | :--- |
| 2026-08-28 | `ErrorDetails` de `backend/src/api/middlewares/error.ts` suma `PRODUCT_NOT_ACTIVE`, que las tres rutas de quant emiten cuando la key compró el motor y el pase venció | `PRODUCT_NOT_ACTIVE` en `KNOWN_ERROR_CODES`, más su rama de traducción en `../errors.ts` |

Esta tabla es el sustituto pobre del chequeo automático: sirve para auditar la
deriva hacia atrás, no para evitarla.

## Una divergencia deliberada, para que nadie la "arregle"

`ApiErrorBodySchema` declara **todos** los campos opcionales, incluidos `status`
y `message`, que en el origen son obligatorios. **No es una copia desactualizada:
es a propósito, y volver a alinearla con el backend reintroduce un fallo.**

Hasta la 0.2.3 se copiaban tal cual, con `status: z.literal("error")`. El efecto
era que un cuerpo que no trajera esas dos claves exactamente así se descartaba
entero, y con él se iba el `code` — lo único que `llms.txt` le manda mirar al
agente («branch on `code`, not on the prose»). Un 403 con
`code: PRODUCT_NOT_INCLUDED` le llegaba como un 403 pelado.

El backend manda las cinco claves, así que contra él la diferencia no se nota.
Se nota contra todo lo demás: `CRYPTOCAPI_API_BASE` existe para apuntar el
paquete a otro despliegue, y cualquier gateway delante de la API puede
reformatear el cuerpo. **Acá se lee con tolerancia justamente porque el origen
del dato no siempre es el origen del contrato.**
