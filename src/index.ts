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
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { CryptoCapiClient } from './http.js';
import { log } from './log.js';
import { registerTools } from './tools.js';

const config = loadConfig();
const client = new CryptoCapiClient(config);

const server = new McpServer({
  name: 'cryptocapi',
  version: '0.0.0',
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
