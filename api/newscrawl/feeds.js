// NewsCrawl Feed List API
// Returns all news feeds (agents) configured in the user's NewsCrawl account.

import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';

export const config = { runtime: 'edge' };

const BASE_URL = 'https://api.prod.news-monitoring.newscore.fr';
const REQUEST_TIMEOUT_MS = 10_000;

export default async function handler(request) {
  const cors = getCorsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isDisallowedOrigin(request)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: cors });
  }

  const apiKey = process.env.NEWSCRAWL_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'NEWSCRAWL_API_KEY not configured', feeds: [] }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  try {
    const resp = await fetch(`${BASE_URL}/external-news-feed/`, {
      headers: { 'Authorization': `Api-Key ${apiKey}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `NewsCrawl API error: ${resp.status}`, feeds: [] }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const json = await resp.json();
    let allResults = json?.data?.results ?? [];
    let nextUrl = json?.data?.next ?? null;
    while (nextUrl) {
      try {
        const nextResp = await fetch(nextUrl, {
          headers: { 'Authorization': `Api-Key ${apiKey}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8_000),
        });
        const nextJson = await nextResp.json();
        allResults = allResults.concat(nextJson?.data?.results ?? []);
        nextUrl = nextJson?.data?.next ?? null;
      } catch { nextUrl = null; }
    }
    const feeds = allResults.map((f) => ({
      id: f.id,
      title: f.title,
      agentType: f.agentType ?? 'NEWS_AGENT',
      isCompleted: f.isCompleted ?? false,
      active: f.active ?? true,
    }));

    return new Response(JSON.stringify({ feeds }), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Unknown error', feeds: [] }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
