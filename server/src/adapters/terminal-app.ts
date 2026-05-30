import fs from 'node:fs';
import { execFile } from 'node:child_process';
import type { LaunchArgs, TerminalAdapter } from './types';

const shellQuote = (s: string) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const asEscape = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// macOS 버전별 Terminal.app 경로 (기본은 시스템 앱)
const TERMINAL_APP_PATHS = [
  '/System/Applications/Utilities/Terminal.app',
  '/Applications/Utilities/Terminal.app',
];

export function buildTerminalAppScript({ cwd, command }: { cwd: string; command: string }): string {
  const shellCmd = `cd ${shellQuote(cwd)} && ${command}`;
  const cmd = asEscape(shellCmd);
  // 콜드스타트 시 앱이 자동으로 여는 기본 창을 재사용(빈 창 중복 방지),
  // 이미 실행 중이면 새 창(사용자 기존 창 보존). running은 앱을 안 켜는 조회.
  return [
    'tell application "Terminal"',
    '  set wasRunning to running',
    '  activate',
    '  if wasRunning then',
    `    do script "${cmd}"`,
    '  else',
    '    delay 0.3',
    `    do script "${cmd}" in window 1`,
    '  end if',
    'end tell',
  ].join('\n');
}

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()));
      else resolve(stdout);
    });
  });
}

// macOS 기본 Terminal.app 어댑터.
export const terminalAppAdapter: TerminalAdapter = {
  id: 'terminal',
  name: 'Terminal.app',

  async isAvailable() {
    return TERMINAL_APP_PATHS.some((p) => fs.existsSync(p));
  },

  async launch({ cwd, command }: LaunchArgs) {
    await runAppleScript(buildTerminalAppScript({ cwd, command }));
    return { ok: true, terminal: 'terminal', via: 'applescript', cwd, command };
  },
};
