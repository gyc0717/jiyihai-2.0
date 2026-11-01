// 生成一份「演示用」的星图数据，用来拍 README 截图 —— 不含任何真实聊天内容。
// 用法：node tools/demo-data.mjs <输出目录>
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'docs/demo';
const DAY = 86400000;
const now = Date.now();
const t0 = now - 26 * DAY;

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261101);

const SOURCES = [
  { id: 'dsh', name: 'DSH 会话', color: [0.42, 0.78, 1.0], count: 0 },
  { id: 'douyin', name: '抖音私信', color: [1.0, 0.55, 0.82], count: 0 },
  { id: 'inbox', name: '导入', color: [0.62, 1.0, 0.72], count: 0 },
];

const CLUSTERS = [
  { id: 0, name: '深夜·碎话', tags: ['凌晨', '睡不着', '窗外的雨'] },
  { id: 1, name: '代码·报错', tags: ['依赖', '构建', '又崩了'] },
  { id: 2, name: '书影·随记', tags: ['电影', '结尾', '重看'] },
  { id: 3, name: '路上的事', tags: ['地铁', '晚霞', '路口'] },
  { id: 4, name: '吃饭·小事', tags: ['面条', '楼下面馆', '加了蛋'] },
];

const LINES = [
  ['凌晨三点了，又没睡着。窗外在下雨，声音很像以前住的那个小区。', '那就别硬睡了，起来喝口水，把窗开一条缝。'],
  ['今天终于把这个构建跑通了，卡了整整两天，居然是个版本号的问题。', '两天换一行字的答案，挺划算的。把它记下来。'],
  ['楼下那家面馆今天关着门，贴了张纸说要休息一周。有点失落。', '一周而已，等它开门你再去，那时候会更香。'],
  ['重看了一遍那部电影，结尾那段还是没看懂，但这次眼眶有点热。', '没看懂还热，说明它打动你的不是剧情。'],
  ['下班走回家，路过天桥的时候正好赶上晚霞，橘色压着一层紫。', '这种时候最好别拍照，拍下来就不对了。'],
  ['地铁上有人在读一本很厚的书，我偷看了一眼封面，没认出来。', '下次可以直接问，读书的人一般很乐意讲。'],
  ['今天做了一件拖了三个月的小事，五分钟就做完了。', '拖延的成本从来不是那五分钟。'],
  ['给家里打了个电话，说了十七分钟，其实没什么事。', '没事的电话才是最好的电话。'],
  ['忽然想起小时候院子里那棵树，不知道还在不在。', '在不在都不影响它长在你记忆里。'],
  ['试着自己写了段渲染，第一帧跑出来的时候有点激动。', '第一帧永远最好看，因为什么都没做对却亮了。'],
  ['今天什么都没干，但是睡得很好。', '这也算干了件大事。'],
  ['把桌面整理了一遍，扔了两百多个快捷方式。', '桌面干净了，脑子也会跟着空一点。'],
  ['买了个新键盘，敲起来声音很大，室友已经开始抗议了。', '那你只能敲得更快，让他听不清。'],
  ['又开始写日记了，这次用的是纯文本，不上云。', '纯文本最结实，二十年后还能打开。'],
  ['今天路过一家旧书店，进去待了半小时，什么也没买。', '没买也值，那半小时是你的。'],
  ['终于把那个小工具做完了，其实没什么用，但很开心。', '没用但开心，是最高级的有用。'],
  ['外面开始降温了，翻出了去年的外套，口袋里有一张电影票。', '去年的电影票，今年的外套，挺配。'],
  ['今天第一次给自己做了顿饭，盐放多了，但还是吃完了。', '吃完了就是成功。下次少放半勺。'],
  ['把手机调成了灰色，刷起来果然没那么上瘾了。', '颜色是钩子，灰了它就钩不住你。'],
  ['突然发现已经十一月了，今年过得像被快进过。', '被快进的年份，通常是因为一直在忙。'],
  ['今天想起一个很久没联系的人，翻了翻聊天记录，最后也没发消息。', '没发也是一种回答。'],
  ['把旧电脑里的照片导出来了，有张是五年前的自己。', '五年前的你，会羡慕现在的你吗？'],
  ['试着用语音记录想法，结果说了三分钟全是废话。', '废话里通常藏着半句真话，回头听听。'],
  ['今天走了两万步，脚疼，但心情不错。', '脚疼和心情好，经常是一起到。'],
  ['天气好得不像十一月，晒了被子，整个房间都是太阳味。', '太阳味是被子里的水被晒走了。'],
  ['把那个想了很久的点子写下来了，只有三行。', '三行够了，剩下的边做边想。'],
  ['今天开会开了两个小时，结论是下次再开一次。', '有些会的产出就是下一次会。'],
  ['终于把这个插件装好了，侧边栏真的出现了。', '装好的那一刻，比用起来还爽。'],
  ['晚上煮了泡面，加了个蛋，感觉人生完整了。', '加蛋是泡面的仪式感。'],
  ['今天没看成日出，起晚了二十分钟。', '明天还有，太阳不请假。'],
  ['整理相册的时候发现自己笑得越来越少了。', '那就多找点值得笑的事，哪怕是泡面加蛋。'],
  ['把这周的账记完了，发现自己大部分钱花在了吃上。', '花钱买开心，吃是最便宜的那种。'],
  ['尝试早睡，躺下之后想了两个小时的人生。', '早睡失败，但思考成功。'],
  ['今天把旧代码删了三千行，神清气爽。', '删代码的快乐，仅次于写第一行。'],
  ['楼下新开了家咖啡店，老板记得我的口味。', '被记住口味，是城市里的小温暖。'],
  ['下雨天不想出门，叫了外卖，看了一下午的云。', '看云也是正经事。'],
  ['把一直想读的那本书读完了，最后一页折了个角。', '折角的地方，通常是最想再读的那句。'],
  ['今天没有任何计划，结果过得最好。', '没有计划的一天，才装得下意外。'],
  ['给窗台那盆快死的绿萝换了土，希望它撑住。', '换土是给它一次重新开始的机会。'],
  ['突然很想吃小时候那种五毛钱的冰棍。', '想吃的不是冰棍，是那个夏天。'],
];

const stars = [];
const N = 96;
for (let i = 0; i < N; i++) {
  const cluster = i % CLUSTERS.length;
  const t = t0 + Math.floor((i / N) * 26 * DAY + rnd() * DAY * 0.7);
  const days = Math.max(0, (t - t0) / DAY);
  const grow = 1 - Math.exp(-days / 18);
  const theta = (cluster / CLUSTERS.length) * Math.PI * 2 + days * 0.06 + (rnd() - 0.5) * 0.5;
  const clusterOffset = [-8, 5, -3, 9, 1][cluster];
  const radius = 8 + grow * 30 + clusterOffset + (rnd() - 0.5) * 10;
  const [text, reply] = LINES[i % LINES.length];
  const src = i % 11 === 0 ? 'douyin' : i % 17 === 0 ? 'inbox' : 'dsh';
  stars.push({
    id: 'demo:' + i,
    src,
    t,
    title: '一段记得住的对话',
    who: src === 'douyin' ? '一个朋友' : '这里',
    text,
    reply,
    tags: CLUSTERS[cluster].tags,
    cluster,
    weight: Number((0.2 + rnd() * 0.8).toFixed(3)),
    pos: [
      Number((Math.cos(theta) * radius).toFixed(2)),
      Number(((rnd() - 0.5) * 9 + grow * 2.5).toFixed(2)),
      Number((Math.sin(theta) * radius).toFixed(2)),
    ],
    session: 'demo-' + cluster,
  });
}

const links = [];
for (let i = 1; i < stars.length; i++) {
  if (i % 5 === 0) continue;
  links.push([i - 1, i, 0.32, 'session']);
}
for (let i = 0; i < stars.length; i += 3) {
  const j = (i + 7) % stars.length;
  if (i !== j) links.push([Math.min(i, j), Math.max(i, j), 0.42, 'semantic']);
}

for (const s of stars) {
  const hit = SOURCES.find((x) => x.id === s.src);
  if (hit) hit.count++;
}

const doc = {
  generatedAt: new Date().toISOString(),
  tookMs: 0,
  layout: { v: 2, t0, sx: 1, sz: 1 },
  stats: {
    stars: stars.length,
    links: links.length,
    sessions: CLUSTERS.length,
    sources: Object.fromEntries(SOURCES.map((s) => [s.id, s.count])),
    from: stars[0].t,
    to: stars[stars.length - 1].t,
  },
  sources: SOURCES,
  clusters: CLUSTERS.map((c, i) => ({ ...c, count: stars.filter((s) => s.cluster === i).length })),
  stars,
  links,
};

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'starsea.json'), JSON.stringify(doc));
console.log('写好了演示数据 → ' + path.join(out, 'starsea.json') + '（' + stars.length + ' 颗星）');
