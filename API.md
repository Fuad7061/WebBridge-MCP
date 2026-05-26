# WebBridge MCP API Reference

All API endpoints return JSON. Authenticate with `Authorization: Bearer wbr_<key>` header.

## Health

```bash
curl http://localhost:3456/health
# {"status":"ok","version":"1.0.0","mode":"http"}
```

## Navigation

### Navigate to URL
```bash
curl -X POST http://localhost:3456/navigate \
  -H "Authorization: Bearer wbr_key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

### Go Back
```bash
curl -X POST http://localhost:3456/back \
  -H "Authorization: Bearer wbr_key"
```

### Go Forward
```bash
curl -X POST http://localhost:3456/forward \
  -H "Authorization: Bearer wbr_key"
```

### Reload
```bash
curl -X POST http://localhost:3456/reload \
  -H "Authorization: Bearer wbr_key"
```

## Interaction

### Click Element
```bash
# By CSS selector
curl -X POST http://localhost:3456/click \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"button#submit"}'

# By text content
curl -X POST http://localhost:3456/click \
  -H "Authorization: Bearer wbr_key" \
  -d '{"text":"Sign in"}'

# By coordinates
curl -X POST http://localhost:3456/click \
  -H "Authorization: Bearer wbr_key" \
  -d '{"x":500,"y":300}'
```

### Type Text
```bash
# Fill (clear + fill instantly, default)
curl -X POST http://localhost:3456/type \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"#email","text":"user@example.com","submit":true}'

# Fill without clearing existing text
curl -X POST http://localhost:3456/type \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"input[name=\"search\"]","text":"hello","clear":false}'

# Real keystrokes (human-like per-character typing)
curl -X POST http://localhost:3456/type \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"#password","value":"secret","action":"type","delay":30}'

# Param aliases: "value" works as alias for "text"
curl -X POST http://localhost:3456/type \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"#search","value":"query","submit":true}'
```

### Fill Form (multi-field)
```bash
curl -X POST http://localhost:3456/fill_form \
  -H "Authorization: Bearer wbr_key" \
  -d '{"fields":{"email":"user@test.com","password":"secret123"},"submit":true}'
```

### Select Dropdown
```bash
curl -X POST http://localhost:3456/select \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"select#country","label":"United States"}'
```

## Scrolling

### Scroll Page
```bash
# Scroll down 500px
curl -X POST http://localhost:3456/scroll \
  -H "Authorization: Bearer wbr_key" \
  -d '{"amount":500}'

# Scroll up
curl -X POST http://localhost:3456/scroll \
  -H "Authorization: Bearer wbr_key" \
  -d '{"amount":-500}'
```

### Scroll to Element
```bash
curl -X POST http://localhost:3456/scroll_to_element \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"#footer"}'
```

## Extraction

### Page Reconnaissance
```bash
curl -X POST http://localhost:3456/recon \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://example.com"}'
# Returns: structured JSON with headings, elements, forms, overlays, captchas
```

### Get Text
```bash
# Full page
curl -X POST http://localhost:3456/get_text \
  -H "Authorization: Bearer wbr_key"

# Scoped to element
curl -X POST http://localhost:3456/get_text \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"main"}'
```

### Get HTML
```bash
curl -X POST http://localhost:3456/get_html \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"#content"}'
```

### Get URL / Title
```bash
curl -X POST http://localhost:3456/get_url -H "Authorization: Bearer wbr_key"
curl -X POST http://localhost:3456/get_title -H "Authorization: Bearer wbr_key"
```

### Find Elements
```bash
curl -X POST http://localhost:3456/find_elements \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"a[href]"}'
```

### Screenshot
```bash
# Viewport screenshot
curl -X POST http://localhost:3456/screenshot \
  -H "Authorization: Bearer wbr_key" > screenshot.json

# Full page
curl -X POST http://localhost:3456/screenshot \
  -H "Authorization: Bearer wbr_key" \
  -d '{"fullPage":true}'

# Element screenshot
curl -X POST http://localhost:3456/screenshot \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"#header"}'
```

## Tab Management

```bash
# List all tabs
curl http://localhost:3456/tabs -H "Authorization: Bearer wbr_key"

# Open new tab
curl -X POST http://localhost:3456/new_tab \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://example.com"}'

# Switch to tab by index
curl -X POST http://localhost:3456/switch_tab \
  -H "Authorization: Bearer wbr_key" \
  -d '{"index":1}'

# Close tab
curl -X POST http://localhost:3456/close_tab \
  -H "Authorization: Bearer wbr_key" \
  -d '{"index":1}'
```

## Keyboard

```bash
# Press Enter (submit form, confirm dialog)
curl -X POST http://localhost:3456/press_key \
  -H "Authorization: Bearer wbr_key" \
  -d '{"key":"Enter"}'

# Press Tab (move to next field)
curl -X POST http://localhost:3456/press_key \
  -H "Authorization: Bearer wbr_key" \
  -d '{"key":"Tab"}'

# Press Escape (close modal, cancel)
curl -X POST http://localhost:3456/press_key \
  -H "Authorization: Bearer wbr_key" \
  -d '{"key":"Escape"}'

# Press ArrowDown (select in dropdown)
curl -X POST http://localhost:3456/press_key \
  -H "Authorization: Bearer wbr_key" \
  -d '{"key":"ArrowDown","delay":50}'
```

## Cookies

```bash
# Get all cookies
curl -X POST http://localhost:3456/cookies \
  -H "Authorization: Bearer wbr_key" \
  -d '{"action":"get"}'

# Set a cookie
curl -X POST http://localhost:3456/cookies \
  -H "Authorization: Bearer wbr_key" \
  -d '{"action":"set","name":"session","value":"abc123","domain":".example.com"}'

# Clear all cookies (also clears the in-memory crash-recovery store)
curl -X POST http://localhost:3456/cookies \
  -H "Authorization: Bearer wbr_key" \
  -d '{"action":"clear"}'

# Export cookies
curl -X POST http://localhost:3456/cookies_export \
  -H "Authorization: Bearer wbr_key"

# Import cookies (persisted for crash recovery automatically)
curl -X POST http://localhost:3456/cookies_import \
  -H "Authorization: Bearer wbr_key" \
  -d '{"cookies":[{"name":"session","value":"xyz","domain":".example.com"}]}'
```

> **Crash recovery**: All cookies set via `cookies` (set), `cookies_import`, or `cookies_from_header` are automatically saved in-memory. If the browser crashes or disconnects between requests, the engine restarts Chromium and replays your cookies before returning — no manual re-import needed. Use `cookies` `clear` to purge both the live context and the recovery store.

## Overlay Dismissal

```bash
# Auto-detect and dismiss cookie banners / modals
curl -X POST http://localhost:3456/dismiss_overlays \
  -H "Authorization: Bearer wbr_key"
```

## JavaScript Evaluation

```bash
curl -X POST http://localhost:3456/evaluate \
  -H "Authorization: Bearer wbr_key" \
  -d '{"code":"document.title"}'

# Returns: {success: true, data: [{type:"text", text:"...page title..."}]}
```

## Waiting

```bash
# Wait for element to appear (max 30s)
curl -X POST http://localhost:3456/wait \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"#loaded-content","timeout":15000}'
```

## Crawling

```bash
# BFS crawl of a website
curl -X POST http://localhost:3456/crawl \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://example.com","maxDepth":2,"maxPages":20}'
```

## Monitoring

```bash
# Monitor a selector for text changes (60s timeout)
curl -X POST http://localhost:3456/monitor \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":".price-value","timeout":30000}'
```

## WebMCP Bridge

```bash
# Discover WebMCP tools on current page
curl -X POST http://localhost:3456/webmcp_discover \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://googlechromelabs.github.io/webmcp-tools/demos/hotel-chain/"}'

# Call a WebMCP tool
curl -X POST http://localhost:3456/webmcp_call \
  -H "Authorization: Bearer wbr_key" \
  -d '{"tool":"search_location","args":{"location":"New York"}}'
```

## MCP Endpoint (Streamable HTTP)

```bash
# List tools
curl -X POST http://localhost:3456/mcp \
  -H "Authorization: Bearer wbr_key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Call a tool
curl -X POST http://localhost:3456/mcp \
  -H "Authorization: Bearer wbr_key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":2,"params":{"name":"browser_navigate","arguments":{"url":"https://example.com"}}}'
```
