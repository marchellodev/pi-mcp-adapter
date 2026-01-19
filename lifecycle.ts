// lifecycle.ts - Connection health checks and reconnection
import type { ServerDefinition } from "./types.js";
import type { McpServerManager } from "./server-manager.js";

export type ReconnectCallback = (serverName: string) => void;

export class McpLifecycleManager {
  private manager: McpServerManager;
  private keepAliveServers = new Map<string, ServerDefinition>();
  private healthCheckInterval?: NodeJS.Timeout;
  private onReconnect?: ReconnectCallback;
  
  constructor(manager: McpServerManager) {
    this.manager = manager;
  }
  
  /**
   * Set callback to be invoked after a successful auto-reconnect.
   * Use this to update tool metadata when a server reconnects.
   */
  setReconnectCallback(callback: ReconnectCallback): void {
    this.onReconnect = callback;
  }
  
  markKeepAlive(name: string, definition: ServerDefinition): void {
    this.keepAliveServers.set(name, definition);
  }
  
  startHealthChecks(intervalMs = 30000): void {
    this.healthCheckInterval = setInterval(() => {
      this.checkConnections();
    }, intervalMs);
    this.healthCheckInterval.unref();
  }
  
  private async checkConnections(): Promise<void> {
    for (const [name, definition] of this.keepAliveServers) {
      const connection = this.manager.getConnection(name);
      
      if (!connection || connection.status !== "connected") {
        try {
          await this.manager.connect(name, definition);
          console.log(`MCP: Reconnected to ${name}`);
          // Notify extension to update metadata
          this.onReconnect?.(name);
        } catch (error) {
          console.error(`MCP: Failed to reconnect to ${name}:`, error);
        }
      }
    }
  }
  
  async gracefulShutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    await this.manager.closeAll();
  }
}
