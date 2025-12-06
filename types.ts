export enum AgentRole {
  PDM = 'Product Manager',
  ARCHITECT = 'System Architect',
  DESIGNER = 'UI/UX Designer',
  FRONTEND = 'Frontend Developer',
  BACKEND = 'Backend Developer',
  QA = 'QA Engineer',
  DOCS = 'Docs Writer',
  REVIEWER = 'Reviewer',
}

export type AgentStatus = 'idle' | 'running' | 'done' | 'error';

export interface AgentState {
  role: AgentRole;
  status: AgentStatus;
  output: string; // The raw text output from the model
  error?: string;
}

export interface ProjectFile {
  path: string;
  content: string;
  language: string;
}

export interface ChatMessage {
  role: 'user' | 'system' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AppState {
  messages: ChatMessage[];
  projectType: string;
  agents: Record<AgentRole, AgentState>;
  files: ProjectFile[];
  isRunning: boolean;
  activeTab: 'chat' | 'agents' | 'files' | 'readme';
}

export const INITIAL_AGENTS_STATE: Record<AgentRole, AgentState> = {
  [AgentRole.PDM]: { role: AgentRole.PDM, status: 'idle', output: '' },
  [AgentRole.ARCHITECT]: { role: AgentRole.ARCHITECT, status: 'idle', output: '' },
  [AgentRole.DESIGNER]: { role: AgentRole.DESIGNER, status: 'idle', output: '' },
  [AgentRole.FRONTEND]: { role: AgentRole.FRONTEND, status: 'idle', output: '' },
  [AgentRole.BACKEND]: { role: AgentRole.BACKEND, status: 'idle', output: '' },
  [AgentRole.QA]: { role: AgentRole.QA, status: 'idle', output: '' },
  [AgentRole.DOCS]: { role: AgentRole.DOCS, status: 'idle', output: '' },
  [AgentRole.REVIEWER]: { role: AgentRole.REVIEWER, status: 'idle', output: '' },
};