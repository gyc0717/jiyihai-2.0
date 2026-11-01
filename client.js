/**
 * 记忆星海 · DSH 客户端插件
 * ---------------------------------------------------------------------------
 * 往宿主里挂两样东西：
 *   1) `main` 面板 —— 一块「记忆星海」的页面（key 与侧栏 id 同名，点侧栏即切到它）
 *   2) `sidebar.panellist` 一行 —— 侧栏最下面的星图标
 *
 * 为什么不是内嵌 iframe：主文档的 CSP 是 `default-src 'self'`，
 * 指向 127.0.0.1:7788 的 iframe 会被直接拦掉。所以这里用 window.open 打开，
 * Electron 会交给系统浏览器（或宿主自己的新窗口），不会把宿主页面顶掉。
 */
window.__ModuleLoader__.load({
  id: 'dsh-memory-starsea',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const PAGE_KEY = 'memory-starsea'
    const TARGET = 'http://127.0.0.1:7788/'

    let layout = null

    const CSS = `
[data-mss-page]{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  min-height:100%;padding:48px 24px;box-sizing:border-box;position:relative;overflow:hidden;
  font-size:13px;line-height:1.7;
  color:var(--dsw-alias-label-primary,#e6edf7);
}
[data-mss-page]::before{
  content:"";position:absolute;inset:-30% -10%;pointer-events:none;
  background:
    radial-gradient(38% 32% at 24% 30%,rgba(90,150,255,.16),transparent 70%),
    radial-gradient(34% 30% at 76% 66%,rgba(150,90,255,.14),transparent 70%),
    radial-gradient(30% 26% at 60% 16%,rgba(60,200,220,.08),transparent 70%);
  filter:blur(6px);
}
[data-mss-card]{
  position:relative;width:min(460px,100%);padding:34px 32px 28px;border-radius:20px;
  border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));
  background:linear-gradient(165deg,rgba(20,32,64,.72),rgba(8,12,28,.86));
  box-shadow:0 26px 70px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06);
  text-align:center;
}
[data-mss-mark]{width:56px;height:56px;margin:0 auto 18px;display:block;opacity:.95;}
[data-mss-title]{font-size:20px;font-weight:600;letter-spacing:.26em;text-indent:.26em;margin:0 0 10px;}
[data-mss-sub]{font-size:12.5px;color:var(--dsw-alias-label-tertiary,#9aa0a6);margin:0 0 26px;}
[data-mss-cta]{
  display:inline-flex;align-items:center;gap:9px;
  padding:11px 26px;border-radius:999px;border:1px solid rgba(127,212,255,.45);
  background:linear-gradient(180deg,rgba(60,130,200,.34),rgba(30,70,120,.34));
  color:#eaf7ff;font-size:13.5px;letter-spacing:.12em;cursor:pointer;
  transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
  font-family:inherit;
}
[data-mss-cta]:hover{transform:translateY(-1px);border-color:rgba(150,225,255,.8);box-shadow:0 8px 26px rgba(80,170,255,.25);}
[data-mss-cta]:active{transform:translateY(0);}
[data-mss-note]{margin:18px 0 0;font-size:11px;line-height:1.9;color:var(--dsw-alias-label-tertiary,#8b93a1);}
[data-mss-url]{
  display:inline-block;margin-top:6px;padding:3px 9px;border-radius:6px;
  font-family:ui-monospace,Consolas,monospace;font-size:11px;
  border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));
  color:#9fd7ff;user-select:all;cursor:text;
}
[data-mss-row]{
  display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;
  border-radius:8px;color:inherit;
}
[data-mss-row]:hover{background:rgba(127,212,255,.12);}
`

    function openSea() {
      try {
        const w = window.open(TARGET, '_blank', 'noopener,noreferrer')
        if (!w) window.location.assign(TARGET)
      } catch (e) {
        try { window.location.assign(TARGET) } catch { /* 交给用户手动打开 */ }
      }
    }

    function Mark() {
      return h(
        'svg',
        { 'data-mss-mark': '', viewBox: '0 0 64 64', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' },
        h('circle', { cx: 32, cy: 33, r: 21, stroke: '#7fd4ff', strokeOpacity: '.22', strokeWidth: 1 }),
        h('circle', { cx: 32, cy: 33, r: 13, stroke: '#7fd4ff', strokeOpacity: '.14', strokeWidth: 1 }),
        h('circle', { cx: 32, cy: 33, r: 5.5, fill: '#eaf7ff' }),
        h('circle', { cx: 32, cy: 33, r: 11, fill: '#7fd4ff', fillOpacity: '.18' }),
        h('circle', { cx: 15, cy: 26, r: 2.1, fill: '#cfe6ff' }),
        h('circle', { cx: 49, cy: 30, r: 1.7, fill: '#cfe6ff' }),
        h('circle', { cx: 44, cy: 47, r: 1.5, fill: '#ffd0e8' }),
        h('circle', { cx: 21, cy: 45, r: 1.2, fill: '#bcd9ff' })
      )
    }

    function Panel() {
      return h(
        'div',
        { 'data-mss-page': '' },
        h(
          'div',
          { 'data-mss-card': '' },
          h(Mark),
          h('h1', { 'data-mss-title': '' }, '记忆星海'),
          h('p', { 'data-mss-sub': '' }, '把和你聊过的字，摊成一片能漂游的海。'),
          h('button', { 'data-mss-cta': '', type: 'button', onClick: openSea }, '进入星海', h('span', { 'aria-hidden': 'true' }, '↗')),
          h(
            'p',
            { 'data-mss-note': '' },
            '在本机浏览器里打开 · 数据不离开这台电脑',
            h('br'),
            h('span', { 'data-mss-url': '' }, '127.0.0.1:7788')
          )
        )
      )
    }

    function Row(props) {
      const size = (props && props.size) || 16
      return h(
        'span',
        {
          'data-mss-row': '',
          title: '记忆星海',
          onClick: () => {
            try { if (layout && layout.selectPanel) layout.selectPanel(PAGE_KEY) } catch { /* 宿主自己会处理 */ }
          },
        },
        h(Mark, { size })
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        try {
          const style = document.createElement('style')
          style.setAttribute('data-plugin-css', 'dsh-memory-starsea')
          style.textContent = CSS
          document.head.appendChild(style)
          if (ctx.effect) ctx.effect(() => () => style.remove(), 'memory-starsea: 页面样式')
        } catch { /* 样式失败不影响入口 */ }

        const slots = (() => {
          try { return typeof ctx.get === 'function' ? ctx.get('slots') : ctx.slots } catch { return null }
        })()
        if (!slots) return

        try {
          if (ctx.inject) ctx.inject(['layout'], (scoped) => { layout = scoped && scoped.layout })
        } catch { /* 拿不到 layout 也能点，宿主会自己切面板 */ }

        try {
          slots.inject('main', () =>
            slots.register({ name: 'main', key: PAGE_KEY }, () => h(Panel))
          )
        } catch { /* 老宿主没有 main 槽位 */ }

        try {
          slots.inject('sidebar.panellist', () =>
            slots.register(
              { name: 'sidebar.panellist', id: PAGE_KEY, order: 2, label: () => '记忆星海' },
              (owner) => h(Row, { size: owner && owner.size })
            )
          )
        } catch { /* 老宿主没有侧栏槽位 */ }
      },
    }
  },
})
