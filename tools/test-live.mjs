// 实时链路自测：连上 SSE，碰一下会话文件，看服务会不会自己重抽并推过来。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.join(os.homedir(), '.dsh', 'sessions');

function firstFile(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const r = firstFile(p);
      if (r) return r;
    } else if (e.name.endsWith('.zstd')) {
      return p;
    }
  }
  return null;
}

const file = firstFile(ROOT);
if (!file) {
  console.log('✗ 找不到会话文件');
  process.exit(1);
}

let done = false;
const req = http.get('http://127.0.0.1:7788/api/events', (res) => {
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    const line = chunk.trim();
    if (line) console.log('  ← ' + line.slice(0, 140));
    if (chunk.includes('"update"')) {
      done = true;
      console.log('✓ 文件一变，服务就重抽并推给页面了');
      req.destroy();
      process.exit(0);
    }
  });
});

req.on('error', (e) => {
  console.log('✗ 连不上 SSE：' + e.message);
  process.exit(1);
});

setTimeout(() => {
  const now = new Date();
  fs.utimesSync(file, now, now);
  console.log('  · 碰了一下 ' + path.basename(path.dirname(file)));
}, 700);

setTimeout(() => {
  if (!done) {
    console.log('✗ 12 秒内没收到更新');
    process.exit(1);
  }
}, 12000);
