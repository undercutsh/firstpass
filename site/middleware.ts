// Markdown content negotiation for the marketing site.
//
// Serves the existing static markdown alternate (e.g. /index.md) instead of
// the HTML page when either:
//   1. the request's Accept header names text/markdown, or
//   2. the request's User-Agent matches a known AI-crawler bot that we
//      already allow in robots.txt (GPTBot, ClaudeBot, PerplexityBot, etc.)
//
// This does NOT create new markdown content — it only routes to alternates
// that already exist as static files in this directory. Normal browser
// requests (Accept: text/html, no matching bot UA) are untouched and fall
// straight through to the existing static HTML/routing behavior. Requests
// for the markdown files themselves (e.g. GET /index.md) are also untouched
// since the matcher below only covers HTML page paths.

// Path -> static markdown alternate. Only pages that actually have a
// shipped .md twin belong here. (pricing.md and llms.md exist as
// standalone agent-facing files today but aren't twins of a routed HTML
// page, so they're intentionally not listed — add them here if/when that
// changes.)
const MARKDOWN_ALTERNATES: Record<string, string> = {
  "/": "/index.md",
};

// Keep in sync with the "Allow: /" bot list in site/robots.txt. These are
// answer-engine crawlers we already invite to index the site; CCBot and
// Bytespider are deliberately excluded (disallowed in robots.txt, training
// crawlers with no citation upside) and must not be added here.
const MARKDOWN_BOT_USER_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
];

function acceptsMarkdown(acceptHeader: string): boolean {
  // Accept can be a comma-separated list of media ranges, each optionally
  // followed by ";q=...". We only care about an exact "text/markdown"
  // media type appearing anywhere in the list — not about */* or
  // text/*, which browsers send routinely and which must keep getting
  // HTML.
  return acceptHeader
    .split(",")
    .some((part) => part.trim().split(";")[0].trim().toLowerCase() === "text/markdown");
}

function isMarkdownBot(userAgent: string): boolean {
  if (!userAgent) return false;
  return MARKDOWN_BOT_USER_AGENTS.some((bot) => userAgent.includes(bot));
}

export const config = {
  // Only intercept paths we actually have a markdown alternate for. Keep
  // this list in sync with MARKDOWN_ALTERNATES's keys.
  matcher: ["/"],
};

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const markdownPath = MARKDOWN_ALTERNATES[url.pathname];

  if (!markdownPath) {
    return; // no alternate for this path — fall through to normal routing
  }

  const accept = request.headers.get("accept") ?? "";
  const userAgent = request.headers.get("user-agent") ?? "";

  if (!acceptsMarkdown(accept) && !isMarkdownBot(userAgent)) {
    return; // normal browser/HTML request — fall through untouched
  }

  // Fetch the existing static markdown file from this same deployment and
  // re-serve it under the requested path, with the negotiation headers a
  // spec-following content-negotiation response needs. We fetch rather than
  // rewrite() so the response headers are fully explicit and don't depend
  // on how vercel.json's per-path header rules interact with a rewritten
  // path.
  const markdownUrl = new URL(markdownPath, url);
  const upstream = await fetch(markdownUrl, {
    headers: { accept: "text/markdown" },
  });

  if (!upstream.ok) {
    // The alternate is missing for some reason — don't break the request,
    // just fall back to the normal HTML response.
    return;
  }

  const body = await upstream.text();

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      // The response varies on both signals that can trigger it, so caches
      // (including Vercel's edge cache and any shared/browser cache) don't
      // serve a bot's markdown response to a browser or vice versa.
      Vary: "Accept, User-Agent",
    },
  });
}
