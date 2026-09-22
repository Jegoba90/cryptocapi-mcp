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

**Cómo se mitiga, y qué falta:** cada archivo declara de qué archivo fuente
salió. **El chequeo automático sigue sin existir**: el plan lo daba por F3 y F3
cerró sin él. Hasta que exista, al tocar `shared/schemas` o los códigos de error
del backend hay que venir a mirar acá a mano.

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
