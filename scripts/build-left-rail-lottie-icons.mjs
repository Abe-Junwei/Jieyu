#!/usr/bin/env node
/**
 * 生成左侧栏 32×32 小画板、带可识别图形的 Lottie JSON（bodymovin 5.7）。
 * 运行：node scripts/build-left-rail-lottie-icons.mjs
 *
 * 若已改用 Lordicon / LottieFiles 等导出的 JSON，可不再运行本脚本；直接用成品覆盖
 * `src/assets/lottie/left-rail/icons/*.json`（文件名与 leftRailLottieMap.ts 中 import 一致）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../src/assets/lottie/left-rail/icons');

const GRAY = [0.38, 0.42, 0.48, 1];

function stroke(w = 1.65) {
  return {
    ty: 'st',
    c: { a: 0, k: GRAY, ix: 3 },
    o: { a: 0, k: 100, ix: 4 },
    w: { a: 0, k: w, ix: 5 },
    lc: 2,
    lj: 2,
    ml: 4,
    bm: 0,
    nm: 'Stroke 1',
    mn: 'ADBE Vector Graphic - Stroke',
    hd: false,
  };
}

function fill() {
  return {
    ty: 'fl',
    c: { a: 0, k: GRAY, ix: 4 },
    o: { a: 0, k: 100, ix: 5 },
    r: 1,
    bm: 0,
    nm: 'Fill 1',
    mn: 'ADBE Vector Graphic - Fill',
    hd: false,
  };
}

function tr(p = [0, 0]) {
  return {
    ty: 'tr',
    p: { a: 0, k: p, ix: 2 },
    a: { a: 0, k: [0, 0], ix: 1 },
    s: { a: 0, k: [100, 100], ix: 3 },
    r: { a: 0, k: 0, ix: 6 },
    o: { a: 0, k: 100, ix: 7 },
    sk: { a: 0, k: 0, ix: 4 },
    sa: { a: 0, k: 0, ix: 5 },
    nm: 'Transform',
  };
}

/** @param {{ it: object[], nm: string }} p */
function gr({ it, nm }) {
  return {
    ty: 'gr',
    it: [...it, tr()],
    nm,
    np: it.length + 1,
    cix: 2,
    bm: 0,
    ix: 1,
    mn: 'ADBE Vector Group',
    hd: false,
  };
}

function rc(w, h, x, y, r = 1) {
  return {
    d: 1,
    ty: 'rc',
    s: { a: 0, k: [w, h], ix: 2 },
    p: { a: 0, k: [x, y], ix: 3 },
    r: { a: 0, k: r, ix: 4 },
    nm: 'Rectangle',
    mn: 'ADBE Vector Shape - Rect',
    hd: false,
  };
}

function el(w, h, x, y) {
  return {
    d: 1,
    ty: 'el',
    s: { a: 0, k: [w, h], ix: 2 },
    p: { a: 0, k: [x, y], ix: 3 },
    nm: 'Ellipse',
    mn: 'ADBE Vector Shape - Ellipse',
    hd: false,
  };
}

/** 开放折线 | Open polyline path */
function shOpen(vertices) {
  const n = vertices.length;
  const i = vertices.map(() => [0, 0]);
  const o = vertices.map(() => [0, 0]);
  return {
    ind: 0,
    ty: 'sh',
    ix: 1,
    ks: {
      a: 0,
      k: {
        i,
        o,
        v: vertices,
        c: false,
      },
      ix: 2,
    },
    nm: 'Path 1',
    mn: 'ADBE Vector Shape - Group',
    hd: false,
  };
}

/** 闭合多边形 | Closed polygon */
function shClosed(vertices) {
  const n = vertices.length;
  const i = vertices.map(() => [0, 0]);
  const o = vertices.map(() => [0, 0]);
  return {
    ind: 0,
    ty: 'sh',
    ix: 1,
    ks: {
      a: 0,
      k: {
        i,
        o,
        v: vertices,
        c: true,
      },
      ix: 2,
    },
    nm: 'Path 1',
    mn: 'ADBE Vector Shape - Group',
    hd: false,
  };
}

/** 正多边形 / 星形 | Polystar: sy 1=star 2=polygon */
function polystar({ sy, pt, x, y, or, ir, rot = 0 }) {
  return {
    ty: 'sr',
    sy,
    d: 1,
    pt: { a: 0, k: pt, ix: 3 },
    p: { a: 0, k: [x, y], ix: 4 },
    r: { a: 0, k: rot, ix: 5 },
    ir: { a: 0, k: ir, ix: 6 },
    is: { a: 0, k: 0, ix: 8 },
    or: { a: 0, k: or, ix: 7 },
    os: { a: 0, k: 0, ix: 9 },
    nm: 'Polystar',
    mn: 'ADBE Vector Shape - Star',
    hd: false,
  };
}

const breathe = {
  o: { a: 0, k: 100, ix: 11 },
  r: { a: 0, k: 0, ix: 10 },
  p: { a: 0, k: [16, 16, 0], ix: 2 },
  a: { a: 0, k: [0, 0, 0], ix: 1 },
  s: {
    a: 1,
    k: [
      {
        i: { x: [0.42, 0.42, 0.667], y: [1, 1, 1] },
        o: { x: [0.58, 0.58, 0.333], y: [0, 0, 0] },
        t: 0,
        s: [90, 90, 100],
      },
      {
        i: { x: [0.42, 0.42, 0.667], y: [1, 1, 1] },
        o: { x: [0.58, 0.58, 0.333], y: [0, 0, 0] },
        t: 60,
        s: [100, 100, 100],
      },
      { t: 120, s: [90, 90, 100] },
    ],
    ix: 6,
  },
};

function buildLottie(nm, shapeGroups) {
  return {
    v: '5.7.4',
    fr: 60,
    ip: 0,
    op: 120,
    w: 32,
    h: 32,
    nm,
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'icon',
        sr: 1,
        ks: breathe,
        ao: 0,
        shapes: shapeGroups,
        ip: 0,
        op: 120,
        st: 0,
        bm: 0,
      },
    ],
    markers: [],
  };
}

/** 各 Material 名 → 形状组列表 */
const ICONS = {
  /** 均衡器三竖条（与转写入口 Material `speech_to_text` 同名资源槽） */
  speech_to_text: [
    gr({ nm: 'b1', it: [rc(2.5, 9, 8, 19.5, 0.5), stroke(2), fill()] }),
    gr({ nm: 'b2', it: [rc(2.5, 12, 16, 18, 0.5), stroke(2), fill()] }),
    gr({ nm: 'b3', it: [rc(2.5, 7, 24, 20.5, 0.5), stroke(2), fill()] }),
  ],
  /** 笔尖 + 笔划 */
  draw: [
    gr({ nm: 'tip', it: [el(5, 5, 22, 11), stroke(1.6), fill()] }),
    gr({ nm: 'line', it: [shOpen([[10, 22], [20, 11]]), stroke(2)] }),
  ],
  /** 双叶脑形轮廓 */
  psychology: [
    gr({ nm: 'l', it: [el(10, 12, 12.5, 16), stroke(1.6)] }),
    gr({ nm: 'r', it: [el(10, 12, 19.5, 16), stroke(1.6)] }),
  ],
  /** 便签纸 + 横线 */
  edit_note: [
    gr({ nm: 'paper', it: [rc(13, 16, 16, 15, 1), stroke(1.6)] }),
    gr({ nm: 'l1', it: [rc(9, 1.2, 16, 11.5, 0.3), fill()] }),
    gr({ nm: 'l2', it: [rc(9, 1.2, 16, 14, 0.3), fill()] }),
    gr({ nm: 'l3', it: [rc(6, 1.2, 16, 16.5, 0.3), fill()] }),
  ],
  /** 打开的书 */
  menu_book: [
    gr({ nm: 'p1', it: [rc(5.5, 13, 12.25, 17.5, 0.5), stroke(1.6), fill()] }),
    gr({ nm: 'p2', it: [rc(5.5, 13, 19.75, 17.5, 0.5), stroke(1.6), fill()] }),
    gr({ nm: 'spine', it: [rc(1, 14, 16, 17.5, 0), fill()] }),
  ],
  /** 地球圈 + 子午线 */
  translate: [
    gr({ nm: 'globe', it: [el(15, 15, 16, 15), stroke(1.6)] }),
    gr({ nm: 'm1', it: [shOpen([[16, 7.5], [16, 22.5]]), stroke(1.4)] }),
    gr({ nm: 'm2', it: [shOpen([[9, 11], [23, 19]]), stroke(1.2)] }),
    gr({ nm: 'm3', it: [shOpen([[9, 19], [23, 11]]), stroke(1.2)] }),
  ],
  /** 书 + 播放三角 */
  auto_stories: [
    gr({ nm: 'book', it: [rc(10, 14, 12, 17, 0.8), stroke(1.6), fill()] }),
    gr({
      nm: 'play',
      it: [shClosed([[20, 12], [26, 16], [20, 20]]), stroke(1.5), fill()],
    }),
  ],
  /** 树：根 + 两子 + 连线 */
  account_tree: [
    gr({ nm: 'root', it: [el(6, 6, 16, 9), stroke(1.5), fill()] }),
    gr({ nm: 'c1', it: [el(5, 5, 10, 21), stroke(1.4), fill()] }),
    gr({ nm: 'c2', it: [el(5, 5, 22, 21), stroke(1.4), fill()] }),
    gr({ nm: 'e1', it: [shOpen([[16, 12], [10, 16.5]]), stroke(1.4)] }),
    gr({ nm: 'e2', it: [shOpen([[16, 12], [22, 16.5]]), stroke(1.4)] }),
  ],
  /** 图书馆：三角顶 + 柱 + 台基 */
  local_library: [
    gr({
      nm: 'roof',
      it: [shClosed([[16, 6], [26, 13], [6, 13]]), stroke(1.5), fill()],
    }),
    gr({ nm: 'col1', it: [rc(2.2, 8, 11, 20.5, 0.3), fill()] }),
    gr({ nm: 'col2', it: [rc(2.2, 8, 16, 20.5, 0.3), fill()] }),
    gr({ nm: 'col3', it: [rc(2.2, 8, 21, 20.5, 0.3), fill()] }),
    gr({ nm: 'base', it: [rc(22, 2.5, 16, 25.5, 0.5), fill()] }),
  ],
  /** 六边形 + 中心圆（齿轮感） */
  settings: [
    gr({
      nm: 'hex',
      it: [polystar({ sy: 2, pt: 6, x: 16, y: 16, or: 9, ir: 9, rot: 0 }), stroke(1.6)],
    }),
    gr({ nm: 'hole', it: [el(5, 5, 16, 16), stroke(1.5)] }),
  ],
  /** 等距盒子：前面 + 顶面 */
  inventory_2: [
    gr({
      nm: 'front',
      it: [shClosed([[9, 13], [23, 13], [23, 24], [9, 24]]), stroke(1.6), fill()],
    }),
    gr({
      nm: 'top',
      it: [shClosed([[9, 13], [16, 8], [23, 13], [16, 18]]), stroke(1.5), fill()],
    }),
  ],
  /** 三层叠板 */
  layers: [
    gr({ nm: 'L1', it: [rc(17, 3.5, 15, 11, 1), stroke(1.4), fill()] }),
    gr({ nm: 'L2', it: [rc(17, 3.5, 16, 16, 1), stroke(1.4), fill()] }),
    gr({ nm: 'L3', it: [rc(17, 3.5, 17, 21, 1), stroke(1.4), fill()] }),
  ],
};

fs.mkdirSync(OUT, { recursive: true });

for (const [name, groups] of Object.entries(ICONS)) {
  const data = buildLottie(`jieyu-left-rail-${name}`, groups);
  fs.writeFileSync(path.join(OUT, `${name}.json`), `${JSON.stringify(data)}\n`, 'utf8');
  console.log('wrote', `${name}.json`);
}
