import type { ToolDefinition, ToolContext, ToolResult, CrawlOptions } from '../types/index.js';

export const crawlTools: ToolDefinition[] = [
  {
    name: 'browser_crawl',
    description: 'Crawl a website using breadth-first search starting from a URL. Discovers links and recursively follows them up to maxDepth and maxPages. Optionally extracts page text content (extractContent: true). Use include/exclude patterns (regex strings) to filter which URLs to follow. Returns a structured result with each page URL, title, depth, discovered links, and content.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Starting URL for the crawl' },
        maxDepth: { type: 'number', default: 2, description: 'Maximum crawl depth' },
        maxPages: { type: 'number', default: 20, description: 'Maximum pages to crawl' },
        include: { type: 'array', items: { type: 'string' }, description: 'URL patterns to include' },
        exclude: { type: 'array', items: { type: 'string' }, description: 'URL patterns to exclude' },
        extractContent: { type: 'boolean', default: false, description: 'Extract text content from each page' },
      },
      required: ['url'],
    },
    handler: async (args, ctx) => {
      const maxDepth = Number(args.maxDepth) || 2;
      const maxPages = Number(args.maxPages) || 20;
      const opts: CrawlOptions = {
        url: String(args.url),
        maxDepth,
        maxPages,
        include: args.include as string[] | undefined,
        exclude: args.exclude as string[] | undefined,
        extractContent: args.extractContent === true,
      };

      const { page } = await ctx.browser.acquireContext();
      try {
        
        const visited = new Set<string>();
        const results: Array<{ url: string; title: string; depth: number; links: string[]; content?: string }> = [];
        let queue: Array<{ url: string; depth: number }> = [{ url: opts.url, depth: 0 }];

        while (queue.length > 0 && results.length < maxPages) {
          const { url: currentUrl, depth } = queue.shift()!;
          if (visited.has(currentUrl)) continue;
          visited.add(currentUrl);

          try {
            await page.goto(currentUrl, { waitUntil: 'load', timeout: 15000 });
            const title = await page.title();
            const links = await page.evaluate(() =>
              Array.from(document.querySelectorAll('a[href]'))
                .map(a => (a as HTMLAnchorElement).href)
                .filter(h => h.startsWith('http'))
                .slice(0, 50)
            );

            let content: string | undefined;
            if (opts.extractContent) {
              content = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '');
            }

            results.push({ url: currentUrl, title, depth, links, content });

            if (depth < maxDepth) {
              const includePatterns = opts.include ? opts.include.map(p => new RegExp(p)) : null;
              const excludePatterns = opts.exclude ? opts.exclude.map(p => new RegExp(p)) : null;

              for (const link of links) {
                if (visited.has(link)) continue;
                if (includePatterns && !includePatterns.some(p => p.test(link))) continue;
                if (excludePatterns && excludePatterns.some(p => p.test(link))) continue;
                queue.push({ url: link, depth: depth + 1 });
              }
            }
          } catch { /* skip failed pages */ }
        }

        return { content: [{ type: 'text', text: JSON.stringify({ crawled: results.length, pages: results }, null, 2) }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_map',
    description: 'Quickly map a website\'s URL structure by visiting a starting page and collecting all linked URLs. Unlike browser_crawl, this does NOT follow links recursively — it only extracts links from the single starting page. Useful for getting a quick sitemap or discovering all pages on a site section.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Starting URL' },
        maxPages: { type: 'number', default: 50 },
      },
      required: ['url'],
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        
        await page.goto(String(args.url), { waitUntil: 'load', timeout: 15000 });

        const allLinks = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]'))
            .map(a => (a as HTMLAnchorElement).href)
            .filter(h => h.startsWith('http'))
        );

        const unique = [...new Set(allLinks)].slice(0, Number(args.maxPages) || 50);
        return { content: [{ type: 'text', text: JSON.stringify({ total: unique.length, urls: unique }, null, 2) }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
