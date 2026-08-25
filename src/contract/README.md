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
salió. Falta el chequeo automático que compare contra el origen; va en F3 junto
al resto del CI. Hasta que exista, al tocar `shared/schemas` en el repo
principal hay que venir a mirar acá.

Sólo se copia lo que el paquete necesita para decidir, no el contrato entero.
