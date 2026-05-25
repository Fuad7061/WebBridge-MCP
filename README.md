# WebBridge MCP

> **Dual-protocol browser automation server** — MCP (stdio/SSE/Streamable HTTP) + HTTP REST API. Anti-detection stealth, WebMCP bridge, persistent sessions, and Coolify deployment support.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-20%2B-brightgreen)](package.json)

## Features

- **Dual protocol**: MCP (stdio + SSE + Streamable HTTP) and HTTP REST API — works with Claude Code, Cursor, VS Code, **n8n MCP Client**, or raw cURL
- **Anti-detection**: 7-layer stealth patches (WebDriver, plugins, WebGL, Canvas, permissions, Chrome API, languages) — behaves like a real human browser
- **Playwright engine**: Cross-browser Chromium automation with persistent contexts and real CDP keystrokes
- **46+ tools**: Navigation, clicking, form filling, keyboard input, screenshots, cookies (including raw header string format), scraping, crawling, tab management, JS evaluation, overlay dismissal, element monitoring
- **WebMCP bridge**: Discover and invoke Google's WebMCP tools on Chrome 146+ pages
- **Cookie persistence**: Export/import sessions, raw header string parsing, survive container restarts and browser crashes (auto-replay on crash recovery)
- **n8n-ready**: SSE + Streamable HTTP transports, persistent browser context across multi-step workflows
- **Cloud-ready**: Docker multi-stage, Coolify deploy config
- **Auth**: API key authentication (Bearer `wbr_*` tokens)

## Quick Start

```bash
# Install
npm install -g webridge-mcp

# Start HTTP server (for cURL, n8n, or any HTTP client)
WEBBRIDGE_AUTH_TOKEN=wbr_your-key webridge start --mode=http

# Or via Docker
docker build -t webridge-mcp .
docker run -p 3456:3456 -e WEBBRIDGE_AUTH_TOKEN=wbr_your-key webridge-mcp
```

## Usage

### As MCP Server (Claude Code / Cursor)

```bash
claude mcp add webridge -- npx webridge-mcp
```

With Streamable HTTP (remote):
```bash
claude mcp add webridge --transport http \
  --header "Authorization: Bearer wbr_your-key" \
  https://your-server.com/mcp
```

### As n8n MCP Client

#### Streamable HTTP (recommended)

| Node Setting | Value |
|---|---|
| Type | MCP |
| Transport | Streamable HTTP |
| URL | `http://your-host:3457/mcp` |
| Headers | `Authorization: Bearer wbr_your-key` |

#### SSE

| Node Setting | Value |
|---|---|
| Type | MCP |
| Transport | SSE |
| SSE Endpoint | `http://your-host:3457/sse` |
| Session URL | (auto-provided by server) |
| Headers | `Authorization: Bearer wbr_your-key` |

#### Local stdio (n8n on same machine)

| Node Setting | Value |
|---|---|
| Type | MCP |
| Transport | STDIO |
| Command | `node /path/to/WebBridge-MCP/dist/index.js --mode=mcp` |
| Env Variables | `WEBBRIDGE_AUTH_TOKEN=wbr_your-key` |

### n8n Multi-Step Workflow Example

Chain multiple WebBridge tools in a single n8n workflow to perform complex browser automation:

```
┌─────────────────────────────────────────────────────────────────┐
│  n8n Workflow: Authenticated Data Scraping                      │
│                                                                 │
│  [MCP Client] ── Step 1: browser_cookies_from_header            │
│     cookieString: "session=abc; token=xyz"                      │
│     url: "https://target-site.com/dashboard"                    │
│         │                                                       │
│         ▼                                                       │
│  [MCP Client] ── Step 2: browser_navigate                       │
│     url: "https://target-site.com/dashboard"                    │
│         │                                                       │
│         ▼                                                       │
│  [MCP Client] ── Step 3: browser_type (fill search field)       │
│     selector: "input[name=q]"                                   │
│     text: "search query"                                        │
│     action: "fill"                                              │
│         │                                                       │
│         ▼                                                       │
│  [MCP Client] ── Step 4: browser_click (submit)                 │
│     selector: "button[type=submit]"                             │
│         │                                                       │
│         ▼                                                       │
│  [MCP Client] ── Step 5: browser_wait (wait for results)        │
│     ms: 3000                                                    │
│         │                                                       │
│         ▼                                                       │
│  [MCP Client] ── Step 6: browser_get_text (extract)             │
│     selector: ".results-container"                              │
│         │                                                       │
│         ▼                                                       │
│  [Output] ── Use scraped data in n8n (transform, store, alert)  │
└─────────────────────────────────────────────────────────────────┘
```

**Key points for n8n:**
- The browser context is **persistent across all tool calls** in the same workflow
- Each MCP Client node step uses the same browser session — state carries between calls
- Use `$json.data[0].text` in n8n to access the text output from any tool
- For screenshots, the image is returned as base64 in `$json.data[1].data`

### As HTTP API (cURL)

```bash
# Health check
curl http://localhost:3456/health

# Page reconnaissance
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/recon \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# Set cookies from raw header string
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/cookies_from_header \
  -d '{"cookieString":"session=abc123; token=xyz789","url":"https://example.com"}'

# Click an element
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/click \
  -d '{"selector":"button#submit"}'

# Type into a field
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/type \
  -d '{"selector":"#email","value":"user@example.com","submit":true}'

# Screenshot
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/screenshot \
  -d '{"fullPage":true}' | jq -r '.data[1].data' | base64 -d > page.png

# Navigate
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/navigate \
  -d '{"url":"https://github.com"}'

# List tabs
curl -H "Authorization: Bearer wbr_your-key" http://localhost:3456/tabs

# Dismiss cookie banners
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/dismiss

# Execute JavaScript
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/evaluate \
  -d '{"code":"document.title"}'

# Crawl a site
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/crawl \
  -d '{"url":"https://example.com","maxDepth":2,"maxPages":10}'
```

## Cookie Header String Format

The `cookies_from_header` endpoint accepts cookies in standard `Cookie` header format:

```
session=abc123; token=xyz789; theme=dark; user_id=42
```

This is the format exported by browser devtools, curl with `--cookie`, and many other tools. Just copy-paste the string directly.

```
curl -X POST http://localhost:3456/cookies_from_header \
  -H "Authorization: Bearer wbr_your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "cookieString": "session=abc123; csrf=xyz789",
    "url": "https://target-site.com"
  }'
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WEBBRIDGE_AUTH_TOKEN` | — | API key for authentication |
| `WEBBRIDGE_MODE` | `http` | `http` or `stdio` |
| `WEBBRIDGE_PORT` | `3456` | HTTP server port |
| `WEBBRIDGE_HOST` | `0.0.0.0` | Bind address |
| `WEBBRIDGE_STEALTH_LEVEL` | `stealth` | `basic`, `standard`, or `stealth` |
| `WEBBRIDGE_HEADLESS` | `true` | `true`, `false`, or `new` |
| `WEBBRIDGE_DATA_DIR` | `./data` | Persistent data directory |
| `WEBBRIDGE_TYPING_DELAY_MS` | `50` | Delay between keystrokes |
| `WEBBRIDGE_MAX_CONCURRENCY` | `5` | Max browser contexts |
| `WEBBRIDGE_RATE_LIMIT_MAX` | `60` | Requests/min per IP |
| `CHROME_PATH` | auto | Chrome/Chromium binary path |

## Architecture

```
AI Agent / n8n / cURL
    │
    ├── MCP Protocol (stdio / SSE / Streamable HTTP) ──┐
    │                                                    │
    ▼                                                    ▼
WebBridge MCP Server ───── HTTP REST API (port 3456)
    │
    ▼
Playwright Engine (Chromium)
    │
    ├── 7-layer stealth patches
    ├── Persistent sessions & cookies
    ├── Raw cookie header string parsing
    ├── WebMCP discovery bridge
    └── Human-like behavior simulation
```

## License

MIT
