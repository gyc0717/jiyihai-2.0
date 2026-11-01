// 记忆星海 · 本地服务
// 只做三件事：发静态文件、给前端数据、按需重新抽取。
// 跑在 127.0.0.1 上，不外网。

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, OUT_FILE, DATA_DIR } from './ingest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, 'web');
const START_PORT = Number(process.env.PORT || 7788);
const PID_FILE = path.join(DATA_DIR, 'server.pid');
const LOG_FILE = path.join(DATA_DIR, 'launch.log');

const HOME = os.homedir();
const WATCH_DIRS = [
  path.join(HOME, '.dsh', 'sessions'),
  path.join(HOME, '.dsh', 'douyin-duty', 'memory'),
  path.join(DATA_DIR, 'inbox'),
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

let building = null;

// ---------------- 实时：看一眼有没有新的对话，有就重抽并推给页面 ----------------

const SSE_CLIENTS = new Set();

function broadcast(payload) {
  const chunk = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of SSE_CLIENTS) {
    try { res.write(chunk); } catch { SSE_CLIENTS.delete(res); }
  }
}

let rebuildTimer = null;
let lastRebuildAt = 0;

/** 文件一变就排一次重抽；几秒内的连续变动合并成一次，
 *  并且两次重抽之间至少隔 6 秒——长回复时日志一直在写，不能把 CPU 吃满。 */
function scheduleRebuild(why) {
  clearTimeout(rebuildTimer);
  const gap = Math.max(2500, 6000 - (Date.now() - lastRebuildAt));
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    try {
      const t0 = Date.now();
      const doc = build();
      lastRebuildAt = Date.now();
      note(`自动重抽（${why}）→ ${doc.stats.stars} 颗星，${Date.now() - t0}ms`);
      broadcast({ type: 'update', stars: doc.stats.stars, to: doc.stats.to, took: doc.tookMs, at: Date.now() });
    } catch (e) {
      note('自动重抽失败：' + (e && e.message));
    }
  }, gap);
  if (rebuildTimer.unref) rebuildTimer.unref();
}

function watchSources() {
  for (const dir of WATCH_DIRS) {
    try {
      if (!fs.existsSync(dir)) continue;
      fs.watch(dir, { recursive: true }, () => scheduleRebuild(path.basename(dir)));
    } catch (e) {
      note('监听失败（' + dir + '）：' + (e && e.message));
    }
  }
}

function ensureData() {
  if (fs.existsSync(OUT_FILE)) return;
  build();
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(WEB, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(WEB)) return send(res, 403, '{"error":"forbidden"}');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, '{"error":"not found"}');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;

  try {
    if (p === '/api/starsea') {
      ensureData();
      const buf = fs.readFileSync(OUT_FILE);
      return send(res, 200, buf);
    }

    if (p === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      res.write(`data: ${JSON.stringify({ type: 'hello', at: Date.now() })}\n\n`);
      SSE_CLIENTS.add(res);
      const ping = setInterval(() => {
        try { res.write(': ping\n\n'); } catch { /* 断开了 */ }
      }, 25000);
      if (ping.unref) ping.unref();
      req.on('close', () => {
        clearInterval(ping);
        SSE_CLIENTS.delete(res);
      });
      return;
    }

    if (p === '/api/rebuild' && req.method === 'POST') {
      // 同时点两次也只跑一次
      if (!building) {
        building = Promise.resolve().then(() => build()).finally(() => { building = null; });
      }
      const doc = await building;
      broadcast({ type: 'update', stars: doc.stats.stars, to: doc.stats.to, took: doc.tookMs, at: Date.now() });
      return send(res, 200, JSON.stringify(doc));
    }

    if (p === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, data: fs.existsSync(OUT_FILE) }));
    }

    return serveStatic(req, res, p);
  } catch (err) {
    console.error('[记忆星海]', err);
    return send(res, 500, JSON.stringify({ error: String(err && err.message ? err.message : err) }));
  }
});

function note(msg) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* 日志写不进去不影响使用 */ }
}

function tryOpen(cmd, args) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    try {
      const p = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
      p.once('error', (e) => { note(`打开浏览器失败(${path.basename(cmd)}): ${e.message}`); done(false); });
      p.once('spawn', () => { try { p.unref(); } catch { /* 忽略 */ } done(true); });
      setTimeout(() => done(true), 1500);
    } catch (e) {
      note(`打开浏览器抛错(${path.basename(cmd)}): ${e.message}`);
      done(false);
    }
  });
}

/** 打开默认浏览器。
 *  不能用 exec('start ...')：那是个异步 shell，父进程一退出就被带走了。
 *  rundll32 的 FileProtocolHandler 最稳，失败再退回 cmd /c start。 */
async function openBrowser(url) {
  if (process.env.NO_OPEN === '1') return;
  const sys = process.env.SystemRoot || 'C:\\Windows';
  const rundll = path.join(sys, 'System32', 'rundll32.exe');
  if (await tryOpen(rundll, ['url.dll,FileProtocolHandler', url])) {
    note(`已打开浏览器: ${url}`);
    return;
  }
  const comspec = process.env.ComSpec || path.join(sys, 'System32', 'cmd.exe');
  if (await tryOpen(comspec, ['/c', 'start', '', url])) {
    note(`已用 cmd start 打开: ${url}`);
    return;
  }
  note(`所有打开方式都失败了: ${url}`);
}

/** 已经在跑就直接开页面，别再起一个占 7789。 */
function alreadyRunning(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 700 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function listen(port, tries = 12) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries > 0) {
      listen(port + 1, tries - 1);
    } else {
      console.error('[记忆星海] 起不来：', err.message);
      note(`启动失败: ${err.message}`);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', async () => {
    const url = `http://127.0.0.1:${port}`;
    try {
      fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
      fs.writeFileSync(PID_FILE, String(process.pid));
    } catch { /* pid 写不进去不影响使用 */ }
    console.log('');
    console.log('  记忆星海  ↗  ' + url);
    console.log('  关掉这个窗口就停了。');
    console.log('');
    note(`服务已启动 pid=${process.pid} ${url}`);
    // STARSEA_NOWATCH=1：拍截图 / 看演示数据时用，不跟着真实聊天记录重抽
    if (process.env.STARSEA_NOWATCH !== '1') watchSources();
    await openBrowser(url);
  });
}

process.on('exit', () => {
  try {
    if (fs.existsSync(PID_FILE) && fs.readFileSync(PID_FILE, 'utf8').trim() === String(process.pid)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch { /* 忽略 */ }
});

// 已经开着的话，只把页面推到前面
if (await alreadyRunning(START_PORT)) {
  const url = `http://127.0.0.1:${START_PORT}`;
  console.log('记忆星海已经在跑了：' + url);
  note(`已在运行，只打开页面: ${url}`);
  await openBrowser(url);
  process.exit(0);
}

listen(START_PORT);
