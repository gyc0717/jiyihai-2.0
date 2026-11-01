// 把本仓库同步到 Gitee 的 ai-agent-project 仓库里（作为 memory-starsea/ 子目录）。
//
// 做法：给远端的 main 开一个临时工作树 → 把本地文件镜像进去 → 有变化就提交并推送。
// 不会动你本地这份工程，也不会碰 ai-agent-project 里别的目录。
//
// 用法：node tools/sync-gitee.mjs ["提交说明"]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const REMOTE = process.env.GITEE_REMOTE || 'https://gitee.com/gyc0717/ai-agent-project.git'
const SUBDIR = 'memory-starsea'
const WT = path.join(os.tmpdir(), 'ai-agent-project-main')
const msg = process.argv[2] || '同步 memory-starsea'

const sh = (args, cwd = ROOT, quiet = false) => {
  const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' })
  return out
}

console.log('\n① 准备远端工作树\n')

// 清掉可能残留的旧工作树
try { execFileSync('git', ['worktree', 'remove', WT, '--force'], { cwd: ROOT, stdio: 'ignore' }) } catch {}
if (fs.existsSync(WT)) fs.rmSync(WT, { recursive: true, force: true })
try { execFileSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'ignore' }) } catch {}

// 有 origin 就从它拉，没有就临时加一个
let hasOrigin = false
try {
  const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim()
  hasOrigin = url === REMOTE
} catch {}

if (!hasOrigin) {
  try { execFileSync('git', ['remote', 'remove', 'origin'], { cwd: ROOT, stdio: 'ignore' }) } catch {}
  execFileSync('git', ['remote', 'add', 'origin', REMOTE], { cwd: ROOT, stdio: 'inherit' })
}

execFileSync('git', ['fetch', 'origin', 'main', '--quiet'], { cwd: ROOT, stdio: 'inherit' })
// 用游离 HEAD 挂着 origin/main：不碰任何本地分支，也就不会有「本地 main 落后」的麻烦
execFileSync('git', ['worktree', 'add', '--detach', WT, 'origin/main'], { cwd: ROOT, stdio: 'inherit' })

console.log('\n② 镜像文件\n')
const dst = path.join(WT, SUBDIR)
fs.mkdirSync(dst, { recursive: true })

const SKIP = new Set(['.git', 'node_modules', 'dist', 'data'])
function mirror(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const s = path.join(from, e.name)
    const d = path.join(to, e.name)
    if (e.isDirectory()) mirror(s, d)
    else fs.copyFileSync(s, d)
  }
}
mirror(ROOT, dst)

// 删掉远端子目录里多出来的文件（本地已经删掉的）
function prune(remoteDir, localDir) {
  for (const e of fs.readdirSync(remoteDir, { withFileTypes: true })) {
    const r = path.join(remoteDir, e.name)
    const l = path.join(localDir, e.name)
    if (e.isDirectory()) {
      if (!fs.existsSync(l)) fs.rmSync(r, { recursive: true, force: true })
      else prune(r, l)
    } else if (!fs.existsSync(l)) {
      fs.unlinkSync(r)
    }
  }
}
prune(dst, ROOT)

console.log('\n③ 提交并推送\n')
execFileSync('git', ['add', '--all', SUBDIR], { cwd: WT, stdio: 'inherit' })

let dirty = true
try {
  execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: WT, stdio: 'ignore' })
  dirty = false
} catch {
  dirty = true
}

if (!dirty) {
  console.log('  没有变化，不用推。')
} else {
  execFileSync('git', ['-c', 'user.name=gyc0717', '-c', 'user.email=gyc0717@users.noreply.github.com',
    'commit', '-m', msg], { cwd: WT, stdio: 'inherit' })
  execFileSync('git', ['push', 'origin', 'HEAD:main'], { cwd: WT, stdio: 'inherit' })
  console.log('\n✓ 已推送到 ' + REMOTE)
}

try { execFileSync('git', ['worktree', 'remove', WT, '--force'], { cwd: ROOT, stdio: 'ignore' }) } catch {}
console.log('')
