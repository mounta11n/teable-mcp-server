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

// Enter API key and table ID manually
const TEABLE_API_KEY = 'teable_XXX';
const TABLE_ID = 'tblXXX';

// Type definition for the arguments of the query_teable tool
interface QueryTeableArgs {
  filter?: string;
  sort?: string;
  limit?: number;
}

/**
 * This checks whether the arguments for the query_teable tool are valid
 */
const isValidQueryTeableArgs = (
  args: unknown
): args is QueryTeableArgs => {
  return (
    typeof args === 'object' &&
    args !== null &&
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
    // Initialize server with name and version
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
    // tool-list
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'query_teable',
          description: 'Fragt Daten aus einer Teable-Datenbanktabelle ab',
          inputSchema: {
            type: 'object',
            properties: {
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
            required: [],
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

      const { filter, sort, limit } = request.params.arguments;

      try {
        // Teable-API Base-URL
        const baseUrl = 'https://acdp.mountai.co/api/table';
        
        // Parameters for the request
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
        
        // Configuration for the request
        const config = {
          headers: {
            'Authorization': `Bearer ${TEABLE_API_KEY}`,
            'Accept': 'application/json'
          },
          params
        };

        // GET request to the Teable API
        const response = await axios.get(
          `${baseUrl}/${encodeURIComponent(TABLE_ID)}/record`,
          config
        );

        // If successful
        return {
          content: [
            {
              type: 'text',
              text: `Daten erfolgreich aus Teable-Tabelle ${TABLE_ID} abgefragt:\n${JSON.stringify(response.data, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        // In case of error
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
