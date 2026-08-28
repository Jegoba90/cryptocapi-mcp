#!/usr/bin/env node
/**
 * Servidor MCP de CryptoCapi — transporte stdio.
 *
 * Corre en la máquina del usuario vía `npx @cryptocapi/mcp`. La API key vive en
 * el `mcp.json` del usuario y nunca en un servidor nuestro (plan §3.1).
 *
 * F2: los siete tools de §4.1 estan registrados. Este archivo solo arma las
 * piezas y abre el transporte; la superficie vive en `tools.ts`.
 */
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { CryptoCapiClient } from './http.js';
import { log } from './log.js';
import { registerTools } from './tools.js';

/**
 * La versión que el servidor le declara al cliente MCP, leída del manifiesto
 * publicado en vez de escrita a mano.
 *
 * Hasta el 2026-08-28 era el literal `'0.0.0'`, que sobrevivió intacto a la
 * release 0.1.0: todo cliente mostraba una versión inexistente, y un reporte de
 * bug no permitía saber qué código estaba corriendo del otro lado.
 *
 * `readFileSync` y no `import ... with { type: 'json' }`: el paquete declara
 * Node >=20 y las import attributes recién son estables en 22. Tampoco un
 * `import` normal, porque `rootDir` es `src` y el manifiesto vive fuera.
 *
 * Desde `dist/index.js`, `../package.json` es la raíz del paquete. npm siempre
 * incluye el manifiesto en el tarball, así que el archivo está garantizado.
 */
function readPackageVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
      const { version } = parsed as { version: unknown };
      if (typeof version === 'string' && version.length > 0) return version;
    }
  } catch {
    // Un manifiesto ilegible no puede tumbar el servidor: la versión es
    // diagnóstico, no funcionalidad. El valor de abajo delata el problema sin
    // hacerse pasar por una versión real.
  }
  return '0.0.0-unknown';
}

const config = loadConfig();
const client = new CryptoCapiClient(config);

const server = new McpServer({
  name: 'cryptocapi',
  version: readPackageVersion(),
});

registerTools(server, client);

async function main(): Promise<void> {
  // Todo diagnóstico por stderr; stdout es sólo del protocolo (§11.1).
  log.info(
    `iniciando contra ${config.baseUrl}` +
      (config.usingDemoKey ? ' con la demo key pública (BTC y ETH en Radar Alpha)' : '')
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('conectado por stdio, esperando al cliente');
}

main().catch((error: unknown) => {
  log.error('el servidor no pudo arrancar', error instanceof Error ? error.message : error);
  process.exit(1);
});
