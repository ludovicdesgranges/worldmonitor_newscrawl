/**
 * NewsCrawl API client — fetches articles from a pre-configured news feed
 * and maps them into the internal ParsedItem format used by the digest pipeline.
 *
 * API docs: https://newscrawl.ai/documentation
 * Base URL: https://api.prod.news-monitoring.newscore.fr
 */

import { cachedFetchJson } from '../../../_shared/redis';
import { classifyByKeyword, type ThreatLevel } from './_classifier';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Matches the shape used by list-feed-digest.ts so items merge seamlessly. */
export interface NewsCrawlParsedItem {
  source: string;
  title: string;
  link: string;
  publishedAt: number;
  isAlert: boolean;
  level: ThreatLevel;
  category: string;
  confidence: number;
  classSource: 'keyword' | 'llm';
}

interface NewsCrawlArticle {
  id: string;
  title: string;
  translatedTitle?: string;
  score?: number;
  url?: string;
  link?: string;
  sourceName?: string;
  source?: string;
  publishedAt?: string;
  createdAt?: string;
}

interface NewsCrawlApiResponse {
  data: {
    count: number;
    results: NewsCrawlArticle[];
  };
  error: Record<string, unknown>;
  isSuccess: boolean;
}

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const BASE_URL = 'https://api.prod.news-monitoring.newscore.fr';
const CACHE_TTL_SECONDS = 900; // 15 min — matches digest TTL
const MAX_ARTICLES = 20;
const REQUEST_TIMEOUT_MS = 10_000;

/* ------------------------------------------------------------------ */
/*  Public                                                             */
/* ------------------------------------------------------------------ */

/**
 * Fetches recent articles from one or more NewsCrawl feeds.
 * Returns [] if the API key is missing or any fetch fails (graceful degradation).
 */
export async function fetchNewsCrawlArticles(
  variant: string,
): Promise<NewsCrawlParsedItem[]> {
  const apiKey = process.env.NEWSCRAWL_API_KEY;
  if (!apiKey) return [];

  const feedIds = getNewsCrawlFeedIds();
  if (feedIds.length === 0) return [];

  const allItems: NewsCrawlParsedItem[] = [];

  for (const feedId of feedIds) {
    const cacheKey = `newscrawl:articles:v1:${feedId}`;

    try {
      const items = await cachedFetchJson<NewsCrawlParsedItem[]>(
        cacheKey,
        CACHE_TTL_SECONDS,
        () => fetchFeedArticles(apiKey, feedId, variant),
      );
      if (items) allItems.push(...items);
    } catch {
      // Graceful degradation — skip this feed
    }
  }

  return allItems.slice(0, MAX_ARTICLES);
}

/* ------------------------------------------------------------------ */
/*  Internal                                                           */
/* ------------------------------------------------------------------ */

async function fetchFeedArticles(
  apiKey: string,
  feedId: string,
  variant: string,
): Promise<NewsCrawlParsedItem[] | null> {
  const url = `${BASE_URL}/related-articles/?newsFeedId=${feedId}&limit=${MAX_ARTICLES}`;

  const resp = await fetch(url, {
    headers: {
      'Authorization': `Api-Key ${apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!resp.ok) return null;

  const json = (await resp.json()) as NewsCrawlApiResponse;
  if (!json.isSuccess || !json.data?.results) return null;

  const items: NewsCrawlParsedItem[] = [];

  for (const article of json.data.results) {
    const title = article.translatedTitle || article.title;
    if (!title) continue;

    const link = article.url || article.link || '';
    const dateStr = article.publishedAt || article.createdAt;
    const publishedAt = dateStr ? new Date(dateStr).getTime() : Date.now();

    const threat = classifyByKeyword(title, variant);

    items.push({
      source: article.sourceName || article.source || 'NewsCrawl',
      title,
      link,
      publishedAt: Number.isNaN(publishedAt) ? Date.now() : publishedAt,
      isAlert: threat.level === 'critical' || threat.level === 'high',
      level: threat.level,
      category: threat.category,
      confidence: threat.confidence,
      classSource: 'keyword',
    });
  }

  return items.length > 0 ? items : null;
}

/**
 * Returns the NewsCrawl feed IDs to poll.
 * Set NEWSCRAWL_FEED_IDS as a comma-separated list of UUIDs.
 */
function getNewsCrawlFeedIds(): string[] {
  const raw = process.env.NEWSCRAWL_FEED_IDS ?? '';
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}
