// 量一下这套算法在更大数据量下要跑多久（不改任何真实数据）
// 用法：node tools/bench-scale.mjs
const VOCAB = 2000;

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 造词表：Zipf 分布，接近真实中文词频
function makeDocs(n, rnd) {
  const weights = Array.from({ length: VOCAB }, (_, i) => 1 / (i + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const pick = () => {
    let r = rnd() * total;
    for (let i = 0; i < VOCAB; i++) {
      r -= weights[i];
      if (r <= 0) return 'w' + i;
    }
    return 'w0';
  };
  const docs = [];
  for (let d = 0; d < n; d++) {
    const m = new Map();
    const len = 30 + Math.floor(rnd() * 60); // 每颗星 30~90 个词
    for (let i = 0; i < len; i++) {
      const k = pick();
      m.set(k, (m.get(k) || 0) + 1);
    }
    docs.push(m);
  }
  return docs;
}

function tfidf(docs) {
  const df = new Map();
  for (const m of docs) for (const k of m.keys()) df.set(k, (df.get(k) || 0) + 1);
  const N = docs.length;
  return docs.map((m) => {
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

function kmeans(vecs, k, iters = 24) {
  const n = vecs.length;
  const rnd = mulberry32(0x5eed1e);
  k = Math.max(1, Math.min(k, n));
  const centers = [vecs[0]];
  const dist = new Array(n).fill(1);
  while (centers.length < k) {
    let sum = 0;
    for (let i = 0; i < n; i++) { dist[i] = 1 - Math.max(...centers.map((c) => cosine(vecs[i], c))); sum += dist[i]; }
    let r = rnd() * sum, pick = 0;
    for (let i = 0; i < n; i++) { r -= dist[i]; if (r <= 0) { pick = i; break; } }
    centers.push(vecs[pick]);
  }
  const assign = new Array(n).fill(0);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      let best = 0, bv = -1;
      for (let c = 0; c < centers.length; c++) {
        const v = cosine(vecs[i], centers[c]);
        if (v > bv) { bv = v; best = c; }
      }
      assign[i] = best;
    }
    for (let c = 0; c < centers.length; c++) {
      const acc = new Map();
      let cnt = 0;
      for (let i = 0; i < n; i++) if (assign[i] === c) { cnt++; for (const [kk, w] of vecs[i]) acc.set(kk, (acc.get(kk) || 0) + w); }
      if (!cnt) continue;
      let norm = 0;
      for (const [kk, w] of acc) { acc.set(kk, w / cnt); norm += (w / cnt) * (w / cnt); }
      norm = Math.sqrt(norm) || 1;
      for (const [kk, w] of acc) acc.set(kk, w / cnt / norm);
      centers[c] = acc;
    }
  }
  return assign;
}

const sizes = [500, 1000, 2000, 4000];
console.log('星数\tTF-IDF\tkmeans\t两两相似\t合计');
for (const n of sizes) {
  const rnd = mulberry32(42 + n);
  const docs = makeDocs(n, rnd);

  let t = Date.now();
  const vecs = tfidf(docs);
  const tTfidf = Date.now() - t;

  t = Date.now();
  kmeans(vecs, Math.max(2, Math.min(9, Math.round(n / 22))));
  const tKmeans = Date.now() - t;

  t = Date.now();
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cosine(vecs[i], vecs[j]) > 0.3) pairs++;
    }
  }
  const tPairs = Date.now() - t;

  console.log(`${n}\t${tTfidf}ms\t${tKmeans}ms\t${tPairs}ms\t${tTfidf + tKmeans + tPairs}ms\t(>0.3 的对数 ${pairs})`);
}
