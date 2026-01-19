// types.ts - Core type definitions
import type { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { TextContent, ImageContent } from "@mariozechner/pi-ai";

// Transport type (stdio + HTTP)
export type Transport = 
  | StdioClientTransport 
  | SSEClientTransport 
  | StreamableHTTPClientTransport;

// Import sources for config
export type ImportKind = 
  | "cursor" 
  | "claude-code" 
  | "claude-desktop" 
  | "codex" 
  | "windsurf" 
  | "vscode";

// Tool definition from MCP server
export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown; // JSON Schema
}

// Resource definition from MCP server
export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// Content types from MCP
export interface McpContent {
  type: "text" | "image" | "audio" | "resource" | "resource_link";
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: {
    uri: string;
    text?: string;
    blob?: string;
  };
  uri?: string;
  name?: string;
  description?: string;
}

// Pi content block type
export type ContentBlock = TextContent | ImageContent;

// Server configuration
export interface ServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  // HTTP fields
  url?: string;
  headers?: Record<string, string>;
  auth?: "oauth" | "bearer";
  bearerToken?: string;
  bearerTokenEnv?: string;
  lifecycle?: "keep-alive" | "ephemeral";
  // Resource handling
  exposeResources?: boolean;
  // Debug
  debug?: boolean;  // Show server stderr (default: false)
}

// Settings
export interface McpSettings {
  toolPrefix?: "server" | "none" | "short";
}

// Root config
export interface McpConfig {
  mcpServers: Record<string, ServerEntry>;
  imports?: ImportKind[];
  settings?: McpSettings;
}

// Alias for clarity
export type ServerDefinition = ServerEntry;

/**
 * Format a tool name with server prefix.
 */
export function formatToolName(
  toolName: string,
  serverName: string,
  prefix: "server" | "none" | "short"
): string {
  switch (prefix) {
    case "none":
      return toolName;
    case "short":
      let short = serverName.replace(/-?mcp$/i, "").replace(/-/g, "_");
      // Fallback if server name was just "mcp" or similar
      if (!short) short = "mcp";
      return `${short}_${toolName}`;
    case "server":
    default:
      const normalized = serverName.replace(/-/g, "_");
      return `${normalized}_${toolName}`;
  }
}
