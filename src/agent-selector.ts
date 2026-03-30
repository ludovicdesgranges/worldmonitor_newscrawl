/**
 * Agent Selector — landing page shown before the dashboard.
 * Each agent represents a pre-configured monitoring context.
 * Built-in agents (all, marine-surveillance) are hardcoded.
 * Custom agents are created by the user from NewsCrawl feeds and stored in localStorage.
 */

import { toApiUrl } from '@/services/runtime';

const AGENT_STORAGE_KEY = 'wm-selected-agent';
const CUSTOM_AGENTS_KEY = 'wm-custom-agents';

export interface AgentDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface AgentConfig {
  defaultNewsCrawlFeedId?: string;
  defaultNewsCrawlFeedTitle?: string;
  hideVariantSwitcher?: boolean;
  mapTitle?: string;
  allowedLayers?: string[];
  defaultEnabledLayers?: string[];
}

interface CustomAgent {
  id: string;
  name: string;
  feedId: string;
  feedTitle: string;
  createdAt: number;
}

/* ------ Built-in agents ------ */

const BUILTIN_AGENTS: (AgentDef & { config?: AgentConfig })[] = [
  {
    id: 'all',
    name: 'All',
    description: 'Full monitoring dashboard with all data sources and panels.',
    icon: '🌍',
  },
  {
    id: 'marine-surveillance',
    name: 'Marine Surveillance',
    description: 'Maritime monitoring: vessel tracking, naval operations, narcotics interdiction, and coastal security.',
    icon: '🚢',
    config: {
      defaultNewsCrawlFeedId: '64b8612e-4ec8-486e-b00d-74c2548a9a8a',
      defaultNewsCrawlFeedTitle: 'Sopra test',
      hideVariantSwitcher: true,
      mapTitle: 'MARINE',
      allowedLayers: ['conflicts', 'newscrawlLocations'],
      defaultEnabledLayers: ['conflicts', 'newscrawlLocations'],
    },
  },
];

/* ------ Custom agents persistence ------ */

function loadCustomAgents(): CustomAgent[] {
  try {
    const raw = localStorage.getItem(CUSTOM_AGENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCustomAgents(agents: CustomAgent[]): void {
  try { localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(agents)); } catch { /* */ }
}

function deleteCustomAgent(id: string): void {
  const agents = loadCustomAgents().filter(a => a.id !== id);
  saveCustomAgents(agents);
}

/* ------ Public API ------ */

export function getSelectedAgent(): string | null {
  try { return localStorage.getItem(AGENT_STORAGE_KEY); } catch { return null; }
}

export function setSelectedAgent(agentId: string): void {
  try { localStorage.setItem(AGENT_STORAGE_KEY, agentId); } catch { /* */ }
}

export function clearSelectedAgent(): void {
  try { localStorage.removeItem(AGENT_STORAGE_KEY); } catch { /* */ }
}

export function getAgentConfig(): AgentConfig | undefined {
  const id = getSelectedAgent();
  if (!id) return undefined;

  // Check built-in
  const builtin = BUILTIN_AGENTS.find(a => a.id === id);
  if (builtin) return builtin.config;

  // Check custom
  const custom = loadCustomAgents().find(a => a.id === id);
  if (custom) {
    return {
      defaultNewsCrawlFeedId: custom.feedId,
      defaultNewsCrawlFeedTitle: custom.feedTitle,
      hideVariantSwitcher: true,
      mapTitle: custom.name.toUpperCase(),
      allowedLayers: ['newscrawlLocations'],
      defaultEnabledLayers: ['newscrawlLocations'],
    };
  }

  return undefined;
}

/* ------ Render ------ */

export function renderAgentSelector(container: HTMLElement, onSelect: (agentId: string) => void): void {
  const customAgents = loadCustomAgents();

  const allAgents = [
    ...BUILTIN_AGENTS.map(a => ({ id: a.id, name: a.name, desc: a.description, icon: a.icon, custom: false })),
    ...customAgents.map(a => ({ id: a.id, name: a.name, desc: `NewsCrawl: ${a.feedTitle}`, icon: '📡', custom: true })),
  ];

  container.innerHTML = `
    <div class="agent-selector">
      <div class="agent-selector-header">
        <div class="agent-selector-logo">MONITOR</div>
        <h1 class="agent-selector-title">Select an Agent</h1>
        <p class="agent-selector-subtitle">Choose a monitoring context to get started.</p>
      </div>
      <div class="agent-selector-grid">
        ${allAgents.map(agent => `
          <div class="agent-card-wrap" data-agent-id="${agent.id}">
            <button class="agent-card" data-agent-id="${agent.id}">
              <span class="agent-card-icon">${agent.icon}</span>
              <h2 class="agent-card-name">${agent.name}</h2>
              <p class="agent-card-desc">${agent.desc}</p>
            </button>
            ${agent.custom ? `<button class="agent-card-delete" data-delete-id="${agent.id}" title="Delete">&times;</button>` : ''}
          </div>
        `).join('')}
        <button class="agent-card agent-card-add" id="addAgentBtn">
          <span class="agent-card-icon">+</span>
          <h2 class="agent-card-name">New Agent</h2>
          <p class="agent-card-desc">Create from a NewsCrawl feed.</p>
        </button>
      </div>
      <div class="agent-feed-picker" id="feedPicker" style="display:none">
        <div class="afp-overlay" id="afpOverlay"></div>
        <div class="afp-modal">
          <div class="afp-header">
            <h3>Select a NewsCrawl Feed</h3>
            <button class="afp-close" id="afpClose">&times;</button>
          </div>
          <div class="afp-body" id="afpBody">
            <div class="afp-loading">Loading feeds...</div>
          </div>
        </div>
      </div>
    </div>
    <style>
      .agent-selector{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a0f0a;color:#e0e0e0;font-family:'JetBrains Mono','SF Mono','Fira Code',monospace;padding:2rem}
      .agent-selector-header{text-align:center;margin-bottom:3rem}
      .agent-selector-logo{font-size:.85rem;letter-spacing:.25em;text-transform:uppercase;color:#4ade80;margin-bottom:1.5rem;font-weight:700}
      .agent-selector-title{font-size:1.8rem;font-weight:600;margin:0 0 .5rem;color:#fff}
      .agent-selector-subtitle{font-size:.9rem;color:#888;margin:0}
      .agent-selector-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.5rem;max-width:1000px;width:100%}
      .agent-card-wrap{position:relative}
      .agent-card{background:#141a14;border:1px solid #2a3a2a;border-radius:12px;padding:2rem;cursor:pointer;transition:all .2s ease;text-align:left;font-family:inherit;color:inherit;display:flex;flex-direction:column;gap:.75rem;width:100%}
      .agent-card:hover{border-color:#4ade80;background:#1a241a;transform:translateY(-2px);box-shadow:0 8px 24px rgba(74,222,128,.1)}
      .agent-card:active{transform:translateY(0)}
      .agent-card-icon{font-size:2.5rem}
      .agent-card-name{font-size:1.2rem;font-weight:600;margin:0;color:#fff}
      .agent-card-desc{font-size:.8rem;color:#888;margin:0;line-height:1.5}
      .agent-card-add{border-style:dashed;border-color:#333;background:#0d120d}
      .agent-card-add:hover{border-color:#4ade80;background:#111a11}
      .agent-card-add .agent-card-icon{color:#4ade80;font-size:2rem}
      .agent-card-delete{position:absolute;top:8px;right:8px;background:#ff446622;border:1px solid #ff446644;color:#ff6666;font-size:16px;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s}
      .agent-card-wrap:hover .agent-card-delete{opacity:1}
      .agent-card-delete:hover{background:#ff4466;color:#fff}

      .agent-feed-picker{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center}
      .afp-overlay{position:absolute;inset:0;background:rgba(0,0,0,.7)}
      .afp-modal{position:relative;background:#111;border:1px solid #333;border-radius:12px;width:500px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column}
      .afp-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #222}
      .afp-header h3{margin:0;font-size:1rem;color:#fff}
      .afp-close{background:none;border:none;color:#888;font-size:22px;cursor:pointer}
      .afp-close:hover{color:#fff}
      .afp-body{padding:12px;overflow-y:auto;flex:1}
      .afp-loading{text-align:center;padding:2rem;color:#888}
      .afp-feed{display:flex;align-items:center;gap:12px;padding:12px;border-radius:8px;cursor:pointer;border:1px solid transparent;transition:all .15s}
      .afp-feed:hover{background:#1a241a;border-color:#4ade80}
      .afp-feed-icon{font-size:1.5rem}
      .afp-feed-info{flex:1}
      .afp-feed-name{font-size:.9rem;font-weight:600;color:#fff}
      .afp-feed-type{font-size:.75rem;color:#888;margin-top:2px}
      .afp-error{text-align:center;padding:2rem;color:#ff6666}

      @media(max-width:600px){.agent-selector-grid{grid-template-columns:1fr}.agent-selector-title{font-size:1.4rem}}
    </style>
  `;

  // Select agent
  container.querySelectorAll<HTMLButtonElement>('.agent-card[data-agent-id]').forEach(card => {
    card.addEventListener('click', () => {
      const agentId = card.dataset.agentId;
      if (agentId) { setSelectedAgent(agentId); onSelect(agentId); }
    });
  });

  // Delete custom agent
  container.querySelectorAll<HTMLButtonElement>('.agent-card-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteId;
      if (id && confirm(`Delete agent "${customAgents.find(a => a.id === id)?.name}"?`)) {
        deleteCustomAgent(id);
        renderAgentSelector(container, onSelect);
      }
    });
  });

  // Add agent
  const addBtn = container.querySelector('#addAgentBtn');
  const picker = container.querySelector('#feedPicker') as HTMLElement;
  const overlay = container.querySelector('#afpOverlay');
  const closeBtn = container.querySelector('#afpClose');
  const body = container.querySelector('#afpBody') as HTMLElement;

  const closePicker = () => { picker.style.display = 'none'; };

  addBtn?.addEventListener('click', async () => {
    picker.style.display = 'flex';
    body.innerHTML = '<div class="afp-loading">Loading feeds...</div>';

    try {
      const resp = await fetch(toApiUrl('/api/newscrawl/feeds'), { signal: AbortSignal.timeout(12000) });
      const json = await resp.json() as { feeds: Array<{ id: string; title: string; agentType: string; active: boolean }>; error?: string };

      if (json.error || !json.feeds?.length) {
        body.innerHTML = `<div class="afp-error">${json.error || 'No feeds found'}</div>`;
        return;
      }

      const feeds = json.feeds.filter(f => f.active);
      const existingFeedIds = new Set([
        ...BUILTIN_AGENTS.map(a => a.config?.defaultNewsCrawlFeedId).filter(Boolean),
        ...customAgents.map(a => a.feedId),
      ]);

      body.innerHTML = feeds.map(f => {
        const already = existingFeedIds.has(f.id);
        const icons: Record<string, string> = { NEWS_AGENT: '📰', COMPETITION_AGENT: '🏢' };
        return `<div class="afp-feed${already ? ' afp-feed-used' : ''}" data-feed-id="${f.id}" data-feed-title="${f.title.replace(/"/g, '&quot;')}" style="${already ? 'opacity:.4;pointer-events:none' : ''}">
          <span class="afp-feed-icon">${icons[f.agentType] ?? '📡'}</span>
          <div class="afp-feed-info">
            <div class="afp-feed-name">${f.title}${already ? ' <span style="color:#888;font-size:.7rem">(already added)</span>' : ''}</div>
            <div class="afp-feed-type">${f.agentType === 'COMPETITION_AGENT' ? 'Competition Intelligence' : 'News Agent'}</div>
          </div>
        </div>`;
      }).join('');

      body.querySelectorAll<HTMLElement>('.afp-feed:not(.afp-feed-used)').forEach(el => {
        el.addEventListener('click', () => {
          const feedId = el.dataset.feedId!;
          const feedTitle = el.dataset.feedTitle!;
          const id = `custom-${feedId}`;
          const agent: CustomAgent = {
            id,
            name: feedTitle,
            feedId,
            feedTitle,
            createdAt: Date.now(),
          };
          const agents = loadCustomAgents();
          agents.push(agent);
          saveCustomAgents(agents);
          closePicker();
          renderAgentSelector(container, onSelect);
        });
      });
    } catch (err) {
      body.innerHTML = `<div class="afp-error">Failed to load feeds: ${(err as Error).message}</div>`;
    }
  });

  overlay?.addEventListener('click', closePicker);
  closeBtn?.addEventListener('click', closePicker);
}
