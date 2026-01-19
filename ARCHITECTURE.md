# Pi MCP Adapter - Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PI CODING AGENT                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Tool Registry                                 │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐  │  │
│  │  │  read       │ │  write      │ │  bash       │ │  mcp            │  │  │
│  │  │  (builtin)  │ │  (builtin)  │ │  (builtin)  │ │  (MCP proxy)    │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘  │  │
│  │                                                                       │  │
│  │  Only ONE tool registered for all MCP servers!                        │  │
│  │  ~200 tokens vs ~15,000 tokens for 75 individual tools                │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                     ▲                                       │
│                                     │ pi.registerTool("mcp", ...)           │
│  ┌──────────────────────────────────┴────────────────────────────────────┐  │
│  │                       PI MCP ADAPTER EXTENSION                        │  │
│  │  ┌────────────┐  ┌─────────────────┐  ┌───────────────────────────┐   │  │
│  │  │  Config    │  │ Server Manager  │  │    Tool Metadata          │   │  │
│  │  │  Loader    │──│ (connections)   │──│ (for search/lookup)       │   │  │
│  │  └────────────┘  └─────────────────┘  └───────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
            │ MCP Server  │   │ MCP Server  │   │ MCP Server  │
            │ (stdio)     │   │ (HTTP)      │   │ (stdio)     │
            │             │   │             │   │             │
            │ xcodebuild  │   │ remote-api  │   │ github      │
            └─────────────┘   └─────────────┘   └─────────────┘
```

## Token Efficiency Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OLD APPROACH (rejected)                             │
│                                                                             │
│  Register each MCP tool individually with Pi:                               │
│                                                                             │
│  - xcodebuild_list_sims      (~200 tokens)                                  │
│  - xcodebuild_build_sim      (~200 tokens)                                  │
│  - xcodebuild_tap            (~200 tokens)                                  │
│  - ... 72 more tools ...                                                    │
│                                                                             │
│  Total: ~15,000 tokens just for tool definitions!                           │
│  Problem: Burns context window, slow, expensive                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEW APPROACH (implemented)                          │
│                                                                             │
│  Single unified `mcp` proxy tool:                                           │
│                                                                             │
│  - mcp({ })                    → Show server status                         │
│  - mcp({ server: "name" })     → List tools from server                     │
│  - mcp({ search: "search" })    → Search for tools                           │
│  - mcp({ tool: "name", args }) → Call a tool                                │
│                                                                             │
│  Total: ~200 tokens for the proxy tool!                                     │
│  LLM discovers tools on-demand via search/list                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Config Loading Flow

```
                              ┌─────────────────────────┐
                              │    loadMcpConfig()      │
                              └───────────┬─────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
        ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
        │  Global Config    │ │  Import Sources   │ │  Project Config   │
        │                   │ │                   │ │                   │
        │ ~/.pi/agent/      │ │ ~/.cursor/        │ │ .pi/mcp.json      │
        │    mcp.json       │ │    mcp.json       │ │ (in project)      │
        │                   │ │                   │ │                   │
        │  PRIORITY: 2      │ │ ~/.claude/        │ │  PRIORITY: 1      │
        │  (base config)    │ │    claude_desktop │ │  (overrides all)  │
        │                   │ │    _config.json   │ │                   │
        └─────────┬─────────┘ │                   │ └─────────┬─────────┘
                  │           │ ~/.windsurf/      │           │
                  │           │    mcp.json       │           │
                  │           │                   │           │
                  │           │ .vscode/mcp.json  │           │
                  │           │                   │           │
                  │           │  PRIORITY: 3      │           │
                  │           │  (only if not in  │           │
                  │           │   global config)  │           │
                  │           └─────────┬─────────┘           │
                  │                     │                     │
                  └──────────┬──────────┴──────────┬──────────┘
                             │                     │
                             ▼                     ▼
                    ┌─────────────────────────────────────┐
                    │         Merged McpConfig            │
                    │                                     │
                    │  {                                  │
                    │    mcpServers: {                    │
                    │      "xcodebuild": {...},           │
                    │      "github": {...},               │
                    │      "imported-server": {...}       │
                    │    },                               │
                    │    settings: {                      │
                    │      toolPrefix: "server"           │
                    │    }                                │
                    │  }                                  │
                    └─────────────────────────────────────┘
```

## Connection Establishment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        McpServerManager.connect()                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │   Check: Already connecting?    │
                    │   (dedupe concurrent attempts)  │
                    └─────────────────┬───────────────┘
                                      │ No
                                      ▼
                    ┌─────────────────────────────────┐
                    │   Check: Existing healthy       │
                    │   connection? (reuse if so)     │
                    └─────────────────┬───────────────┘
                                      │ No
                                      ▼
                    ┌─────────────────────────────────┐
                    │   Has command? ──────────────── │ ─── Yes ──┐
                    └─────────────────┬───────────────┘           │
                                      │ No                        │
                                      ▼                           ▼
                    ┌─────────────────────────────────┐  ┌────────────────────┐
                    │   Has URL?                      │  │ Create Stdio       │
                    └─────────────────┬───────────────┘  │ Transport          │
                                      │ Yes              │                    │
                                      ▼                  │ - spawn process    │
              ┌───────────────────────────────────────┐  │ - connect stdin/   │
              │        HTTP Transport Selection       │  │   stdout           │
              │                                       │  └─────────┬──────────┘
              │  ┌─────────────────────────────────┐  │            │
              │  │ Try StreamableHTTP first        │  │            │
              │  │ (modern MCP servers)            │  │            │
              │  └───────────────┬─────────────────┘  │            │
              │                  │                    │            │
              │         Success? │                    │            │
              │           │      │                    │            │
              │     ┌─────┴──────┴──────┐             │            │
              │     │ Yes              │ No           │            │
              │     ▼                  ▼              │            │
              │  ┌────────┐    ┌──────────────┐       │            │
              │  │ Use    │    │ Fallback to  │       │            │
              │  │ Stream │    │ SSE Transport│       │            │
              │  │ able   │    │ (legacy)     │       │            │
              │  │ HTTP   │    └──────┬───────┘       │            │
              │  └───┬────┘           │               │            │
              │      │                │               │            │
              └──────┼────────────────┼───────────────┘            │
                     │                │                            │
                     └────────┬───────┴────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────────────┐
              │         client.connect(transport)     │
              └───────────────────┬───────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
        ┌───────────────────┐       ┌───────────────────┐
        │   listTools()     │       │  listResources()  │
        │   (with cursor    │       │  (with cursor     │
        │    pagination)    │       │   pagination)     │
        └─────────┬─────────┘       └─────────┬─────────┘
                  │                           │
                  └─────────────┬─────────────┘
                                │
                                ▼
              ┌───────────────────────────────────────┐
              │         ServerConnection              │
              │  {                                    │
              │    client,                            │
              │    transport,                         │
              │    tools: McpTool[],                  │
              │    resources: McpResource[],          │
              │    status: "connected" | "closed"     │
              │  }                                    │
              └───────────────────────────────────────┘
```

## Tool Metadata Collection (NOT Registration)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MCP Server Tool Definition                              │
│                                                                             │
│  {                                                                          │
│    name: "list_sims",                                                       │
│    description: "Lists available iOS simulators",                           │
│    inputSchema: { ... }  ◄─── NOT converted (MCP server validates)          │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Tool Name Formatting                                  │
│                       formatToolName()                                      │
│                                                                             │
│   Server: "xcodebuild"    Tool: "list_sims"                                 │
│                                                                             │
│   prefix: "server"  ──►  "xcodebuild_list_sims"                             │
│   prefix: "short"   ──►  "xcodebuild_list_sims"   (strips -mcp suffix)      │
│   prefix: "none"    ──►  "list_sims"              (collision risk!)         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Tool Metadata (stored in Map)                            │
│                    NOT registered with Pi!                                  │
│                                                                             │
│  toolMetadata.set("xcodebuild", [                                           │
│    {                                                                        │
│      name: "xcodebuild_list_sims",      ◄─── Prefixed name (for lookup)     │
│      originalName: "list_sims",          ◄─── Original MCP tool name        │
│      description: "Lists available iOS simulators",                         │
│    },                                                                       │
│    {                                                                        │
│      name: "xcodebuild_get_simulators",                                     │
│      originalName: "get_simulators",                                        │
│      description: "Read resource: xcodebuildmcp://simulators",              │
│      resourceUri: "xcodebuildmcp://simulators",  ◄─── Resource tools        │
│    },                                                                       │
│    // ... more tools                                                        │
│  ]);                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## How the LLM Uses MCP Tools

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LLM SEES (single tool in system prompt):                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Tool: mcp                                                           │    │
│  │ Description: MCP gateway - connect to MCP servers and call tools.   │    │
│  │                                                                     │    │
│  │ Usage:                                                              │    │
│  │   mcp({ })                          → Show server status            │    │
│  │   mcp({ server: "name" })           → List tools from server        │    │
│  │   mcp({ search: "query" })          → Search for tools              │    │
│  │   mcp({ describe: "tool_name" })    → Show tool parameters          │    │
│  │   mcp({ tool: "name", args: {...} })→ Call a tool                   │    │
│  │                                                                     │    │
│  │ Parameters:                                                         │    │
│  │   tool?: string       - Tool name to call                           │    │
│  │   args?: object       - Arguments for tool call                     │    │
│  │   describe?: string   - Tool name to describe (shows parameters)    │    │
│  │   search?: string     - Search (space-separated words OR'd)         │    │
│  │   server?: string     - Filter to specific server                   │    │
│  │   regex?: boolean     - Treat as regex instead of OR'd words        │    │
│  │   includeSchemas?: boolean - Include schemas (default: true)        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ~200 tokens total (vs ~15,000 for 75 individual tools)                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ LLM workflow:
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  1. LLM calls mcp({}) to see what servers are available                     │
│     → Returns: "MCP: 1/1 servers, 75 tools\n✓ xcodebuild (75 tools)"        │
│                                                                             │
│  2. LLM calls mcp({ search: "simulator" }) to find relevant tools           │
│     → Returns: "Found 5 tools matching 'simulator':\n- xcodebuild_..."      │
│                                                                             │
│  3. LLM calls mcp({ describe: "xcodebuild_boot_sim" }) to see parameters    │
│     → Returns: "Parameters:\n  simulatorId (string) *required*\n  ..."      │
│                                                                             │
│  4. LLM calls mcp({ tool: "xcodebuild_boot_sim", args: {...} }) to execute  │
│     → Returns: "Simulator booted successfully"                              │
│                                                                             │
│  Note: Step 3 is optional - LLM can skip it and learn from error messages   │
│  which include the expected parameter schema.                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tool Execution Flow

```
┌────────────────────────┐
│ LLM decides to call:   │
│ mcp({                  │
│   tool: "xcodebuild_   │
│          list_sims"    │
│ })                     │
└───────────┬────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────┐
│                    Pi Tool Executor                           │
│                                                               │
│  Looks up "mcp" in Tool Registry                              │
│  Finds the unified MCP proxy tool                             │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│              mcp tool execute() - executeCall()               │
│                                                               │
│  1. Look up tool in toolMetadata                              │
│     for (const [server, metadata] of toolMetadata) {          │
│       const found = metadata.find(m => m.name === toolName);  │
│       if (found) { serverName = server; toolMeta = found; }   │
│     }                                                         │
│                                                               │
│  2. Get connection from ServerManager                         │
│     const connection = manager.getConnection(serverName);     │
│     if (!connection || connection.status !== "connected")     │
│       return error;                                           │
│                                                               │
│  3. Call MCP server                                           │
│     if (toolMeta.resourceUri) {                               │
│       // Resource tool - use readResource                     │
│       connection.client.readResource({ uri: resourceUri });   │
│     } else {                                                  │
│       // Regular tool - use callTool                          │
│       connection.client.callTool({                            │
│         name: toolMeta.originalName,  ◄── Original name!      │
│         arguments: args ?? {}                                 │
│       });                                                     │
│     }                                                         │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                    MCP Protocol                               │
│                                                               │
│  ┌─────────────────┐         ┌─────────────────────────────┐  │
│  │  Pi MCP Client  │ ──────► │  MCP Server (xcodebuild)    │  │
│  │                 │  JSON   │                             │  │
│  │  callTool()     │  RPC    │  Validates args (JSON Schema)│ │
│  │                 │ ◄────── │  Executes list_sims         │  │
│  └─────────────────┘         └─────────────────────────────┘  │
│                                                               │
│  Transport: stdio (stdin/stdout) or HTTP (StreamableHTTP/SSE) │
│  Validation: MCP server validates args, not Pi                │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                Content Transformation                         │
│                transformMcpContent()                          │
│                                                               │
│  MCP Content Types          Pi Content Types                  │
│  ─────────────────          ────────────────                  │
│  { type: "text",     ──►    { type: "text",                   │
│    text: "..." }              text: "..." }                   │
│                                                               │
│  { type: "image",    ──►    { type: "image",                  │
│    data: "base64",            data: "base64",                 │
│    mimeType: "..." }          mimeType: "..." }               │
│                                                               │
│  { type: "resource", ──►    { type: "text",                   │
│    resource: {...} }          text: "[Resource: uri]\n..." }  │
│                                                               │
│  { type: "resource   ──►    { type: "text",                   │
│    _link",                    text: "[Resource Link: name]\n  │
│    uri: "..." }               URI: uri" }                     │
│                                                               │
│  { type: "audio",    ──►    { type: "text",                   │
│    ... }                      text: "[Audio content: mime]" } │
│                                                               │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                    Back to LLM                                │
│                                                               │
│  {                                                            │
│    content: [                                                 │
│      { type: "text", text: "Available iOS Simulators:..." }   │
│    ],                                                         │
│    details: { mode: "call", server: "xcodebuild", ... }       │
│  }                                                            │
│                                                               │
│  LLM receives the result and continues conversation           │
└───────────────────────────────────────────────────────────────┘
```

## Lifecycle & Health Checks

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Session Start                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │     initializeMcp()             │
                    │                                 │
                    │  1. Load config                 │
                    │  2. Create ServerManager        │
                    │  3. Create LifecycleManager     │
                    │  4. Connect to each server      │
                    │  5. Collect tool metadata       │
                    │  6. Mark keep-alive servers     │
                    │  7. Start health checks         │
                    │  8. Set reconnect callback      │
                    └─────────────────┬───────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Normal Operation                                     │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Health Check Loop (30s)                          │   │
│   │                                                                     │   │
│   │     for each keep-alive server:                                     │   │
│   │       if (status !== "connected"):                                  │   │
│   │         try reconnect                                               │   │
│   │         if success: call onReconnect callback                       │   │
│   │                     → updates toolMetadata                          │   │
│   │                                                                     │   │
│   │     ┌──────────────────────────────────────────────────────────┐    │   │
│   │     │  Note: Reconnect callback updates tool metadata so       │    │   │
│   │     │  the mcp proxy tool can find tools after reconnection.   │    │   │
│   │     └──────────────────────────────────────────────────────────┘    │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    /mcp Commands                                    │   │
│   │                                                                     │   │
│   │   /mcp status    - Show all servers and their connection status    │   │
│   │   /mcp tools     - List all available MCP tools                    │   │
│   │   /mcp reconnect - Force reconnect all servers, update metadata    │   │
│   │                                                                     │   │
│   │   /mcp-auth <server> - Show OAuth setup instructions               │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ session_shutdown event
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Graceful Shutdown                                  │
│                                                                             │
│   1. Clear health check interval                                            │
│   2. Close all MCP connections (client + transport)                         │
│   3. Tool calls via mcp proxy return "not connected" error                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
~/.pi/agent/extensions/pi-mcp-adapter/
│
├── index.ts              Entry point: unified mcp tool, commands, event handlers
│                         - mcp({}) status, search, list, call modes
│                         - /mcp and /mcp-auth commands
│                         - tool metadata management
│
├── types.ts              Type definitions, formatToolName()
│                         - McpTool, McpResource, McpContent
│                         - ServerEntry, McpConfig, McpSettings
│
├── config.ts             Config loading, import merging
│                         - Global, project, and imported configs
│                         - Priority: project > global > imports
│
├── server-manager.ts     MCP connection management
│                         - stdio transport
│                         - HTTP transport (StreamableHTTP + SSE fallback)
│                         - connection pooling and deduplication
│
├── tool-registrar.ts     Tool name collection (NOT registration!)
│                         - collectToolNames() - builds name list
│                         - transformMcpContent() - MCP → Pi content
│
├── resource-tools.ts     Resource tool name collection
│                         - collectResourceToolNames()
│                         - resourceNameToToolName()
│
├── lifecycle.ts          Health checks, reconnection
│                         - keep-alive server tracking
│                         - reconnect callback for metadata updates
│
├── oauth-handler.ts      OAuth token file reading
│                         - getStoredTokens() from ~/.pi/agent/mcp-oauth/
│
├── package.json          Dependencies (@modelcontextprotocol/sdk)
│
└── tsconfig.json         TypeScript configuration
```

## Key Design Decisions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  1. SINGLE PROXY TOOL (token efficiency)                                    │
│     ────────────────────────────────────                                    │
│     Only ONE tool ("mcp") is registered with Pi.                            │
│     LLM discovers MCP tools on-demand via search/list.                      │
│     Saves ~15,000 tokens for a server with 75 tools.                        │
│                                                                             │
│     mcp({ tool: "xcodebuild_list_sims" })  // call                          │
│     mcp({ search: "simulator" })            // search                        │
│     mcp({ server: "xcodebuild" })          // list                          │
│                                                                             │
│  2. SCHEMA ON-DEMAND (describe mode + error enhancement)                    │
│     ────────────────────────────────────────────────────                    │
│     Schemas stored in metadata, formatted to human-readable on request.     │
│     - mcp({ describe: "tool" }) returns full description + parameters       │
│     - Error responses include expected parameters to help self-correct      │
│     MCP server still does final validation - we just help the LLM.          │
│                                                                             │
│  3. METADATA-BASED LOOKUP                                                   │
│     ────────────────────────                                                │
│     Tool metadata stored in Map<server, ToolMetadata[]>                     │
│     executeCall() looks up tool by prefixed name → finds server + original  │
│     name → calls MCP server with original name.                             │
│                                                                             │
│  4. HTTP TRANSPORT FALLBACK                                                 │
│     ────────────────────────                                                │
│     Try StreamableHTTP first (modern), fall back to SSE (legacy).           │
│     Probe with a test connection, close it, create fresh for real use.      │
│                                                                             │
│  5. TOOL PREFIXING                                                          │
│     ───────────────                                                         │
│     Default "server" prefix prevents tool name collisions.                  │
│     "short" removes -mcp suffix for cleaner names.                          │
│     "none" is risky but available for single-server setups.                 │
│                                                                             │
│  6. CONFIG IMPORT                                                           │
│     ─────────────                                                           │
│     Can import from Cursor, Claude, VSCode, etc.                            │
│     Allows reusing existing MCP configurations.                             │
│     Priority: project > global > imports                                    │
│                                                                             │
│  7. RECONNECT CALLBACK                                                      │
│     ──────────────────                                                      │
│     Lifecycle manager notifies extension after auto-reconnect.              │
│     Extension updates tool metadata so proxy can find tools.                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```
