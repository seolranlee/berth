import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { LaunchArgs, TerminalAdapter } from './types';

const LAUNCH_DIR = path.join(os.homedir(), '.warp', 'launch_configurations');

// YAML 스칼라 안전 인용: JSON 문자열은 유효한 YAML 더블쿼트 문자열
const y = (s: string) => JSON.stringify(String(s));

function buildLaunchConfig(opts: {
  name: string;
  cwd: string;
  command: string;
  title: string;
}): string {
  return [
    '---',
    `name: ${opts.name}`,
    'windows:',
    '  - tabs:',
    `      - title: ${y(opts.title)}`,
    '        layout:',
    `          cwd: ${y(opts.cwd)}`,
    '          commands:',
    `            - exec: ${y(opts.command)}`,
    '    active_tab_index: 0',
    'active_window_index: 0',
    '',
  ].join('\n');
}

function openUri(uri: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('open', [uri], (err) => (err ? reject(err) : resolve()));
  });
}

// Warp 어댑터: launch configuration 생성 후 warp:// URI로 구동.
// open이 Warp 미실행 시에도 실행시키므로 콜드스타트(a-2) 커버.
export const warpAdapter: TerminalAdapter = {
  id: 'warp',
  name: 'Warp',

  async isAvailable() {
    return fs.existsSync('/Applications/Warp.app');
  },

  async launch({ sessionId, cwd, command, title = 'berth' }: LaunchArgs) {
    fs.mkdirSync(LAUNCH_DIR, { recursive: true });
    const configName = `berth-${sessionId}`; // 세션별 결정적 이름 → 무한 누적 방지
    const yaml = buildLaunchConfig({ name: configName, cwd, command, title });
    fs.writeFileSync(path.join(LAUNCH_DIR, `${configName}.yaml`), yaml, 'utf8');
    await openUri(`warp://launch/${configName}`);
    return { ok: true, terminal: 'warp', via: 'launch_configuration', cwd, command };
  },
};
