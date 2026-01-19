# Pi MCP Adapter

Connect [Pi](https://github.com/badlogic/pi-mono/) to any MCP server without burning your context window.

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

## The Problem

MCP servers expose tools for databases, browsers, file systems, APIs. But each tool definition costs ~200 tokens when sent to the LLM. A server with 50 tools? That's 10,000 tokens gone before you've even started. Three servers and you've lost 30K tokens to tool definitions alone.

## The Solution

One proxy tool. The LLM searches for what it needs, sees the schema, and calls it:

```
mcp({ search: "screenshot" })
```
```
chrome_devtools_take_screenshot
  Take a screenshot of the page or element.

  Parameters:
    format (enum: "png", "jpeg", "webp") [default: "png"]
    fullPage (boolean) - Full page instead of viewport
```
```
mcp({ tool: "chrome_devtools_take_screenshot", args: { format: "png" } })
```

Two calls. ~200 tokens for the proxy tool instead of 30K+ for every tool definition.

## Install

```bash
cd ~/.pi/agent/extensions
npm install pi-mcp-adapter
```

Or clone it:

```bash
git clone https://github.com/nicobailon/pi-mcp-adapter
cd pi-mcp-adapter && npm install
```

Restart Pi.

## Config

Create `~/.pi/agent/mcp.json`:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"],
      "lifecycle": "keep-alive"
    }
  }
}
```

For HTTP servers:

```json
{
  "mcpServers": {
    "remote-api": {
      "url": "https://api.example.com/mcp",
      "auth": "bearer",
      "bearerTokenEnv": "API_TOKEN"
    }
  }
}
```

### Options

| Field | Description |
|-------|-------------|
| `command` | Executable for stdio transport |
| `args` | Command arguments |
| `env` | Environment variables (`${VAR}` interpolation supported) |
| `url` | HTTP endpoint (tries StreamableHTTP, falls back to SSE) |
| `auth` | `"bearer"` or `"oauth"` |
| `bearerToken` / `bearerTokenEnv` | Token or env var containing token |
| `lifecycle` | `"keep-alive"` for auto-reconnect |
| `exposeResources` | Expose MCP resources as tools (default: true) |
| `debug` | Show server stderr output (default: false) |

### Import Existing Configs

Already have MCP set up in Cursor or Claude? Import it:

```json
{
  "imports": ["cursor", "claude-code", "claude-desktop"],
  "mcpServers": { }
}
```

Supported: `cursor`, `claude-code`, `claude-desktop`, `vscode`, `windsurf`, `codex`

## Usage

### Search

```
mcp({ search: "screenshot navigate" })
```

Space-separated words are OR'd. Results include parameter schemas by default.

Use `includeSchemas: false` for compact output, `regex: true` for regex matching.

### Describe

```
mcp({ describe: "chrome_devtools_take_screenshot" })
```

Full details for a specific tool. Mostly redundant now that search includes schemas.

### Call

```
mcp({ tool: "chrome_devtools_navigate_page", args: { type: "url", url: "https://example.com" } })
```

If you pass bad arguments, the error includes the expected schema.

### Status

```
mcp({ })
mcp({ server: "chrome-devtools" })
```

See connected servers and their tools.

## Commands

| Command | What it does |
|---------|--------------|
| `/mcp` | Server status |
| `/mcp tools` | List all tools |
| `/mcp reconnect` | Reconnect all servers |
| `/mcp-auth <server>` | OAuth setup instructions |

## OAuth

For OAuth servers, get a token from your provider and save it:

```bash
mkdir -p ~/.pi/agent/mcp-oauth/my-server
cat > ~/.pi/agent/mcp-oauth/my-server/tokens.json << 'EOF'
{
  "access_token": "your-token",
  "token_type": "bearer"
}
EOF
```

Then `/mcp reconnect`.

## How It Works

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full breakdown. The short version:

- One `mcp` tool registered with Pi (~200 tokens)
- Tool metadata stored in a map, looked up at call time
- MCP server validates arguments (no schema conversion needed)
- Keep-alive servers get health checks and auto-reconnect

## Limitations

- OAuth tokens obtained externally (no browser flow)
- No automatic token refresh
- Servers connect sequentially on startup
