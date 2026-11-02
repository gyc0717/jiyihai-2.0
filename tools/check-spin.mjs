// 用与 app.js 相同的相机/投影，算一个点在屏幕上的位置，判断旋转方向。
// 约定：屏幕 y 向下为正；星带下缘 = 靠近相机的近侧。
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];
}

function lookAt(eye, center, up) {
  let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
  let len = Math.hypot(z0, z1, z2) || 1;
  z0 /= len; z1 /= len; z2 /= len;
  let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2) || 1;
  x0 /= len; x1 /= len; x2 /= len;
  const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
  return [
    x0, y0, z0, 0,
    x1, y1, z1, 0,
    x2, y2, z2, 0,
    -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
    -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
    -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
    1,
  ];
}

const yaw = 0.45, pitch = 0.16, dist = 90;
const cp = Math.cos(pitch), sp = Math.sin(pitch);
const eye = [Math.sin(yaw) * cp * dist, sp * dist, Math.cos(yaw) * cp * dist];
const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
const proj = perspective((48 * Math.PI) / 180, 1400 / 880, 0.5, 800);
const W = 1400, H = 880;

function project(px, py, pz) {
  const v = view, m = proj;
  const x = v[0] * px + v[4] * py + v[8] * pz + v[12];
  const y = v[1] * px + v[5] * py + v[9] * pz + v[13];
  const z = v[2] * px + v[6] * py + v[10] * pz + v[14];
  const w = -z;
  const cx = m[0] * x, cy = m[5] * y;
  return [((cx / w) * 0.5 + 0.5) * W, (1 - ((cy / w) * 0.5 + 0.5)) * H];
}

console.log('近侧判定（屏幕 y 越大越靠下）:');
console.log('  点 (0,0,+20) →', project(0, 0, 20).map((n) => n.toFixed(0)).join(', '));
console.log('  点 (0,0,-20) →', project(0, 0, -20).map((n) => n.toFixed(0)).join(', '));

// 近侧的一个点，正角度 vs 负角度，看它往哪边跑
const r = 20;
for (const spin of [+0.012, -0.012]) {
  const t = 25;
  const a = t * spin * (1 + 0.10 * Math.exp(-r / 28));
  const x = r * Math.cos(a), z = r * Math.sin(a); // 起点在 (r,0,0)
  const p0 = project(r, 0, 0);
  const p1 = project(x, 0, z);
  console.log(`spin=${spin > 0 ? '+' : ''}${spin} 时，点 (${r},0,0) 从 x=${p0[0].toFixed(0)} → x=${p1[0].toFixed(0)}  ${p1[0] > p0[0] ? '向右' : '向左'}`);
}
