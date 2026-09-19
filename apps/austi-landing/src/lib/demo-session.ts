import { GENERATION_POLICY } from '../../../../convex/chat/policy';

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
export const MAX_MESSAGE_LENGTH = GENERATION_POLICY.demo.maxMessage;
export const SEND_INTERVAL_MS = 5000;
export const DEMO_STORAGE_KEY = 'austi:landing-demo:v1';
export const demoTabs = ['Approvals', 'Contractors', 'Case record'] as const;
export type DemoTab = (typeof demoTabs)[number];

export type DemoTurn = {
  id: string;
  request: string;
  reply: string;
  status: 'thinking' | 'ready' | 'error';
};

export type LocalDemoSession = {
  version: 1;
  token: string;
  expiresAt: number;
  draft: string;
  tab: DemoTab;
  approved: boolean;
  turns: DemoTurn[];
  lastSentAt: number | null;
};

export const createDemoSession = (): LocalDemoSession => ({
  version: 1,
  token: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join(''),
  expiresAt: Date.now() + SESSION_TTL,
  draft: '',
  tab: 'Approvals',
  approved: false,
  turns: [],
  lastSentAt: null,
});

export const parseDemoSession = (value: string | null): LocalDemoSession | null => {
  try {
    const session = JSON.parse(value ?? 'null');
    if (
      !session ||
      session.version !== 1 ||
      typeof session.token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(session.token) ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= Date.now() ||
      typeof session.draft !== 'string' ||
      session.draft.length > MAX_MESSAGE_LENGTH ||
      !demoTabs.includes(session.tab) ||
      typeof session.approved !== 'boolean' ||
      (session.lastSentAt !== null && !Number.isFinite(session.lastSentAt)) ||
      !Array.isArray(session.turns) ||
      session.turns.some(
        (turn: DemoTurn) =>
          !turn ||
          typeof turn.id !== 'string' ||
          typeof turn.request !== 'string' ||
          !turn.request.trim() ||
          turn.request.length > MAX_MESSAGE_LENGTH ||
          typeof turn.reply !== 'string' ||
          !['queued', 'thinking', 'writing', 'ready', 'error'].includes(turn.status),
      )
    )
      return null;
    return {
      ...session,
      turns: session.turns.map((turn: DemoTurn) =>
        // Recover pending turns, including statuses saved by the earlier streaming demo.
        turn.status === 'ready' || turn.status === 'error' ? turn : { ...turn, status: 'error' },
      ),
    };
  } catch {
    return null;
  }
};
