// 把「记忆星海」装进 DSH 的 desktop profile。
//   1. 备份 profile/package.json
//   2. 把本仓库（= 插件包本体）拷进 profile/node_modules/dsh-memory-starsea
//   3. package.json 里登记 bundles + dependencies
//   4. pnpm-lock.yaml 跟着写一条
//
// 用法：node tools/install-dsh.mjs
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const PKG = 'dsh-memory-starsea'

// 进 node_modules 的东西（tools / docs / cmd 都不带）
const SHIP = ['package.json', 'index.js', 'client.js', 'cordis.patch.yml', 'starsea', 'README.md']

const PROFILE = process.env.DSH_PROFILE_DIR || path.join(os.homedir(), '.dsh', 'profiles', 'desktop')
const PKG_JSON = path.join(PROFILE, 'package.json')
const DEST = path.join(PROFILE, 'node_modules', PKG)

const say = (m) => console.log('  ' + m)

if (!fs.existsSync(PKG_JSON)) {
  console.error('✗ 找不到 DSH 的 desktop profile：' + PROFILE)
  console.error('  如果装在别处，用环境变量指定：set DSH_PROFILE_DIR=<...\\profiles\\desktop>')
  process.exit(1)
}

console.log('\n装到：' + PROFILE + '\n')

// 备份
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const backup = PKG_JSON + '.bak-memory-starsea-' + stamp
fs.copyFileSync(PKG_JSON, backup)
say('已备份 package.json → ' + path.basename(backup))

// 整包拷贝（真实目录，不用软链）
if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true })
  say('清掉了旧的插件目录')
}
fs.mkdirSync(DEST, { recursive: true })
for (const name of SHIP) {
  const src = path.join(ROOT, name)
  if (!fs.existsSync(src)) continue
  fs.cpSync(src, path.join(DEST, name), { recursive: true })
  say('+ ' + name)
}
say('  └ starsea/server.mjs 在不在：' + (fs.existsSync(path.join(DEST, 'starsea', 'server.mjs')) ? '在' : '不在！'))

// 登记
const raw = fs.readFileSync(PKG_JSON, 'utf8')
const hadBom = raw.charCodeAt(0) === 0xfeff
const pkg = JSON.parse(hadBom ? raw.slice(1) : raw)
pkg.dsh = pkg.dsh || {}
pkg.dsh.profile = pkg.dsh.profile || {}
pkg.dsh.profile.bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : []
pkg.dependencies = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}

let changed = false

if (pkg.dsh.profile.bundles.includes(PKG)) {
  say('bundles 里已经有了')
} else {
  pkg.dsh.profile.bundles.push(PKG)
  changed = true
  say('bundles 已加入 ' + PKG)
}

const linkSpec = 'link:' + ROOT.replace(/\\/g, '/')
if (pkg.dependencies[PKG] === linkSpec) {
  say('dependencies 里已经有了')
} else {
  pkg.dependencies[PKG] = linkSpec
  changed = true
  say('dependencies 已声明 ' + linkSpec)
}

if (changed) {
  fs.writeFileSync(PKG_JSON, (hadBom ? '\ufeff' : '') + JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

// lockfile 跟着写一条，免得 pnpm 下次觉得「清单和锁对不上」
const LOCK = path.join(PROFILE, 'pnpm-lock.yaml')
if (fs.existsSync(LOCK)) {
  const spec = linkSpec.replace(/\\/g, '/')
  const y = fs.readFileSync(LOCK, 'utf8')
  const block = `      ${PKG}:\n        specifier: ${spec}\n        version: ${spec}\n`
  const entryRe = new RegExp(`      ${PKG}:\\n        specifier: .*\\n        version: .*\\n`)
  if (entryRe.test(y)) {
    const next = y.replace(entryRe, block)
    if (next !== y) {
      fs.writeFileSync(LOCK, next, 'utf8')
      say('pnpm-lock.yaml 已更新')
    } else {
      say('pnpm-lock.yaml 里已经是新的了')
    }
  } else {
    const marker = '      dsh-plugin-wallpaper-engine:\n'
    const idx = y.indexOf(marker)
    if (idx >= 0) {
      fs.writeFileSync(LOCK, y.slice(0, idx) + block + y.slice(idx), 'utf8')
      say('pnpm-lock.yaml 已补登记')
    } else {
      say('pnpm-lock.yaml 结构不认识，跳过补登记')
    }
  }
}

console.log('\n✓ 装好了。关掉 DeepSeek Harness 再重新打开，侧边栏底部会多一个星形入口。')
console.log('  想退回：node tools/uninstall-dsh.mjs\n')
