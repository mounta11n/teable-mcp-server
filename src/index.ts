#!/usr/bin/env node
/**
 * MCP-Server for teable
 * This server will query a specified teable database
 * teable is an opensource alternative to airtable.
 */

// @ts-nocheck
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

// API-Key aus der Umgebungsvariable
const API_KEY = process.env.TEABLE_API_KEY;
if (!API_KEY) {
  console.error('WARNUNG: TEABLE_API_KEY Umgebungsvariable ist nicht gesetzt');
}

// Typdefinition für die Argumente des query_teable-Tools
interface QueryTeableArgs {
  tableId: string;
  filter?: string;
  sort?: string;
  limit?: number;
}

/**
 * Prüft, ob die Argumente für das query_teable-Tool gültig sind
 */
const isValidQueryTeableArgs = (
  args: unknown
): args is QueryTeableArgs => {
  return (
    typeof args === 'object' &&
    args !== null &&
    'tableId' in args && typeof (args as QueryTeableArgs).tableId === 'string' &&
    (!('filter' in args) || typeof (args as QueryTeableArgs).filter === 'string') &&
    (!('sort' in args) || typeof (args as QueryTeableArgs).sort === 'string') &&
    (!('limit' in args) || typeof (args as QueryTeableArgs).limit === 'number')
  );
};

/**
 * TeableServer class to implement the MCP-server
 */
class TeableServer {
  private server: Server;

  constructor() {
    // Server mit Namen und Version initialisieren
    this.server = new Server(
      {
        name: 'teable-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {}, // define later in setupToolHandlers
        },
      }
    );

    this.setupToolHandlers();
    this.server.onerror = (error: unknown) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * setup tool-handler
   */
  private setupToolHandlers() {
    // tool-liste
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'query_teable',
          description: 'Fragt Daten aus einer Teable-Datenbanktabelle ab',
          inputSchema: {
            type: 'object',
            properties: {
              tableId: {
                type: 'string',
                description: 'Die ID der Teable-Tabelle (z.B. tblMIKjgQRIvgq1NrBZ)',
              },
              filter: {
                type: 'string',
                description: 'Optional, Filterkriterien im JSON-Format',
              },
              sort: {
                type: 'string',
                description: 'Optional, Sortierkriterien im JSON-Format',
              },
              limit: {
                type: 'number',
                description: 'Optional, Maximale Anzahl der zurückgegebenen Datensätze',
                minimum: 1,
              }
            },
            required: ['tableId'],
          },
        },
      ],
    }));

    // call tool-handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'query_teable') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unbekanntes Tool: ${request.params.name}`
        );
      }

      if (!isValidQueryTeableArgs(request.params.arguments)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Ungültige Argumente für query_teable'
        );
      }

      const { tableId, filter, sort, limit } = request.params.arguments;

      try {
        // Basis-URL für die Teable-API
        const baseUrl = 'https://acdp.mountai.co/api/table';
        
        // Parameter für die Anfrage
        const params: Record<string, string | number> = {};
        
        if (filter) {
          params.filter = filter;
        }
        
        if (sort) {
          params.sort = sort;
        }
        
        if (limit) {
          params.limit = limit;
        }
        
        // Konfiguration für die Anfrage
        const config = {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json'
          },
          params
        };

        // GET-Anfrage an die Teable-API
        const response = await axios.get(
          `${baseUrl}/${encodeURIComponent(tableId)}/record`,
          config
        );

        // Bei Erfolg
        return {
          content: [
            {
              type: 'text',
              text: `Daten erfolgreich aus Teable-Tabelle ${tableId} abgefragt:\n${JSON.stringify(response.data, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        // Bei Fehler
        if (axios.isAxiosError(error)) {
          return {
            content: [
              {
                type: 'text',
                text: `Fehler bei der Abfrage der Teable-Datenbank: ${
                  error.response?.data ? JSON.stringify(error.response.data) : error.message
                }`,
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
    });
  }

  /**
   * Start the MCP-Server
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Teable MCP-Server läuft über stdio');
  }
}

const server = new TeableServer();
server.run().catch(console.error);
