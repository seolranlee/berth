import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const LAUNCH_DIR = path.join(os.homedir(), '.warp', 'launch_configurations');

// YAML 스칼라 안전 인용: JSON 문자열은 유효한 YAML 더블쿼트 문자열
const y = (s) => JSON.stringify(String(s));

function buildLaunchConfig({ name, cwd, command, title }) {
  return [
    '---',
    `name: ${name}`,
    'windows:',
    '  - tabs:',
    `      - title: ${y(title)}`,
    '        layout:',
    `          cwd: ${y(cwd)}`,
    '          commands:',
    `            - exec: ${y(command)}`,
    '    active_tab_index: 0',
    'active_window_index: 0',
    '',
  ].join('\n');
}

function openUri(uri) {
  return new Promise((resolve, reject) => {
    execFile('open', [uri], (err) => (err ? reject(err) : resolve()));
  });
}

// Warp 어댑터: launch configuration을 생성하고 warp:// URI로 구동.
// `open`은 Warp가 꺼져 있어도 실행시키므로 콜드스타트(a-2)도 커버.
export const warpAdapter = {
  id: 'warp',
  name: 'Warp',

  async isAvailable() {
    return fs.existsSync('/Applications/Warp.app');
  },

  async launch({ sessionId, cwd, command, title = 'berth' }) {
    fs.mkdirSync(LAUNCH_DIR, { recursive: true });
    // 세션별 결정적 이름 → 재실행 시 동일 파일 갱신(무한 누적 방지)
    const configName = `berth-${sessionId}`;
    const yaml = buildLaunchConfig({ name: configName, cwd, command, title });
    fs.writeFileSync(path.join(LAUNCH_DIR, `${configName}.yaml`), yaml, 'utf8');
    await openUri(`warp://launch/${configName}`);
    return { ok: true, terminal: 'warp', via: 'launch_configuration', cwd, command };
  },
};
