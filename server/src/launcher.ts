import type { LaunchResult } from '@shared';
import { getSessionById } from './scanner';
import { getAdapter } from './adapters/index';

// 세션을 지정 터미널에서 resume.
// cwd는 클라이언트 입력을 믿지 않고 서버가 세션 파일에서 직접 확보한다.
export async function launchSession(
  sessionId: string,
  terminal = 'warp',
): Promise<LaunchResult> {
  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error(`세션을 찾을 수 없거나 잘못된 id: ${sessionId}`);
  }
  if (!session.cwd) {
    throw new Error('세션에 cwd 정보가 없어 실행 위치를 정할 수 없음');
  }

  const adapter = getAdapter(terminal);
  if (!adapter) {
    throw new Error(`지원하지 않는 터미널: ${terminal}`);
  }
  if (adapter.isAvailable && !(await adapter.isAvailable())) {
    throw new Error(`${adapter.name}가 설치되어 있지 않음`);
  }

  // sessionId는 getSessionById에서 UUID 검증 통과 → 명령에 안전하게 사용
  const command = `claude --resume ${sessionId}`;
  return adapter.launch({
    sessionId,
    cwd: session.cwd,
    command,
    title: session.title,
  });
}
