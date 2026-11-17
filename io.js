/* 檔案讀寫：Excel（.xlsx）／CSV 讀取與寫出。複製自 課程平台/teacher-classroom-helper/io.js（不用 SheetJS，.xlsx 用瀏覽器內建 DecompressionStream 解壓）。 */
(function (root) {
'use strict';

/* ---------- zip ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b){ let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files, type){
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  files.forEach((f) => {
    const nm = enc.encode(f.name), d = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + d.length;
  });
  const cs = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), {type: type || 'application/zip'});
}
function unzip(buf){
  const u = new Uint8Array(buf), dv = new DataView(buf); let e = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 65558); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('不是有效的壓縮檔');
  const n = dv.getUint16(e + 10, true), out = {}, dec = new TextDecoder(); let p = dv.getUint32(e + 16, true);
  for (let k = 0; k < n && dv.getUint32(p, true) === 0x02014b50; k++) {
    const m = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u.subarray(p + 46, p + 46 + nl)), st = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    out[name] = {m, data:u.subarray(st, st + cs)};
    p += 46 + nl + el + cl;
  }
  return out;
}
async function inflate(e){
  if (e.m === 0) return e.data;
  if (typeof DecompressionStream === 'undefined') throw new Error('這個瀏覽器不支援解壓縮，請改用 CSV');
  const s = new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function zipText(z, name){ const e = z[name]; return e ? new TextDecoder().decode(await inflate(e)) : null; }
const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const tags = (el, n) => Array.from(el.getElementsByTagNameNS('*', n));

/* ---------- 讀檔 ---------- */
function decodeText(buf){
  let t; try { t = new TextDecoder('utf-8', {fatal:true}).decode(buf); } catch (e) { t = new TextDecoder('big5').decode(buf); } // 台灣 Excel 存的 CSV 常是 Big5
  return t.replace(/^﻿/, '');
}
function parseCsv(t){
  const rows = []; let row = [], f = '', q = false;
  const sep = (t.split('\n')[0].match(/\t/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === '') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
async function readXlsx(buf){
  const z = unzip(buf);
  let path = 'xl/worksheets/sheet1.xml';
  const wb = await zipText(z, 'xl/workbook.xml'), rels = await zipText(z, 'xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const sh = tags(xml(wb), 'sheet')[0];
    const rid = sh && (sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sh.getAttribute('r:id'));
    const rel = tags(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
    if (rel) { const t = rel.getAttribute('Target'); path = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''); }
  }
  const ssx = await zipText(z, 'xl/sharedStrings.xml');
  const ss = ssx ? tags(xml(ssx), 'si').map((si) => tags(si, 't').filter((t) => t.parentNode === si || t.parentNode.localName === 'r').map((t) => t.textContent).join('')) : [];
  const sx = await zipText(z, path); if (!sx) throw new Error('讀不到工作表');
  const rows = [];
  tags(xml(sx), 'row').forEach((row) => {
    const r = [];
    tags(row, 'c').forEach((c, idx) => {
      const ref = c.getAttribute('r'); let ci = idx;
      if (ref) { ci = 0; for (const ch of ref.replace(/\d+/g, '')) ci = ci * 26 + ch.charCodeAt(0) - 64; ci--; }
      const t = c.getAttribute('t'), v = tags(c, 'v')[0];
      r[ci] = t === 's' ? (ss[+(v && v.textContent)] || '') : t === 'inlineStr' ? tags(c, 't').map((x) => x.textContent).join('') : (v ? v.textContent : '');
    });
    rows.push(Array.from(r, (x) => x == null ? '' : x));
  });
  return rows;
}
async function readFile(file){
  const name = file.name.toLowerCase(), buf = await file.arrayBuffer(), head = new Uint8Array(buf.slice(0, 4));
  if (head[0] === 0xD0 && head[1] === 0xCF) throw new Error('這是舊版 Excel 檔（.xls），請在 Excel 裡「另存新檔」成 .xlsx 或 CSV');
  if (/\.xlsx$|\.xlsm$/.test(name)) return {rows:await readXlsx(buf)};
  if (/\.(csv|tsv|txt)$/.test(name) || file.type.indexOf('text') === 0) return {rows:parseCsv(decodeText(buf))};
  throw new Error('不支援這種檔案，請用 .xlsx、.csv 或 .txt');
}

/* ---------- 寫檔 ---------- */
const xe = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function colName(i){ let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - 1 - m) / 26; } return s; }
function xlsxBlob(rows, sheet, widths){
  const sh = String(sheet || 'Sheet1').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Sheet1';
  const data = rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => v === '' || v == null ? '' :
    typeof v === 'number' ? '<c r="' + colName(ci) + (ri + 1) + '"' + (ri === 0 ? ' s="1"' : '') + '><v>' + v + '</v></c>' :
    '<c r="' + colName(ci) + (ri + 1) + '" t="inlineStr"' + (ri === 0 ? ' s="1"' : '') + '><is><t xml:space="preserve">' + xe(v) + '</t></is></c>').join('') + '</row>').join('');
  const cols = (widths || []).map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('');
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zipStore([
    {name:'[Content_Types].xml', data:X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
    {name:'_rels/.rels', data:X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml', data:X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xe(sh) + '" sheetId="1" r:id="rId1"/></sheets></workbook>'},
    {name:'xl/_rels/workbook.xml.rels', data:X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
    {name:'xl/styles.xml', data:X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="12"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="12"/><name val="Microsoft JhengHei"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
    {name:'xl/worksheets/sheet1.xml', data:X + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' + (cols ? '<cols>' + cols + '</cols>' : '') + '<sheetData>' + data + '</sheetData></worksheet>'},
  ], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
// CSV：UTF-8＋BOM（Excel 才不會亂碼）；0 開頭的學號用 ="0123" 保住前導 0
function csvText(rows){
  const q = (v) => { v = v == null ? '' : String(v); if (/^0\d+$/.test(v)) return '="' + v + '"'; return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
}

/* ---------- 名單解析 ---------- */
const isId = (v) => /^[A-Za-z]{0,3}\d[\dA-Za-z-]*$/.test(String(v || '').trim());

root.TCGIO = {zipStore, unzip, crc32, readFile, readXlsx, parseCsv, decodeText, xlsxBlob, csvText};
})(typeof window !== 'undefined' ? window : globalThis);
