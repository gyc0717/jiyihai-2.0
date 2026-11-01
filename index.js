/**
 * 记忆星海 · 服务端插件
 * ---------------------------------------------------------------------------
 * 只做一件事：DSH 起来的时候，顺手把内置的星海服务拉起来（如果它没在跑）。
 *
 * 整个应用就在本包的 starsea/ 里，不依赖外面任何路径 ——
 * 把这一包拷到哪儿都能用。
 *
 * 拉起子进程用的是宿主自己的可执行文件 + ELECTRON_RUN_AS_NODE=1，
 * 这正是 dsh.cmd 的做法，所以不用去猜 node 装在哪。
 *
 * 全部逻辑都在 try/catch 和延时里，绝不在启动路径上抛错。
 */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const name = 'memory-starsea'
export const inject = []

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SERVER = path.join(HERE, 'starsea', 'server.mjs')
const PORT = 7788

function log(msg) {
  try { console.log('[memory-starsea] ' + msg) } catch { /* 忽略 */ }
}

function health() {
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    try {
      const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/health', timeout: 700 }, (res) => {
        res.resume()
        finish(res.statusCode === 200)
      })
      req.on('error', () => finish(false))
      req.on('timeout', () => { req.destroy(); finish(false) })
    } catch {
      finish(false)
    }
  })
}

function launch() {
  try {
    if (!fs.existsSync(SERVER)) {
      log('包不完整，找不到 starsea/server.mjs')
      return false
    }
    const child = spawn(process.execPath, [SERVER], {
      cwd: path.dirname(SERVER),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NO_OPEN: '1' },
    })
    child.on('error', (e) => log('起服务失败：' + (e && e.message)))
    child.unref()
    log('已拉起星海服务')
    return true
  } catch (e) {
    log('起服务抛错：' + (e && e.message))
    return false
  }
}

export function apply() {
  try {
    const timer = setTimeout(async () => {
      try {
        if (await health()) return
        launch()
      } catch { /* 静默 */ }
    }, 1500)
    if (timer && typeof timer.unref === 'function') timer.unref()
  } catch { /* 静默 */ }
}
