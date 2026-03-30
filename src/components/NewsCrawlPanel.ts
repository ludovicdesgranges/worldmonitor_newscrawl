import { Panel } from './Panel';
import { toApiUrl } from '@/services/runtime';
import { t } from '@/services/i18n';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NewsCrawlFeed {
  id: string;
  title: string;
  agentType: string;
  isCompleted: boolean;
  active: boolean;
}

interface NewsCrawlLocation {
  location: string;
  latitude: number;
  longitude: number;
}

interface NewsCrawlArticle {
  id: string;
  title: string;
  originalTitle: string;
  translatedTitle: string;
  score: number;
  scoreReview: string;
  url: string;
  source: string;
  contentSource: string;
  publishedAt: string;
  language: string;
  languageCode: string;
  summary: string;
  clusterSize: number;
  labels: string[];
  locations?: NewsCrawlLocation[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FEEDS_CACHE_MS = 5 * 60_000;
const ARTICLES_PER_PAGE = 30;

type View = 'feeds' | 'articles';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export class NewsCrawlPanel extends Panel {
  private feeds: NewsCrawlFeed[] = [];
  private selectedFeedId: string | null = null;
  private selectedFeedTitle = '';
  private articles: NewsCrawlArticle[] = [];
  private totalArticles = 0;
  private currentOffset = 0;
  private feedsCacheTs = 0;
  private loading = false;
  private view: View = 'feeds';
  private defaultFeedId: string | null = null;
  private defaultFeedTitle = '';

  constructor(options?: { defaultFeedId?: string; defaultFeedTitle?: string }) {
    super({ id: 'newscrawl', title: 'NewsCrawl AI', showCount: true, trackActivity: true });
    if (options?.defaultFeedId) {
      this.defaultFeedId = options.defaultFeedId;
      this.defaultFeedTitle = options.defaultFeedTitle ?? '';
    }
    this.renderView();
  }

  /* ------ Public API ------ */

  public async init(): Promise<void> {
    if (this.defaultFeedId) {
      this.selectFeed(this.defaultFeedId, this.defaultFeedTitle);
      return;
    }
    await this.loadFeeds();
  }

  /* ------ Feed list ------ */

  private async loadFeeds(): Promise<void> {
    if (Date.now() - this.feedsCacheTs < FEEDS_CACHE_MS && this.feeds.length > 0) {
      this.renderView();
      return;
    }

    this.showLoading();

    try {
      const resp = await fetch(toApiUrl('/api/newscrawl/feeds'), {
        signal: AbortSignal.timeout(12_000),
      });
      const json = await resp.json() as { feeds: NewsCrawlFeed[]; error?: string };

      if (json.error && json.feeds.length === 0) {
        this.showError(json.error, () => void this.loadFeeds());
        return;
      }

      this.feeds = json.feeds.filter(f => f.active);
      this.feedsCacheTs = Date.now();
      this.setCount(this.feeds.length);
      this.view = 'feeds';
      this.renderView();
    } catch {
      this.showError(t('common.fetchError'), () => void this.loadFeeds());
    }
  }

  /* ------ Articles ------ */

  private async loadArticles(feedId: string, offset = 0): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    if (offset === 0) this.showLoading();

    try {
      const params = new URLSearchParams({
        feedId,
        limit: String(ARTICLES_PER_PAGE),
        offset: String(offset),
      });

      const resp = await fetch(toApiUrl(`/api/newscrawl/articles?${params}`), {
        signal: AbortSignal.timeout(15_000),
      });
      const json = await resp.json() as { articles: NewsCrawlArticle[]; count: number; error?: string };

      if (json.error && json.articles.length === 0) {
        this.showError(json.error, () => void this.loadArticles(feedId, offset));
        return;
      }

      if (offset === 0) {
        this.articles = json.articles;
      } else {
        this.articles.push(...json.articles);
      }

      this.totalArticles = json.count;
      this.currentOffset = offset + json.articles.length;
      this.view = 'articles';
      this.renderView();
      this.pushLocationsToMap();
    } catch {
      if (offset === 0) {
        this.showError(t('common.fetchError'), () => void this.loadArticles(feedId, offset));
      }
    } finally {
      this.loading = false;
    }
  }

  /* ------ View router ------ */

  private renderView(): void {
    if (this.view === 'feeds') {
      this.renderFeedsScreen();
    } else {
      this.renderArticlesScreen();
    }
  }

  /* ------ Screen 1: Feed/Agent list ------ */

  private renderFeedsScreen(): void {
    if (this.feeds.length === 0) {
      this.content.innerHTML = `
        <div class="nc-empty">
          <p>No NewsCrawl feeds found.</p>
          <p class="nc-sub">Set NEWSCRAWL_API_KEY in .env.local</p>
        </div>
        <style>${NewsCrawlPanel.styles()}</style>`;
      return;
    }

    const agentIcons: Record<string, string> = {
      NEWS_AGENT: '📰',
      COMPETITION_AGENT: '🏢',
    };

    const feedsHtml = this.feeds.map(f => {
      const icon = agentIcons[f.agentType] ?? '📡';
      const inactive = !f.active;
      const typeBadge = f.agentType === 'COMPETITION_AGENT' ? 'CI' : 'News';
      const statusDot = inactive ? '<span class="nc-dot nc-dot-off"></span>' : '<span class="nc-dot nc-dot-on"></span>';
      return `<button class="nc-agent-card${inactive ? ' nc-agent-inactive' : ''}" data-feed-id="${f.id}" data-feed-title="${this.esc(f.title)}">
        <div class="nc-agent-top">
          <span class="nc-agent-icon">${icon}</span>
          <span class="nc-agent-name">${this.esc(f.title)}</span>
        </div>
        <div class="nc-agent-bottom">
          ${statusDot}
          <span class="nc-agent-status">${inactive ? 'Paused' : 'Active'}</span>
          <span class="nc-agent-type">${typeBadge}</span>
        </div>
      </button>`;
    }).join('');

    this.content.innerHTML = `
      <div class="nc-container">
        <div class="nc-agents-grid">${feedsHtml}</div>
      </div>
      <style>${NewsCrawlPanel.styles()}</style>`;

    this.content.querySelectorAll('.nc-agent-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        const feedId = el.dataset.feedId;
        const feedTitle = el.dataset.feedTitle ?? '';
        if (feedId) this.selectFeed(feedId, feedTitle);
      });
    });
  }

  /* ------ Screen 2: Articles for selected agent ------ */

  private renderArticlesScreen(): void {
    const rows = this.articles.map(a => {
      const scoreColor = a.score >= 80 ? '#44ff88' : a.score >= 50 ? '#ffaa44' : '#ff4466';
      const date = a.publishedAt ? this.relativeTime(a.publishedAt) : '';
      const labels = a.labels.map(l => `<span class="nc-label">${this.esc(l)}</span>`).join('');
      const lang = a.language ? `<span class="nc-lang">${this.esc(a.language)}</span>` : '';
      const src = a.contentSource && a.contentSource !== 'News'
        ? `<span class="nc-content-src">${this.esc(a.contentSource)}</span>` : '';
      const cluster = a.clusterSize > 1
        ? `<span class="nc-cluster" title="${a.clusterSize} related articles">+${a.clusterSize - 1}</span>` : '';

      return `<a class="nc-article" href="${this.esc(a.url)}" target="_blank" rel="noopener">
        <div class="nc-article-row1">
          <span class="nc-score" style="color:${scoreColor}">${a.score}</span>
          <span class="nc-article-title">${this.esc(a.translatedTitle || a.title)}</span>
        </div>
        ${a.originalTitle && a.translatedTitle && a.originalTitle !== a.translatedTitle
          ? `<div class="nc-original-title">${this.esc(a.originalTitle)}</div>` : ''}
        <div class="nc-article-meta">
          <span class="nc-source">${this.esc(a.source)}</span>
          ${lang}${src}${cluster}${labels}
          <span class="nc-date">${date}</span>
        </div>
        ${a.summary ? `<div class="nc-summary">${this.esc(a.summary).slice(0, 180)}${a.summary.length > 180 ? '...' : ''}</div>` : ''}
      </a>`;
    }).join('');

    const hasMore = this.currentOffset < this.totalArticles;
    const loadMoreBtn = hasMore
      ? `<button class="nc-load-more">Load more (${this.totalArticles - this.currentOffset} remaining)</button>`
      : '';

    const emptyMsg = this.articles.length === 0 ? '<div class="nc-empty">No articles found for this agent.</div>' : '';

    this.content.innerHTML = `
      <div class="nc-container">
        <div class="nc-toolbar">
          <button class="nc-back-btn">&larr; Back</button>
          <span class="nc-toolbar-title">${this.esc(this.selectedFeedTitle)}</span>
          <span class="nc-toolbar-count">${this.totalArticles} articles</span>
        </div>
        <div class="nc-articles-list">
          ${emptyMsg}${rows}${loadMoreBtn}
        </div>
      </div>
      <style>${NewsCrawlPanel.styles()}</style>`;

    this.content.querySelector('.nc-back-btn')?.addEventListener('click', () => {
      this.view = 'feeds';
      this.selectedFeedId = null;
      this.articles = [];
      this.renderView();
    });

    const loadMoreEl = this.content.querySelector('.nc-load-more');
    loadMoreEl?.addEventListener('click', () => {
      if (this.selectedFeedId) void this.loadArticles(this.selectedFeedId, this.currentOffset);
    });
  }

  /* ------ Actions ------ */

  private selectFeed(feedId: string, title: string): void {
    this.selectedFeedId = feedId;
    this.selectedFeedTitle = title;
    this.articles = [];
    this.currentOffset = 0;
    this.totalArticles = 0;
    void this.loadArticles(feedId);
  }

  /* ------ Map integration ------ */

  private pushLocationsToMap(): void {
    const markers: Array<Record<string, unknown>> = [];
    for (const article of this.articles) {
      if (!article.locations || article.locations.length === 0) continue;
      const ts = article.publishedAt ? new Date(article.publishedAt) : undefined;
      const threat = article.score >= 80 ? 'high' : article.score >= 50 ? 'medium' : 'low';
      for (const loc of article.locations) {
        markers.push({
          lat: loc.latitude,
          lon: loc.longitude,
          title: article.translatedTitle || article.title,
          threatLevel: threat,
          timestamp: ts,
          score: article.score,
          source: article.source,
          url: article.url,
          summary: article.summary,
          language: article.language,
          scoreReview: article.scoreReview,
          labels: article.labels,
          publishedAt: article.publishedAt,
          locationName: loc.location,
          clusterSize: article.clusterSize,
        });
      }
    }
    document.dispatchEvent(new CustomEvent('newscrawl-locations', { detail: markers }));
  }

  /* ------ Helpers ------ */

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private relativeTime(iso: string): string {
    // NewsCrawl dates may be "DD-MM-YYYYTHH:mm:ss+0000 UTC" — normalize to ISO
    let dateStr = iso;
    const ddMm = iso.match(/^(\d{2})-(\d{2})-(\d{4}T)/);
    if (ddMm) dateStr = `${ddMm[3]!.slice(0, -1)}-${ddMm[2]!}-${ddMm[1]!}T${iso.slice(11)}`;
    dateStr = dateStr.replace(/\s*UTC$/, '');
    const ts = new Date(dateStr).getTime();
    if (Number.isNaN(ts)) return '';
    const diff = Date.now() - ts;
    if (diff < 0) return '';
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  /* ------ Styles ------ */

  private static styles(): string {
    return `
      .nc-container { display:flex; flex-direction:column; height:100%; }
      .nc-empty { padding:24px; text-align:center; color:var(--text-secondary, #888); font-size:0.85rem; }
      .nc-sub { font-size:0.75rem; opacity:0.6; margin-top:4px; }

      /* --- Screen 1: Agent grid --- */
      .nc-agents-grid {
        display:flex; flex-wrap:wrap; gap:6px; padding:8px;
        overflow-y:auto; flex:1;
      }
      .nc-agent-card {
        display:flex; flex-direction:column; justify-content:space-between;
        width:calc(50% - 3px); min-height:56px;
        padding:8px 10px; border:1px solid var(--border-color, #333);
        border-radius:6px; background:rgba(255,255,255,0.02);
        cursor:pointer; text-align:left;
        transition: border-color 0.15s, background 0.15s;
      }
      .nc-agent-card:hover { border-color:var(--accent-color, #4488ff); background:rgba(68,136,255,0.06); }
      .nc-agent-inactive { opacity:0.4; }

      .nc-agent-top { display:flex; align-items:center; gap:6px; }
      .nc-agent-icon { font-size:1rem; }
      .nc-agent-name {
        font-size:0.78rem; font-weight:600; color:var(--text-primary, #ddd);
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      .nc-agent-bottom { display:flex; align-items:center; gap:5px; margin-top:4px; }
      .nc-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
      .nc-dot-on { background:#44ff88; }
      .nc-dot-off { background:#666; }
      .nc-agent-status { font-size:0.65rem; color:var(--text-secondary, #888); }
      .nc-agent-type {
        margin-left:auto; font-size:0.6rem; padding:1px 5px; border-radius:3px;
        background:rgba(255,255,255,0.06); color:var(--text-secondary, #999);
      }

      /* --- Screen 2: Articles --- */
      .nc-toolbar {
        display:flex; align-items:center; gap:8px; padding:6px 8px;
        border-bottom:1px solid var(--border-color, #333); flex-shrink:0;
      }
      .nc-back-btn {
        background:none; border:1px solid var(--border-color, #444);
        border-radius:4px; color:var(--accent-color, #4488ff);
        padding:3px 8px; font-size:0.75rem; cursor:pointer;
        transition: background 0.15s;
      }
      .nc-back-btn:hover { background:rgba(68,136,255,0.1); }
      .nc-toolbar-title {
        font-size:0.8rem; font-weight:600; color:var(--text-primary, #ddd);
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;
      }
      .nc-toolbar-count { font-size:0.7rem; color:var(--text-secondary, #888); white-space:nowrap; }

      .nc-articles-list { flex:1; overflow-y:auto; }

      .nc-article {
        display:block; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.05);
        text-decoration:none; transition: background 0.1s; cursor:pointer;
      }
      .nc-article:hover { background:rgba(255,255,255,0.04); }

      .nc-article-row1 { display:flex; align-items:flex-start; gap:8px; }
      .nc-score {
        flex-shrink:0; font-weight:700; font-size:0.9rem; min-width:28px;
        text-align:right; font-family:monospace;
      }
      .nc-article-title {
        color:var(--text-primary, #ddd); font-size:0.82rem;
        line-height:1.35; word-break:break-word;
      }
      .nc-original-title {
        font-size:0.7rem; color:var(--text-secondary, #777); padding-left:36px;
        margin-top:2px; font-style:italic;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }

      .nc-article-meta {
        display:flex; gap:5px; align-items:center; margin-top:4px; padding-left:36px;
        flex-wrap:wrap;
      }
      .nc-source { font-size:0.7rem; color:var(--accent-color, #4488ff); font-weight:500; }
      .nc-lang {
        font-size:0.6rem; padding:1px 5px; border-radius:3px;
        background:rgba(51,119,250,0.15); color:#5599ff;
      }
      .nc-content-src {
        font-size:0.6rem; padding:1px 5px; border-radius:3px;
        background:rgba(255,170,68,0.12); color:#ffaa44;
      }
      .nc-cluster {
        font-size:0.6rem; padding:1px 5px; border-radius:3px;
        background:rgba(255,255,255,0.06); color:var(--text-secondary, #aaa);
      }
      .nc-label {
        font-size:0.6rem; padding:1px 5px; border-radius:3px;
        background:rgba(68,255,136,0.1); color:#44ff88;
      }
      .nc-date { font-size:0.7rem; color:var(--text-secondary, #666); margin-left:auto; }

      .nc-summary {
        font-size:0.72rem; color:var(--text-secondary, #999); line-height:1.4;
        padding:4px 10px 2px 36px;
      }

      .nc-load-more {
        display:block; width:calc(100% - 16px); margin:6px 8px; padding:10px;
        background:transparent; border:1px solid var(--border-color, #444);
        border-radius:4px; color:var(--accent-color, #4488ff);
        cursor:pointer; font-size:0.8rem; text-align:center;
        transition: background 0.15s;
      }
      .nc-load-more:hover { background:rgba(68,136,255,0.1); }
    `;
  }

  public override destroy(): void {
    super.destroy();
  }
}
