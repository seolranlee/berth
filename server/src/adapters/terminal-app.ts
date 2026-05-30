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
  // do script (대상 미지정) = 새 창에서 실행. activate가 콜드스타트 커버.
  return [
    'tell application "Terminal"',
    '  activate',
    `  do script "${asEscape(shellCmd)}"`,
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
