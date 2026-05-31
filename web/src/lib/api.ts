import type { Session, TerminalInfo, LaunchResult } from '@shared';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string })?.error;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  listSessions: () => http<Session[]>('/api/sessions'),
  listTerminals: () => http<TerminalInfo[]>('/api/terminals'),
  launch: (sessionId: string, terminal: string, mode: 'window' | 'tab' = 'window') =>
    http<LaunchResult>(`/api/sessions/${sessionId}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminal, mode }),
    }),
  pin: (sessionId: string) =>
    http<{ pinned: string[] }>(`/api/sessions/${sessionId}/pin`, { method: 'POST' }),
  unpin: (sessionId: string) =>
    http<{ pinned: string[] }>(`/api/sessions/${sessionId}/pin`, { method: 'DELETE' }),
  generateTitles: () =>
    http<{ generating: boolean; pending: number }>('/api/titles/generate', {
      method: 'POST',
    }),
  deleteSession: (sessionId: string) =>
    http<{ deleted: boolean; trashed: number }>(`/api/sessions/${sessionId}`, {
      method: 'DELETE',
    }),
  deleteNoise: () =>
    http<{ deleted: number }>('/api/sessions/delete-noise', { method: 'POST' }),
};
