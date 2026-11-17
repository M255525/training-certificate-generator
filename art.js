/* 訓練證書產生器：程式自繪圖形（SVG 字串）——證書框、團花浮水印、印章、版型縮圖。單位都是 mm。 */
(function(root){
'use strict';
const f2 = (n) => Math.round(n * 100) / 100;
const xe = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));

// 沿著一條線段畫多條相位錯開的正弦波（防偽花紋的繩紋效果）
function waveBand(x1, y1, x2, y2, amp, period, phases, step){
  const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(L / period)), per = L / n;
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux, st = step || .8;
  return phases.map((ph) => {
    let d = '';
    for(let s = 0; s <= L + 1e-6; s += st){
      const o = amp * Math.sin(2 * Math.PI * s / per + ph);
      d += (s ? 'L' : 'M') + f2(x1 + ux * s + nx * o) + ' ' + f2(y1 + uy * s + ny * o);
    }
    return d;
  }).join('');
}
// 矩形一圈的繩紋（inset：離紙邊的距離、th：帶寬）
function ropeFrame(W, H, inset, th, period, nph){
  const c = inset + th / 2, a = th / 2 - .25, ph = [];
  for(let i = 0; i < nph; i++) ph.push(i * Math.PI / nph);
  return waveBand(c, c, W - c, c, a, period, ph) + waveBand(W - c, c, W - c, H - c, a, period, ph) +
    waveBand(W - c, H - c, c, H - c, a, period, ph) + waveBand(c, H - c, c, c, a, period, ph);
}
// 團花：多個旋轉的橢圓
function rosette(cx, cy, r, n, ratio, sw, color, op){
  let s = '<g fill="none" stroke="' + color + '" stroke-width="' + sw + '"' + (op != null ? ' opacity="' + op + '"' : '') + '>';
  for(let i = 0; i < n; i++) s += '<ellipse cx="' + f2(cx) + '" cy="' + f2(cy) + '" rx="' + f2(r) + '" ry="' + f2(r * ratio) + '" transform="rotate(' + f2(i * 180 / n) + ' ' + f2(cx) + ' ' + f2(cy) + ')"/>';
  return s + '<circle cx="' + f2(cx) + '" cy="' + f2(cy) + '" r="' + f2(r * ratio * .55) + '"/></g>';
}
// 回紋角飾（L 形折線）
function fretCorner(x, y, sx, sy, u, color, sw){
  const p = [[0, 0], [5, 0], [5, 3], [2, 3], [2, 2], [4, 2], [4, 1], [1, 1], [1, 4], [3, 4], [3, 5], [0, 5], [0, 0]];
  return '<path fill="none" stroke="' + color + '" stroke-width="' + sw + '" d="' + p.map((q, i) => (i ? 'L' : 'M') + f2(x + sx * q[0] * u) + ' ' + f2(y + sy * q[1] * u)).join('') + '"/>';
}

/* ---------- 證書框 ---------- */
function frame(style, W, H, c1, c2){
  let s = '<svg class="frame" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">';
  if(style === 'classic'){
    s += '<rect x="6" y="6" width="' + (W - 12) + '" height="' + (H - 12) + '" fill="none" stroke="' + c1 + '" stroke-width="1.1"/>';
    s += '<path fill="none" stroke="' + c1 + '" stroke-width=".16" d="' + ropeFrame(W, H, 8, 6, 7, 5) + '"/>';
    s += '<rect x="15.2" y="15.2" width="' + (W - 30.4) + '" height="' + (H - 30.4) + '" fill="none" stroke="' + c2 + '" stroke-width=".35"/>';
    s += '<rect x="16.4" y="16.4" width="' + (W - 32.8) + '" height="' + (H - 32.8) + '" fill="none" stroke="' + c1 + '" stroke-width=".15"/>';
    [[11, 11], [W - 11, 11], [11, H - 11], [W - 11, H - 11]].forEach((p) => { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="6.2" style="fill:var(--pp,#fff)"/>' + rosette(p[0], p[1], 5.4, 12, .38, .16, c1); });
  } else if(style === 'navy'){
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none" stroke="' + c1 + '" stroke-width="14"/>';
    s += '<path fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width=".14" d="' + ropeFrame(W, H, .6, 5.8, 5, 4) + '"/>';
    s += '<rect x="9" y="9" width="' + (W - 18) + '" height="' + (H - 18) + '" fill="none" stroke="' + c2 + '" stroke-width=".9"/>';
    s += '<path fill="none" stroke="' + c1 + '" stroke-width=".13" stroke-opacity=".7" d="' + ropeFrame(W, H, 10.5, 4.2, 4.2, 3) + '"/>';
    s += '<rect x="15.6" y="15.6" width="' + (W - 31.2) + '" height="' + (H - 31.2) + '" fill="none" stroke="' + c2 + '" stroke-width=".3"/>';
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach((d) => { const x = d[0] > 0 ? 18 : W - 18, y = d[1] > 0 ? 18 : H - 18; s += fretCorner(x, y, d[0], d[1], 1.6, c2, .35); });
  } else if(style === 'official'){
    s += '<rect x="11" y="11" width="' + (W - 22) + '" height="' + (H - 22) + '" fill="none" stroke="' + c1 + '" stroke-width="1.1"/>';
    s += '<rect x="13.2" y="13.2" width="' + (W - 26.4) + '" height="' + (H - 26.4) + '" fill="none" stroke="' + c1 + '" stroke-width=".3"/>';
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach((d) => { const x = d[0] > 0 ? 15.5 : W - 15.5, y = d[1] > 0 ? 15.5 : H - 15.5; s += fretCorner(x, y, d[0], d[1], 1.3, c2, .3); });
  } else if(style === 'modern'){
    s += '<rect x="0" y="0" width="26" height="' + H + '" fill="' + c1 + '"/>';
    s += '<rect x="26" y="0" width="2.2" height="' + H + '" fill="' + c2 + '"/>';
    s += '<path fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width=".18" d="' + waveBand(13, 0, 13, H, 9, 22, [0, .8, 1.6, 2.4, 3.2]) + '"/>';
    s += '<rect x="36" y="10" width="' + (W - 46) + '" height="' + (H - 20) + '" fill="none" stroke="' + c1 + '" stroke-opacity=".35" stroke-width=".3"/>';
  } else if(style === 'green'){
    const arcs = (cx, cy, sx, sy) => { let a = ''; [46, 38, 30].forEach((r, i) => { a += '<path d="M' + cx + ' ' + (cy + sy * r) + ' A' + r + ' ' + r + ' 0 0 ' + (sx * sy > 0 ? 0 : 1) + ' ' + (cx + sx * r) + ' ' + cy + ' L' + cx + ' ' + cy + 'Z" fill="' + (i === 1 ? c2 : c1) + '" opacity="' + [.18, .35, .9][i] + '"/>'; }); return a; };
    s += arcs(0, 0, 1, 1) + arcs(W, H, -1, -1);
    s += '<rect x="9" y="9" width="' + (W - 18) + '" height="' + (H - 18) + '" fill="none" stroke="' + c1 + '" stroke-width=".5" rx="4"/>';
    s += '<path fill="none" stroke="' + c1 + '" stroke-width=".15" stroke-opacity=".6" d="' + waveBand(48, H - 14, W - 14, H - 14, 1.6, 9, [0, 1.6]) + waveBand(14, 14, W - 48, 14, 1.6, 9, [0, 1.6]) + '"/>';
  } else { // mono
    s += '<rect x="10" y="10" width="' + (W - 20) + '" height="' + (H - 20) + '" fill="none" stroke="#000" stroke-width=".7"/>';
    s += '<rect x="12" y="12" width="' + (W - 24) + '" height="' + (H - 24) + '" fill="none" stroke="#000" stroke-width=".2"/>';
  }
  return s + '</svg>';
}
// 中央浮水印團花
function watermark(style, W, H, c1){
  if(style === 'mono' || style === 'modern') return '';
  const cx = style === 'modern' ? W / 2 + 13 : W / 2, cy = H / 2 + (W > H ? 4 : 10), r = Math.min(W, H) * (style === 'navy' ? .3 : .26);
  return '<svg class="wm" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' + rosette(cx, cy, r, 36, .42, .12, c1, style === 'navy' ? .13 : .1) + rosette(cx, cy, r * .55, 24, .5, .1, c1, .1) + '</svg>';
}

/* ---------- 印章 ---------- */
// 方印：文字由右而左、由上而下直排；kind 'unit'＝大印（粗框）、'head'＝負責人章
function seal(text, kind){
  const chars = Array.from(String(text || '').replace(/\s+/g, '')).slice(0, 16);
  if(!chars.length) return '';
  const n = chars.length, cols = n <= 2 ? n : n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : 4, rows = Math.ceil(n / cols);
  const S = 100, pad = kind === 'unit' ? 11 : 12, cw = (S - pad * 2) / cols, ch = (S - pad * 2) / rows, col = '#C8102E';
  let s = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sr' + kind + '"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.6 1.55"/><feComposite in="SourceGraphic" operator="in"/></filter></defs><g filter="url(#sr' + kind + ')">';
  s += '<rect x="3" y="3" width="94" height="94" rx="' + (kind === 'unit' ? 2 : 5) + '" fill="none" stroke="' + col + '" stroke-width="' + (kind === 'unit' ? 6.5 : 5.5) + '"/>';
  if(kind === 'unit') s += '<rect x="9" y="9" width="82" height="82" fill="none" stroke="' + col + '" stroke-width="1.2"/>';
  chars.forEach((c, i) => {
    const ci = Math.floor(i / rows), ri = i % rows, x = S - pad - cw * (ci + .5), y = pad + ch * (ri + .5);
    const fs = Math.min(cw * 1.02, ch * 1.02);
    s += '<text x="' + f2(x) + '" y="' + f2(y) + '" font-size="' + f2(fs) + '" text-anchor="middle" dominant-baseline="central" fill="' + col + '" font-weight="700" font-family="DFKai-SB,BiauKai,標楷體,LXGW WenKai TC,Noto Serif TC,serif"' + (cw / ch < .8 ? ' transform="translate(' + f2(x) + ' ' + f2(y) + ') scale(' + f2(cw / ch * 1.15) + ' 1) translate(' + f2(-x) + ' ' + f2(-y) + ')"' : ch / cw < .8 ? ' transform="translate(' + f2(x) + ' ' + f2(y) + ') scale(1 ' + f2(ch / cw * 1.15) + ') translate(' + f2(-x) + ' ' + f2(-y) + ')"' : '') + '>' + xe(c) + '</text>';
  });
  return s + '</g></svg>';
}

/* ---------- 版型縮圖 ---------- */
function swatch(style, c1, c2, pp){
  const W = 297, H = 210;
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:100%;display:block;background:' + pp + '" preserveAspectRatio="xMidYMid slice">' + frame(style, W, H, c1, c2).replace(/^<svg[^>]*>|<\/svg>$/g, '') +
    '<rect x="' + (W / 2 - 40) + '" y="62" width="80" height="16" fill="' + c1 + '" opacity=".8"/><rect x="' + (W / 2 - 60) + '" y="100" width="120" height="6" fill="#999"/><rect x="' + (W / 2 - 60) + '" y="114" width="120" height="6" fill="#999"/><rect x="' + (W - 90) + '" y="150" width="30" height="30" fill="#C8102E" opacity=".75"/></svg>';
}
const PALETTE = {
  classic:{pp:'#FBF6E7', tx:'#2B2215', c1:'#A9812A', c2:'#6E5113'},
  official:{pp:'#FFFFFF', tx:'#1A1A1A', c1:'#1A1A1A', c2:'#555555'},
  navy:{pp:'#FDFCF8', tx:'#16243A', c1:'#1F3A68', c2:'#A8862F'},
  modern:{pp:'#FFFFFF', tx:'#1E2A30', c1:'#0F6E68', c2:'#E3B341'},
  green:{pp:'#FAFCF6', tx:'#1F2E22', c1:'#3E7D4F', c2:'#9DC383'},
  mono:{pp:'#FFFFFF', tx:'#000000', c1:'#000000', c2:'#333333'},
};

root.TCGART = {frame, watermark, seal, swatch, rosette, waveBand, PALETTE};
})(typeof window !== 'undefined' ? window : globalThis);
