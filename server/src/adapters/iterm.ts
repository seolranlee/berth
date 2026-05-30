import fs from 'node:fs';
import { execFile } from 'node:child_process';
import type { LaunchArgs, TerminalAdapter } from './types';

const shellQuote = (s: string) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const asEscape = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function buildItermScript({ cwd, command }: { cwd: string; command: string }): string {
  const shellCmd = `cd ${shellQuote(cwd)} && ${command}`;
  const cmd = asEscape(shellCmd);
  // 콜드스타트 시 iTerm이 띄운 기본 창 재사용(빈 창 중복 방지, 없으면 생성),
  // 이미 실행 중이면 새 창. running은 앱을 안 켜는 조회.
  return [
    'tell application "iTerm"',
    '  set wasRunning to running',
    '  activate',
    '  if wasRunning then',
    '    set targetWindow to (create window with default profile)',
    '  else',
    '    delay 0.3',
    '    try',
    '      set targetWindow to current window',
    '    on error',
    '      set targetWindow to (create window with default profile)',
    '    end try',
    '  end if',
    '  tell current session of targetWindow',
    `    write text "${cmd}"`,
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
