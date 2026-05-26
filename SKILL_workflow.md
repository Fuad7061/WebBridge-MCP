# WebBridge Workflow Generator

Generate step-by-step browser automation workflows from user goals, `/recon` output, or Chrome DevTools selectors. Outputs ready-to-run cURL command sequences or n8n MCP Client node chains.

---

## Input Sources

The workflow generator accepts any combination of:

| Source | How to Provide | Example |
|---|---|---|
| User goal | Describe what you want to accomplish | "Log into example.com and download the report CSV" |
| `recon` output | Paste the JSON from a `/recon` call | Full page scan with elements, forms, selectors |
| Chrome DevTools selectors | Copy CSS selectors from Elements panel | `#email`, `button[type="submit"]` |
| Raw Cookie header | Cookie string from browser devtools | `session=abc123; token=xyz` |
| Page URL | Target page URL | `https://example.com/login` |

---

## Quick Reference — All Tool Routes

Every tool has a `POST` route. Use `Authorization: Bearer wbr_<key>` header.

```bash
# Navigation
POST /navigate        {"url":"https://...","waitUntil":"networkidle","timeout":30000}
POST /back            {}
POST /forward         {}
POST /reload          {}

# Clicking
POST /click           {"selector":"#id"} | {"text":"Sign in"} | {"x":100,"y":200}
POST /scroll_to_element {"selector":"#footer"}

# Typing & Forms
POST /type            {"selector":"#email","text":"user@test.com","submit":true}
POST /type            {"selector":"#search","value":"query","action":"type","delay":30}
POST /fill_form       {"fields":{"Email":"a@b.com","Password":"secret"},"submit":true}
POST /select          {"selector":"select#country","label":"United States"}

# Keyboard
POST /press_key       {"key":"Enter"} | {"key":"Tab"} | {"key":"Escape"} | {"key":"ArrowDown"}

# Extraction
POST /recon           {"url":"https://..."}  — full page structure scan
POST /get_text        {"selector":".results"} | {} (full page)
POST /get_html        {"selector":"#main"} | {} (full page)
POST /get_url         {}
POST /get_title       {}
POST /find_elements   {"selector":"a[href]"}
POST /screenshot      {"fullPage":true} | {"selector":"#header"}

# Tab Management
POST /list_tabs       {}  — alias: POST /tabs
POST /new_tab         {"url":"https://..."}
POST /switch_tab      {"index":1}
POST /close_tab       {"index":1}

# Cookies
POST /cookies         {"action":"get"} | {"action":"set","name":"x","value":"y","domain":".example.com"} | {"action":"clear"}
POST /cookies_export  {}
POST /cookies_import  {"cookies":[...]}
POST /cookies_from_header {"cookieString":"session=abc","url":"https://example.com"}

# Page Interaction
POST /wait            {"selector":"#loaded","timeout":15000} | {"ms":3000}
POST /scroll          {"amount":800} | {"amount":-500}
POST /evaluate        {"code":"document.title"}
POST /dismiss_overlays {} — alias: POST /dismiss

# Crawling
POST /crawl           {"url":"https://...","maxDepth":2,"maxPages":20}
POST /map             {"url":"https://...","maxPages":50}

# Monitoring
POST /monitor         {"selector":".price","timeout":30000}

# WebMCP (Chrome 146+)
POST /webmcp_discover {"url":"https://..."}
POST /webmcp_call     {"tool":"search","args":{"q":"nyc"}}
```

---

## Workflow Pattern 1: Auth + Scrape

For sites requiring cookie-based authentication before scraping.

**Step 1: Set Cookies**
```bash
curl -X POST http://localhost:3456/cookies_from_header \
  -H "Authorization: Bearer wbr_key" \
  -H "Content-Type: application/json" \
  -d '{
    "cookieString": "session=abc123; token=xyz789",
    "url": "https://target.com"
  }'
```

**Step 2: Navigate to Target**
```bash
curl -X POST http://localhost:3456/navigate \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://target.com/dashboard","waitUntil":"networkidle","timeout":30000}'
```

**Step 3: Dismiss Overlays**
```bash
curl -X POST http://localhost:3456/dismiss_overlays \
  -H "Authorization: Bearer wbr_key"
```

**Step 4: Wait for Content**
```bash
curl -X POST http://localhost:3456/wait \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":".dashboard-content","timeout":15000}'
```

**Step 5: Extract Data**
```bash
curl -X POST http://localhost:3456/get_text \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":".results-table"}'
```

Optionally take a screenshot:
```bash
curl -X POST http://localhost:3456/screenshot \
  -H "Authorization: Bearer wbr_key" \
  -d '{"fullPage":true}' | jq -r '.data[1].data' | base64 -d > dashboard.png
```

---

## Workflow Pattern 2: Search + Extract Results

For searching on any site and scraping the results.

**Step 1: Navigate to Search Page**
```bash
curl -X POST http://localhost:3456/navigate \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://example.com/search"}'
```

**Step 2: Recon to Find Selectors**
```bash
curl -X POST http://localhost:3456/recon \
  -H "Authorization: Bearer wbr_key"
```
From the recon output, identify:
- Search input selector (e.g., `input[name="q"]`)
- Submit button/text (e.g., `button:has-text("Search")`)
- Results container (e.g., `.search-results .item`)

**Step 3: Type Query and Submit**
```bash
curl -X POST http://localhost:3456/type \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":"input[name=\"q\"]","text":"search query","submit":true}'
```

**Step 4: Wait for Results**
```bash
curl -X POST http://localhost:3456/wait \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":".search-results","timeout":10000}'
```

**Step 5: Extract Results**
```bash
# Individual result text
curl -X POST http://localhost:3456/get_text \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":".search-results .item"}'

# Or full results area HTML
curl -X POST http://localhost:3456/get_html \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":".search-results"}'
```

**Step 6: (Optional) Click Through to First Result**
```bash
curl -X POST http://localhost:3456/click \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":".search-results .item:first-child a"}'

curl -X POST http://localhost:3456/wait \
  -H "Authorization: Bearer wbr_key" \
  -d '{"ms":2000}'

curl -X POST http://localhost:3456/get_text \
  -H "Authorization: Bearer wbr_key"
```

---

## Workflow Pattern 3: Login + Dashboard

For sites where you need to fill credentials and navigate past a login wall.

**Step 1: Navigate to Login Page**
```bash
curl -X POST http://localhost:3456/navigate \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://example.com/login"}'
```

**Step 2: Recon to Find Login Form**
```bash
curl -X POST http://localhost:3456/recon \
  -H "Authorization: Bearer wbr_key"
```
Look for the form fields in the `forms` array:
```json
"forms": [{
  "fields": [
    {"tag":"input","type":"email","name":"email","selector":"#email"},
    {"tag":"input","type":"password","name":"password","selector":"#password"},
    {"tag":"button","text":"Sign In","selector":"button[type=submit]"}
  ]
}]
```

**Step 3: Fill Form**
```bash
curl -X POST http://localhost:3456/fill_form \
  -H "Authorization: Bearer wbr_key" \
  -d '{"fields":{"email":"user@example.com","password":"mypassword"},"submit":true}'
```

**Step 4: Wait for Redirect**
```bash
curl -X POST http://localhost:3456/wait \
  -H "Authorization: Bearer wbr_key" \
  -d '{"ms":3000}'
```

**Step 5: Verify Login Succeeded**
```bash
curl -X POST http://localhost:3456/get_url \
  -H "Authorization: Bearer wbr_key"
```

**Step 6: Navigate to Target Dashboard**
```bash
curl -X POST http://localhost:3456/navigate \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://example.com/dashboard"}'
```

**Step 7: Extract Data**
```bash
curl -X POST http://localhost:3456/get_text \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":".dashboard-stats"}'
```

---

## Workflow Pattern 4: Multi-Tab Comparison

For comparing data across multiple pages simultaneously.

**Step 1: Navigate to First Page**
```bash
curl -X POST http://localhost:3456/navigate \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://example.com/product/1"}'

curl -X POST http://localhost:3456/get_text \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":".product-price"}'
```

**Step 2: Open Second Product in New Tab**
```bash
curl -X POST http://localhost:3456/new_tab \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://example.com/product/2"}'
```

**Step 3: Switch to New Tab and Extract**
```bash
curl -X POST http://localhost:3456/switch_tab \
  -H "Authorization: Bearer wbr_key" \
  -d '{"index":1}'

curl -X POST http://localhost:3456/wait \
  -H "Authorization: Bearer wbr_key" \
  -d '{"ms":2000}'

curl -X POST http://localhost:3456/get_text \
  -H "Authorization: Bearer wbr_key" \
  -d '{"selector":".product-price"}'
```

**Step 4: Switch Back to First Tab**
```bash
curl -X POST http://localhost:3456/switch_tab \
  -H "Authorization: Bearer wbr_key" \
  -d '{"index":0}'
```

**Step 5: Close Second Tab**
```bash
curl -X POST http://localhost:3456/close_tab \
  -H "Authorization: Bearer wbr_key" \
  -d '{"index":1}'
```

---

## Workflow Pattern 5: Site Crawl

For mapping or extracting content from an entire site.

**Option A — Quick Site Map (single page links):**
```bash
curl -X POST http://localhost:3456/map \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://example.com","maxPages":100}'
```

**Option B — Deep Crawl with Content:**
```bash
curl -X POST http://localhost:3456/crawl \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://example.com","maxDepth":3,"maxPages":50,"extractContent":true}'
```

**Option C — Targeted Crawl by URL Pattern:**
```bash
curl -X POST http://localhost:3456/crawl \
  -H "Authorization: Bearer wbr_key" \
  -d '{"url":"https://example.com/blog","maxDepth":2,"maxPages":30,"include":["example.com/blog/"],"exclude":["/tag/","/author/"],"extractContent":true}'
```

---

## Recon-to-Curl Mapping Guide

When you have a `/recon` JSON output, use this table to generate the correct tool call for each element type.

### Elements Array Mapping

| Recon Field | Element Type | Tool to Call | Example |
|---|---|---|---|
| `tag: "a"` with `href` | Link | `click {"selector":"a#id"}` or `navigate {"url":"href"}` | Navigate if it's a page URL, click if it triggers JS |
| `tag: "button"` with `text` | Button | `click {"selector":"#id"}` or `click {"text":"Sign In"}` | Use text for buttons without stable IDs |
| `tag: "input"` `type:"text"/"email"/"password"` | Text field | `type {"selector":"[name=email]","text":"value"}` | Use the `selector` from recon |
| `tag: "input"` `type:"checkbox"/"radio"` | Checkbox/radio | `click {"selector":"#id"}` | Click to toggle |
| `tag: "input"` `type:"submit"/"button"` | Submit button | `click {"selector":"#id"}` or `press_key {"key":"Enter"}` | Enter key often works on focused form |
| `tag: "select"` | Dropdown | `select {"selector":"#id","label":"..."}` | Use label text (visible) or value attribute |
| `tag: "textarea"` | Text area | `type {"selector":"#id","text":"..."}` | Same as text input |

### Forms Array Mapping

Each `forms[].fields[]` entry has a `selector` and `label`. Use:
- `fill_form {"fields":{"Label":"value","label":"value"}}` — fills ALL fields at once
- Or individual `type` calls for each field

```bash
# From recon form output:
# "fields": [{"label":"Email","selector":"#email"}, {"label":"Password","selector":"#password"}]
POST /fill_form
{"fields":{"Email":"user@test.com","Password":"secret123"},"submit":true}
```

### Overlays Array Mapping

If overlays are detected:
```bash
POST /dismiss_overlays
```
This automatically clicks buttons matching "Reject", "Accept", "Close", etc. in multiple languages.

---

## Selector Source Mapping

| Where You Got the Selector | How to Use It |
|---|---|
| **Chrome DevTools** — right-click element → Copy → Copy selector | Use as-is in `"selector"` params. IDs like `#email`, classes like `.btn-primary`, attributes like `[name="q"]` |
| **Chrome DevTools** — copy full XPath | Do NOT use XPath. Instead use recon output or CSS selector. XPath is not supported by these tools |
| **Chrome DevTools** — copy JS path | Not useful. Use CSS selectors instead |
| **Recon output** — `selector` field from elements/forms | Use the `selector` value directly. These are optimized CSS selectors |
| **Recon output** — `text` field from elements | Use in `click {"text":"..."}` or `scroll_to_element {"text":"..."}` for fuzzy text matching |
| **Page URL / visible text** | Use `click {"text":"Sign In"}` — fuzzy matches any element containing that text |
| **Coordinates** (from screenshot analysis) | Use `click {"x":500,"y":300}` — pixel-precise, useful for canvas elements |

---

## Chain Rules & Best Practices

Follow these rules when generating multi-step workflows:

### Step Ordering
1. **Cookies first** — always set cookies before navigation if auth is needed
2. **Navigate** — load the page
3. **Dismiss overlays** — clear cookie banners/modals before interacting
4. **Recon** — understand the page structure (if selectors are not known)
5. **Wait** — ensure elements are visible before interacting
6. **Interact** — click, type, select, submit
7. **Wait again** — let the page respond to interaction
8. **Extract** — get text, HTML, screenshot
9. **Repeat** — for multi-page workflows

### Wait Rules
- Always add `wait` after `navigate` when the next tool expects a specific element
- Always add `wait` after `click` or `type` with `submit` before extracting results
- Use `wait {"ms":1000}` for short delays (animations, redirects)
- Use `wait {"selector":"...#"} ` for content-aware waits (preferred)

### Error Recovery
- If `click` returns "Element not found", run `recon` again to get fresh selectors (page may have changed)
- If `type` returns "Element not found", check if the element is inside an iframe or shadow DOM
- If navigation fails, retry with a longer timeout or `waitUntil:"domcontentloaded"`
- If cookie setting fails, verify the URL matches the cookie domain exactly
- The browser automatically recovers from crashes (cookies are replayed)

### Anti-Detection
- Add small delays between steps (100-500ms) for human-like behavior
- Use `scroll` between sections before extracting content
- Use `screenshot` periodically to verify the page state
- If blocked, try `headless: false` (visible mode) or a different proxy

---

## n8n Workflow Layout

Each MCP Client node in n8n calls one tool. Chain them by mapping `$json.data[0].text` from each step to the next.

### Node Configuration Pattern

```
Node 1: MCP Client
  Tool: browser_cookies_from_header
  Args: {"cookieString":"session=abc","url":"https://target.com"}

Node 2: MCP Client
  Tool: browser_navigate
  Args: {"url":"https://target.com/dashboard","waitUntil":"networkidle"}

Node 3: MCP Client
  Tool: browser_wait
  Args: {"ms":2000}

Node 4: MCP Client
  Tool: browser_dismiss_overlays
  Args: {}

Node 5: MCP Client
  Tool: browser_get_text
  Args: {"selector":".content"}
  — Output: $json.data[0].text contains the scraped content

Node 6: MCP Client (optional screenshot)
  Tool: browser_screenshot
  Args: {"fullPage":true}
  — Output: $json.data[1].data contains base64 image
```

### Data Mapping in n8n
- Text output → `{{ $json.data[0].text }}`
- Image (base64) → `{{ $json.data[1].data }}`
- Screenshot MIME → `{{ $json.data[1].mimeType }}`
- Error flag → `{{ $json.isError }}`

---

## Common Edge Cases

| Situation | Solution |
|---|---|
| Element inside **iframe** | Use `evaluate` with `document.querySelector('iframe').contentWindow.document.querySelector(...)` |
| **Dynamic content** (SPA) | Wait longer or use `surf_monitor` to detect when text changes stabilize |
| **Page uses shadow DOM** | Use `evaluate` with `document.querySelector('x').shadowRoot.querySelector(...)` |
| **reCAPTCHA / hCaptcha** | Detect with `recon`, cannot automate. Must use manual solving or a CAPTCHA service |
| **File download** | `evaluate` to extract download URL, then fetch with curl separately |
| **Pagination** | Loop: click "Next" → wait → extract → repeat until "Next" disabled |
| **Infinite scroll** | Run `scroll {"amount":2000}` multiple times, extracting content between scrolls |
| **Rate limiting** | Add `wait {"ms":1000}` — 5000 between requests. `WEBBRIDGE_RATE_LIMIT_MAX` env var |
| **Auth popup** (Basic Auth) | Include credentials in URL: `https://user:pass@example.com` |
| **Cookies not persisting** | Check URL matches cookie domain exactly. Use `cookies_from_header` instead of `cookies set` |
| **Browser crash / disconnect** | Automatic recovery. Cookies are replayed, browser restarts on next request |

---

## Workflow Generation Prompt Template

When the AI is asked to generate a workflow, it should follow this template:

```
## Goal
[User's stated goal]

## Step-by-Step Workflow

### Step 1: [Action name]
**Tool**: [tool name]
**Route**: POST /[route]
```bash
curl -X POST http://localhost:3456/[route] \
  -H "Authorization: Bearer wbr_key" \
  -d '[JSON params]'
```
**Purpose**: Why this step is needed

### Step 2: [Next action]
...

### Notes
- [Any edge cases, timing considerations, or alternative approaches]
```

The AI should:
1. Decompose the goal into sequential steps
2. Map each step to the appropriate tool and parameters
3. Insert `wait` steps between interactions and extractions
4. Add `dismiss_overlays` after navigation
5. Use selectors from recon output or user-provided Chrome selectors
6. Output complete, copy-pasteable cURL commands or n8n MCP Client node configs
