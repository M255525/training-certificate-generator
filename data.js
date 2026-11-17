/* 訓練證書產生器：純函式引擎（不碰 DOM，node 也能 require 測試）
   日期格式、證書字號、身分證字號檢核／遮罩、發證資格判斷、名單解析、驗證碼（HMAC）、QR 內容編碼、範例。 */
(function(root){
'use strict';

const clone = (o) => JSON.parse(JSON.stringify(o));
const cut = (s, n) => Array.from(String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')).slice(0, n).join('');
const FW = (s) => String(s == null ? '' : s).replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');

/* ---------- 計畫別預設（門檻可改；以各計畫最新規定為準） ---------- */
const PLANS = {
  tims:   {n:'產業人才投資方案', title:'結訓證書', ratio:'2/3', needScore:true, pass:60, result:'經考評成績合格'},
  inhouse:{n:'企業內部訓練', title:'訓練證明書', ratio:'80%', needScore:false, pass:60, result:'完成訓練'},
  seminar:{n:'研習／講座', title:'研習證明書', ratio:'100%', needScore:false, pass:60, result:'全程參與'},
  course: {n:'自辦課程', title:'結業證書', ratio:'2/3', needScore:true, pass:60, result:'成績及格'},
  custom: {n:'其他（自訂）', title:'結訓證書', ratio:'2/3', needScore:false, pass:60, result:'完成訓練'},
};
const PLAN_ORDER = ['tims', 'inhouse', 'seminar', 'course', 'custom'];
const TITLES = ['結訓證書', '結業證書', '訓練證明書', '研習證明書', '修業證明書', '參訓證明書', '時數證明書'];
const EN_TITLES = {'結訓證書':'Certificate of Completion', '結業證書':'Certificate of Completion', '訓練證明書':'Certificate of Training', '研習證明書':'Certificate of Attendance', '修業證明書':'Certificate of Study', '參訓證明書':'Certificate of Participation', '時數證明書':'Certificate of Training Hours'};

const STYLES = {
  classic:{n:'典雅金框', s:'傳統獎狀・米色紙・金色花紋框', orient:'land'},
  official:{n:'公文素雅', s:'白底雙線框・直式・字號在右上', orient:'port'},
  navy:{n:'藍色專業', s:'深藍花紋框・中央徽紋', orient:'land'},
  modern:{n:'現代簡約', s:'左側色帶・放 Logo', orient:'land'},
  green:{n:'清新綠意', s:'綠色弧形角飾・直式', orient:'port'},
  mono:{n:'黑白省墨', s:'只有線條・最省墨水', orient:'land'},
};
const STYLE_ORDER = ['classic', 'official', 'navy', 'modern', 'green', 'mono'];

/* ---------- 日期 ---------- */
const CN = '〇一二三四五六七八九';
function cnNum(n){ // 1～999，證書落款用：一百一十五、十一、二十
  n = Math.floor(n); if(!(n > 0)) return String(n);
  const h = Math.floor(n / 100), t = Math.floor(n % 100 / 10), o = n % 10;
  let s = '';
  if(h) s += CN[h] + '百';
  if(t) s += (t === 1 && !h ? '' : CN[t]) + '十';
  else if(h && o) s += '零';
  if(o) s += CN[o];
  return s;
}
// 接受 2026-11-17、2026/11/17、115/11/17、115.11.17、1151117、Excel 序號 46343
function parseDate(v){
  if(v == null) return '';
  let s = FW(v).trim(); if(!s) return '';
  let y, m, d, mm;
  if(/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000){ const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5); y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate(); }
  else if((mm = s.match(/^(?:民國|中華民國)?\s*(\d{2,4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/))){ y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else if((mm = s.match(/^(\d{2,3})(\d{2})(\d{2})$/))){ y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else if((mm = s.match(/^(\d{4})(\d{2})(\d{2})$/))){ y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else return '';
  if(y < 1000) y += 1911;
  const t = new Date(Date.UTC(y, m - 1, d));
  if(t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d || y < 1900 || y > 2200) return '';
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// fmt：rocc 中華民國一百一十五年十一月十七日／roc 中華民國115年11月17日／rocn 115年11月17日／rocs 115/11/17／ad 2026年11月17日／en November 17, 2026
function fmtDate(iso, fmt){
  const p = parseDate(iso); if(!p) return '';
  const [y, m, d] = p.split('-').map(Number), r = y - 1911;
  switch(fmt){
    case 'rocc': return '中華民國' + cnNum(r) + '年' + cnNum(m) + '月' + cnNum(d) + '日';
    case 'roc': return '中華民國' + r + '年' + m + '月' + d + '日';
    case 'rocs': return r + '/' + String(m).padStart(2, '0') + '/' + String(d).padStart(2, '0');
    case 'ad': return y + '年' + m + '月' + d + '日';
    case 'en': return MON[m - 1] + ' ' + d + ', ' + y;
    default: return r + '年' + m + '月' + d + '日';
  }
}
// 落款用的分欄：['中華民國', '一百一十五', '十一', '十七']
function dateParts(iso, cnStyle){
  const p = parseDate(iso); if(!p) return null;
  const [y, m, d] = p.split('-').map(Number);
  return cnStyle ? [cnNum(y - 1911), cnNum(m), cnNum(d)] : [String(y - 1911), String(m), String(d)];
}
const rocYear = (iso) => { const p = parseDate(iso); return p ? +p.slice(0, 4) - 1911 : ''; };

/* ---------- 證書字號 ---------- */
// 樣板：{年}＝發證日民國年、{號}＝流水號（補零到 digits 位）、{期}＝班別期數文字
function serialNo(tpl, n, opt){
  opt = opt || {};
  const digits = Math.max(1, Math.min(8, +opt.digits || 4));
  return String(tpl || '第{號}號').replace(/\{年\}/g, rocYear(opt.date) || '').replace(/\{期\}/g, opt.term || '').replace(/\{號\}/g, String(Math.max(0, Math.floor(n))).padStart(digits, '0'));
}

/* ---------- 身分證／居留證 ---------- */
const LET = {A:10, B:11, C:12, D:13, E:14, F:15, G:16, H:17, I:34, J:18, K:19, L:20, M:21, N:22, O:35, P:23, Q:24, R:25, S:26, T:27, U:28, V:29, W:32, X:30, Y:31, Z:33};
// 回傳 'ok'（檢查碼正確）／'bad'（格式對但檢查碼錯）／'other'（護照、舊式居留證等無法檢核）／''（空白）
function checkId(v){
  const s = FW(v).trim().toUpperCase().replace(/\s+/g, '');
  if(!s) return '';
  if(!/^[A-Z][0-9]{9}$/.test(s)) return /^[A-Z]{2}[0-9]{8}$/.test(s) || /^[A-Z0-9]{6,12}$/.test(s) ? 'other' : 'bad';
  if('1289'.indexOf(s[1]) < 0) return 'bad';
  const n = LET[s[0]], w = [8, 7, 6, 5, 4, 3, 2, 1, 1];
  let sum = Math.floor(n / 10) + (n % 10) * 9;
  for(let i = 0; i < 9; i++) sum += +s[i + 1] * w[i];
  return sum % 10 === 0 ? 'ok' : 'bad';
}
// mode：full 完整／mask A12****789／hide 不顯示
function maskId(v, mode){
  const s = FW(v).trim().toUpperCase();
  if(!s || mode === 'hide') return '';
  if(mode === 'full' || s.length < 7) return s;
  return s.slice(0, 3) + '*'.repeat(s.length - 6) + s.slice(-3);
}
// 名字遮罩（清冊／QR 用不到，查驗頁顯示用）：王小明→王○明
function maskName(n){ const a = Array.from(String(n || '')); return a.length <= 1 ? a.join('') : a.length === 2 ? a[0] + '○' : a[0] + '○'.repeat(a.length - 2) + a[a.length - 1]; }

/* ---------- 發證資格 ---------- */
function parseRatio(r){
  const s = FW(r).trim();
  let m = s.match(/^(\d+)\s*\/\s*(\d+)$/); if(m && +m[2] > 0) return {num:+m[1], den:+m[2], txt:m[1] + '/' + m[2]};
  m = s.match(/^(\d+(?:\.\d+)?)\s*%?$/); if(m){ const p = Math.min(100, +m[1]); return {num:p, den:100, txt:p + '%'}; }
  return {num:0, den:1, txt:'不限'};
}
const num = (v) => { const s = FW(v).trim().replace(/[,，]/g, ''); return s === '' || isNaN(+s) ? null : +s; };
// row：{name, att, score, include}；course：{hours}；rule：{ratio, needScore, pass}
function eligible(row, course, rule){
  const reasons = [], hours = num(course.hours) || 0, R = parseRatio(rule.ratio);
  if(!String(row.name || '').trim()) reasons.push('沒有姓名');
  const att = num(row.att) == null ? hours : num(row.att);
  if(hours > 0 && R.num > 0 && att * R.den < hours * R.num - 1e-9) reasons.push('出席 ' + att + '／' + hours + ' 小時，未達 ' + R.txt);
  if(hours > 0 && att > hours + 1e-9) reasons.push('出席時數超過課程總時數');
  if(rule.needScore){
    const sc = num(row.score);
    if(sc == null) reasons.push('沒有成績');
    else if(sc < (num(rule.pass) == null ? 60 : num(rule.pass))) reasons.push('成績 ' + sc + ' 未達 ' + (num(rule.pass) == null ? 60 : num(rule.pass)) + ' 分');
  }
  return {ok:!reasons.length, reasons, att};
}

/* ---------- 名單解析 ---------- */
const HEAD = {
  name:/^(學員)?(姓名|名字|中文姓名|學員)$|^name$/i,
  ename:/英文|english|^ename$/i,
  id:/身分證|身份證|統一編號|證號|證件|^id$/i,
  birth:/生日|出生|birth/i,
  att:/出席|參訓時數|上課時數|實到|attend/i,
  score:/成績|分數|考評|score/i,
  note:/備註|note/i,
};
function splitLine(l){
  if(l.indexOf('\t') >= 0) return l.split('\t');
  if(/[｜|]/.test(l)) return l.split(/[｜|]/);
  if(l.indexOf(',') >= 0 || l.indexOf('，') >= 0) return l.split(/[,，]/);
  return l.trim().split(/\s+/);
}
function rowsToRoster(rows){
  rows = (rows || []).map((r) => (r || []).map((c) => String(c == null ? '' : c).trim())).filter((r) => r.some(Boolean));
  if(!rows.length) return [];
  let map = null;
  const h = rows[0], cand = {};
  h.forEach((c, i) => { for(const k in HEAD) if(cand[k] == null && HEAD[k].test(c.replace(/\s/g, ''))) { cand[k] = i; break; } });
  if(cand.name != null){ map = cand; rows = rows.slice(1); }
  else {
    // 沒有標題列：姓名、身分證、出生日期、出席時數、成績（依內容猜：身分證樣子的欄、日期樣子的欄）
    map = {name:0};
    const r0 = rows[0];
    r0.forEach((c, i) => {
      if(i === 0) return;
      if(map.id == null && /^[A-Za-z][A-Za-z0-9]\d{8}$/.test(FW(c))) map.id = i;
      else if(map.birth == null && parseDate(c) && !/^\d{1,3}(\.\d+)?$/.test(c)) map.birth = i;
      else if(map.att == null && num(c) != null) map.att = i;
      else if(map.score == null && num(c) != null) map.score = i;
      else if(map.ename == null && /^[A-Za-z][A-Za-z .,'-]+$/.test(c)) map.ename = i;
    });
  }
  const g = (r, k) => map[k] == null ? '' : (r[map[k]] || '');
  return rows.map((r) => ({
    name:cut(g(r, 'name').replace(/\s+/g, ''), 20), ename:cut(g(r, 'ename'), 40), id:cut(FW(g(r, 'id')).toUpperCase().replace(/\s/g, ''), 14),
    birth:parseDate(g(r, 'birth')), att:cut(g(r, 'att'), 8), score:cut(g(r, 'score'), 6), note:cut(g(r, 'note'), 40), include:true,
  })).filter((x) => x.name).slice(0, 500);
}
function parseRosterText(t){ return rowsToRoster(String(t || '').split(/\r?\n/).map(splitLine)); }
function rosterToText(list){ return ['姓名\t英文姓名\t身分證字號\t出生日期\t出席時數\t成績\t備註'].concat((list || []).map((r) => [r.name, r.ename, r.id, r.birth, r.att, r.score, r.note].map((x) => x == null ? '' : x).join('\t'))).join('\n'); }

/* ---------- 證書文字 ---------- */
const TOKENS = ['姓名', '英文姓名', '身分證', '出生日期', '課程', '英文課程', '班別', '計畫', '起日', '迄日', '時數', '出席時數', '成績', '結果', '單位', '地點', '字號', '發證日'];
// 把 {姓名} 等代入；回傳 [{t:文字} 或 {k:欄位, t:值}] 片段，畫面決定怎麼加強
function fillParts(tpl, vals){
  const out = [], re = /\{([^{}]{1,6})\}/g; let li = 0, m;
  tpl = String(tpl || '');
  while((m = re.exec(tpl))){
    if(m.index > li) out.push({t:tpl.slice(li, m.index)});
    if(Object.prototype.hasOwnProperty.call(vals, m[1])) out.push({k:m[1], t:String(vals[m[1]] == null ? '' : vals[m[1]])});
    else out.push({t:m[0]});
    li = re.lastIndex;
  }
  if(li < tpl.length) out.push({t:tpl.slice(li)});
  return out;
}
const fill = (tpl, vals) => fillParts(tpl, vals).map((p) => p.t).join('');
function vals(ctx, row, no){
  const c = ctx.course, u = ctx.unit, f = ctx.fmt || {};
  const df = f.body || 'rocn', ev = eligible(row, c, ctx.rule);
  return {
    '姓名':row.name, '英文姓名':row.ename || row.name, '身分證':maskId(row.id, f.idMode || 'mask'), '出生日期':fmtDate(row.birth, df),
    '課程':c.name, '英文課程':c.ename || c.name, '班別':c.term || '', '計畫':c.plan ? (PLANS[c.plan] || {}).n || '' : '',
    '起日':fmtDate(c.start, df), '迄日':fmtDate(c.end, df), '時數':c.hours, '出席時數':ev.att, '成績':row.score || '',
    '結果':ctx.rule.result || '', '單位':u.name, '地點':c.place || '', '字號':no || '', '發證日':fmtDate(ctx.cert.date, df),
    '起日E':fmtDate(c.start, 'en'), '迄日E':fmtDate(c.end, 'en'), '發證日E':fmtDate(ctx.cert.date, 'en'), '英文單位':u.ename || u.name,
  };
}
const DEF_BODY = '於{起日}至{迄日}參加本單位辦理之「{課程}」{班別}，訓練時數共計{時數}小時，{結果}，特發此證，以資證明。';
const DEF_EN = 'This is to certify that {英文姓名} has completed the {時數}-hour training course "{英文課程}" held by {英文單位} from {起日E} to {迄日E}.';

/* ---------- 科目表 ---------- */
// 每行「科目｜時數｜講師」，# 開頭略過
function parseSubjects(t){
  return String(t || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== '#').map((l) => {
    const a = splitLine(l).map((x) => x.trim());
    return {s:cut(a[0], 40), h:cut(a[1] || '', 6), tch:cut(a[2] || '', 20)};
  }).filter((x) => x.s).slice(0, 40);
}
const subjectHours = (list) => list.reduce((a, x) => a + (num(x.h) || 0), 0);

/* ---------- 驗證碼與 QR ---------- */
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function b32(bytes, n){ let bits = 0, val = 0, out = ''; for(const b of bytes){ val = (val << 8) | b; bits += 8; while(bits >= 5 && out.length < n){ out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } return out; }
function codeInput(f){ return [f.no, f.name, f.course, f.date, f.hours].map((x) => String(x == null ? '' : x).trim()).join('|'); }
async function verifyCode(secret, f){
  secret = String(secret || ''); if(!secret) return '';
  const enc = new TextEncoder(), C = (root.crypto || globalThis.crypto).subtle;
  const key = await C.importKey('raw', enc.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const sig = new Uint8Array(await C.sign('HMAC', key, enc.encode(codeInput(f))));
  const s = b32(sig, 8); return s.slice(0, 4) + '-' + s.slice(4);
}
function b64u(str){
  const bytes = new TextEncoder().encode(str); let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return (typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s){
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while(s.length % 4) s += '=';
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
// QR 內容只放證書上本來就印的資料，不放身分證字號
function qrPayload(f){ return b64u(JSON.stringify({v:1, u:cut(f.unit, 40), t:cut(f.title, 12), no:cut(f.no, 40), n:cut(f.name, 20), c:cut(f.course, 60), s:f.start || '', e:f.end || '', h:String(f.hours || ''), d:f.date || '', k:f.code || '', tel:cut(f.tel, 30)})); }
function readPayload(s){
  try{
    const o = JSON.parse(unb64u(s)); if(!o || o.v !== 1) return null;
    return {unit:cut(o.u, 40), title:cut(o.t, 12), no:cut(o.no, 40), name:cut(o.n, 20), course:cut(o.c, 60), start:parseDate(o.s), end:parseDate(o.e), hours:cut(o.h, 8), date:parseDate(o.d), code:cut(o.k, 9), tel:cut(o.tel, 30)};
  }catch(e){ return null; }
}

/* ---------- 範例（全部虛構） ---------- */
const EXAMPLES = [
  {id:'tims', ic:'🏭', n:'產投課程範例', s:'虛構協會・門市服務',
    unit:{name:'臺灣示範職業訓練協會', ename:'Taiwan Demo Vocational Training Association', short:'示訓', head:'理事長', headName:'林志遠', tel:'(02)2345-6789', addr:'臺北市中正區示範路 100 號', sealText:'臺灣示範職業訓練協會', sealMode:'gen', headSeal:true},
    course:{plan:'tims', name:'門市服務與顧客關係管理實務班', ename:'Retail Service and Customer Relationship Management', term:'第2期', start:'2026-09-05', end:'2026-10-24', hours:'36', place:'本會301教室',
      subjects:'門市服務禮儀與應對｜6｜陳老師\n顧客需求探詢與溝通｜6｜陳老師\n客訴處理與服務補救｜6｜張老師\n會員經營與 LINE 官方帳號｜9｜張老師\n門市銷售數據分析｜6｜李老師\n成果發表與考評｜3｜李老師'},
    cert:{title:'結訓證書', tpl:'（{年}）示訓字第{號}號', next:1, digits:4, date:'2026-10-31'},
    style:'classic',
    roster:'姓名\t英文姓名\t身分證字號\t出生日期\t出席時數\t成績\n王小明\tWANG XIAO-MING\tA123456789\t1990-05-12\t36\t88\n陳美玲\tCHEN MEI-LING\tB223456782\t1988/11/03\t33\t92\n張大同\tCHANG TA-TUNG\tC134567893\t1995/02/28\t21\t75\n李曉華\tLEE HSIAO-HUA\tD245678908\t79/07/19\t30\t58\n黃志明\tHUANG CHIH-MING\tE156789015\t1992-12-01\t36\t81'},
  {id:'inhouse', ic:'🦺', n:'企業內訓範例', s:'虛構公司・職場安全',
    unit:{name:'示範精密工業股份有限公司', ename:'Demo Precision Industry Co., Ltd.', short:'示精', head:'總經理', headName:'周建宏', tel:'(04)2234-5678', addr:'臺中市西屯區示範大道 8 號', sealText:'示範精密工業股份有限公司', sealMode:'gen', headSeal:true},
    course:{plan:'inhouse', name:'職場安全衛生與緊急應變訓練', ename:'Occupational Safety and Emergency Response Training', term:'', start:'2026-11-10', end:'2026-11-11', hours:'12', place:'二廠訓練教室', subjects:'職業安全衛生法規概要｜3\n機械設備危害預防｜3\n化學品安全與標示｜3\n緊急應變與滅火器操作｜3'},
    cert:{title:'訓練證明書', tpl:'示精訓字第{年}{號}號', next:21, digits:3, date:'2026-11-12'},
    style:'navy',
    roster:'姓名,工號,出席時數\n吳家豪,,12\n蔡佩君,,12\n鄭文傑,,9\n許雅婷,,12'},
  {id:'seminar', ic:'💡', n:'研習證明範例', s:'虛構學會・AI 研習',
    unit:{name:'示範數位教育學會', ename:'Demo Digital Education Society', short:'數教', head:'理事長', headName:'郭怡君', tel:'', addr:'', sealText:'示範數位教育學會', sealMode:'gen', headSeal:false},
    course:{plan:'seminar', name:'AI 辦公室應用研習工作坊', ename:'AI for Office Productivity Workshop', term:'', start:'2026-11-07', end:'2026-11-07', hours:'6', place:'線上', subjects:''},
    cert:{title:'研習證明書', tpl:'數教研字第{號}號', next:101, digits:4, date:'2026-11-07'},
    style:'green',
    roster:'姓名\n劉冠廷\n楊淑芬\n謝承恩'},
];

const DEF = {
  unit:{name:'', ename:'', short:'', head:'理事長', headName:'', tel:'', addr:'', sealText:'', sealMode:'gen', headSeal:true, logo:'', sealImg:'', signImg:''},
  course:{plan:'tims', name:'', ename:'', term:'', start:'', end:'', hours:'', place:'', subjects:''},
  cert:{title:'結訓證書', tpl:'（{年}）訓字第{號}號', next:1, digits:4, date:'', body:DEF_BODY, en:DEF_EN, suffix:'君', secret:''},
  rule:{ratio:'2/3', needScore:true, pass:60, result:'經考評成績合格'},
  fmt:{body:'rocn', foot:'rocc', idMode:'mask', showId:true, showBirth:false, showEn:false, qr:true, subj:'none', font:'kai', showNo:true, onlyOk:true, frame:true},
  style:'classic', orient:'auto', color:'',
};

root.TCG = {clone, cut, FW, PLANS, PLAN_ORDER, TITLES, EN_TITLES, STYLES, STYLE_ORDER, cnNum, parseDate, fmtDate, dateParts, rocYear, serialNo,
  checkId, maskId, maskName, parseRatio, num, eligible, rowsToRoster, parseRosterText, rosterToText, splitLine, TOKENS, fillParts, fill, vals,
  DEF_BODY, DEF_EN, parseSubjects, subjectHours, verifyCode, codeInput, b64u, unb64u, qrPayload, readPayload, EXAMPLES, DEF};
if(typeof module !== 'undefined' && module.exports) module.exports = root.TCG;
})(typeof window !== 'undefined' ? window : globalThis);
