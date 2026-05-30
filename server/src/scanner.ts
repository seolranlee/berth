import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { Session } from '@shared';

// 클로드 코드 세션 기록 위치: ~/.claude/projects/<인코딩된-cwd>/<sessionId>.jsonl
export const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

const MAX_PREVIEW = 200;

function truncate(s: string | null | undefined, n = MAX_PREVIEW): string | null {
  if (!s) return null;
  const t = String(s).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > n ? t.slice(0, n) + '…' : t;
}

const TRIVIAL_PROMPTS = new Set(['resume', 'clear', 'exit', 'continue', '계속', 'cd ..']);

// 노이즈 세션 = 빈 세션이거나, 의미있는 작업 없이 trivial 입력만 한 1턴 이하 세션.
// aiTitle이 있으면 클로드가 요약을 생성한 것 = 실제 작업 → 노이즈 아님.
function computeNoise(
  userTurns: number,
  firstPrompt: string | null,
  aiTitle: string | null,
): boolean {
  if (userTurns === 0) return true; // 빈 세션
  if (aiTitle) return false; // 의미있는 제목 생성됨 → 실제 작업
  if (userTurns <= 1) {
    const fp = (firstPrompt ?? '').trim().toLowerCase();
    if (!fp) return true;
    if (fp.startsWith('/')) return true; // 슬래시 명령(오타 포함)
    if (TRIVIAL_PROMPTS.has(fp)) return true;
    if (fp.length <= 3) return true; // 극히 짧은 입력
  }
  return false;
}

interface JsonlRecord {
  type?: string;
  cwd?: string;
  gitBranch?: string;
  timestamp?: string;
  aiTitle?: string;
  lastPrompt?: string;
  message?: { role?: string; content?: unknown };
}

// user 레코드에서 사람이 실제로 친 프롬프트 텍스트만 추출 (도구결과/시스템래퍼 제외)
function extractUserText(rec: JsonlRecord): string | null {
  const m = rec.message;
  if (!m) return null;
  const c = m.content;
  let text: string | null = null;
  if (typeof c === 'string') {
    text = c;
  } else if (Array.isArray(c)) {
    const parts = c
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string);
    if (parts.length) text = parts.join('\n');
  }
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('<')) return null;
  if (trimmed.startsWith('Caveat:')) return null;
  return trimmed;
}

// 세션 jsonl 한 개 → 목록 표시용 메타데이터 요약
async function parseSession(filePath: string): Promise<Session> {
  const sessionId = path.basename(filePath, '.jsonl');
  const stat = fs.statSync(filePath);

  let aiTitle: string | null = null;
  let lastPrompt: string | null = null;
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let firstPrompt: string | null = null;
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;
  let userTurns = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec: JsonlRecord;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // 깨진 줄 스킵
    }

    if (rec.cwd && !cwd) cwd = rec.cwd;
    if (rec.gitBranch && !gitBranch) gitBranch = rec.gitBranch;
    if (rec.timestamp) {
      if (!firstTimestamp) firstTimestamp = rec.timestamp;
      lastTimestamp = rec.timestamp;
    }

    switch (rec.type) {
      case 'ai-title':
        if (rec.aiTitle) aiTitle = rec.aiTitle;
        break;
      case 'last-prompt':
        if (rec.lastPrompt) lastPrompt = rec.lastPrompt;
        break;
      case 'user': {
        const userText = extractUserText(rec);
        if (userText) {
          userTurns++;
          if (!firstPrompt) firstPrompt = userText;
        }
        break;
      }
    }
  }

  return {
    sessionId,
    title: aiTitle || truncate(firstPrompt, 80) || '(제목 없음)',
    aiTitle,
    firstPrompt: truncate(firstPrompt),
    lastPrompt: truncate(lastPrompt),
    cwd,
    project: cwd ? path.basename(cwd) : null,
    gitBranch,
    userTurns,
    createdAt: firstTimestamp,
    updatedAt: lastTimestamp || stat.mtime.toISOString(),
    fileSize: stat.size,
    resumeCommand: `claude --resume ${sessionId}`,
    noise: computeNoise(userTurns, firstPrompt, aiTitle),
    pinned: false, // 서버 라우트에서 store 기준으로 채워짐
    koreanTitle: null, // 서버 라우트에서 title 캐시 기준으로 채워짐
    active: false, // 서버 라우트에서 recency 기준으로 채워짐
  };
}

const SESSION_ID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// sessionId가 UUID 형식인지 검증 (명령 주입 방지 1차 방어선)
export function isValidSessionId(id: string): boolean {
  return typeof id === 'string' && SESSION_ID_RE.test(id);
}

// id로 단일 세션 조회 (실행 시 cwd를 서버가 직접 확보)
export async function getSessionById(id: string): Promise<Session | null> {
  if (!isValidSessionId(id)) return null;
  if (!fs.existsSync(PROJECTS_DIR)) return null;
  for (const dirent of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const file = path.join(PROJECTS_DIR, dirent.name, `${id}.jsonl`);
    if (fs.existsSync(file)) return parseSession(file);
  }
  return null;
}

// 모든 프로젝트의 최상위 UUID 세션 스캔 → 최근 업데이트순 정렬
// (agent-*.jsonl 등 서브에이전트/비세션 파일은 제외)
export async function listSessions(): Promise<Session[]> {
  if (!fs.existsSync(PROJECTS_DIR)) return [];

  const files: string[] = [];
  for (const dirent of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const dirPath = path.join(PROJECTS_DIR, dirent.name);
    for (const f of fs.readdirSync(dirPath)) {
      if (f.endsWith('.jsonl') && isValidSessionId(path.basename(f, '.jsonl'))) {
        files.push(path.join(dirPath, f));
      }
    }
  }

  const sessions = await Promise.all(files.map((f) => parseSession(f).catch(() => null)));

  return sessions
    .filter((s): s is Session => s !== null)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
