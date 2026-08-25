/**
 * Diagnóstico, siempre por stderr.
 *
 * stdout es el canal del protocolo MCP y nada que no sea JSON-RPC puede
 * escribirse ahí (plan §11.1). En Node el riesgo es mayor que en Go porque
 * `console.log` es el reflejo natural: un solo `console.log` de depuración
 * corrompe el stream y mata la sesión sin dejar un error entendible.
 *
 * Por eso este módulo es la única vía de salida de texto del paquete, y todo
 * lo que escribe va a `process.stderr`. `console.log` no se usa en ningún
 * archivo de `src/`.
 */

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, message: string, detail?: unknown): void {
  const line =
    detail === undefined
      ? `[cryptocapi-mcp] ${level}: ${message}`
      : `[cryptocapi-mcp] ${level}: ${message} ${safeDetail(detail)}`;
  process.stderr.write(`${line}\n`);
}

/**
 * Un detalle que no se puede serializar no debe tumbar el proceso: el log es
 * accesorio y el protocolo no.
 */
function safeDetail(detail: unknown): string {
  try {
    return typeof detail === 'string' ? detail : JSON.stringify(detail);
  } catch {
    return '[detalle no serializable]';
  }
}

export const log = {
  info: (message: string, detail?: unknown): void => emit('info', message, detail),
  warn: (message: string, detail?: unknown): void => emit('warn', message, detail),
  error: (message: string, detail?: unknown): void => emit('error', message, detail),
};
