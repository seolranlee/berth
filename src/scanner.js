import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

// 클로드 코드가 세션을 기록하는 디렉토리.
// 구조: ~/.claude/projects/<인코딩된-cwd>/<sessionId>.jsonl
export const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

const MAX_PREVIEW = 200;

function truncate(s, n = MAX_PREVIEW) {
  if (!s) return null;
  const t = String(s).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > n ? t.slice(0, n) + '…' : t;
}

// user 레코드에서 "사람이 실제로 친 프롬프트" 텍스트만 뽑아낸다.
// (도구 결과/시스템 래퍼/명령 출력은 제외)
function extractUserText(rec) {
  const m = rec.message;
  if (!m) return null;
  let c = m.content;
  let text = null;
  if (typeof c === 'string') {
    text = c;
  } else if (Array.isArray(c)) {
    const parts = c
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text);
    if (parts.length) text = parts.join('\n');
  }
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  // <command-...>, <local-command...>, <system-reminder> 같은 래퍼 / Caveat 안내 제외
  if (trimmed.startsWith('<')) return null;
  if (trimmed.startsWith('Caveat:')) return null;
  return trimmed;
}

// 세션 jsonl 한 개 → 목록 표시용 메타데이터 요약
async function parseSession(filePath) {
  const sessionId = path.basename(filePath, '.jsonl');
  const stat = fs.statSync(filePath);

  let aiTitle = null; // 최신 ai-title (계속 갱신됨)
  let lastPrompt = null; // 최신 last-prompt
  let cwd = null;
  let gitBranch = null;
  let firstPrompt = null;
  let firstTimestamp = null;
  let lastTimestamp = null;
  let userTurns = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // 깨진 줄은 스킵
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
        const text = extractUserText(rec);
        if (text) {
          userTurns++;
          if (!firstPrompt) firstPrompt = text;
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
  };
}

// 모든 프로젝트의 모든 세션을 스캔 → 최근 업데이트 순 정렬
export async function listSessions() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];

  const files = [];
  for (const dirent of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const dirPath = path.join(PROJECTS_DIR, dirent.name);
    for (const f of fs.readdirSync(dirPath)) {
      // 최상위 UUID 세션 파일만. agent-*.jsonl 등 서브에이전트/비세션 파일 제외
      if (f.endsWith('.jsonl') && isValidSessionId(path.basename(f, '.jsonl'))) {
        files.push(path.join(dirPath, f));
      }
    }
  }

  const sessions = await Promise.all(
    files.map((f) => parseSession(f).catch(() => null)),
  );

  return sessions
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

const SESSION_ID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// sessionId가 UUID 형식인지 검증 (명령 주입 방지의 1차 방어선)
export function isValidSessionId(id) {
  return typeof id === 'string' && SESSION_ID_RE.test(id);
}

// id로 단일 세션 조회 (실행 시 cwd 등 권위 있는 값을 서버에서 직접 확보)
export async function getSessionById(id) {
  if (!isValidSessionId(id)) return null;
  if (!fs.existsSync(PROJECTS_DIR)) return null;
  for (const dirent of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const file = path.join(PROJECTS_DIR, dirent.name, `${id}.jsonl`);
    if (fs.existsSync(file)) return parseSession(file);
  }
  return null;
}
