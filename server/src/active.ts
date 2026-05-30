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
