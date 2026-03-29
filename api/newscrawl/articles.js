// NewsCrawl Articles API
// Returns articles for a given NewsCrawl feed (agent) with scores, titles, sources.

import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';

export const config = { runtime: 'edge' };

const BASE_URL = 'https://api.prod.news-monitoring.newscore.fr';
const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export default async function handler(request) {
  const cors = getCorsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isDisallowedOrigin(request)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: cors });
  }

  const apiKey = process.env.NEWSCRAWL_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'NEWSCRAWL_API_KEY not configured', articles: [], count: 0 }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const url = new URL(request.url);
  const feedId = url.searchParams.get('feedId');
  if (!feedId) {
    return new Response(JSON.stringify({ error: 'Missing feedId parameter', articles: [], count: 0 }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '', 10) || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parseInt(url.searchParams.get('offset') ?? '', 10) || 0;
  const search = url.searchParams.get('search') ?? '';
  const startDate = url.searchParams.get('startDate') ?? '';
  const endDate = url.searchParams.get('endDate') ?? '';

  const params = new URLSearchParams({
    newsFeedId: feedId,
    limit: String(limit),
    offset: String(offset),
  });
  if (search) params.set('search', search);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  try {
    const resp = await fetch(`${BASE_URL}/related-articles/?${params}`, {
      headers: { 'Authorization': `Api-Key ${apiKey}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `NewsCrawl API error: ${resp.status}`, articles: [], count: 0 }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const json = await resp.json();
    const results = json?.data?.results ?? [];
    const count = json?.data?.count ?? 0;

    const articles = results.map((a) => ({
      id: a.id,
      title: a.title || '',
      translatedTitle: a.translatedTitle || '',
      originalTitle: a.title || '',
      score: a.score ?? 0,
      scoreReview: a.scoreReview || '',
      url: a.urlParsed || a.originalUrl || '',
      source: a.websiteName || '',
      contentSource: a.contentSource || 'News',
      publishedAt: a.publicationDate || a.createdAt || '',
      language: a.language?.name || '',
      languageCode: a.language?.code || '',
      summary: a.summary || '',
      clusterSize: a.numberOfArticlesInCluster ?? 1,
      labels: (a.labels ?? []).map((l) => l.name ?? l).filter(Boolean),
    }));

    return new Response(JSON.stringify({ articles, count }), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=120, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Unknown error', articles: [], count: 0 }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
