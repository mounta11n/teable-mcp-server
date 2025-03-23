#!/usr/bin/env node
/**
 * MCP-Server for ntfy.sh
 * This server will send messages to a specified ntfy.sh
 * ntfy.sh is a nice service which can enhance your workflows,
 * because the clients will get push notifications, even on iphones.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

/**
 * check if arguments in send_message-Tool are valid
 */
const isValidSendMessageArgs = (
  args: any
): args is { channel: string; message: string; title?: string; priority?: number; tags?: string[] } => {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof args.channel === 'string' &&
    typeof args.message === 'string' &&
    (args.title === undefined || typeof args.title === 'string') &&
    (args.priority === undefined || typeof args.priority === 'number') &&
    (args.tags === undefined || Array.isArray(args.tags))
  );
};

/**
 * NtfyServer class to implement the MCP-server
 */
class NtfyServer {
  private server: Server;

  constructor() {
    // Server mit Namen und Version initialisieren
    this.server = new Server(
      {
        name: 'ntfy-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {}, // define later in setupToolHandlers
        },
      }
    );

    this.setupToolHandlers();
    this.server.onerror = (error) => console.error('[MCP Error]', error);
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
          name: 'send_message',
          description: 'Sendet eine Nachricht an einen ntfy.sh-Kanal',
          inputSchema: {
            type: 'object',
            properties: {
              channel: {
                type: 'string',
                description: 'Der ntfy.sh-Kanal, an den die Nachricht gesendet wird',
              },
              message: {
                type: 'string',
                description: 'Die zu sendende Nachricht',
              },
              title: {
                type: 'string',
                description: 'Optional, Titel der Nachricht',
              },
              priority: {
                type: 'number',
                description: 'Optional, Priorität (1-5, wobei 5 die höchste Prio ist)',
                minimum: 1,
                maximum: 5,
              },
              tags: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Optional, Tags für die Nachricht',
              }
            },
            required: ['channel', 'message'],
          },
        },
      ],
    }));

    // call tool-handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'send_message') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unbekanntes Tool: ${request.params.name}`
        );
      }

      if (!isValidSendMessageArgs(request.params.arguments)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Ungültige Argumente für send_message'
        );
      }

      const { channel, message, title, priority, tags } = request.params.arguments;

      try {
        const config: any = {};
        
        const headers: Record<string, string> = {};
        
        if (title) {
          headers['Title'] = title;
        }
        
        if (priority) {
          headers['Priority'] = priority.toString();
        }
        
        if (tags && tags.length > 0) {
          headers['Tags'] = tags.join(',');
        }
        
        if (Object.keys(headers).length > 0) {
          config.headers = headers;
        }

        const response = await axios.post(
          `https://ntfy.sh/${encodeURIComponent(channel)}`,
          message,
          config
        );

        // if success
        return {
          content: [
            {
              type: 'text',
              text: `Nachricht erfolgreich an ntfy.sh/${channel} gesendet:\n${JSON.stringify(response.data, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        // otherwise
        if (axios.isAxiosError(error)) {
          return {
            content: [
              {
                type: 'text',
                text: `Fehler beim Senden der Nachricht: ${
                  error.response?.data || error.message
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
    console.error('Ntfy MCP-Server läuft über stdio');
  }
}

const server = new NtfyServer();
server.run().catch(console.error);
