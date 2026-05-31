import { execFile } from 'node:child_process';

// "진행중" = 실제로 실행 중인 claude 세션 (recency 아님).
// claude는 `claude --resume <id>`로 돌고 argv에 세션 id가 들어가므로,
// ps에서 그 id들을 모아 "살아있는 세션 집합"을 만든다.
// (recency 기준은 방금 닫은 세션을 오탐 → 폐기. 프로세스 존재가 정확한 신호.)
const RESUME_ID_RE =
  /--resume\s+([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g;

export function getLiveSessionIds(): Promise<Set<string>> {
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'command'], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      const ids = new Set<string>();
      if (err || !stdout) return resolve(ids);
      RESUME_ID_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = RESUME_ID_RE.exec(stdout)) !== null) {
        ids.add(m[1].toLowerCase());
      }
      resolve(ids);
    });
  });
}

// 특정 세션의 claude 프로세스 PID 목록 (ps에서 `--resume <id>` 라인의 pid 추출)
export function getSessionPids(sessionId: string): Promise<number[]> {
  const idLower = sessionId.toLowerCase();
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'pid=,command='], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      const pids: number[] = [];
      if (err || !stdout) return resolve(pids);
      for (const raw of stdout.split('\n')) {
        const line = raw.trim();
        const sp = line.indexOf(' ');
        if (sp < 0) continue;
        const pid = Number(line.slice(0, sp));
        if (!Number.isInteger(pid)) continue;
        const cmd = line.slice(sp + 1);
        const m = cmd.match(
          /--resume\s+([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/,
        );
        if (m && m[1].toLowerCase() === idLower) pids.push(pid);
      }
      resolve(pids);
    });
  });
}

// 세션 종료: 해당 claude 프로세스에 SIGTERM → 유예 후에도 남아있으면 SIGKILL.
// SIGKILL 직전 ps를 다시 읽어 "지금도 이 세션의 --resume 프로세스인 PID"만 강제 종료한다.
// (유예 중 정상 종료됐거나 PID가 재사용된 경우, 엉뚱한 프로세스를 죽이지 않도록 재검증.)
// 세션 jsonl은 보존되어 나중에 다시 resume 가능 (비파괴적, /exit과 체감 동일).
// 종료한 프로세스 수를 반환 (0이면 실행 중이 아니었음).
export async function killSession(sessionId: string): Promise<number> {
  const pids = await getSessionPids(sessionId);
  if (pids.length === 0) return 0;
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* 이미 종료됐거나 권한 없음 — 무시 */
    }
  }
  // 정상 종료(터미널 모드 복원 등)에 충분한 유예
  await new Promise((r) => setTimeout(r, 1500));
  // 재검증: 유예 후에도 여전히 이 세션의 --resume 프로세스로 남아있는 PID만 SIGKILL
  const stillResume = new Set(await getSessionPids(sessionId));
  for (const pid of pids) {
    if (stillResume.has(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* 무시 */
      }
    }
  }
  return pids.length;
}
