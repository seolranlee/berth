import fs from 'node:fs';
import { execFile } from 'node:child_process';
import type { LaunchArgs, TerminalAdapter } from './types';

const shellQuote = (s: string) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const asEscape = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function buildItermScript({ cwd, command }: { cwd: string; command: string }): string {
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

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()));
      else resolve(stdout);
    });
  });
}

// iTerm2 어댑터: AppleScript로 새 창 생성 + cwd 이동 후 명령 실행.
export const itermAdapter: TerminalAdapter = {
  id: 'iterm',
  name: 'iTerm2',

  async isAvailable() {
    return fs.existsSync('/Applications/iTerm.app');
  },

  async launch({ cwd, command }: LaunchArgs) {
    await runAppleScript(buildItermScript({ cwd, command }));
    return { ok: true, terminal: 'iterm', via: 'applescript', cwd, command };
  },
};
