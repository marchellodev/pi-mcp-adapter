<p>
  <img src="banner.png" alt="pi-mcp-adapter" width="1100">
</p>

# Pi MCP Adapter

Use MCP servers with [Pi](https://github.com/badlogic/pi-mono/) without burning your context window.

https://github.com/user-attachments/assets/4b7c66ff-e27e-4639-b195-22c3db406a5a

## Why This Exists

Mario wrote about [why you might not need MCP](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/). The problem: tool definitions are verbose. A single MCP server can burn 10k+ tokens, and you're paying that cost whether you use those tools or not. Connect a few servers and you've burned half your context window before the conversation starts.

His take: skip MCP entirely, write simple CLI tools instead.

But the MCP ecosystem has useful stuff - databases, browsers, APIs. This adapter gives you access without the bloat. One proxy tool (~200 tokens) instead of hundreds. The agent discovers what it needs on-demand.

## Install

```bash
pi install npm:pi-mcp-adapter
```

Restart Pi after installation.

## Quick Start

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

The LLM searches for tools, sees their schemas, and calls them:

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
mcp({ tool: "chrome_devtools_take_screenshot", args: '{"format": "png"}' })
```

Note: `args` is a JSON string, not an object.

Two calls instead of 26 tools cluttering the context.

## Config

### Server Options

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "some-mcp-server"],
      "lifecycle": "keep-alive"
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `command` | Executable for stdio transport |
| `args` | Command arguments |
| `env` | Environment variables (`${VAR}` interpolation) |
| `url` | HTTP endpoint (StreamableHTTP with SSE fallback) |
| `auth` | `"bearer"` or `"oauth"` |
| `bearerToken` / `bearerTokenEnv` | Token or env var |
| `lifecycle` | `"keep-alive"` for auto-reconnect |
| `exposeResources` | Expose MCP resources as tools (default: true) |
| `debug` | Show server stderr (default: false) |

### Import Existing Configs

Already have MCP set up elsewhere? Import it:

```json
{
  "imports": ["cursor", "claude-code", "claude-desktop"],
  "mcpServers": { }
}
```

Supported: `cursor`, `claude-code`, `claude-desktop`, `vscode`, `windsurf`, `codex`

## Usage

| Mode | Example |
|------|---------|
| Search | `mcp({ search: "screenshot navigate" })` |
| Describe | `mcp({ describe: "tool_name" })` |
| Call | `mcp({ tool: "...", args: '{"key": "value"}' })` |
| Status | `mcp({ })` or `mcp({ server: "name" })` |

Search includes parameter schemas by default. Space-separated words are OR'd.

## Commands

| Command | What it does |
|---------|--------------|
| `/mcp` | Server status |
| `/mcp tools` | List all tools |
| `/mcp reconnect` | Reconnect servers |
| `/mcp-auth <server>` | OAuth setup |

## How It Works

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details. Short version:

- One `mcp` tool in context (~200 tokens)
- Tool metadata stored in a map, looked up at call time
- MCP server validates arguments
- Keep-alive servers get health checks and auto-reconnect

## Limitations

- OAuth tokens obtained externally (no browser flow)
- No automatic token refresh
