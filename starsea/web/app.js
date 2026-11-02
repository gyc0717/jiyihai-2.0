// 记忆星海 · 前端
// 原生 WebGL2 画星海，没有框架、没有依赖——打开就能看。

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 星流：整片星海绕中心转的角速度（弧度/秒）。转一圈约 8.7 分钟。
const SPIN = 0.012;

// ------------------------------------------------------------ 4x4 矩阵

const M4 = {
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  },
  lookAt(eye, center, up) {
    let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
    let len = Math.hypot(z0, z1, z2) || 1;
    z0 /= len; z1 /= len; z2 /= len;
    let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
    len = Math.hypot(x0, x1, x2) || 1;
    x0 /= len; x1 /= len; x2 /= len;
    const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    return new Float32Array([
      x0, y0, z0, 0,
      x1, y1, z1, 0,
      x2, y2, z2, 0,
      -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
      -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
      -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
      1,
    ]);
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] =
          a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  },
};

// ------------------------------------------------------------ 着色器

const VS_POINTS = `#version 300 es
in vec3 aPos;
in vec4 aColor;
in float aSize;
in float aSeed;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uRot;
uniform float uScale;
uniform float uTime;
uniform float uDrift;
out vec4 vColor;
out float vSeed;
void main() {
  float c = cos(uRot), s = sin(uRot);
  vec3 p = vec3(aPos.x * c - aPos.z * s, aPos.y, aPos.x * s + aPos.z * c);

  // 星海在流：每颗星按自己的相位轻轻漂，像被同一股洋流推着走
  float ph = uTime * 0.42 + aSeed * 6.2831;
  p.x += sin(ph) * 0.75 * uDrift;
  p.y += cos(ph * 0.83) * 0.55 * uDrift;
  p.z += sin(ph * 1.27 + 1.7) * 0.75 * uDrift;

  vec4 mv = uView * vec4(p, 1.0);
  gl_Position = uProj * mv;
  float depth = max(0.6, -mv.z);
  gl_PointSize = aSize * uScale * (240.0 / depth);
  vColor = aColor;
  vSeed = aSeed;
}`;

const FS_POINTS = `#version 300 es
precision highp float;
in vec4 vColor;
in float vSeed;
uniform float uAlpha;
uniform float uTime;
uniform float uTwinkle;
out vec4 o;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  // 硬核心 + 柔光晕。之前只有一团高斯，远看就糊成一片
  float core = 1.0 - smoothstep(0.0, 0.30, r);
  float halo = pow(max(0.0, 1.0 - r), 3.0);
  float a = core * 1.3 + halo * 0.40;

  // 每颗星自己的呼吸
  float tw = 0.72 + 0.28 * sin(uTime * 2.1 + vSeed * 37.0);
  a *= mix(1.0, tw, uTwinkle);

  o = vec4(vColor.rgb * (0.78 + a * 1.05), vColor.a * a * uAlpha);
}`;

const VS_LINES = `#version 300 es
in vec3 aPos;
in vec4 aColor;
uniform mat4 uView;
uniform mat4 uProj;
out vec4 vColor;
void main() {
  vec4 mv = uView * vec4(aPos, 1.0);
  gl_Position = uProj * mv;
  vColor = aColor;
}`;

const FS_LINES = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 o;
void main() { o = vColor; }`;

const BG_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const BG_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = (gl_FragCoord.xy - uRes * 0.5) / uRes.y;
  float t = uTime * 0.010;
  float n1 = fbm(p * 2.1 + vec2(t, -t * 0.55));
  float n2 = fbm(p * 4.6 + vec2(-t * 0.7, t * 0.35) + n1 * 1.5);
  float n3 = fbm(p * 1.15 + vec2(-t * 0.25, t * 0.15));

  vec3 deep   = vec3(0.012, 0.016, 0.042);
  vec3 blue   = vec3(0.075, 0.150, 0.360);
  vec3 violet = vec3(0.180, 0.085, 0.330);
  vec3 teal   = vec3(0.050, 0.190, 0.230);

  vec3 c = deep;
  c = mix(c, blue, smoothstep(0.30, 0.95, n1) * 0.95);
  c = mix(c, violet, smoothstep(0.50, 1.0, n2) * 0.70);
  c = mix(c, teal, smoothstep(0.62, 1.0, n3) * 0.30);

  // 一条斜着的银河带
  float band = exp(-pow((p.y * 1.5 + p.x * 0.42) * 2.4, 2.0));
  c += vec3(0.055, 0.075, 0.150) * band * (0.55 + n2 * 0.8);

  float r = length(p);
  c *= 1.0 - smoothstep(0.30, 1.20, r) * 0.62;
  o = vec4(c, 1.0);
}`;

// ------------------------------------------------------------ GL 初始化

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) + '\n' + src);
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p));
  }
  return p;
}

const canvas = $('#sea');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
if (!gl) {
  document.body.innerHTML = '<div class="empty"><h2>这台机器的浏览器没有开 WebGL2</h2><p>换 Edge / Chrome 再打开一次。</p></div>';
  throw new Error('no webgl2');
}

const progPoints = program(gl, VS_POINTS, FS_POINTS);
const progLines = program(gl, VS_LINES, FS_LINES);
const progBg = program(gl, BG_VS, BG_FS);

const loc = {
  points: {
    pos: gl.getAttribLocation(progPoints, 'aPos'),
    color: gl.getAttribLocation(progPoints, 'aColor'),
    size: gl.getAttribLocation(progPoints, 'aSize'),
    seed: gl.getAttribLocation(progPoints, 'aSeed'),
    view: gl.getUniformLocation(progPoints, 'uView'),
    proj: gl.getUniformLocation(progPoints, 'uProj'),
    rot: gl.getUniformLocation(progPoints, 'uRot'),
    scale: gl.getUniformLocation(progPoints, 'uScale'),
    alpha: gl.getUniformLocation(progPoints, 'uAlpha'),
    time: gl.getUniformLocation(progPoints, 'uTime'),
    drift: gl.getUniformLocation(progPoints, 'uDrift'),
    twinkle: gl.getUniformLocation(progPoints, 'uTwinkle'),
  },
  lines: {
    pos: gl.getAttribLocation(progLines, 'aPos'),
    color: gl.getAttribLocation(progLines, 'aColor'),
    view: gl.getUniformLocation(progLines, 'uView'),
    proj: gl.getUniformLocation(progLines, 'uProj'),
  },
  bg: {
    pos: gl.getAttribLocation(progBg, 'aPos'),
    res: gl.getUniformLocation(progBg, 'uRes'),
    time: gl.getUniformLocation(progBg, 'uTime'),
  },
};

const vaoBg = gl.createVertexArray();
gl.bindVertexArray(vaoBg);
const bgBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(loc.bg.pos);
gl.vertexAttribPointer(loc.bg.pos, 2, gl.FLOAT, false, 0, 0);

const vaoDust = gl.createVertexArray();
const bufDustPos = gl.createBuffer();
const bufDustCol = gl.createBuffer();
const bufDustSize = gl.createBuffer();
const bufDustSeed = gl.createBuffer();
gl.bindVertexArray(vaoDust);
gl.bindBuffer(gl.ARRAY_BUFFER, bufDustPos);
gl.enableVertexAttribArray(loc.points.pos);
gl.vertexAttribPointer(loc.points.pos, 3, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, bufDustCol);
gl.enableVertexAttribArray(loc.points.color);
gl.vertexAttribPointer(loc.points.color, 4, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, bufDustSize);
gl.enableVertexAttribArray(loc.points.size);
gl.vertexAttribPointer(loc.points.size, 1, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, bufDustSeed);
gl.enableVertexAttribArray(loc.points.seed);
gl.vertexAttribPointer(loc.points.seed, 1, gl.FLOAT, false, 0, 0);

const vaoStars = gl.createVertexArray();
const bufStarPos = gl.createBuffer();
const bufStarCol = gl.createBuffer();
const bufStarSize = gl.createBuffer();
const bufStarSeed = gl.createBuffer();
gl.bindVertexArray(vaoStars);
gl.bindBuffer(gl.ARRAY_BUFFER, bufStarPos);
gl.enableVertexAttribArray(loc.points.pos);
gl.vertexAttribPointer(loc.points.pos, 3, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, bufStarCol);
gl.enableVertexAttribArray(loc.points.color);
gl.vertexAttribPointer(loc.points.color, 4, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, bufStarSize);
gl.enableVertexAttribArray(loc.points.size);
gl.vertexAttribPointer(loc.points.size, 1, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, bufStarSeed);
gl.enableVertexAttribArray(loc.points.seed);
gl.vertexAttribPointer(loc.points.seed, 1, gl.FLOAT, false, 0, 0);

const vaoLines = gl.createVertexArray();
const bufLinePos = gl.createBuffer();
const bufLineCol = gl.createBuffer();
gl.bindVertexArray(vaoLines);
gl.bindBuffer(gl.ARRAY_BUFFER, bufLinePos);
gl.enableVertexAttribArray(loc.lines.pos);
gl.vertexAttribPointer(loc.lines.pos, 3, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, bufLineCol);
gl.enableVertexAttribArray(loc.lines.color);
gl.vertexAttribPointer(loc.lines.color, 4, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

// ------------------------------------------------------------ 星尘

function makeDust(n) {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 4);
  const size = new Float32Array(n);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // 扁盘状分布，越外面越稀
    const r = 18 + Math.pow(Math.random(), 0.65) * 95;
    const a = Math.random() * Math.PI * 2;
    const h = (Math.random() - 0.5) * 34 * Math.exp(-r / 70);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = h;
    pos[i * 3 + 2] = Math.sin(a) * r;
    const t = Math.random();
    const c = t < 0.6 ? [0.45, 0.62, 1.0] : t < 0.88 ? [0.72, 0.55, 1.0] : [1.0, 0.86, 0.62];
    const a2 = 0.05 + Math.random() * 0.16;
    col[i * 4] = c[0]; col[i * 4 + 1] = c[1]; col[i * 4 + 2] = c[2]; col[i * 4 + 3] = a2;
    size[i] = 0.7 + Math.random() * 1.1;
    seed[i] = Math.random();
  }
  return { pos, col, size, seed };
}

const DUST_N = 4200;
const dust = makeDust(DUST_N);
gl.bindBuffer(gl.ARRAY_BUFFER, bufDustPos);
gl.bufferData(gl.ARRAY_BUFFER, dust.pos, gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, bufDustCol);
gl.bufferData(gl.ARRAY_BUFFER, dust.col, gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, bufDustSize);
gl.bufferData(gl.ARRAY_BUFFER, dust.size, gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, bufDustSeed);
gl.bufferData(gl.ARRAY_BUFFER, dust.seed, gl.STATIC_DRAW);

// ------------------------------------------------------------ 状态

const S = {
  data: null,
  stars: [],
  links: [],
  byId: [],
  sources: {},
  clusters: [],
  selected: -1,
  hover: -1,
  q: '',
  srcOff: new Set(),
  cluster: -1,
  drift: true,
  idle: 0,
  live: false,
  fitted: false,
  spawn: new Map(),
  frame: null,
  lastInput: performance.now(),
  cam: { yaw: 0.7, pitch: 0.30, dist: 96, target: [0, 0, 0] },
  camTo: { yaw: 0.7, pitch: 0.30, dist: 96, target: [0, 0, 0] },
  flying: false,
  time: 0,
  proj: null,
  view: null,
  w: 1,
  h: 1,
  dpr: 1,
};

const starPos = () => S.data.stars;

// ------------------------------------------------------------ 加载

async function load(rebuild = false) {
  const url = rebuild ? '/api/rebuild' : '/api/starsea';
  const res = await fetch(url, { method: rebuild ? 'POST' : 'GET' });
  if (!res.ok) throw new Error('加载失败：' + res.status);
  const data = await res.json();

  const first = !S.data;
  applyData(data, !first);

  if (first) {
    // 可以直接把某一颗星发给别人：?star=42 / ?q=关键词
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q) {
      S.q = q;
      $('#search').value = q;
      updateSearchInfo();
    }
    const si = params.get('star');
    if (si !== null && S.stars[Number(si)]) {
      setTimeout(() => select(Number(si)), 400);
    }
    connectLive();
  }
}

/** 把一份新数据装进场景。animateNew=true 时，新出现的星会有「刚点亮」的动画。 */
function applyData(data, animateNew) {
  const prevIds = new Set(S.stars.map((s) => s.id));
  const prevSelectedId = S.selected >= 0 && S.stars[S.selected] ? S.stars[S.selected].id : null;
  const first = !S.data;

  S.data = data;
  S.stars = data.stars || [];
  S.links = data.links || [];
  S.clusters = data.clusters || [];
  S.sources = Object.fromEntries((data.sources || []).map((s) => [s.id, s]));

  if (first) {
    S.camTo.target = [0, 0, 0];
  }

  if (animateNew && prevIds.size) {
    const now = performance.now();
    let added = 0;
    for (const s of S.stars) {
      if (!prevIds.has(s.id)) {
        S.spawn.set(s.id, now);
        added++;
      }
    }
    // 被删掉的星（几乎不会发生）清掉动画记录
    for (const id of [...S.spawn.keys()]) {
      if (!S.stars.some((s) => s.id === id)) S.spawn.delete(id);
    }
    if (added) toast(`+${added} 颗新星`);
  }

  if (prevSelectedId) {
    const idx = S.stars.findIndex((s) => s.id === prevSelectedId);
    S.selected = idx >= 0 ? idx : -1;
    if (S.selected < 0) $('#card').hidden = true;
  }

  if (!S.fitted) { fitCamera(); S.fitted = true; }

  renderMeta();

  if (!S.stars.length) {
    $('#empty').hidden = false;
    $('#subtitle').textContent = '还没有星';
  } else {
    $('#empty').hidden = true;
  }
}

// ------------------------------------------------------------ 实时连接

function connectLive() {
  // ?nolive=1：截图/离线查看时用，不开长连接
  if (new URLSearchParams(location.search).has('nolive')) return;
  let es;
  try {
    es = new EventSource('/api/events');
  } catch {
    return;
  }
  es.onopen = () => { S.live = true; paintLive(); };
  es.onerror = () => { S.live = false; paintLive(); };
  es.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg && msg.type === 'update') {
      fetch('/api/starsea', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) applyData(d, true); })
        .catch(() => {});
    }
  };
}

function paintLive() {
  const el = $('#live');
  if (!el) return;
  el.classList.toggle('on', !!S.live);
  el.title = S.live ? '正在跟着聊天记录走' : '没连上实时通道（刷新一下）';
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function fitCamera() {
  let maxR = 20;
  for (const s of S.stars) maxR = Math.max(maxR, Math.hypot(s.pos[0], s.pos[2]));
  S.cam.dist = clamp(maxR * 1.75, 55, 175);
  S.camTo.dist = S.cam.dist;
  S.cam.target = [0, 0, 0];
  S.camTo.target = [0, 0, 0];
}

function fmtDate(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function fmtFull(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  const wd = '日一二三四五六'[d.getDay()];
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 周${wd} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ago(t) {
  const diff = Date.now() - t;
  const day = 86400000;
  if (diff < 3600000) return `${Math.max(1, Math.round(diff / 60000))} 分钟前`;
  if (diff < day) return `${Math.round(diff / 3600000)} 小时前`;
  if (diff < day * 30) return `${Math.round(diff / day)} 天前`;
  return `${Math.round(diff / (day * 30))} 个月前`;
}

function renderMeta() {
  const st = S.data.stats || {};
  const from = st.from ? fmtDate(st.from) : '';
  const to = st.to ? fmtDate(st.to) : '';
  $('#subtitle').textContent = `${st.stars || 0} 颗星 · ${st.sessions || 0} 场对话 · ${from} — ${to}`;
  $('#tl-from').textContent = from;
  $('#tl-to').textContent = to;

  // 来源 chips
  const box = $('#sources');
  box.innerHTML = '';
  for (const s of Object.values(S.sources)) {
    const el = document.createElement('div');
    el.className = 'chip' + (S.srcOff.has(s.id) ? ' off' : '');
    el.innerHTML = `<span class="dot" style="background:rgb(${s.color.map((c) => Math.round(c * 255)).join(',')});color:rgb(${s.color.map((c) => Math.round(c * 255)).join(',')})"></span>${s.name}<span class="n">${s.count}</span>`;
    el.onclick = () => {
      if (S.srcOff.has(s.id)) S.srcOff.delete(s.id); else S.srcOff.add(s.id);
      renderMeta();
      updateSearchInfo();
    };
    box.appendChild(el);
  }

  // 星座
  const list = $('#clusters');
  list.innerHTML = '';
  for (const c of S.clusters) {
    const li = document.createElement('li');
    li.className = c.id === S.cluster ? 'active' : '';
    li.innerHTML = `<span class="cname">${escapeHtml(c.name)}</span><span class="cnum">${c.count}</span>`;
    li.title = (c.tags || []).join(' · ');
    li.onclick = () => {
      S.cluster = S.cluster === c.id ? -1 : c.id;
      renderMeta();
    };
    list.appendChild(li);
  }
  updateSearchInfo();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------------------ 交互

let drag = null;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: 0, yaw: S.camTo.yaw, pitch: S.camTo.pitch };
  canvas.classList.add('dragging');
  S.flying = false;
  S.lastInput = performance.now();
});

canvas.addEventListener('pointermove', (e) => {
  S.lastInput = performance.now();
  if (!drag) { hoverAt(e.clientX, e.clientY); return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  S.camTo.yaw = drag.yaw - dx * 0.005;
  S.camTo.pitch = clamp(drag.pitch + dy * 0.004, -1.35, 1.35);
});

canvas.addEventListener('pointerup', (e) => {
  canvas.classList.remove('dragging');
  if (drag && drag.moved < 5) clickAt(e.clientX, e.clientY);
  drag = null;
});

canvas.addEventListener('pointerleave', () => { S.hover = -1; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  S.lastInput = performance.now();
  S.flying = false;
  S.camTo.dist = clamp(S.camTo.dist * Math.exp(e.deltaY * 0.0011), 14, 260);
}, { passive: false });

function hoverAt(cx, cy) {
  const idx = pick(cx, cy);
  S.hover = idx;
  canvas.style.cursor = idx >= 0 ? 'pointer' : 'grab';
}

function pick(cx, cy) {
  if (!S.proj || !S.frame) return -1;
  const rect = canvas.getBoundingClientRect();
  let best = -1, bestD = 16;
  for (let i = 0; i < S.stars.length; i++) {
    const s = S.stars[i];
    // 用这一帧的实际位置来拾取：星海在转，静态坐标会点偏
    const p = project(S.frame, i * 3);
    if (!p) continue;
    const d = Math.hypot(p[0] - (cx - rect.left), p[1] - (cy - rect.top));
    const bias = s.weight > 0.6 ? 3 : 0;
    if (d < bestD + bias) { bestD = d; best = i; }
  }
  return best;
}

function project(arr, o) {
  if (!S.view || !S.proj) return null;
  const v = S.view, m = S.proj;
  const px = arr[o], py = arr[o + 1], pz = arr[o + 2];
  const x = v[0] * px + v[4] * py + v[8] * pz + v[12];
  const y = v[1] * px + v[5] * py + v[9] * pz + v[13];
  const z = v[2] * px + v[6] * py + v[10] * pz + v[14];
  const w = -z;
  if (w <= 0.1) return null;
  const cx = m[0] * x, cy = m[5] * y;
  return [((cx / w) * 0.5 + 0.5) * S.w, (1 - ((cy / w) * 0.5 + 0.5)) * S.h];
}

function clickAt(cx, cy) {
  const idx = pick(cx, cy);
  if (idx >= 0) select(idx);
  else deselect();
}

function select(i) {
  S.selected = i;
  S.flying = true;
  const s = S.stars[i];
  // 星在转，镜头要跟到它现在待的位置
  if (S.frame) {
    S.camTo.target = [S.frame[i * 3] * 0.55, S.frame[i * 3 + 1] * 0.3, S.frame[i * 3 + 2] * 0.55];
  } else {
    S.camTo.target = [s.pos[0] * 0.55, s.pos[1] * 0.3, s.pos[2] * 0.55];
  }
  S.camTo.dist = 52;
  showCard(s);
  const u = new URL(location.href);
  u.searchParams.set('star', String(i));
  history.replaceState(null, '', u);
}

function deselect() {
  S.selected = -1;
  S.flying = false;
  $('#card').hidden = true;
  const u = new URL(location.href);
  u.searchParams.delete('star');
  history.replaceState(null, '', u);
}

function showCard(s) {
  const src = S.sources[s.src] || { name: s.src, color: [0.8, 0.85, 1] };
  const card = $('#card');
  $('#card-src').textContent = src.name;
  $('#card-src').style.color = `rgb(${src.color.map((c) => Math.round(c * 255)).join(',')})`;
  $('#card-time').textContent = `${fmtFull(s.t)} · ${ago(s.t)}`;
  $('#card-title').textContent = s.title || '一段没有标题的记忆';
  const tags = $('#card-tags');
  tags.innerHTML = (s.tags || []).map((t) => `<span>${escapeHtml(t)}</span>`).join('');
  $('#card-text').textContent = s.text;
  const replyBox = $('#card-reply');
  if (s.reply) {
    replyBox.hidden = false;
    $('#card-reply-text').textContent = s.reply;
  } else {
    replyBox.hidden = true;
  }
  const c = S.clusters.find((k) => k.id === s.cluster);
  $('#card-foot').textContent = c ? `星座 · ${c.name}` : '';
  card.hidden = false;
  card.scrollTop = 0;

  // 时间轴上的位置
  const st = S.data.stats || {};
  const p = st.to > st.from ? (s.t - st.from) / (st.to - st.from) : 0;
  $('#tl-fill').style.width = `${clamp(p * 100, 0, 100)}%`;
}

$('#cardclose').onclick = deselect;

$('#search').addEventListener('input', (e) => {
  S.q = e.target.value.trim();
  updateSearchInfo();
  if (S.q) S.drift = false;
});

function matches(s) {
  if (!S.q) return true;
  const q = S.q.toLowerCase();
  return (
    s.text.toLowerCase().includes(q) ||
    (s.reply || '').toLowerCase().includes(q) ||
    (s.tags || []).some((t) => t.toLowerCase().includes(q)) ||
    (s.title || '').toLowerCase().includes(q)
  );
}

function updateSearchInfo() {
  const el = $('#searchinfo');
  if (!S.q) { el.textContent = ''; return; }
  let n = 0;
  for (const s of S.stars) if (matches(s)) n++;
  el.textContent = n ? `${n} 颗星亮起` : '没找到';
}

function visible(s) {
  if (S.srcOff.has(s.src)) return false;
  return true;
}

$('#drift').onclick = () => {
  S.drift = !S.drift;
  $('#drift').textContent = `漂游 · ${S.drift ? '开' : '关'}`;
  $('#drift').classList.toggle('on', S.drift);
};

$('#rebuild').onclick = async () => {
  const btn = $('#rebuild');
  btn.disabled = true;
  btn.textContent = '打捞中…';
  try {
    await load(true);
    S.selected = -1;
    $('#card').hidden = true;
  } catch (err) {
    btn.textContent = '失败了，重试';
    console.error(err);
  } finally {
    btn.disabled = false;
    setTimeout(() => { btn.textContent = '重新抽取'; }, 1200);
  }
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    $('#drift').click();
  }
  if (e.code === 'Escape') { deselect(); $('#search').blur(); }
});

// ------------------------------------------------------------ 尺寸

function resize() {
  S.dpr = Math.min(window.devicePixelRatio || 1, 2);
  S.w = canvas.clientWidth;
  S.h = canvas.clientHeight;
  canvas.width = Math.round(S.w * S.dpr);
  canvas.height = Math.round(S.h * S.dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------ 渲染

const starBuf = { pos: new Float32Array(0), col: new Float32Array(0), size: new Float32Array(0), seed: new Float32Array(0) };
const lineBuf = { pos: new Float32Array(0), col: new Float32Array(0) };

/** 每颗星一个稳定的相位，用来让「流动」和「呼吸」互不同步。 */
function seedOf(id) {
  let h = 2166136261 >>> 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 10000) / 10000;
}

function grow(arr, n) {
  return arr.length >= n ? arr : new Float32Array(n);
}

function buildStarBuffers(t) {
  const n = S.stars.length;
  if (!starBuf.pos || starBuf.pos.length < n * 3) {
    starBuf.pos = new Float32Array(n * 3);
    starBuf.col = new Float32Array(n * 4);
    starBuf.size = new Float32Array(n);
    starBuf.seed = new Float32Array(n);
    S.frame = new Float32Array(n * 3);
  }
  const sel = S.stars[S.selected];
  const query = S.q;

  for (let i = 0; i < n; i++) {
    const s = S.stars[i];
    const src = S.sources[s.src] || { color: [0.8, 0.85, 1] };
    let r = src.color[0], g = src.color[1], b = src.color[2];
    let a = 0.50 + s.weight * 0.50;
    let size = 2.8 + s.weight * 5.2;

    if (!visible(s)) a *= 0.07;
    if (S.cluster >= 0 && s.cluster !== S.cluster) a *= 0.10;
    if (query) {
      if (matches(s)) { a = 1; size *= 1.7; r = 1; g = 1; b = 1; }
      else a *= 0.10;
    }
    if (i === S.hover) { size *= 1.35; a = Math.min(1, a + 0.25); }
    if (i === S.selected) {
      const pulse = 1 + Math.sin(t * 3.2) * 0.10;
      size = 9.5 * pulse;
      a = 1;
      r = 1; g = 0.97; b = 0.88;
    }

    // 刚记下的星：从虚无里亮起来，再稳在星海里
    const born = S.spawn.get(s.id);
    if (born !== undefined) {
      const age = (performance.now() - born) / 2200;
      if (age >= 1) {
        S.spawn.delete(s.id);
      } else {
        const k = 1 - Math.pow(1 - Math.max(0, age), 3);
        a *= 0.15 + 0.85 * k;
        size *= 0.5 + 0.9 * k;
        r = Math.min(1, r + (1 - r) * (1 - k) * 0.8);
        g = Math.min(1, g + (1 - g) * (1 - k) * 0.8);
        b = Math.min(1, b + (1 - b) * (1 - k) * 0.8);
      }
    }

    // 星流：整片海绕中心缓缓转，内圈比外圈快一点点 —— 转起来才有银河的样子
    const seed = seedOf(s.id);
    const r0 = Math.hypot(s.pos[0], s.pos[2]) || 1;
    const omega = SPIN * (1 + 0.10 * Math.exp(-r0 / 28));
    const ang = t * omega;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ph = t * 0.42 + seed * 6.2831;

    const x = (s.pos[0] * ca - s.pos[2] * sa) + Math.sin(ph) * 0.75;
    const y = s.pos[1] + Math.cos(ph * 0.83) * 0.55;
    const z = (s.pos[0] * sa + s.pos[2] * ca) + Math.sin(ph * 1.27 + 1.7) * 0.75;

    starBuf.pos[i * 3] = x;
    starBuf.pos[i * 3 + 1] = y;
    starBuf.pos[i * 3 + 2] = z;
    S.frame[i * 3] = x;
    S.frame[i * 3 + 1] = y;
    S.frame[i * 3 + 2] = z;
    starBuf.col[i * 4] = r;
    starBuf.col[i * 4 + 1] = g;
    starBuf.col[i * 4 + 2] = b;
    starBuf.col[i * 4 + 3] = a;
    starBuf.size[i] = size;
    starBuf.seed[i] = seed;
  }

  // 选中的星，把它的连线拎出来
  const m = S.links.length;
  if (lineBuf.pos.length < m * 6) {
    lineBuf.pos = new Float32Array(m * 6);
    lineBuf.col = new Float32Array(m * 8);
  }
  let k = 0;
  const F = S.frame;
  for (let i = 0; i < m; i++) {
    const [a, b, strength, kind] = S.links[i];
    const sa = S.stars[a], sb = S.stars[b];
    if (!sa || !sb) continue;
    const isSel = S.selected === a || S.selected === b;
    let alpha = kind === 'semantic' ? 0.045 : 0.022;
    if (isSel) alpha = 0.5;
    else if (S.selected >= 0) alpha *= 0.35;
    // 跨得太远的连线淡下去，不然像画了条直线穿屏
    const dist = Math.hypot(F[a * 3] - F[b * 3], F[a * 3 + 1] - F[b * 3 + 1], F[a * 3 + 2] - F[b * 3 + 2]);
    alpha *= clamp(1.2 - dist / 85, 0.10, 1);
    if (!visible(sa) || !visible(sb)) alpha *= 0.15;
    if (query && !(matches(sa) && matches(sb))) alpha *= 0.2;
    const rr = isSel ? 0.75 : 0.45, gg = isSel ? 0.9 : 0.65, bb = isSel ? 1.0 : 1.0;
    lineBuf.pos[k * 6] = F[a * 3]; lineBuf.pos[k * 6 + 1] = F[a * 3 + 1]; lineBuf.pos[k * 6 + 2] = F[a * 3 + 2];
    lineBuf.pos[k * 6 + 3] = F[b * 3]; lineBuf.pos[k * 6 + 4] = F[b * 3 + 1]; lineBuf.pos[k * 6 + 5] = F[b * 3 + 2];
    lineBuf.col[k * 8] = rr; lineBuf.col[k * 8 + 1] = gg; lineBuf.col[k * 8 + 2] = bb; lineBuf.col[k * 8 + 3] = alpha;
    lineBuf.col[k * 8 + 4] = rr; lineBuf.col[k * 8 + 5] = gg; lineBuf.col[k * 8 + 6] = bb; lineBuf.col[k * 8 + 7] = alpha;
    k++;
  }
  return k;
}

function frame(now) {
  const dt = Math.min(64, now - (S.prev || now));
  S.prev = now;
  S.time += dt / 1000;

  // 闲置后自动漂游
  const idle = now - S.lastInput > 2600;
  if (S.drift && idle && !drag) {
    // 镜头只轻轻转，主角让给星海自己的星流
    S.camTo.yaw += dt * 0.000016;
    S.camTo.pitch = clamp(S.camTo.pitch + Math.sin(S.time * 0.13) * dt * 0.000012, -0.9, 0.9);
  }

  // 相机缓动
  const k = 1 - Math.pow(0.0016, dt / 1000);
  S.cam.yaw += (S.camTo.yaw - S.cam.yaw) * k;
  S.cam.pitch += (S.camTo.pitch - S.cam.pitch) * k;
  S.cam.dist += (S.camTo.dist - S.cam.dist) * k;
  for (let i = 0; i < 3; i++) S.cam.target[i] += (S.camTo.target[i] - S.cam.target[i]) * k * 0.9;

  const cp = Math.cos(S.cam.pitch), sp = Math.sin(S.cam.pitch);
  const eye = [
    S.cam.target[0] + Math.sin(S.cam.yaw) * cp * S.cam.dist,
    S.cam.target[1] + sp * S.cam.dist,
    S.cam.target[2] + Math.cos(S.cam.yaw) * cp * S.cam.dist,
  ];
  S.view = M4.lookAt(eye, S.cam.target, [0, 1, 0]);
  S.proj = M4.perspective((48 * Math.PI) / 180, S.w / Math.max(1, S.h), 0.5, 800);

  const lineCount = buildStarBuffers(S.time);

  gl.clearColor(0.008, 0.012, 0.03, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);

  // 星云
  gl.useProgram(progBg);
  gl.uniform2f(loc.bg.res, canvas.width, canvas.height);
  gl.uniform1f(loc.bg.time, S.time);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(vaoBg);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  // 星尘：比记忆星漂得快一点，形成视差
  gl.useProgram(progPoints);
  gl.uniformMatrix4fv(loc.points.view, false, S.view);
  gl.uniformMatrix4fv(loc.points.proj, false, S.proj);
  gl.uniform1f(loc.points.rot, S.time * 0.0055);
  gl.uniform1f(loc.points.scale, 1);
  gl.uniform1f(loc.points.alpha, 1);
  gl.uniform1f(loc.points.time, S.time);
  gl.uniform1f(loc.points.drift, 2.2);
  gl.uniform1f(loc.points.twinkle, 0.35);
  gl.bindVertexArray(vaoDust);
  gl.drawArrays(gl.POINTS, 0, DUST_N);

  // 连线
  if (lineCount > 0) {
    gl.useProgram(progLines);
    gl.uniformMatrix4fv(loc.lines.view, false, S.view);
    gl.uniformMatrix4fv(loc.lines.proj, false, S.proj);
    gl.bindVertexArray(vaoLines);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLinePos);
    gl.bufferData(gl.ARRAY_BUFFER, lineBuf.pos.subarray(0, lineCount * 6), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLineCol);
    gl.bufferData(gl.ARRAY_BUFFER, lineBuf.col.subarray(0, lineCount * 8), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, lineCount * 2);
  }

  // 星星
  gl.useProgram(progPoints);
  gl.uniformMatrix4fv(loc.points.view, false, S.view);
  gl.uniformMatrix4fv(loc.points.proj, false, S.proj);
  gl.uniform1f(loc.points.rot, 0);
  gl.uniform1f(loc.points.scale, 1);
  gl.uniform1f(loc.points.alpha, 1);
  gl.uniform1f(loc.points.time, S.time);
  gl.uniform1f(loc.points.drift, 0); // 星的位置已经在 CPU 算好了（含星流与漂移）
  gl.uniform1f(loc.points.twinkle, 1);
  gl.bindVertexArray(vaoStars);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufStarPos);
  gl.bufferData(gl.ARRAY_BUFFER, starBuf.pos, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufStarCol);
  gl.bufferData(gl.ARRAY_BUFFER, starBuf.col, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufStarSize);
  gl.bufferData(gl.ARRAY_BUFFER, starBuf.size, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufStarSeed);
  gl.bufferData(gl.ARRAY_BUFFER, starBuf.seed, gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.POINTS, 0, S.stars.length);

  // 再画一层放大的柔光，当作廉价的泛光。
  // 这一层不能太重，否则整片星海会糊——清晰度主要靠上面那层硬核心。
  gl.uniform1f(loc.points.scale, 2.6);
  gl.uniform1f(loc.points.alpha, 0.055);
  gl.uniform1f(loc.points.twinkle, 0);
  gl.drawArrays(gl.POINTS, 0, S.stars.length);

  gl.bindVertexArray(null);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------ 起飞

resize();
load()
  .then(() => requestAnimationFrame(frame))
  .catch((err) => {
    console.error(err);
    $('#empty').hidden = false;
    $('#empty').innerHTML = `<h2>没连上本地服务</h2><p>${escapeHtml(err.message)}</p><p>试试重新运行 <code>start.cmd</code>。</p>`;
  });
