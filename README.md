# WebBridge MCP

> **Dual-protocol browser automation server** — MCP (stdio/SSE/Streamable HTTP) + HTTP REST API. Anti-detection stealth, WebMCP bridge, persistent sessions, and Coolify deployment support.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-20%2B-brightgreen)](package.json)

## Features

- **Dual protocol**: MCP (stdio + SSE + Streamable HTTP) and HTTP REST API — works with Claude Code, Cursor, VS Code, **n8n MCP Client**, or raw cURL
- **Anti-detection**: 7-layer stealth patches (WebDriver, plugins, WebGL, Canvas, permissions, Chrome API, languages) — behaves like a real human browser
- **Playwright engine**: Cross-browser Chromium automation with persistent contexts and real CDP keystrokes
- **35 tools**: Navigation, clicking, form filling, keyboard input, screenshots, cookies (including raw header string format), scraping, crawling, tab management, JS evaluation, overlay dismissal, element monitoring, workflow generator
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
│  [MCP Client] ── Step 4: browser_press_key (submit)             │
│     key: "Enter"                                                │
│  (or browser_click → selector: "button[type=submit]")           │
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

# Type into a field (clear + fill instantly)
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/type \
  -d '{"selector":"#email","text":"user@example.com","submit":true}'
# Accepts "value" as alias for "text", and action: "type" for real keystrokes

# Press a keyboard key (Enter, Tab, Escape, etc.)
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/press_key \
  -d '{"key":"Enter"}'

curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/press_key \
  -d '{"key":"Escape"}'

curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/press_key \
  -d '{"key":"ArrowDown","delay":50}'

# Screenshot
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/screenshot \
  -d '{"fullPage":true}' | jq -r '.data[1].data' | base64 -d > page.png

# Navigate
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/navigate \
  -d '{"url":"https://github.com"}'

# List tabs
curl -X POST -H "Authorization: Bearer wbr_your-key" \
  http://localhost:3456/list_tabs
# (alias: POST /tabs)

# Dismiss cookie banners
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/dismiss_overlays
# (alias: POST /dismiss)

# Execute JavaScript
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/evaluate \
  -d '{"code":"document.title"}'

# Crawl a site
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/crawl \
  -d '{"url":"https://example.com","maxDepth":2,"maxPages":10}'

# Get workflow guide (returns step-by-step patterns for all scenarios)
curl -H "Authorization: Bearer wbr_your-key" \
  -X POST http://localhost:3456/workflow_guide
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

## MCP Endpoints

The MCP endpoints let you interact with WebBridge using the Model Context Protocol (JSON-RPC 2.0). They are used by n8n MCP Client, Claude Code, Cursor, and any MCP-compatible client.

### GET /tools — List all tools

Returns every registered MCP tool with its name, description, and JSON input schema. Use this to discover available capabilities programmatically.

```bash
curl http://localhost:3456/tools \
  -H "Authorization: Bearer wbr_your-key"

# Returns: { tools: [{ name, description, inputSchema }, ...] }
```

### POST /tools/:name — Call a tool by MCP name

Call any MCP tool directly via HTTP using its full MCP name (e.g. `browser_navigate`, `browser_cookies_from_header`).

```bash
curl -X POST http://localhost:3456/tools/browser_navigate \
  -H "Authorization: Bearer wbr_your-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

### POST /mcp — Streamable HTTP (JSON-RPC)

Accepts standard JSON-RPC 2.0 requests. Supports `initialize`, `ping`, `tools/list`, and `tools/call` methods.

```bash
# Initialize session
curl -X POST http://localhost:3456/mcp \
  -H "Authorization: Bearer wbr_your-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1}'
# Returns: { jsonrpc: "2.0", id: 1, result: { protocolVersion, capabilities, serverInfo } }

# List tools
curl -X POST http://localhost:3456/mcp \
  -H "Authorization: Bearer wbr_your-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'

# Call a tool
curl -X POST http://localhost:3456/mcp \
  -H "Authorization: Bearer wbr_your-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"browser_navigate","arguments":{"url":"https://example.com"}}}'

# Ping (keep-alive)
curl -X POST http://localhost:3456/mcp \
  -H "Authorization: Bearer wbr_your-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"ping","id":4}'
# Returns: { jsonrpc: "2.0", id: 4, result: {} }
```

### GET /sse — SSE Transport

For clients that use Server-Sent Events (like n8n MCP Client with SSE transport). The flow is:

1. **Client connects** to `GET /sse`
2. **Server sends** an `endpoint` event with a session-specific POST URL
3. **Client POSTs** JSON-RPC messages to `/mcp?sessionId=<id>`
4. **Server responds** through the SSE stream

```bash
# Step 1: Connect to SSE (keep this connection open)
curl -N http://localhost:3456/sse \
  -H "Authorization: Bearer wbr_your-key"

# Server sends:
#   event: endpoint
#   data: /mcp?sessionId=abc-123

# Step 2: In another terminal, send JSON-RPC via the session URL
curl -X POST "http://localhost:3456/mcp?sessionId=abc-123" \
  -H "Authorization: Bearer wbr_your-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
# Response is sent back through the SSE stream
```

This is the same endpoint n8n uses under the hood when you configure it with SSE transport. The server sends keep-alive pings every 30 seconds to maintain the connection.

> **Note:** When using `POST /mcp` without a `sessionId` query parameter, responses are returned directly (Streamable HTTP mode). When `sessionId` is provided, responses are routed through the corresponding SSE stream.

## Concurrency & Tab Targeting

### How concurrent requests are handled

All browser operations are **serialized through a global mutex** — concurrent requests to any tool (e.g. three simultaneous `POST /navigate` calls) are queued and executed one at a time. Each request waits for the previous one to finish before acquiring the shared browser page. This prevents races on the tab state.

```text
Request A ──→ [navigate to URL1] ──→ done
Request B ──→ (waiting) ──→ [navigate to URL2] ──→ done
Request C ──→ (waiting) ──→ (waiting) ──→ [navigate to URL3] ──→ done
```

The mutex covers all 35 tools, not just navigation. This means you can safely send multiple requests without worrying about interleaved state.

### How targeting works: which page does a click/type act on?

Each tool operates on the **currently active tab** by default. In a single-threaded (sequential) workflow this is straightforward:

1. `POST /navigate` → loads URL A in the active tab
2. `POST /click` → clicks on URL A's page
3. `POST /navigate` → loads URL B (same tab, old page replaced)
4. `POST /type` → types on URL B's page

### Multi-tab workflows with tabIndex

Every page-operating tool supports an optional **`tabIndex`** parameter. This lets you target a specific tab without first calling `switch_tab`:

```bash
# Open and navigate in tab 0
curl -X POST http://localhost:3456/navigate \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://site-a.com","tabIndex":0}'

# Open and navigate in tab 1
curl -X POST http://localhost:3456/new_tab \
  -H "Authorization: Bearer wbr_key"
curl -X POST http://localhost:3456/navigate \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://site-b.com","tabIndex":1}'

# Type in tab 1 while tab 0 stays on site-a.com
curl -X POST http://localhost:3456/type \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"#search","text":"hello","tabIndex":1}'

# Screenshot tab 0 — still has site-a.com loaded
curl -X POST http://localhost:3456/screenshot \
  -H "Authorization: Bearer wbr_key" \
  -d '{"tabIndex":0}'
```

**Tools that accept `tabIndex`:**
- Navigation: `navigate`, `back`, `forward`, `reload`
- Interaction: `click`, `type`, `fill_form`, `select`, `press_key`, `scroll`, `scroll_to_element`
- Extraction: `get_text`, `get_html`, `get_url`, `get_title`, `find_elements`, `recon`, `screenshot`
- Page control: `wait`, `dismiss_overlays`, `evaluate`, `monitor`
- WebMCP: `webmcp_discover`, `webmcp_call`

**Tools that DON'T need tabIndex** (operate on context, not page): `cookies`, `cookies_export`, `cookies_import`, `cookies_from_header`, `list_tabs`, `new_tab`, `switch_tab`, `close_tab`, `crawl`, `map`, `workflow_guide`.

> With the mutex + tabIndex, you can safely run multi-tab workflows where operations on different tabs never interfere with each other, even under concurrent requests.

## Tool Parameter Reference

### Navigation

**`browser_navigate`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | ✅ | — | URL to navigate to (http/https) |
| `waitUntil` | string | — | `load` | When to consider navigation done: `load`, `domcontentloaded`, or `networkidle` |
| `timeout` | number | — | `30000` | Navigation timeout in ms |

**`browser_back`** — No parameters. Goes back one page in history.

**`browser_forward`** — No parameters. Goes forward one page in history.

**`browser_reload`** — No parameters. Reloads the current page.

### Clicking & Scrolling

**`browser_click`** (at least one of `selector`/`text`/`x+y` required)
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | — | — | CSS selector of element to click |
| `text` | string | — | — | Click element containing this text (fuzzy match) |
| `x` | number | — | — | X coordinate for pixel-precise click |
| `y` | number | — | — | Y coordinate for pixel-precise click |
| `waitAfter` | number | — | `500` | Wait ms after click |

**`browser_scroll_to_element`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | — | — | CSS selector of element to scroll into view |
| `text` | string | — | — | Scroll to element containing this text |

**`browser_scroll`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `amount` | number | — | `800` | Pixels to scroll (negative = up) |

### Typing & Forms

**`browser_type`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | ✅ | — | CSS selector of the input field |
| `text` | string | — | — | Text to type (alias: `value`) |
| `value` | string | — | — | Text to type (alias: `text`) |
| `action` | string | — | `fill` | `"fill"` = clear + fill instantly; `"type"` = per-character keystrokes with delay |
| `clear` | boolean | — | `true` | Clear existing content first (only for `action: "fill"`) |
| `submit` | boolean | — | `false` | Press Enter after typing |
| `delay` | number | — | `50` | Delay between keystrokes in ms (for `action: "type"`) |

**`browser_fill_form`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `fields` | object | ✅ | — | Map of field identifiers (label, name, id, or placeholder) to values, e.g. `{"email":"a@b.com","password":"secret"}` |
| `submit` | boolean | — | `false` | Submit the form after filling |

**`browser_select`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | ✅ | — | CSS selector of the `<select>` element |
| `value` | string | — | — | Option `value` attribute to select |
| `label` | string | — | — | Option visible text label to select |

### Keyboard

**`browser_press_key`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `key` | string | ✅ | — | Key to press: `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Space`, `Control`, `Alt`, `Shift`, `Meta`, `F1`–`F12` |
| `delay` | number | — | `0` | Delay between keydown and keyup in ms |

### Screenshots

**`browser_screenshot`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | — | — | CSS selector of element to capture (omit for full viewport) |
| `fullPage` | boolean | — | `false` | Capture full page (scrollable length) |

### Tab Management

**`browser_list_tabs`** — No parameters. Returns all open tabs with index, URL, and title.

**`browser_new_tab`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | — | — | URL to open in the new tab |

**`browser_switch_tab`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `index` | number | ✅ | — | Tab index to switch to (0-based) |

**`browser_close_tab`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `index` | number | ✅ | — | Tab index to close (0-based) |

### Cookies

**`browser_cookies`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `action` | string | ✅ | — | `"get"` = read all cookies; `"set"` = set one cookie; `"clear"` = delete all cookies |
| `name` | string | — | — | Cookie name (for `action: "set"`) |
| `value` | string | — | — | Cookie value (for `action: "set"`) |
| `url` | string | — | — | URL scope (for `action: "set"`) |
| `domain` | string | — | — | Cookie domain (for `action: "set"`) |
| `path` | string | — | `/` | Cookie path (for `action: "set"`) |

**`browser_cookies_export`** — No parameters. Returns all cookies as a JSON blob. Also stores them in the session.

**`browser_cookies_import`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `cookies` | array | ✅ | — | Array of cookie objects (from `browser_cookies_export` output) |

**`browser_cookies_from_header`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `cookieString` | string | ✅ | — | Raw Cookie header string, e.g. `"session=abc; token=xyz"`. Supports `__Secure-` and `__Host-` prefixed cookies, `Secure`/`HttpOnly`/`Path`/`Domain`/`SameSite` attributes |
| `url` | string | ✅ | — | URL to scope cookies to |
| `domain` | string | — | — | Optional domain override (e.g. `.example.com`) |

> **Crash recovery**: All cookies set via any method are saved in-memory. If the browser crashes between requests, the engine restarts and replays your cookies automatically.

### Page Content Extraction

**`browser_get_text`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | — | — | CSS selector to scope text (omit for full page text) |

**`browser_get_html`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | — | — | CSS selector to scope HTML (omit for full page HTML) |

**`browser_get_url`** — No parameters. Returns the current page URL.

**`browser_get_title`** — No parameters. Returns the current page title.

**`browser_find_elements`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | ✅ | — | CSS selector to find matching elements |

### Reconnaissance

**`recon`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | — | — | Navigate to URL first, then scan (omit to scan current page) |

Returns a complete page analysis: elements with selectors, forms with fields, headings, meta tags, overlays, captchas, content summary.

### JavaScript Evaluation

**`browser_evaluate`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `code` | string | ✅ | — | JavaScript code to execute in the page context |

### Overlay Dismissal

**`browser_dismiss_overlays`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `method` | string | — | `auto` | `"auto"` = intelligent detect + dismiss; `"click"` = try clicking common accept/close buttons; `"scroll"` = scroll past overlays |

### Waiting

**`browser_wait`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | — | — | CSS selector to wait for (omit for pure delay) |
| `timeout` | number | — | `30000` | Max wait time in ms |
| `ms` | number | — | — | Milliseconds to sleep (only used when `selector` is omitted) |

### Crawling & Mapping

**`browser_crawl`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | ✅ | — | Starting URL for the crawl |
| `maxDepth` | number | — | `2` | Maximum link depth to follow |
| `maxPages` | number | — | `20` | Maximum pages to visit |
| `include` | array of strings | — | — | Only crawl URLs matching these patterns |
| `exclude` | array of strings | — | — | Skip URLs matching these patterns |
| `extractContent` | boolean | — | `false` | Extract text content from each page |

**`browser_map`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | ✅ | — | Starting URL |
| `maxPages` | number | — | `50` | Maximum pages to discover |

### Element Monitoring

**`surf_monitor`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | ✅ | — | CSS selector to monitor for changes |
| `timeout` | number | — | `60000` | Max monitoring time in ms |
| `interval` | number | — | `500` | Poll interval in ms |

### WebMCP Bridge (Chrome 146+)

**`webmcp_discover`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | — | — | Navigate to URL first (optional, uses current page if omitted) |

**`webmcp_call`**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `tool` | string | ✅ | — | Name of the WebMCP tool to invoke |
| `args` | object | — | — | Arguments to pass to the WebMCP tool |

### Workflow Guide

**`browser_workflow_guide`** — No parameters. Returns the full workflow generation guide with step-by-step patterns for all browser automation scenarios, recon-to-curl mapping, selector formats, error handling, and n8n workflow layouts. Call this first when you need to build a multi-step browser automation sequence.

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
