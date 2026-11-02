// 卸载：bundles、dependencies、pnpm-lock 三处登记一起清，再删 node_modules 里的目录。
// 不动聊天记录，也不动 profile 的其它插件。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PKG = 'dsh-memory-starsea'
const PROFILE = process.env.DSH_PROFILE_DIR || path.join(os.homedir(), '.dsh', 'profiles', 'desktop')
const PKG_JSON = path.join(PROFILE, 'package.json')
const LOCK = path.join(PROFILE, 'pnpm-lock.yaml')
const DEST = path.join(PROFILE, 'node_modules', PKG)

if (!fs.existsSync(PKG_JSON)) {
  console.error('找不到 ' + PKG_JSON)
  process.exit(1)
}

const raw = fs.readFileSync(PKG_JSON, 'utf8')
const hadBom = raw.charCodeAt(0) === 0xfeff
const pkg = JSON.parse(hadBom ? raw.slice(1) : raw)
let changed = false

const list = pkg?.dsh?.profile?.bundles
if (Array.isArray(list) && list.includes(PKG)) {
  pkg.dsh.profile.bundles = list.filter((x) => x !== PKG)
  changed = true
  console.log('  ✓ 已从 bundles 移除')
} else {
  console.log('  · bundles 里本来就没有')
}

if (pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, PKG)) {
  delete pkg.dependencies[PKG]
  changed = true
  console.log('  ✓ 已从 dependencies 移除')
} else {
  console.log('  · dependencies 里本来就没有')
}

if (changed) {
  fs.writeFileSync(PKG_JSON, (hadBom ? '\ufeff' : '') + JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

// lockfile：删掉这个包的整段（它的 specifier/version 两行）
if (fs.existsSync(LOCK)) {
  const lines = fs.readFileSync(LOCK, 'utf8').split('\n')
  const out = []
  let skipping = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (new RegExp(`^\\s+${PKG}:\\s*$`).test(line)) {
      skipping = true
      continue
    }
    if (skipping) {
      // 该段的收尾：遇到同级或更浅缩进的非内容行就停
      if (/^\s+(specifier|version):/.test(line)) continue
      skipping = false
    }
    out.push(line)
  }
  const next = out.join('\n')
  if (next !== lines.join('\n')) {
    fs.writeFileSync(LOCK, next, 'utf8')
    console.log('  ✓ 已从 pnpm-lock.yaml 移除')
  } else {
    console.log('  · lockfile 里本来就没有')
  }
}

// 删安装位置。如果它是链接（junction / symlink），只拆链接，绝不跟进去删目标目录 ——
// 否则一句 rmSync 递归就把整个仓库删了。
if (fs.existsSync(DEST)) {
  let isLink = false
  try { isLink = fs.lstatSync(DEST).isSymbolicLink() } catch { /* 忽略 */ }
  if (isLink) {
    try { fs.rmdirSync(DEST) } catch { fs.unlinkSync(DEST) }
    console.log('  ✓ 已拆掉指向仓库的链接（仓库本身没动）')
  } else {
    fs.rmSync(DEST, { recursive: true, force: true })
    console.log('  ✓ 已删除 node_modules/' + PKG)
  }
}

console.log('\n重启 DeepSeek Harness 后入口就消失了。')
