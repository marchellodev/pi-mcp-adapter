// resource-tools.ts - MCP resource tool name collection
// NOTE: Resources are NOT registered as Pi tools - they're called via the `mcp` proxy.

import { formatToolName, type McpResource } from "./types.js";

interface ResourceCollectionOptions {
  serverName: string;
  prefix: "server" | "none" | "short";
}

/**
 * Collect tool names for MCP resources.
 * Does NOT register with Pi - resources are called via the `mcp` proxy.
 */
export function collectResourceToolNames(
  resources: McpResource[],
  options: ResourceCollectionOptions
): string[] {
  const collected: string[] = [];
  const { serverName, prefix } = options;
  
  for (const resource of resources) {
    const baseName = `get_${resourceNameToToolName(resource.name)}`;
    const toolName = formatToolName(baseName, serverName, prefix);
    collected.push(toolName);
  }
  
  return collected;
}

export function resourceNameToToolName(name: string): string {
  let result = name
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/, "")  // Remove leading underscores
    .replace(/_+$/, "")  // Remove trailing underscores
    .toLowerCase();
  
  // Ensure we have a valid name
  if (!result || /^\d/.test(result)) {
    result = "resource" + (result ? "_" + result : "");
  }
  
  return result;
}
