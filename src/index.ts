#!/usr/bin/env node
/**
 * Servidor MCP de CryptoCapi — transporte stdio.
 *
 * Corre en la máquina del usuario vía `npx @cryptocapi/mcp`. La API key vive en
 * el `mcp.json` del usuario y nunca en un servidor nuestro (plan §3.1).
 *
 * F1: esqueleto. Los 7 tools de §4.1 llegan en F2; acá sólo se prueba que el
 * server levanta, habla el protocolo y no ensucia stdout.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { CryptoCapiClient } from './http.js';
import { log } from './log.js';

const config = loadConfig();
const client = new CryptoCapiClient(config);

const server = new McpServer({
  name: 'cryptocapi',
  version: '0.0.0',
});

/**
 * Único tool de F1, y a propósito el más barato: endpoint público, sin key, sin
 * sello. Sirve para verificar el transporte de punta a punta antes de que exista
 * nada que pueda romper el `protocol_hash`.
 *
 * La respuesta se reenvía **verbatim** (§11.2): el texto que devolvió la API,
 * sin volver a serializar. Es el patrón que van a seguir los 7 tools de F2.
 */
server.registerTool(
  'get_market_summary',
  {
    title: 'Resumen de mercado',
    description:
      'Resumen del mercado cripto de CryptoCapi: capitalización total, volumen 24h, ' +
      'dominancia de BTC y ETH e índice de miedo y codicia. Endpoint público: no ' +
      'requiere plan ni API key.',
    inputSchema: {},
  },
  async () => {
    const response = await client.get('/market/market-summary');
    return {
      content: [{ type: 'text' as const, text: response.raw }],
      ...(response.status >= 400 ? { isError: true } : {}),
    };
  }
);

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
