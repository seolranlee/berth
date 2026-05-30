import fs from 'node:fs';
import { execFile } from 'node:child_process';
import type { LaunchArgs, TerminalAdapter } from './types';

const shellQuote = (s: string) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const asEscape = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function buildItermScript({
  cwd,
  command,
  mode = 'window',
}: {
  cwd: string;
  command: string;
  mode?: 'window' | 'tab';
}): string {
  const cmd = asEscape(`cd ${shellQuote(cwd)} && ${command}`);

  if (mode === 'tab') {
    // 실행 중인 창에 새 탭. 미실행/창 없음이면 새 창(콜드 시작창 재사용)으로 폴백.
    return [
      'tell application "iTerm"',
      '  set wasRunning to running',
      '  activate',
      '  if wasRunning and (count of windows) > 0 then',
      '    tell current window to create tab with default profile',
      '    tell current session of current window',
      `      write text "${cmd}"`,
      '    end tell',
      '  else',
      '    delay 0.3',
      '    try',
      '      set targetWindow to current window',
      '    on error',
      '      set targetWindow to (create window with default profile)',
      '    end try',
      '    tell current session of targetWindow',
      `      write text "${cmd}"`,
      '    end tell',
      '  end if',
      'end tell',
    ].join('\n');
  }

  // mode === 'window': 콜드스타트 시 시작창 재사용, 실행 중이면 새 창
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

// iTerm2 어댑터: AppleScript로 새 창 또는 새 탭에 cwd 이동 후 명령 실행.
export const itermAdapter: TerminalAdapter = {
  id: 'iterm',
  name: 'iTerm2',
  supportsTab: true, // iTerm은 AppleScript로 탭 생성 가능

  async isAvailable() {
    return fs.existsSync('/Applications/iTerm.app');
  },

  async launch({ cwd, command, mode }: LaunchArgs) {
    await runAppleScript(buildItermScript({ cwd, command, mode }));
    return {
      ok: true,
      terminal: 'iterm',
      via: mode === 'tab' ? 'applescript-tab' : 'applescript',
      cwd,
      command,
    };
  },
};
