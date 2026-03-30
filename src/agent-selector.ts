/**
 * Agent Selector — landing page shown before the dashboard.
 * Each agent represents a pre-configured monitoring context.
 * Selecting an agent stores the choice in localStorage and boots the dashboard.
 */

const AGENT_STORAGE_KEY = 'wm-selected-agent';

export interface AgentDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const AGENTS: AgentDef[] = [
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
  },
];

export function getSelectedAgent(): string | null {
  try {
    return localStorage.getItem(AGENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setSelectedAgent(agentId: string): void {
  try {
    localStorage.setItem(AGENT_STORAGE_KEY, agentId);
  } catch { /* ignore */ }
}

export function clearSelectedAgent(): void {
  try {
    localStorage.removeItem(AGENT_STORAGE_KEY);
  } catch { /* ignore */ }
}

export function renderAgentSelector(container: HTMLElement, onSelect: (agentId: string) => void): void {
  container.innerHTML = `
    <div class="agent-selector">
      <div class="agent-selector-header">
        <div class="agent-selector-logo">MONITOR</div>
        <h1 class="agent-selector-title">Select an Agent</h1>
        <p class="agent-selector-subtitle">Choose a monitoring context to get started.</p>
      </div>
      <div class="agent-selector-grid">
        ${AGENTS.map(agent => `
          <button class="agent-card" data-agent-id="${agent.id}">
            <span class="agent-card-icon">${agent.icon}</span>
            <h2 class="agent-card-name">${agent.name}</h2>
            <p class="agent-card-desc">${agent.description}</p>
          </button>
        `).join('')}
      </div>
    </div>
    <style>
      .agent-selector {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #0a0f0a;
        color: #e0e0e0;
        font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
        padding: 2rem;
      }
      .agent-selector-header {
        text-align: center;
        margin-bottom: 3rem;
      }
      .agent-selector-logo {
        font-size: 0.85rem;
        letter-spacing: 0.25em;
        text-transform: uppercase;
        color: #4ade80;
        margin-bottom: 1.5rem;
        font-weight: 700;
      }
      .agent-selector-title {
        font-size: 1.8rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
        color: #fff;
      }
      .agent-selector-subtitle {
        font-size: 0.9rem;
        color: #888;
        margin: 0;
      }
      .agent-selector-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
        max-width: 800px;
        width: 100%;
      }
      .agent-card {
        background: #141a14;
        border: 1px solid #2a3a2a;
        border-radius: 12px;
        padding: 2rem;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
        font-family: inherit;
        color: inherit;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .agent-card:hover {
        border-color: #4ade80;
        background: #1a241a;
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(74, 222, 128, 0.1);
      }
      .agent-card:active {
        transform: translateY(0);
      }
      .agent-card-icon {
        font-size: 2.5rem;
      }
      .agent-card-name {
        font-size: 1.2rem;
        font-weight: 600;
        margin: 0;
        color: #fff;
      }
      .agent-card-desc {
        font-size: 0.8rem;
        color: #888;
        margin: 0;
        line-height: 1.5;
      }
      @media (max-width: 600px) {
        .agent-selector-grid {
          grid-template-columns: 1fr;
        }
        .agent-selector-title {
          font-size: 1.4rem;
        }
      }
    </style>
  `;

  container.querySelectorAll<HTMLButtonElement>('.agent-card').forEach(card => {
    card.addEventListener('click', () => {
      const agentId = card.dataset.agentId;
      if (agentId) {
        setSelectedAgent(agentId);
        onSelect(agentId);
      }
    });
  });
}
