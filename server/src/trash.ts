import fs from 'node:fs';
import path from 'node:path';
import trash from 'trash';
import { PROJECTS_DIR, isValidSessionId } from './scanner';

// 소프트 삭제: 세션 jsonl을 OS 휴지통으로 이동.
// 사용자는 Finder 휴지통에서 '제자리로 되돌리기'(복원)·'휴지통 비우기'(영구 삭제)를 평소처럼 할 수 있다.
// (trash 패키지는 NSFileManager.trashItem 을 호출 → 별도 자동화 권한 없이 원위치 복원까지 지원)
//
// 같은 세션 UUID가 여러 프로젝트 디렉터리에 존재할 수 있으므로(다른 cwd resume, 머신 간 복사 등)
// 전부 휴지통으로 보낸다. 이동한 파일 수를 반환 (0이면 해당 세션 파일이 없었음).
export async function trashSession(sessionId: string): Promise<number> {
  if (!isValidSessionId(sessionId)) throw new Error('잘못된 세션 id');
  if (!fs.existsSync(PROJECTS_DIR)) return 0;
  const files: string[] = [];
  for (const dirent of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const src = path.join(PROJECTS_DIR, dirent.name, `${sessionId}.jsonl`);
    if (fs.existsSync(src)) files.push(src);
  }
  if (files.length === 0) return 0;
  await trash(files);
  return files.length;
}
