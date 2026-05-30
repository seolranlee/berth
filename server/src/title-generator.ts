import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Session } from '@shared';

// 사용자의 기존 Claude Code 인증/구독을 그대로 재사용 (별도 API 키 불필요).
// 빠르고 저렴한 모델로 제목만 생성.
const MODEL = 'haiku';
const TIMEOUT_MS = 30_000;

function buildPrompt(s: Session): string {
  return [
    '아래는 종료된 코딩 작업 세션의 정보야. 이 세션 *전체*를 대표하는 간결한 한글 제목을 지어줘.',
    '',
    '규칙:',
    '- 세션의 핵심 목적/주제를 담을 것. [첫 요청]과 [영문 요약]이 전체 의도를 가장 잘 나타냄.',
    '- [최근 작업]은 마지막 단계일 뿐이니 거기에 치우치지 말 것.',
    '- 한 줄, 12~25자 내외, 따옴표·마침표·설명 없이 제목 텍스트만 출력.',
    '',
    `[영문 요약] ${s.aiTitle ?? '(없음)'}`,
    `[프로젝트] ${s.project ?? '(없음)'}`,
    `[첫 요청] ${s.firstPrompt ?? '(없음)'}`,
    `[최근 작업] ${s.lastPrompt ?? '(없음)'}`,
  ].join('\n');
}

function clean(output: string): string {
  let t = (output.trim().split('\n')[0] ?? '').trim();
  t = t.replace(/^["'`]+|["'`]+$/g, '').trim(); // 감싼 따옴표 제거
  return t.slice(0, 60);
}

// 제목 생성 호출이 남긴 임시 세션 파일을 정확히 삭제.
// claude 2.1.x 일부 환경에선 --no-session-persistence 로도 빈 세션 파일이 생성됨.
// 매 호출마다 berth가 발급한 고유 id(uuid)를 --session-id 로 넘기므로,
// ~/.claude/projects/*/<id>.jsonl 한 곳만 정확히 지울 수 있다 (유저 세션은 절대 건드리지 않음).
async function deleteTitleGenArtifact(id: string): Promise<void> {
  const base = join(homedir(), '.claude', 'projects');
  try {
    const dirs = await readdir(base);
    await Promise.all(
      dirs.map((d) => rm(join(base, d, `${id}.jsonl`), { force: true }).catch(() => {})),
    );
  } catch {
    // projects 디렉터리 없음 등 — 무시
  }
}

// 세션 메타데이터(이미 스캐너가 추출)만으로 한글 제목 생성. jsonl 재읽기 없음.
export function generateKoreanTitle(session: Session): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmpId = randomUUID();
    execFile(
      'claude',
      // --session-id <고유 임시 id> + --no-session-persistence:
      // 빈 세션 파일을 못 막는 환경 대비. 고유 id 덕에 호출 직후 그 파일만 정확히 삭제 →
      // 빈 세션 잔류·증식 0. (id별 파일 분리라 동시 실행 충돌도 없음.)
      ['-p', '--session-id', tmpId, '--no-session-persistence', '--model', MODEL, buildPrompt(session)],
      { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        // 프로세스 종료 시점 = 세션 파일 기록 완료 시점. 성공/실패 무관하게 정리.
        void deleteTitleGenArtifact(tmpId);
        if (err) return reject(err);
        const title = clean(stdout);
        if (!title) return reject(new Error('빈 제목 응답'));
        resolve(title);
      },
    );
  });
}
