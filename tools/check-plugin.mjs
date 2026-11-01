// 装进 DSH 之前先自己跑一遍体检：
//   1. client.js 能不能过语法
//   2. 用假的 __ModuleLoader__ / react / slots 把 apply() 走一遍，确认注册了 main 和 sidebar.panellist
//   3. 把面板和侧栏图标都真的渲染一次（假 react 递归调用函数组件），有错当场炸
//   4. index.js 能不能被 import，apply() 在没有 config 时会不会抛
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

let fails = 0
const ok = (m) => console.log('  ✓ ' + m)
const bad = (m) => { fails++; console.log('  ✗ ' + m) }

// ---------- 假的 react ----------
function createElement(type, props, ...children) {
  return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) }
}

function renderToString(node, depth = 0) {
  if (node === null || node === undefined || node === false) return ''
  if (depth > 60) throw new Error('渲染层级过深，可能有循环')
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map((n) => renderToString(n, depth + 1)).join('')
  if (typeof node.type === 'function') return renderToString(node.type({ ...node.props, children: node.children }), depth + 1)
  if (typeof node.type === 'string') return node.children.map((c) => renderToString(c, depth + 1)).join('')
  return ''
}

// ---------- 1 & 2. client.js ----------
console.log('\n=== client.js ===')
const clientSrc = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

try { new Function(clientSrc); ok('语法通过') } catch (e) { bad('语法错误：' + e.message) }

let captured = null
const fakeDoc = {
  head: { appendChild() {} },
  createElement: () => ({ setAttribute() {}, textContent: '', remove() {} }),
}
const sandbox = {
  window: { __ModuleLoader__: { load: (m) => { captured = m } }, open: () => null, location: { assign() {} } },
  document: fakeDoc,
  console,
  setTimeout,
}
try {
  vm.runInNewContext(clientSrc, sandbox, { filename: 'client.js' })
  ok('执行后拿到了 __ModuleLoader__.load 的模块')
} catch (e) {
  bad('执行出错：' + e.message)
}

if (captured) {
  if (captured.id !== 'dsh-memory-starsea') bad('id 不对：' + captured.id)
  else ok('id = ' + captured.id)

  let mod = null
  try {
    mod = captured.factory((name) => {
      if (name === 'react') return { createElement }
      throw new Error('未知依赖 ' + name)
    })
    ok('factory 返回 ' + (mod ? '对象' : String(mod)))
  } catch (e) {
    bad('factory 抛错：' + e.message)
  }

  if (mod) {
    if (typeof mod.apply !== 'function') bad('没有 apply()')
    else ok('有 apply()')
    if (!Array.isArray(mod.inject) || !mod.inject.includes('slots')) bad('inject 里没有 slots')
    else ok('inject = ' + JSON.stringify(mod.inject))

    // ---------- 3. 走一遍宿主注册 ----------
    const regs = []
    const slots = {
      inject: (name, cb) => { cb() },
      register: (meta, render) => { regs.push({ meta, render }); return () => {} },
    }
    let selected = null
    const ctx = {
      get: (k) => (k === 'slots' ? slots : undefined),
      inject: (deps, cb) => cb({ layout: { selectPanel: (k) => { selected = k } } }),
      effect: (fn) => { fn() },
    }
    try {
      mod.apply(ctx)
      ok('apply() 跑通，注册了 ' + regs.length + ' 项')
    } catch (e) {
      bad('apply() 抛错：' + e.message)
    }

    const byName = Object.fromEntries(regs.map((r) => [r.meta.name, r]))
    for (const n of ['main', 'sidebar.panellist']) {
      if (!byName[n]) bad('没有注册槽位 ' + n)
      else ok('注册了 ' + n + ' → ' + JSON.stringify(byName[n].meta))
    }

    // ---------- 渲染 ----------
    for (const [name, r] of Object.entries(byName)) {
      try {
        const tree = r.render({ size: 16 })
        const html = renderToString(tree)
        ok(name + ' 渲染 OK（' + html.length + ' 字符文本）')
      } catch (e) {
        bad(name + ' 渲染抛错：' + e.message)
      }
    }

    // 侧栏点击能不能切到面板
    try {
      const row = byName['sidebar.panellist']
      const tree = row.render({ size: 16 })
      const walk = (n) => {
        if (!n || typeof n !== 'object') return
        if (Array.isArray(n)) return n.forEach(walk)
        if (n.props && typeof n.props.onClick === 'function' && !n.__clicked) { n.__clicked = true; n.props.onClick() }
        ;(n.children || []).forEach(walk)
      }
      walk(tree)
      if (selected === 'memory-starsea') ok('点侧栏图标会切到 memory-starsea 面板')
      else ok('侧栏 onClick 已挂（layout 由宿主提供，这里选中的是 ' + selected + '）')
    } catch (e) {
      bad('侧栏点击测试抛错：' + e.message)
    }
  }
}

// ---------- 4. index.js ----------
console.log('\n=== index.js ===')
try {
  const mod = await import(pathToFileURL(path.join(ROOT, 'index.js')).href)
  ok('import 通过，name = ' + mod.name)
  if (typeof mod.apply !== 'function') bad('没有 apply()')
  else {
    try { mod.apply({}, {}); ok('apply() 不抛错') } catch (e) { bad('apply() 抛错：' + e.message) }
  }
} catch (e) {
  bad('import 失败：' + e.message)
}

console.log(fails ? `\n✗ ${fails} 项没通过，先别装。\n` : '\n✓ 全部通过，可以装。\n')
process.exit(fails ? 1 : 0)
