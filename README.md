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
