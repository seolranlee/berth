import { execFile } from 'node:child_process';
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

// 세션 메타데이터(이미 스캐너가 추출)만으로 한글 제목 생성. jsonl 재읽기 없음.
export function generateKoreanTitle(session: Session): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'claude',
      // --no-session-persistence: 제목 생성 호출이 새 세션 파일을 만들지 않도록 (오염/피드백 루프 방지)
      ['-p', '--no-session-persistence', '--model', MODEL, buildPrompt(session)],
      { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        const title = clean(stdout);
        if (!title) return reject(new Error('빈 제목 응답'));
        resolve(title);
      },
    );
  });
}
