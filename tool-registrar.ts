// tool-registrar.ts - MCP tool metadata and content transformation
// NOTE: Tools are NOT registered with Pi - only the unified `mcp` proxy tool is registered.
// This keeps the LLM context small (1 tool instead of 100s).

import type { McpTool, McpContent, ContentBlock } from "./types.js";
import { formatToolName } from "./types.js";

interface ToolCollectionOptions {
  serverName: string;
  prefix: "server" | "none" | "short";
}

/**
 * Collect tool names from MCP server tools.
 * Does NOT register with Pi - tools are called via the `mcp` proxy.
 */
export function collectToolNames(
  tools: McpTool[],
  options: ToolCollectionOptions
): { collected: string[]; failed: string[] } {
  const collected: string[] = [];
  const failed: string[] = [];
  
  for (const tool of tools) {
    // Basic validation - tool must have a name
    if (!tool.name) {
      failed.push("(unnamed)");
      continue;
    }
    
    const toolName = formatToolName(tool.name, options.serverName, options.prefix);
    collected.push(toolName);
  }
  
  return { collected, failed };
}

/**
 * Transform MCP content types to Pi content blocks.
 */
export function transformMcpContent(content: McpContent[]): ContentBlock[] {
  return content.map(c => {
    if (c.type === "text") {
      return { type: "text" as const, text: c.text ?? "" };
    }
    if (c.type === "image") {
      return {
        type: "image" as const,
        data: c.data ?? "",
        mimeType: c.mimeType ?? "image/png",
      };
    }
    if (c.type === "resource") {
      const resourceUri = c.resource?.uri ?? "(no URI)";
      const resourceContent = c.resource?.text ?? (c.resource ? JSON.stringify(c.resource) : "(no content)");
      return {
        type: "text" as const,
        text: `[Resource: ${resourceUri}]\n${resourceContent}`,
      };
    }
    if (c.type === "resource_link") {
      const linkName = c.name ?? c.uri ?? "unknown";
      const linkUri = c.uri ?? "(no URI)";
      return {
        type: "text" as const,
        text: `[Resource Link: ${linkName}]\nURI: ${linkUri}`,
      };
    }
    if (c.type === "audio") {
      return {
        type: "text" as const,
        text: `[Audio content: ${c.mimeType ?? "audio/*"}]`,
      };
    }
    return { type: "text" as const, text: JSON.stringify(c) };
  });
}
