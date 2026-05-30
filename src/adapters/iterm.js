import fs from 'node:fs';
import { execFile } from 'node:child_process';

// 셸 인용: 작은따옴표로 감싸고 내부 작은따옴표만 이스케이프
const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
// AppleScript 더블쿼트 문자열 이스케이프: 백슬래시·큰따옴표
const asEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// 테스트 가능하도록 스크립트 생성을 분리
export function buildItermScript({ cwd, command }) {
  const shellCmd = `cd ${shellQuote(cwd)} && ${command}`;
  return [
    'tell application "iTerm"',
    '  activate', // 꺼져 있으면 여기서 실행됨 (콜드스타트 커버)
    '  set newWindow to (create window with default profile)',
    '  tell current session of newWindow',
    `    write text "${asEscape(shellCmd)}"`,
    '  end tell',
    'end tell',
  ].join('\n');
}

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()));
      else resolve(stdout);
    });
  });
}

// iTerm2 어댑터: AppleScript로 새 창을 만들고 cwd 이동 후 명령 실행.
export const itermAdapter = {
  id: 'iterm',
  name: 'iTerm2',

  async isAvailable() {
    return fs.existsSync('/Applications/iTerm.app');
  },

  async launch({ cwd, command }) {
    await runAppleScript(buildItermScript({ cwd, command }));
    return { ok: true, terminal: 'iterm', via: 'applescript', cwd, command };
  },
};
