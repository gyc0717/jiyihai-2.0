// 记忆星海 · 抽取管线
// 把散落的聊天记录抽成「星」：每条记忆一颗星，相近的连成星座。
// 无第三方依赖，只用 Node 内置模块。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();

// 数据放在用户目录，不放在程序目录 ——
// 这样重装/升级插件、甚至把工程目录整个删掉，星图都还在。
const DATA_DIR = process.env.STARSEA_DATA
  ? path.resolve(process.env.STARSEA_DATA)
  : path.join(HOME, '.dsh', 'memory-starsea');
const OUT_FILE = path.join(DATA_DIR, 'starsea.json');
const INBOX_DIR = path.join(DATA_DIR, 'inbox');

/** 老版本把数据放在工程里的 data/ 下，第一次跑时搬过来。 */
function migrateLegacyData() {
  try {
    const legacy = path.join(HERE, 'data');
    if (path.resolve(legacy) === path.resolve(DATA_DIR)) return;
    if (!fs.existsSync(legacy)) return;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const f of ['starsea.json', 'launch.log']) {
      const src = path.join(legacy, f);
      const dst = path.join(DATA_DIR, f);
      if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
    }
    const oldInbox = path.join(legacy, 'inbox');
    if (fs.existsSync(oldInbox)) {
      fs.cpSync(oldInbox, INBOX_DIR, { recursive: true, force: false, errorOnExist: false });
    }
  } catch { /* 搬不动就算了，不影响新建 */ }
}

migrateLegacyData();

const SOURCES = {
  dsh: { id: 'dsh', name: 'DSH 会话', color: [0.42, 0.78, 1.0], hint: '在这台电脑上和我聊过的每一次' },
  douyin: { id: 'douyin', name: '抖音私信', color: [1.0, 0.55, 0.82], hint: '抖音里的对话框' },
  qq: { id: 'qq', name: 'QQ', color: [1.0, 0.82, 0.4], hint: 'QQ 里的对话' },
  inbox: { id: 'inbox', name: '导入', color: [0.62, 1.0, 0.72], hint: '手动放进 data/inbox 的记录' },
};

// ---------------------------------------------------------------- zstd

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** DSH 的 session.v4.jsonl.zstd 是「一条记录一帧」的拼接，必须逐帧解。 */
function decodeZstdFrames(buf) {
  const starts = [];
  let at = buf.indexOf(ZSTD_MAGIC, 0);
  while (at !== -1) {
    starts.push(at);
    at = buf.indexOf(ZSTD_MAGIC, at + 4);
  }
  if (!starts.length) return buf.toString('utf8');
  const parts = [];
  for (let i = 0; i < starts.length; i++) {
    let end = i + 1 < starts.length ? starts[i + 1] : buf.length;
    for (let tries = 0; tries < 4; tries++) {
      try {
        parts.push(zlib.zstdDecompressSync(buf.subarray(starts[i], end)).toString('utf8'));
        break;
      } catch {
        const next = i + 2 + tries;
        end = next < starts.length ? starts[next] : buf.length;
      }
    }
  }
  return parts.join('');
}

function readJsonlOrZstd(file) {
  const buf = fs.readFileSync(file);
  const text = file.endsWith('.zstd') ? decodeZstdFrames(buf) : buf.toString('utf8');
  const out = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* 半行忽略 */ }
  }
  return out;
}

// ---------------------------------------------------------------- 分词

const STOP = new Set(`
我们 你们 他们 这个 那个 什么 怎么 可以 就是 不是 没有 一个 一下 这样 那样 因为 所以 但是 如果 已经 还是 觉得
自己 现在 时候 东西 事情 问题 需要 帮我 给我 你能 不能 好的 收到 谢谢 请问 然后 其实 真的 有点 一直 应该 知道
the and for you that with this have are was not but can will your from they what when all
reply let span maybe actually question search yes sure ok okay thanks hello just like make made
`.trim().split(/\s+/).filter(Boolean));

const CJK = /[\u4e00-\u9fff]/;
const PUNCT = /[\s，。！？、；：""''（）《》…·~～\-—+=【】\[\]{}<>\/\\|@#$%^&*_`'"!?.,:;()]/;

let SEGMENTER = null;
try { SEGMENTER = new Intl.Segmenter('zh', { granularity: 'word' }); } catch { SEGMENTER = null; }

/** 优先用 ICU 的中文分词（分出来是「运行」「检索」「文献」这样的真词）；
 *  没有 Segmenter 的老环境退回到 2-gram / 3-gram。 */
function tokenize(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out = [];

  if (SEGMENTER) {
    for (const part of SEGMENTER.segment(clean)) {
      if (!part.isWordLike) continue;
      const w = part.segment.toLowerCase();
      if (w.length < 2) continue;
      if (STOP.has(w) || PUNCT.test(w)) continue;
      if (!CJK.test(w) && w.length < 3) continue;
      out.push(w);
    }
    return out;
  }

  for (const run of clean.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= run.length; i++) {
        const g = run.slice(i, i + n);
        if (!STOP.has(g)) out.push(g);
      }
    }
  }
  for (const w of clean.toLowerCase().match(/[a-z][a-z0-9_+#.-]{2,}/g) || []) {
    if (!STOP.has(w)) out.push(w);
  }
  return out;
}

const EMO = /[哈嘿嘻笑哭泪爱想念念暖心疼累困睡抱喜欢怕孤单啊啊呜！？!?…～~]{1}/g;

function intensity(text) {
  const t = String(text || '');
  let s = Math.min(t.length / 220, 1) * 0.55;
  s += Math.min((t.match(EMO) || []).length / 12, 1) * 0.45;
  return Math.max(0.15, Math.min(1, s));
}

// ---------------------------------------------------------------- 源：DSH 会话

function textOf(rec) {
  const d = rec?.data;
  const blocks = d?.content || d?.message?.content || [];
  if (typeof blocks === 'string') return blocks;
  return blocks
    .filter((b) => b && (b.type === 'text' || typeof b.text === 'string'))
    .map((b) => b.text || '')
    .join('\n')
    .trim();
}

const NOISE = /^(Current runtime context|A skill is a reusable|The following skills|Time sampled|CURRENT_|DSH-CONTEXT|<)/i;
// 「自动转达」这类是转发通知，正文已经从抖音私信源单独进了星海，再收一遍就成了重影
const RELAY = /^【抖音私信·自动转达】/;

function isRealUserMessage(text, src) {
  if (!text || text.length < 4) return false;
  if (src && src.kind && src.kind !== 'user') return false;
  if (NOISE.test(text) || RELAY.test(text)) return false;
  if (/^[\s\W]*$/.test(text)) return false;
  return true;
}

function readDshSessions() {
  const root = path.join(HOME, '.dsh', 'sessions');
  if (!fs.existsSync(root)) return [];
  const units = [];
  const seenIds = new Set();

  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl.zstd') || e.name.endsWith('.jsonl')) files.push(p);
    }
  })(root);

  for (const file of files) {
    let recs;
    try { recs = readJsonlOrZstd(file); } catch { continue; }
    const sessionDir = path.basename(path.dirname(file));
    const groupName = path.basename(path.dirname(path.dirname(file)));

    let title = '';
    let createdAt = 0;
    let lastUser = null;
    let lastAssistant = '';
    const pending = [];

    for (const rec of recs) {
      if (rec.type === 'session') {
        createdAt = rec.createdAt || 0;
      } else if (rec.type === 'session/title') {
        const t = rec.data?.title || '';
        if (t && !title) title = t;
      } else if (rec.type === 'user/message') {
        const text = textOf(rec);
        if (isRealUserMessage(text, rec.data?.source)) {
          if (lastUser && lastUser.text === text) {
            lastAssistant = '';           // 同一句话连发两遍，只留一颗星
            continue;
          }
          if (lastUser && lastUser.text) pending.push({ ...lastUser, reply: lastAssistant });
          lastUser = { t: rec.time || createdAt, text, src: rec.data?.source };
          lastAssistant = '';
        }
      } else if (rec.type === 'assistant/message') {
        const text = textOf(rec);
        if (text) lastAssistant = lastAssistant ? lastAssistant + '\n' + text : text;
      }
    }
    if (lastUser && lastUser.text) pending.push({ ...lastUser, reply: lastAssistant });

    for (const u of pending) {
      const id = `dsh:${sessionDir}:${u.t}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      units.push({
        id,
        source: 'dsh',
        who: groupName.includes('douyin-duty') ? '抖音助手会话' : '这里',
        sessionId: sessionDir,
        sessionTitle: title || '未命名对话',
        t: u.t,
        text: u.text,
        reply: u.reply || '',
      });
    }
  }
  return units;
}

// ---------------------------------------------------------------- 源：抖音私信

function readDouyinMemory() {
  const dir = path.join(HOME, '.dsh', 'douyin-duty', 'memory');
  if (!fs.existsSync(dir)) return [];
  const units = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    const nick = doc.who?.nick || '抖音好友';
    const msgs = Array.isArray(doc.messages) ? doc.messages : [];
    // 把对话按时间压成「一来一回」：对方说了什么，我怎么接
    let lastThem = null;
    for (const m of msgs) {
      const t = Date.parse(m.at) || 0;
      const text = String(m.text || '').trim();
      if (!text) continue;
      if (m.from === 'them') {
        if (lastThem) units.push({ id: `douyin:${nick}:${lastThem.t}`, source: 'douyin', who: nick, t: lastThem.t, text: lastThem.text, reply: '', sessionTitle: nick });
        lastThem = { t, text };
      } else if (m.from === 'me' && lastThem) {
        units.push({ id: `douyin:${nick}:${lastThem.t}`, source: 'douyin', who: nick, t: lastThem.t, text: lastThem.text, reply: text, sessionTitle: nick });
        lastThem = null;
      }
    }
    if (lastThem) units.push({ id: `douyin:${nick}:${lastThem.t}`, source: 'douyin', who: nick, t: lastThem.t, text: lastThem.text, reply: '', sessionTitle: nick });
  }
  return units;
}

// ---------------------------------------------------------------- 源：导入（QQ / 任意导出）

/** 支持两种形状：{messages:[{t|time, from|role, text|content}]} 或 [{...}, ...] */
function readInbox() {
  if (!fs.existsSync(INBOX_DIR)) { fs.mkdirSync(INBOX_DIR, { recursive: true }); return []; }
  const units = [];
  for (const f of fs.readdirSync(INBOX_DIR)) {
    if (!/\.(json|jsonl)$/i.test(f)) continue;
    const full = path.join(INBOX_DIR, f);
    let msgs = [];
    try {
      if (f.endsWith('.jsonl')) msgs = readJsonlOrZstd(full);
      else {
        const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
        msgs = Array.isArray(doc) ? doc : doc.messages || [];
      }
    } catch { continue; }
    const isQq = /qq/i.test(f);
    const source = isQq ? 'qq' : 'inbox';
    const who = isQq ? 'QQ' : f.replace(/\.(json|jsonl)$/i, '');
    let lastThem = null;
    for (const m of msgs) {
      const t = Date.parse(m.t || m.time || m.at || m.timestamp || 0) || Number(m.t) || 0;
      const text = String(m.text || m.content || m.message || '').trim();
      if (!text) continue;
      const from = String(m.from || m.role || '').toLowerCase();
      const mine = /me|self|assistant|bot/.test(from);
      if (!mine) {
        if (lastThem) units.push({ id: `${source}:${f}:${lastThem.t}`, source, who, t: lastThem.t, text: lastThem.text, reply: '', sessionTitle: who });
        lastThem = { t, text };
      } else if (lastThem) {
        units.push({ id: `${source}:${f}:${lastThem.t}`, source, who, t: lastThem.t, text: lastThem.text, reply: text, sessionTitle: who });
        lastThem = null;
      }
    }
    if (lastThem) units.push({ id: `${source}:${f}:${lastThem.t}`, source, who, t: lastThem.t, text: lastThem.text, reply: '', sessionTitle: who });
  }
  return units;
}

// ---------------------------------------------------------------- 向量

function buildVectors(docs) {
  const tfs = docs.map((d) => {
    const m = new Map();
    for (const tk of tokenize(d)) m.set(tk, (m.get(tk) || 0) + 1);
    return m;
  });
  const df = new Map();
  for (const m of tfs) for (const k of m.keys()) df.set(k, (df.get(k) || 0) + 1);
  const N = docs.length || 1;
  return tfs.map((m) => {
    const v = new Map();
    let norm = 0;
    for (const [k, c] of m) {
      const w = (1 + Math.log(c)) * (Math.log((N + 1) / ((df.get(k) || 1) + 0.5)) + 1);
      v.set(k, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [k, w] of v) v.set(k, w / norm);
    return v;
  });
}

function cosine(a, b) {
  let s = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const [k, w] of small) { const x = big.get(k); if (x) s += w * x; }
  return s;
}

/** 稳定的字符串哈希（FNV-1a），保证每次跑出来的星图不变形。 */
function hash32(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 哈希随机投影：把稀疏 TF-IDF 投到平面，语义近的自然靠近。 */
function project2d(vec) {
  let x = 0, z = 0;
  for (const [k, w] of vec) {
    const h1 = hash32(k, 0x9e3779b1);
    const h2 = hash32(k, 0x85ebca6b);
    x += w * (((h1 & 0xffff) / 0xffff) * 2 - 1);
    z += w * (((h2 & 0xffff) / 0xffff) * 2 - 1);
  }
  return [x, z];
}

// ---------------------------------------------------------------- 组星图

function quantile(arr, q) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))));
  return a[i];
}

function topTags(vec, n = 4) {
  const cand = [...vec.entries()]
    .filter(([k]) => k.length >= 2 && !PUNCT.test(k) && !/^\d+$/.test(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24);
  // 「检索」和「检索词」这种只留一个
  const kept = [];
  for (const [k] of cand) {
    if (kept.length >= n) break;
    if (kept.some((j) => j.includes(k) || k.includes(j))) continue;
    kept.push(k);
  }
  return kept;
}

/** 固定种子的随机数：同一天重抽，星图不会跳来跳去。 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kmeans(vecs, k, iters = 24) {
  const n = vecs.length;
  if (!n) return { centers: [], assign: [] };
  const rnd = mulberry32(0x5eed1e);
  k = Math.max(1, Math.min(k, n));
  // k-means++ 初始化
  const centers = [vecs[0]];
  const dist = new Array(n).fill(1);
  while (centers.length < k) {
    let sum = 0;
    for (let i = 0; i < n; i++) { dist[i] = 1 - Math.max(...centers.map((c) => cosine(vecs[i], c))); sum += dist[i]; }
    let r = rnd() * sum, pick = 0;
    for (let i = 0; i < n; i++) { r -= dist[i]; if (r <= 0) { pick = i; break; } }
    centers.push(vecs[pick]);
  }
  let assign = new Array(n).fill(0);
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let best = 0, bv = -1;
      for (let c = 0; c < centers.length; c++) {
        const v = cosine(vecs[i], centers[c]);
        if (v > bv) { bv = v; best = c; }
      }
      if (assign[i] !== best) moved++;
      assign[i] = best;
    }
    // 重算中心
    for (let c = 0; c < centers.length; c++) {
      const acc = new Map();
      let cnt = 0;
      for (let i = 0; i < n; i++) if (assign[i] === c) {
        cnt++;
        for (const [kk, w] of vecs[i]) acc.set(kk, (acc.get(kk) || 0) + w);
      }
      if (!cnt) continue;
      let norm = 0;
      for (const [kk, w] of acc) { const v = w / cnt; acc.set(kk, v); norm += v * v; }
      norm = Math.sqrt(norm) || 1;
      for (const [kk, w] of acc) acc.set(kk, w / norm);
      centers[c] = acc;
    }
    if (!moved) break;
  }
  return { centers, assign };
}

/** 读上一次的坐标系锚点。有了它，新星只会往外长，旧星不会挪窝。 */
function readPrevLayout() {
  try {
    const doc = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    const l = doc && doc.layout;
    if (l && l.v === 2 && Number.isFinite(l.t0) && Number.isFinite(l.sx) && Number.isFinite(l.sz)) {
      return { v: 2, t0: l.t0, sx: l.sx, sz: l.sz };
    }
  } catch { /* 第一次跑，没有旧文件 */ }
  return null;
}

function build() {
  const started = Date.now();
  const units = [...readDshSessions(), ...readDouyinMemory(), ...readInbox()]
    .filter((u) => u.text && u.text.trim().length >= 4 && u.t > 0)
    .sort((a, b) => a.t - b.t);

  if (!units.length) {
    const empty = { generatedAt: new Date().toISOString(), stats: { stars: 0, sources: {}, sessions: 0 }, sources: [], stars: [], links: [], clusters: [] };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(empty, null, 1));
    return empty;
  }

  const vecs = buildVectors(units.map((u) => `${u.text} ${u.reply || ''}`));
  const K = Math.max(2, Math.min(9, Math.round(units.length / 22)));
  const { centers, assign } = kmeans(vecs, K);

  const tMin = units[0].t;
  const tMax = units[units.length - 1].t;

  const projected = vecs.map(project2d);

  // ---- 位置：用一套「不随数据漂移」的坐标系
  // 每次重建都重新归一化的话，新来一颗星就会让整片星海挪一次。
  // 所以把锚点（t0 / 语义缩放）存进 starsea.json，之后一直沿用：
  // 新星只会在外圈长出来，旧星原地不动。
  let layout = readPrevLayout();
  if (!layout) {
    layout = {
      v: 2,
      t0: tMin,
      sx: quantile(projected.map((p) => Math.abs(p[0])), 0.92) || 1,
      sz: quantile(projected.map((p) => Math.abs(p[1])), 0.92) || 1,
    };
  }

  const DAY = 86400000;
  const stars = units.map((u, i) => {
    const [x0, z0] = projected[i];
    const days = Math.max(0, (u.t - layout.t0) / DAY);
    const grow = 1 - Math.exp(-days / 18);              // 越久远越靠外，最后趋于稳定
    const theta = (x0 / layout.sx) * 1.5 + days * 0.06; // 语义定方向，时间把旋臂慢慢拧过来
    const radius = 8 + grow * 34 + (z0 / layout.sz) * 3.2;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    const y = (z0 / layout.sz) * 6.5 + Math.sin(days / 9) * 2.4 + grow * 2.5;
    const w = intensity(u.text);
    return {
      id: u.id,
      src: u.source,
      t: u.t,
      title: (u.sessionTitle || u.who || '').slice(0, 40),
      who: u.who || '',
      text: u.text.slice(0, 900),
      reply: (u.reply || '').slice(0, 700),
      tags: topTags(vecs[i], 4),
      cluster: assign[i],
      weight: Number(w.toFixed(3)),
      pos: [Number(x.toFixed(2)), Number(y.toFixed(2)), Number(z.toFixed(2))],
      session: u.sessionId || u.who || '',
    };
  });

  // ---- 连线：同一场对话的相邻星 + 语义相近的星
  const links = [];
  const degree = new Map();
  const push = (a, b, s, kind) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (degree.has(key)) return;
    degree.set(key, true);
    links.push([Math.min(a, b), Math.max(a, b), Number(s.toFixed(3)), kind]);
  };

  const bySession = new Map();
  stars.forEach((s, i) => {
    if (!s.session) return;
    if (!bySession.has(s.session)) bySession.set(s.session, []);
    bySession.get(s.session).push(i);
  });
  for (const idxs of bySession.values()) {
    for (let i = 1; i < idxs.length; i++) push(idxs[i - 1], idxs[i], 0.32, 'session');
  }

  const near = [];
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const c = cosine(vecs[i], vecs[j]);
      if (c > 0.3) near.push([i, j, c]);
    }
  }
  near.sort((a, b) => b[2] - a[2]);
  const semDeg = new Map();
  for (const [i, j, c] of near) {
    if (links.length > stars.length * 2.2) break;
    const di = semDeg.get(i) || 0, dj = semDeg.get(j) || 0;
    if (di >= 3 || dj >= 3) continue;
    semDeg.set(i, di + 1);
    semDeg.set(j, dj + 1);
    push(i, j, c, 'semantic');
  }

  // ---- 星座：给每个聚类起个名字（取最能代表它的词）
  const isCjk = (t) => /^[\u4e00-\u9fff]{2,}$/.test(t);
  const usedLead = new Set();
  const clusters = centers.map((center, ci) => {
    const members = assign.map((a, i) => (a === ci ? i : -1)).filter((i) => i >= 0);
    const tags = topTags(center, 6);
    // 名字优先用中文：中心词全是英文标识符时，退回去数成员身上最常出现的中文词
    let label = tags.filter(isCjk);
    if (!label.length) {
      const tally = new Map();
      for (const i of members) for (const t of stars[i].tags) if (isCjk(t)) tally.set(t, (tally.get(t) || 0) + 1);
      label = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    }
    // 几个星座都叫「检索·…」就分不清了，换个没被用过的当开头
    const lead = label.find((t) => !usedLead.has(t)) || label[0];
    if (lead) usedLead.add(lead);
    const rest = label.filter((t) => t !== lead).slice(0, 1);
    return {
      id: ci,
      name: [lead, ...rest].filter(Boolean).join('·') || `星团 ${ci + 1}`,
      tags,
      count: members.length,
    };
  }).filter((c) => c.count >= 3);

  const counts = {};
  for (const s of stars) counts[s.src] = (counts[s.src] || 0) + 1;
  const sessions = new Set(stars.map((s) => s.session)).size;

  const doc = {
    generatedAt: new Date().toISOString(),
    tookMs: Date.now() - started,
    layout,
    stats: {
      stars: stars.length,
      links: links.length,
      sessions,
      sources: counts,
      from: tMin,
      to: tMax,
    },
    sources: Object.values(SOURCES).filter((s) => counts[s.id]).map((s) => ({ ...s, count: counts[s.id] })),
    clusters,
    stars,
    links,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(doc));
  return doc;
}

export { build, OUT_FILE, DATA_DIR };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const doc = build();
  console.log(`[记忆星海] ${doc.stats.stars} 颗星 / ${doc.stats.links} 条连线 / ${doc.stats.sessions} 场对话 → ${OUT_FILE}`);
  console.log('[记忆星海] 来源:', JSON.stringify(doc.stats.sources));
}
