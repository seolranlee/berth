// server ↔ web 공용 타입. 런타임 값 없이 타입만 → import type으로 쓰면 런타임 결합 0.

export interface Session {
  sessionId: string;
  title: string;
  aiTitle: string | null;
  firstPrompt: string | null;
  lastPrompt: string | null;
  cwd: string | null;
  project: string | null;
  gitBranch: string | null;
  userTurns: number;
  createdAt: string | null;
  updatedAt: string;
  fileSize: number;
  resumeCommand: string;
  pinned: boolean;
}

export interface TerminalInfo {
  id: string;
  name: string;
  available: boolean;
}

export interface LaunchResult {
  ok: boolean;
  terminal: string;
  via: string;
  cwd: string;
  command: string;
}
