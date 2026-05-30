// PoC 검증용 CLI: 세션 스캔 결과를 터미널에 출력한다.
// 실행: npm run scan  (의존성 없이 순수 Node)
import { listSessions, PROJECTS_DIR } from './scanner.js';

const t0 = Date.now();
const sessions = await listSessions();
const ms = Date.now() - t0;

console.log(`\n📂 ${PROJECTS_DIR}`);
console.log(`🔎 세션 ${sessions.length}개 발견 (${ms}ms)\n`);

const LIMIT = 25;
for (const s of sessions.slice(0, LIMIT)) {
  const when = (s.updatedAt || '').slice(0, 16).replace('T', ' ');
  const loc = `${s.project || '?'}${s.gitBranch ? ` (${s.gitBranch})` : ''}`;
  console.log(`● ${s.title}`);
  console.log(`    ${when}  ·  ${loc}  ·  ${s.userTurns} turns  ·  ${(s.fileSize / 1024).toFixed(0)}KB`);
  console.log(`    ↻ ${s.resumeCommand}`);
  if (s.lastPrompt) console.log(`    ⤷ last: ${s.lastPrompt.slice(0, 80)}`);
  console.log('');
}

if (sessions.length > LIMIT) {
  console.log(`… 외 ${sessions.length - LIMIT}개\n`);
}
