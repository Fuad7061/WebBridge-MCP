# WebBridge MCP — Agent Usage Guide

## Overview

WebBridge is a browser automation server that gives AI agents access to a real, stealth-configured Chromium browser. Use it to navigate pages, click elements, fill forms, extract data, and perform complex multi-step web tasks.

## Workflow

The recommended workflow for most tasks:

1. **Navigate** → `browser_navigate` to the target URL
2. **Wait** → `browser_wait` for critical elements
3. **Dismiss overlays** → `browser_dismiss_overlays` (cookie banners, modals)
4. **Recon** → `recon` to get structured page data (elements, forms, headings)
5. **Interact** → `browser_click`, `browser_type`, `browser_fill_form`
6. **Extract** → `browser_screenshot`, `browser_get_text`, `browser_get_html`

## Tab Management

- `browser_list_tabs` — see all open tabs
- `browser_new_tab` — open URLs in a new tab
- `browser_switch_tab` — switch by tab index
- `browser_close_tab` — close tabs when done (avoid leaving stale tabs)

## Clicking Elements

Always recon first to get stable selectors. Then:
- Use `browser_click` with `selector` (CSS selector from recon)
- Or with `text` (fuzzy text matching)
- Or with `x, y` coordinates (pixel-precise)

## Form Filling

- `browser_type` for single fields (supports `text` or `value` param, `action: "fill"` or `action: "type"`, `submit`, `clear`, `delay`)
- `browser_fill_form` for multiple fields at once (matches by label, name, id, placeholder)
- `browser_select` for dropdown selections

## Keyboard

- `browser_press_key` — press any keyboard key (Enter, Tab, Escape, ArrowDown, etc.)
- Use it to submit forms, navigate dropdowns, close modals, or trigger keyboard shortcuts
- `delay` parameter mimics human typing by adding ms between keydown and keyup

## Cookies

- `browser_cookies` — get/set/clear individual cookies
- `browser_cookies_from_header` — **set cookies from a raw Cookie header string** (e.g. `session=abc; token=xyz`). Requires a `cookieString` and `url`.
- `browser_cookies_export` — export all cookies as JSON
- `browser_cookies_import` — restore cookies from exported JSON

## Cookie Header String Format

The `browser_cookies_from_header` tool accepts the same format browsers send in the `Cookie` header:

```
session=abc123; token=xyz789; theme=dark; user_id=42
```

Use this when you have cookies from browser devtools, another tool, or an existing session.

## Anti-Detection

Stealth mode is enabled by default. You don't need to configure anything. WebBridge patches:
- `navigator.webdriver` → undefined
- `navigator.plugins` → real plugin array
- `navigator.languages` → realistic locale
- `navigator.permissions` → realistic queries
- `window.chrome` → complete API surface
- WebGL → real GPU strings
- Canvas → fingerprinting noise

## Cookie & Session Persistence

- Cookies survive across navigations within the same context
- Cookies automatically survive browser crashes: the engine stores all cookies in-memory and replays them when a new browser context starts
- Use `browser_cookies` `get` to verify cookies are active
- Use `browser_cookies_from_header` to set cookies from a raw header string (handles `__Secure-` and `__Host-` prefixes)
- Use `browser_cookies_export` to save session state for later reuse
- Use `browser_cookies_import` to restore a previously exported session
- Calling `browser_cookies` `clear` clears both live cookies and the in-memory crash-recovery store
- On Coolify/Docker, the `/data` volume persists the Chrome profile across container restarts

## WebMCP (Chrome 146+)

If the page implements Google's WebMCP standard:
- `webmcp_discover` — list all registered tools on the page
- `webmcp_call` — invoke a tool directly (much more reliable than clicking)

Requires Chrome 146+ with `--enable-experimental-web-platform-features`.

## n8n MCP Integration

### Prerequisites

- n8n (self-hosted or cloud) with **MCP Client** node
- WebBridge running with HTTP mode

### Connection Methods

#### Method 1: Streamable HTTP (recommended for remote)

In n8n's **MCP Client** node:
- **Type**: MCP
- **Transport**: Streamable HTTP
- **URL**: `http://your-host:3457/mcp`
- **Headers**: `Authorization: Bearer wbr_your-key`

#### Method 2: SSE (Server-Sent Events)

In n8n's **MCP Client** node:
- **Type**: MCP
- **Transport**: SSE
- **SSE Endpoint**: `http://your-host:3457/sse`
- **Session URL**: will be provided by the server
- **Headers**: `Authorization: Bearer wbr_your-key`

#### Method 3: Local stdio (for local n8n)

In n8n's **MCP Client** node:
- **Type**: MCP
- **Transport**: STDIO
- **Command**: `node /path/to/WebBridge-MCP/dist/index.js --mode=mcp`
- **Environment Variables**: `WEBBRIDGE_AUTH_TOKEN=wbr_your-key`

### Multi-Step Workflow (n8n Example)

Here's a typical authenticated scraping workflow connecting n8n → WebBridge:

```
Step 1: Set Cookies from Header String
  Tool: browser_cookies_from_header
  Arguments:
    cookieString: "session=abc123; csrf_token=xyz; user_id=42"
    url: "https://target-site.com"

Step 2: Navigate to Page
  Tool: browser_navigate
  Arguments:
    url: "https://target-site.com/dashboard"
    waitUntil: "networkidle"

Step 3: Type into Search Field
  Tool: browser_type
  Arguments:
    selector: "input[name=q]"
    text: "search query"
    action: "fill"

Step 4: Submit Form (click or keyboard)
  Option A — click:
    Tool: browser_click
    Arguments:
      selector: "button[type=submit]"
  Option B — press Enter (often simpler):
    Tool: browser_press_key
    Arguments:
      key: "Enter"

Step 5: Wait for Results
  Tool: browser_wait
  Arguments:
    ms: 3000
  (or use selector: ".results-container" to wait for an element)

Step 6: Extract Output Data
  Tool: browser_get_text
  Arguments:
    selector: ".results"
  (or use browser_get_html to get full HTML)

Step 7: (Optional) Take Screenshot
  Tool: browser_screenshot
  Arguments:
    fullPage: true
```

### n8n Workflow Tips

- **Persistent context**: The browser context stays alive between tool calls in the same n8n workflow — you can navigate, then read the URL, then click, all on the same page
- **Error handling**: If a step fails (e.g. element not found), enable n8n's error handling workflow to retry or fall back to recon
- **Data mapping**: n8n can map output data from one tool call as input to the next (e.g. use `$json.data[0].text` from `browser_get_text`)
- **Screenshots**: The `browser_screenshot` tool returns base64 image data that can be used in n8n's binary data processing
- **Rate limiting**: Default is 60 req/min — increase via `WEBBRIDGE_RATE_LIMIT_MAX` env var if needed

## Troubleshooting

| Issue | Solution |
|---|---|
| Element not found | Try `recon` again (page may have loaded differently) |
| Click not working | Try coordinates or `dispatch` event, or use `browser_press_key` with `"Enter"` |
| Keyboard not working | Ensure the correct element is focused first via `browser_click` or `browser_type` |
| Page not loading fully | Increase navigation timeout |
| Auth errors | Check `WEBBRIDGE_AUTH_TOKEN` matches `Authorization` header |
| Bot detection | Ensure stealth level is `stealth` (not `basic`) |
| n8n "Method not found" | Ensure using correct transport (Streamable HTTP or SSE) |
| Cookies not persisting | Always set URL when using `browser_cookies_from_header` |
| Browser crashes in Docker | Set `WEBBRIDGE_HEADLESS=new` and ensure Chrome dependencies installed |
