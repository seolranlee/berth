import fs from 'node:fs';
import { execFile } from 'node:child_process';

// 셸 인용: 작은따옴표로 감싸고 내부 작은따옴표만 이스케이프
const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
// AppleScript 더블쿼트 문자열 이스케이프: 백슬래시·큰따옴표
const asEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// macOS 버전별 Terminal.app 경로 (기본은 시스템 앱)
const TERMINAL_APP_PATHS = [
  '/System/Applications/Utilities/Terminal.app',
  '/Applications/Utilities/Terminal.app',
];

// 테스트 가능하도록 스크립트 생성 분리
export function buildTerminalAppScript({ cwd, command }) {
  const shellCmd = `cd ${shellQuote(cwd)} && ${command}`;
  // do script (대상 미지정) = 새 창에서 실행. activate가 콜드스타트 커버.
  return [
    'tell application "Terminal"',
    '  activate',
    `  do script "${asEscape(shellCmd)}"`,
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

// macOS 기본 Terminal.app 어댑터.
export const terminalAppAdapter = {
  id: 'terminal',
  name: 'Terminal.app',

  async isAvailable() {
    return TERMINAL_APP_PATHS.some((p) => fs.existsSync(p));
  },

  async launch({ cwd, command }) {
    await runAppleScript(buildTerminalAppScript({ cwd, command }));
    return { ok: true, terminal: 'terminal', via: 'applescript', cwd, command };
  },
};
