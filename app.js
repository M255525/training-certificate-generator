/* 訓練證書產生器：畫面 */
(function(){
'use strict';
var P = window.TCG, IO = window.TCGIO, ART = window.TCGART, $ = function(id){ return document.getElementById(id); };
var PFX = 'tcg.';
var ONLINE = 'https://m255525.github.io/training-certificate-generator/';
function lsGet(k){ try{ return localStorage.getItem(PFX + k); }catch(e){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(PFX + k, v); return true; }catch(e){ return false; } }
function lsDel(k){ try{ localStorage.removeItem(PFX + k); }catch(e){} }
function lsJson(k, d){ try{ var v = JSON.parse(lsGet(k)); return v == null ? d : v; }catch(e){ return d; } }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
function today(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

/* ---------- 狀態 ---------- */
function merge(saved){
  var D = P.clone(P.DEF), o = saved || {};
  ['unit', 'course', 'cert', 'rule', 'fmt'].forEach(function(k){ D[k] = Object.assign(D[k], o[k] || {}); });
  ['style', 'orient', 'color', 'view', 'keepRoster', 'src', 'mk'].forEach(function(k){ if(o[k] != null) D[k] = o[k]; });
  D.open = Object.assign({ex:true, unit:true, course:false, cert:false, roster:true, look:true}, o.open || {});
  if(!P.STYLES[D.style]) D.style = 'classic';
  if(!D.cert.date) D.cert.date = today();
  return D;
}
var saved = lsJson('state', null);
var S = merge(saved);
var ROSTER = S.keepRoster ? lsJson('roster', []) : [];
var HIST = lsJson('hist', []);
var TPLS = lsJson('tpls', []);
var LAST = [];
var gateOpen = false, VERIFY_MODE = false; // 登入序號閘門；VERIFY_MODE＝從證書 QR 進來的查驗畫面，不需要序號
function save(){
  if(!lsSet('state', JSON.stringify(S))) toast('⚠ 瀏覽器空間不足，圖片可能太大，設定沒有存起來');
  if(S.keepRoster) lsSet('roster', JSON.stringify(ROSTER)); else lsDel('roster');
}
function getPath(p){ var a = p.split('.'), o = S; for(var i = 0; i < a.length - 1; i++) o = o[a[i]]; return o[a[a.length - 1]]; }
function setPath(p, v){ var a = p.split('.'), o = S; for(var i = 0; i < a.length - 1; i++) o = o[a[i]]; o[a[a.length - 1]] = v; }

/* ---------- 共用 ---------- */
function openModal(h){ $('modalBox').innerHTML = h; $('modal').classList.add('show'); }
function closeModal(){ $('modal').classList.remove('show'); if(VERIFY_MODE){ VERIFY_MODE = false; document.body.classList.remove('verify-only'); if(!gateOpen) $('entryGate').classList.remove('hidden'); } }
var toastT;
function toast(s){ var t = document.querySelector('.toast'); if(!t){ t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = s; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function(){ t.hidden = true; }, 3000); }
function download(blob, name){ var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 800); }
function safeName(s){ return String(s || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40); }

/* ---------- 計算：誰發證、字號 ---------- */
function ctx(){ return {unit:S.unit, course:S.course, cert:S.cert, rule:S.rule, fmt:S.fmt}; }
function items(){
  var n = Math.max(0, Math.floor(+S.cert.next || 1)), out = [];
  ROSTER.forEach(function(r, i){
    var ev = P.eligible(r, S.course, S.rule), issue = r.include !== false && (ev.ok || !S.fmt.onlyOk), no = '';
    if(issue){ no = P.serialNo(S.cert.tpl, n, {date:S.cert.date, digits:S.cert.digits, term:S.course.term}); n++; }
    out.push({r:r, i:i, ev:ev, issue:issue, no:no, idc:P.checkId(r.id)});
  });
  return out;
}
function orient(){ return S.orient === 'land' || S.orient === 'port' ? S.orient : P.STYLES[S.style].orient; }
function pal(){ var p = Object.assign({}, ART.PALETTE[S.style]); if(S.color && /^#[0-9a-f]{6}$/i.test(S.color) && S.style !== 'mono') p.c1 = S.color; if(S.fmt.frame === false) p.pp = '#FFFFFF'; return p; }

/* ---------- 證書 HTML ---------- */
function bodySize(len, land){ return land ? (len <= 80 ? 6.3 : len <= 110 ? 5.8 : len <= 150 ? 5.3 : 4.8) : (len <= 70 ? 6 : len <= 100 ? 5.5 : len <= 140 ? 5 : 4.5); }
function sealHtml(kind, size, style){
  var u = S.unit;
  if(kind === 'unit'){
    if(u.sealMode === 'none') return '';
    if(u.sealMode === 'blank') return '<div class="seal blank" style="' + style + 'width:' + size + 'mm;height:' + size + 'mm">用印處</div>';
    if(u.sealMode === 'img' && u.sealImg) return '<div class="seal" style="' + style + 'width:' + size + 'mm;height:' + size + 'mm"><img src="' + u.sealImg + '" alt=""></div>';
    if(u.sealMode === 'img') return '';
    var t = u.sealText || u.name; if(!t) return '';
    return '<div class="seal" style="' + style + 'width:' + size + 'mm;height:' + size + 'mm">' + ART.seal(t, 'unit') + '</div>';
  }
  if(!u.headSeal || !u.headName || u.sealMode === 'none' || u.sealMode === 'blank') return '';
  var nm = Array.from(u.headName.replace(/\s/g, '')), txt = nm.length === 3 ? nm.join('') + '印' : nm.length === 2 ? nm.join('') + '之印' : nm.join('');
  return '<div class="seal" style="' + style + 'width:' + size + 'mm;height:' + size + 'mm">' + ART.seal(txt, 'head') + '</div>';
}
function dateRow(){
  var f = S.fmt.foot || 'rocc', iso = S.cert.date, p = P.parseDate(iso); if(!p) return [];
  if(f === 'en') return [P.fmtDate(iso, 'en')];
  if(f === 'ad'){ var a = p.split('-').map(Number); return ['西元', a[0], '年', a[1], '月', a[2], '日']; }
  var d = P.dateParts(iso, f === 'rocc'); return ['中華民國', d[0], '年', d[1], '月', d[2], '日'];
}
function certHtml(it, idx){
  var r = it.r, c = S.course, u = S.unit, F = S.fmt, land = orient() === 'land', W = land ? 297 : 210, H = land ? 210 : 297, pl = pal();
  var V = P.vals(ctx(), r, it.no), st = S.style, modern = st === 'modern';
  var L = modern ? 44 : land ? 32 : 26, R = land ? 32 : 26;
  var title = S.cert.title || '證書', tsz = (land ? 17 : 15) * (Array.from(title).length > 5 ? .8 : 1);
  var parts = P.fillParts(S.cert.body || P.DEF_BODY, V), len = parts.reduce(function(a, p){ return a + Array.from(p.t).length; }, 0);
  var body = parts.map(function(p){ return p.k === '課程' || p.k === '時數' ? '<b>' + esc(p.t) + '</b>' : esc(p.t); }).join('').replace(/\n/g, '<br>');
  var nmLen = Array.from(r.name).length, nsz = nmLen <= 4 ? (land ? 11 : 10) : nmLen <= 6 ? 9 : 7;
  var h = '<div class="sheet cert ' + (land ? 'land' : 'port') + ' f-' + (F.font || 'kai') + ' st-' + st + '" style="--pp:' + pl.pp + ';--tx:' + pl.tx + ';--c1:' + pl.c1 + ';--c2:' + pl.c2 + '">' +
    (F.frame === false ? '' : ART.watermark(st, W, H, pl.c1) + ART.frame(st, W, H, pl.c1, pl.c2)); // 取消「印邊框與底紋」＝只印文字（現成證書紙用）
  if(F.showNo && it.no) h += '<div class="cno" style="top:' + (st === 'official' ? 20 : 20) + 'mm;right:' + (st === 'official' ? R : R - 6) + 'mm">' + esc(it.no) + '</div>';
  h += '<div class="cin" style="left:' + L + 'mm;right:' + R + 'mm;top:' + (land ? 22 : 40) + 'mm">';
  if(u.logo) h += '<div class="logo"><img src="' + u.logo + '" alt=""></div>'; else h += '<div style="height:' + (land ? 6 : 10) + 'mm"></div>';
  h += '<div class="ttl" style="font-size:' + tsz + 'mm">' + esc(title) + '</div>';
  if(F.showEn) h += '<div class="ettl" style="font-size:' + (land ? 4.6 : 4.2) + 'mm">' + esc(P.EN_TITLES[title] || 'Certificate') + '</div>';
  h += '<div class="nm" style="font-size:' + nsz + 'mm">' + esc(r.name) + (S.cert.suffix ? '<small>' + esc(S.cert.suffix) + '</small>' : '') + '</div>';
  if(F.showEn && r.ename) h += '<div class="ennm">' + esc(r.ename) + '</div>';
  var idl = [];
  if(F.showId && r.id && F.idMode !== 'hide') idl.push('身分證統一編號：' + P.maskId(r.id, F.idMode));
  if(F.showBirth && r.birth) idl.push('出生日期：' + P.fmtDate(r.birth, F.body || 'rocn'));
  if(idl.length) h += '<div class="idl">' + esc(idl.join('　')) + '</div>';
  h += '<p class="txt" style="font-size:' + bodySize(len, land) + 'mm;max-width:' + (land ? 220 : 158) + 'mm">' + body + '</p>';
  if(F.subj === 'below'){
    var sj = P.parseSubjects(c.subjects);
    if(sj.length) h += '<p class="txt" style="font-size:' + (land ? 3.6 : 3.5) + 'mm;text-indent:0;line-height:1.6;margin-top:2mm;max-width:' + (land ? 220 : 158) + 'mm">課程內容：' + esc(sj.map(function(x){ return x.s + (x.h ? '（' + x.h + '小時）' : ''); }).join('、')) + '</p>';
  }
  if(F.showEn) h += '<p class="en" style="max-width:' + (land ? 215 : 158) + 'mm">' + esc(P.fill(S.cert.en || P.DEF_EN, V)) + '</p>';
  h += '</div>';
  // 落款
  var sb = land ? 32 : 52, sr = land ? R + 20 : R + 22;
  h += '<div class="sign" style="right:' + sr + 'mm;bottom:' + sb + 'mm"><div class="who"><div class="u">' + esc(u.name) + '</div>' +
    (u.headName ? '<div style="display:flex;align-items:center">' + esc(u.head || '') + '　' + esc(u.headName) + (u.signImg ? '<img class="sg" src="' + u.signImg + '" alt="">' : '') + sealHtml('head', 12, 'position:relative;display:inline-block;margin-left:2mm;') + '</div>' : '') +
    (u.addr || u.tel ? '<div class="addr">' + esc([u.addr, u.tel].filter(Boolean).join('　')) + '</div>' : '') + '</div>' +
    sealHtml('unit', 28, land ? 'right:-31mm;top:-13mm;' : 'right:-22mm;top:-22mm;') + '</div>';
  if(F.qr) h += '<div class="qr" data-q="' + idx + '" style="left:' + (L - 4) + 'mm;bottom:' + (land ? 29 : 40) + 'mm"><div class="qi"></div><b class="qc"></b>掃描查看證書資料</div>';
  else h += '<div class="qr" data-q="' + idx + '" style="left:' + (L - 4) + 'mm;bottom:' + (land ? 31 : 42) + 'mm"><b class="qc"></b></div>';
  var dr = dateRow();
  h += '<div class="dt" style="left:' + (land ? 62 : 34) + 'mm;right:' + (land ? 62 : 34) + 'mm;bottom:' + (land ? 21 : 26) + 'mm' + (dr.length === 1 ? ';justify-content:center' : '') + '">' + dr.map(function(x){ return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
  if(!it.ev.ok) h += '<div class="tag">未達發證條件（只在預覽顯示）</div>';
  return h + '</div>';
}
function backHtml(){
  var land = orient() === 'land', pl = pal(), sj = P.parseSubjects(S.course.subjects), c = S.course;
  var h = '<div class="sheet backp ' + (land ? 'land' : 'port') + ' f-' + (S.fmt.font || 'kai') + '" style="--pp:' + pl.pp + ';--c1:' + pl.c1 + ';--c2:' + pl.c2 + '"><div class="bin"><h3>課程內容</h3><div class="meta">' + esc(c.name + (c.term ? ' ' + c.term : '')) + '　' + esc(P.fmtDate(c.start, 'rocn') + (c.end && c.end !== c.start ? '～' + P.fmtDate(c.end, 'rocn') : '')) + '　共 ' + esc(c.hours) + ' 小時</div>' +
    '<table><tr><th style="width:12mm">序</th><th>科目</th><th class="h">時數</th>' + (sj.some(function(x){ return x.tch; }) ? '<th style="width:40mm">講師</th>' : '') + '</tr>';
  var hasT = sj.some(function(x){ return x.tch; });
  sj.forEach(function(x, i){ h += '<tr><td>' + (i + 1) + '</td><td>' + esc(x.s) + '</td><td class="h">' + esc(x.h) + '</td>' + (hasT ? '<td>' + esc(x.tch) + '</td>' : '') + '</tr>'; });
  return h + '</table></div></div>';
}
function regHtml(list){
  var c = S.course, u = S.unit, per = 18, pages = Math.max(1, Math.ceil(list.length / per)), out = '', idm = S.fmt.idMode === 'full' ? 'full' : 'mask';
  for(var p = 0; p < pages; p++){
    var h = '<div class="sheet reg port"><div class="rin"><h2>' + esc(S.cert.title || '證書') + '核發清冊</h2><div class="meta">' +
      '<span>辦訓單位：' + esc(u.name) + '</span><span>課程名稱：' + esc(c.name + (c.term ? ' ' + c.term : '')) + '</span>' +
      '<span>訓練期間：' + esc(P.fmtDate(c.start, 'rocn') + '～' + P.fmtDate(c.end, 'rocn')) + '</span><span>訓練時數：' + esc(c.hours) + ' 小時</span>' +
      '<span>發證日期：' + esc(P.fmtDate(S.cert.date, 'rocn')) + '</span><span>發證條件：出席 ' + esc(P.parseRatio(S.rule.ratio).txt) + (S.rule.needScore ? '、成績 ' + esc(S.rule.pass) + ' 分以上' : '') + '</span></div>' +
      '<table><tr><th style="width:9mm">序</th><th>證書字號</th><th style="width:22mm">姓名</th><th style="width:28mm">身分證字號</th><th style="width:20mm">出生日期</th><th style="width:13mm">出席<br>時數</th><th style="width:11mm">成績</th><th style="width:30mm">備註</th><th style="width:18mm">簽收</th></tr>';
    list.slice(p * per, p * per + per).forEach(function(it, k){
      h += '<tr><td>' + (p * per + k + 1) + '</td><td class="l" style="white-space:nowrap;font-size:3mm">' + esc(it.no || '—') + '</td><td>' + esc(it.r.name) + '</td><td>' + esc(P.maskId(it.r.id, idm)) + '</td><td>' + esc(P.fmtDate(it.r.birth, 'rocs')) + '</td><td>' + esc(it.ev.att) + '</td><td>' + esc(it.r.score) + '</td><td class="l" style="font-size:2.7mm">' + esc(it.issue ? (it.r.note || '') : '未發證：' + it.ev.reasons.join('；')) + '</td><td></td></tr>';
    });
    h += '</table>' + (p === pages - 1 ? '<div class="ft"><span>承辦人：</span><span>單位主管：</span><span>' + esc(u.head || '負責人') + '：</span></div><p style="font-size:3mm;color:#555;margin-top:4mm">共 ' + list.length + ' 人，發證 ' + list.filter(function(x){ return x.issue; }).length + ' 人。</p>' : '') + '</div><div class="pg">第 ' + (p + 1) + '／' + pages + ' 頁</div></div>';
    out += h;
  }
  return out;
}

/* ---------- 預覽 ---------- */
var FILLTOK = 0, PENDING = Promise.resolve();
function renderSheets(){
  var el = $('sheets'); if(!el) return;
  var all = items(), list = all.filter(function(x){ return x.issue; }), h = '';
  LAST = [];
  if(S.view === 'reg'){
    h = all.filter(function(x){ return x.r.include !== false; }).length ? regHtml(all.filter(function(x){ return x.r.include !== false; })) : '';
  } else {
    var back = S.fmt.subj === 'back' && P.parseSubjects(S.course.subjects).length;
    list.forEach(function(it){
      LAST.push({no:it.no, name:it.r.name, course:S.course.name, date:S.cert.date, hours:S.course.hours, start:S.course.start, end:S.course.end});
      h += certHtml(it, LAST.length - 1); if(back) h += backHtml();
    });
  }
  el.innerHTML = h || '<div class="empty-pv">' + (ROSTER.length ? '目前沒有符合發證條件的學員。看「4 學員名單」裡每個人的狀態。' : '先在左邊「4 學員名單」貼上名單，或點一個範例。') + '</div>';
  renderBar(all, list);
  fillAsync();
}
function renderBar(all, list){
  var b = $('pvbar'); if(!b) return;
  var inc = all.filter(function(x){ return x.r.include !== false; }).length;
  b.innerHTML = '<div class="vt" role="tablist"><button role="tab" data-view="certs" aria-selected="' + (S.view !== 'reg') + '">📜 證書 ' + list.length + ' 張</button><button role="tab" data-view="reg" aria-selected="' + (S.view === 'reg') + '">📋 核發清冊 ' + inc + ' 人</button></div><span class="sp"></span>' +
    '<label class="small" style="color:#fff">縮放 <input type="range" id="zoom" min="20" max="100" value="' + Math.round(zoomVal() * 100) + '"></label>' +
    '<button class="btn gd" data-act="print"' + ((S.view === 'reg' ? inc : list.length) ? '' : ' disabled') + '>🖨 列印／存 PDF</button>';
}
function zoomVal(){ var z = +lsGet('zoom'); if(z) return z; var w = ($('sheetsWrap') || {}).clientWidth || 800; return Math.max(.2, Math.min(1, (w - 30) / (S.view !== 'reg' && orient() === 'land' ? 1123 : 794))); }
function applyZoom(){ var el = $('sheets'); if(el) el.style.setProperty('--z', zoomVal()); }
var CODES = {}, QRS = {}, qrLib = null;
function codeFor(f){
  var sec = S.cert.secret || ''; if(!sec) return Promise.resolve('');
  var k = sec + '\u0001' + P.codeInput(f); if(CODES[k] != null) return Promise.resolve(CODES[k]);
  return P.verifyCode(sec, f).then(function(c){ CODES[k] = c; return c; });
}
function loadQR(){
  if(window.QRCode) return Promise.resolve();
  if(!qrLib) qrLib = new Promise(function(ok, no){ var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = ok; s.onerror = function(){ qrLib = null; no(new Error('QR 元件載入失敗（需要網路）')); }; document.head.appendChild(s); });
  return qrLib;
}
function qrData(text){
  if(QRS[text]) return QRS[text];
  var d = document.createElement('div'); d.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(d);
  try{ new window.QRCode(d, {text:text, width:400, height:400, correctLevel:window.QRCode.CorrectLevel.L}); var cv = d.querySelector('canvas'); QRS[text] = cv ? cv.toDataURL('image/png') : (d.querySelector('img') || {}).src || ''; }
  catch(e){ QRS[text] = ''; }
  d.remove(); return QRS[text];
}
function fillAsync(){
  var tok = ++FILLTOK, jobs = [];
  document.querySelectorAll('#sheets [data-q]').forEach(function(el){
    var f = LAST[+el.dataset.q]; if(!f) return;
    jobs.push(codeFor(f).then(function(code){
      if(tok !== FILLTOK) return;
      var ce = el.querySelector('.qc'); if(ce) ce.textContent = code ? '驗證碼 ' + code : '';
      if(!S.fmt.qr) return;
      return loadQR().then(function(){
        if(tok !== FILLTOK) return;
        var url = ONLINE + '#v=' + P.qrPayload(Object.assign({}, f, {code:code, unit:S.unit.name, title:S.cert.title, tel:S.unit.tel}));
        var src = qrData(url), qi = el.querySelector('.qi'); if(qi && src) qi.innerHTML = '<img src="' + src + '" alt="QR">';
      });
    }));
  });
  PENDING = Promise.all(jobs).catch(function(e){ toast('⚠ ' + e.message); });
}
var rT;
function refreshSoon(){ clearTimeout(rT); rT = setTimeout(function(){ renderSheets(); updateSums(); }, 220); }

/* ---------- 版面骨架 ---------- */
function render(){
  $('app').innerHTML = '<div class="top noprint"><h1><span class="sealmini" aria-hidden="true"><span>證</span><span>訓</span><span>書</span><span>結</span></span>訓練證書產生器 <small>辦訓單位的結訓證書・研習證明</small></h1>' +
    '<button class="ibtn lictop" id="licTop" data-act="settings" hidden></button><button class="ibtn" data-act="hist">🗂 發證紀錄</button><button class="ibtn" data-act="verify">🔍 查驗證書</button><a class="ibtn" href="manual.html">📖 操作手冊</a><button class="ibtn" data-act="settings" aria-label="常用設定">⚙</button></div>' +
    '<p class="warn-line noprint">發證門檻請依各計畫最新規定；名單只在這台電腦處理、不上傳。<button data-act="warn">⚠ 使用警語</button></p>' +
    '<div class="work"><div class="panel noprint" id="panel"></div><div class="pv"><div class="pvbar noprint" id="pvbar"></div><div id="sheetsWrap"><div id="sheets"></div></div></div></div>' + footer();
  renderPanel(); renderSheets(); applyZoom(); showLicTop();
}
function footer(){
  return '<footer class="foot noprint">👤 創作者 Mark Tsai（蔡豐全）<a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a><br><a href="manual.html">📖 操作手冊</a><a href="#" data-act="warn">⚠ 使用警語</a>' +
    (standalone ? '' : '<a href="#" data-act="install">📲 加入主畫面</a>') +
    '<br><img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.trainingcertificategenerator" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle;margin-top:.4rem"></footer>';
}
function card(id, no, title, sv, body){ return '<details class="card" data-card="' + id + '"' + (S.open[id] ? ' open' : '') + '><summary><span class="no">' + no + '</span>' + title + '<span class="sv" data-sv="' + id + '">' + esc(sv) + '</span></summary><div class="cb">' + body + '</div></details>'; }
function inp(path, label, o){
  o = o || {}; var v = getPath(path); v = v == null ? '' : v;
  return '<label class="fld">' + label + (o.hint ? '<span class="hint">' + o.hint + '</span>' : '') + '<input data-b="' + path + '" value="' + esc(v) + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + ' maxlength="' + (o.max || 60) + '"' + (o.mode ? ' inputmode="' + o.mode + '"' : '') + '></label>';
}
function sel(path, label, opts, rp){ var v = String(getPath(path)); return '<label class="fld">' + label + '<select data-b="' + path + '"' + (rp ? ' data-rp="1"' : '') + '>' + opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>'; }
function chk(path, label, rp){ return '<label class="chk"><input type="checkbox" data-b="' + path + '"' + (getPath(path) ? ' checked' : '') + (rp ? ' data-rp="1"' : '') + '>' + label + '</label>'; }
function imgBox(k, label){ var v = S.unit[k]; return '<div class="imgbox">' + label + (v ? '<img src="' + v + '" alt="">' : '<span class="ph">＋</span>') + '<label>' + (v ? '換一張' : '上傳圖片') + '<input type="file" accept="image/png,image/jpeg,image/webp" data-img="' + k + '" hidden></label>' + (v ? '<button data-delimg="' + k + '">移除</button>' : '') + '</div>'; }

function sums(){
  var all = items(), ok = all.filter(function(x){ return x.issue; }).length;
  return {
    ex:S.src ? (P.EXAMPLES.filter(function(e){ return e.id === S.src; })[0] || {}).n || S.src : '',
    unit:S.unit.name || '尚未填寫', course:(S.course.name || '尚未填寫') + (S.course.hours ? '・' + S.course.hours + 'h' : ''),
    cert:S.cert.title + '・' + P.serialNo(S.cert.tpl, +S.cert.next || 1, {date:S.cert.date, digits:S.cert.digits, term:S.course.term}),
    roster:ROSTER.length ? ROSTER.length + ' 人・發證 ' + ok : '尚無名單', look:P.STYLES[S.style].n + '・' + (orient() === 'land' ? '橫式' : '直式') + (S.fmt.frame === false ? '・只印文字' : ''),
  };
}
function updateSums(){ var s = sums(); Object.keys(s).forEach(function(k){ var e = document.querySelector('[data-sv="' + k + '"]'); if(e) e.textContent = s[k]; }); }

function renderPanel(){
  var el = $('panel'); if(!el) return;
  var s = sums(), u = S.unit, c = S.course;
  var h = '';
  // 0 範例與範本
  h += card('ex', '例', '範例與我的範本', s.ex,
    '<p class="small">點範例看看完成的樣子（單位、人名全部虛構）。改成自己的單位後可以「存成範本」，下次開課直接套用。</p>' +
    '<div class="exs" style="margin-top:.4rem">' + P.EXAMPLES.map(function(e){ return '<button class="btn alt sm" data-ex="' + e.id + '">' + e.ic + ' ' + esc(e.n) + '</button>'; }).join('') + '<button class="btn alt sm" data-act="blank">📄 空白開始</button></div>' +
    '<div class="row2"><label class="fld">我的範本<select id="tplSel"><option value="">（' + TPLS.length + ' 個）</option>' + TPLS.map(function(t, i){ return '<option value="' + i + '">' + esc(t.name) + '</option>'; }).join('') + '</select></label>' +
    '<div class="fld">&nbsp;<div class="go" style="margin-top:.15rem"><button class="btn sm" data-act="tplLoad">套用</button><button class="btn alt sm" data-act="tplDel">刪除</button></div></div></div>' +
    '<div class="go"><button class="btn alt sm" data-act="tplSave">💾 目前設定存成範本</button><button class="btn alt sm" data-act="exportProj">⬇ 匯出設定檔</button><label class="btn alt sm" style="cursor:pointer">⬆ 開啟設定檔<input type="file" id="projFile" accept=".json,application/json" hidden></label></div>' +
    '<p class="small">範本包含單位、課程、證書格式、版型與圖片，<b>不含學員名單</b>。</p>');
  // 1 單位
  h += card('unit', '一', '發證單位', s.unit,
    inp('unit.name', '單位全銜', {ph:'例如：社團法人臺灣○○協會', max:40}) + inp('unit.ename', '英文名稱（中英對照才會用到）', {max:80}) +
    '<div class="row2">' + inp('unit.head', '負責人職稱', {ph:'理事長／總經理／校長', max:10}) + inp('unit.headName', '負責人姓名', {max:12}) + '</div>' +
    '<div class="row2">' + inp('unit.tel', '聯絡電話（選填，印在落款下方與 QR）', {max:30}) + inp('unit.addr', '地址（選填）', {max:60}) + '</div>' +
    sel('unit.sealMode', '單位印章', [['gen', '程式產生示意印章'], ['img', '上傳印章圖檔（建議去背 PNG）'], ['blank', '留「用印處」框，列印後親自蓋章'], ['none', '不印章']], true) +
    (u.sealMode === 'gen' ? inp('unit.sealText', '印章文字', {hint:'預設用單位全銜，由右而左直排', ph:u.name, max:16}) : '') +
    chk('unit.headSeal', '負責人小章（依負責人姓名產生）') +
    '<div class="imgs">' + imgBox('logo', 'Logo') + (u.sealMode === 'img' ? imgBox('sealImg', '印章圖檔') : '<div class="imgbox" style="opacity:.5">印章圖檔<span class="ph">—</span><span class="small">上方選「上傳印章圖檔」</span></div>') + imgBox('signImg', '負責人簽名') + '</div>' +
    '<p class="small">⚠ 程式產生的印章只是排版示意。正式證書請上傳貴單位的印信圖檔，或選「留用印處」列印後親自用印。</p>');
  // 2 課程
  var sj = P.parseSubjects(c.subjects), sh = P.subjectHours(sj), hrs = P.num(c.hours);
  h += card('course', '二', '課程資料', s.course,
    sel('course.plan', '計畫別（選了會套用建議的發證門檻）', P.PLAN_ORDER.map(function(k){ return [k, P.PLANS[k].n]; }), true) +
    inp('course.name', '課程名稱', {max:50}) + inp('course.ename', '英文課程名稱（選填）', {max:100}) +
    '<div class="row2">' + inp('course.term', '班別／期別（選填）', {ph:'第2期', max:16}) + inp('course.hours', '訓練總時數', {mode:'decimal', max:6}) + '</div>' +
    '<div class="row2">' + inp('course.start', '開訓日期', {type:'date'}) + inp('course.end', '結訓日期', {type:'date'}) + '</div>' +
    inp('course.place', '上課地點（選填）', {max:40}) +
    '<label class="fld">科目與時數（選填，印在證書下方或背面）<span class="hint">每行「科目｜時數｜講師」，可從 Excel 複製貼上</span><textarea data-b="course.subjects" rows="5" spellcheck="false">' + esc(c.subjects) + '</textarea></label>' +
    (sj.length && hrs && Math.abs(sh - hrs) > 1e-9 ? '<div class="alert warn">科目時數合計 ' + sh + ' 小時，和總時數 ' + hrs + ' 小時不一樣，請確認。</div>' : '') +
    (c.start && c.end && c.end < c.start ? '<div class="alert bad">結訓日期比開訓日期早。</div>' : ''));
  // 3 規則與證書
  var tOpts = P.TITLES.map(function(t){ return [t, t]; }); if(P.TITLES.indexOf(S.cert.title) < 0) tOpts.push([S.cert.title, S.cert.title]);
  h += card('cert', '三', '發證條件與證書文字', s.cert,
    '<div class="row3">' + inp('rule.ratio', '出席門檻', {hint:'2/3、80%、100%', max:8}) + '<div>' + chk('rule.needScore', '要看成績', true) + '</div>' + (S.rule.needScore ? inp('rule.pass', '及格分數', {mode:'decimal', max:5}) : '<div></div>') + '</div>' +
    '<p class="small">預設門檻：' + esc(P.PLANS[c.plan] ? P.PLANS[c.plan].n : '') + '。<b>請依計畫最新規定調整</b>，本工具不做法規解釋。</p>' +
    inp('rule.result', '結果用語（代入 {結果}）', {ph:'經考評成績合格', max:20}) +
    '<div class="row2">' + sel('cert.title', '證書名稱', tOpts) + inp('cert.titleCustom', '或自訂名稱', {ph:'輸入後按 Enter', max:10}) + '</div>' +
    inp('cert.tpl', '證書字號樣板', {hint:'{年}＝發證日的民國年、{號}＝流水號、{期}＝班別', max:40}) +
    '<div class="row3">' + inp('cert.next', '起始流水號', {mode:'numeric', max:8}) + inp('cert.digits', '補零位數', {mode:'numeric', max:1}) + inp('cert.date', '發證日期', {type:'date'}) + '</div>' +
    '<div class="row2">' + inp('cert.suffix', '姓名後面的稱謂', {ph:'君／同學／（空白）', max:4}) + '</div>' +
    '<label class="fld">證書本文<textarea id="tBody" data-b="cert.body" rows="4">' + esc(S.cert.body) + '</textarea></label>' +
    '<div class="tokens" data-for="tBody">' + ['起日', '迄日', '課程', '班別', '時數', '出席時數', '成績', '結果', '單位', '計畫', '地點'].map(function(t){ return '<button data-tok="{' + t + '}">{' + t + '}</button>'; }).join('') + '</div>' +
    (S.fmt.showEn ? '<label class="fld">英文本文<textarea id="tEn" data-b="cert.en" rows="3">' + esc(S.cert.en) + '</textarea></label><div class="tokens" data-for="tEn">' + ['英文姓名', '英文課程', '英文單位', '時數', '起日E', '迄日E', '發證日E'].map(function(t){ return '<button data-tok="{' + t + '}">{' + t + '}</button>'; }).join('') + '</div>' : '') +
    '<div class="go"><button class="btn alt sm" data-act="resetBody">↺ 還原預設本文</button></div>' +
    inp('cert.secret', '單位密語（產生 QR 驗證碼用）', {hint:'自己設一組不外流的密語；查驗時輸入同一組才驗得過。留空＝不印驗證碼', type:'password', max:40}) +
    (S.cert.secret === 'DEMO' ? '<div class="alert warn">目前是範例密語 DEMO，正式使用前請改成自己的。</div>' : ''));
  // 4 名單
  var all = items(), okN = all.filter(function(x){ return x.issue; }).length, badId = all.filter(function(x){ return x.idc === 'bad'; }).length, noN = all.filter(function(x){ return x.r.include !== false && !x.ev.ok; }).length;
  var rows = all.map(function(x){
    var r = x.r;
    return '<tr' + (r.include === false ? ' class="off"' : '') + '><td><input type="checkbox" data-inc="' + x.i + '"' + (r.include !== false ? ' checked' : '') + ' aria-label="發證"></td><td><b>' + esc(r.name) + '</b>' + (r.ename ? '<br><small>' + esc(r.ename) + '</small>' : '') + '</td><td>' + esc(P.maskId(r.id, 'mask')) + (x.idc === 'bad' ? ' <span class="idb bad" title="檢查碼不對，請核對">檢查碼錯</span>' : x.idc === 'other' ? ' <span class="idb other">外籍／其他</span>' : '') + '</td><td>' + esc(P.num(r.att) == null ? '（全勤）' : r.att) + '</td><td>' + esc(r.score) + '</td><td class="st">' + (x.ev.ok ? '<span class="ok">✓ 可發證</span>' : '<span class="ng">✗ ' + esc(x.ev.reasons.join('；')) + '</span>') + '</td><td>' + esc(x.no) + '</td></tr>';
  }).join('');
  h += card('roster', '四', '學員名單', s.roster,
    '<p class="small">從 Excel 複製整個表格貼上（第一列是標題最好）：<b>姓名、英文姓名、身分證字號、出生日期、出席時數、成績、備註</b>，只有姓名是必填。出席時數空白＝全勤。</p>' +
    '<label class="fld">貼上名單<textarea id="rText" rows="6" spellcheck="false" placeholder="姓名\t身分證字號\t出席時數\t成績">' + esc(ROSTER.length ? P.rosterToText(ROSTER) : '') + '</textarea></label>' +
    '<div class="go"><button class="btn" data-act="applyRoster">✔ 套用名單</button><label class="btn alt" style="cursor:pointer">⬆ 開啟 Excel／CSV<input type="file" id="rFile" accept=".xlsx,.csv,.txt,.tsv" hidden></label>' + (MK ? '<button class="btn alt" data-act="mkPick">📥 從課程專案帶入</button>' : '') + '<button class="btn alt sm" data-act="rosterTpl">⬇ 名單範本 .xlsx</button><button class="btn alt sm" data-act="clearRoster">🗑 清空</button></div>' +
    chk('keepRoster', '在這台電腦記住名單（公用電腦不要勾）', true) +
    (ROSTER.length ? '<div class="stat"><span>共 ' + ROSTER.length + ' 人</span><span class="g">發證 ' + okN + ' 人</span>' + (noN ? '<span class="r">未達條件 ' + noN + ' 人</span>' : '') + (badId ? '<span class="r">身分證檢查碼錯 ' + badId + ' 人</span>' : '') + '</div>' +
      '<div class="tw"><table class="rs"><tr><th>發</th><th>姓名</th><th>身分證</th><th>出席</th><th>成績</th><th>狀態</th><th>字號</th></tr>' + rows + '</table></div>' +
      chk('fmt.onlyOk', '只印符合發證條件的人', true) : ''));
  // 5 版型
  var p0 = ART.PALETTE;
  h += card('look', '五', '版型與列印', s.look,
    '<div class="styles">' + P.STYLE_ORDER.map(function(k){ var p = p0[k]; return '<button class="sty" data-style="' + k + '" aria-pressed="' + (S.style === k) + '"><span class="sw">' + ART.swatch(k, p.c1, p.c2, p.pp) + '</span><b>' + esc(P.STYLES[k].n) + '</b><small>' + esc(P.STYLES[k].s) + '</small></button>'; }).join('') + '</div>' +
    '<div class="row3">' + sel('orient', '方向', [['auto', '依版型'], ['land', '橫式'], ['port', '直式']], true) + sel('fmt.font', '字體', [['kai', '楷書'], ['ming', '明體'], ['hei', '黑體']]) +
    '<label class="fld">主色<input type="color" data-b="color" value="' + esc(S.color || pal().c1) + '"' + (S.style === 'mono' ? ' disabled' : '') + '></label></div>' +
    (S.color ? '<div class="go" style="margin-top:.2rem"><button class="btn alt sm" data-act="resetColor">↺ 版型原色</button></div>' : '') +
    '<div class="row2">' + sel('fmt.body', '本文日期格式', [['rocn', '115年11月17日'], ['roc', '中華民國115年11月17日'], ['ad', '2026年11月17日']]) + sel('fmt.foot', '落款日期', [['rocc', '中華民國一百一十五年…'], ['roc', '中華民國115年…'], ['ad', '西元2026年…'], ['en', 'November 17, 2026']]) + '</div>' +
    chk('fmt.showId', '印身分證字號', true) + (S.fmt.showId ? sel('fmt.idMode', '身分證字號顯示', [['mask', '遮罩 A12****789（建議）'], ['full', '完整顯示'], ['hide', '不顯示']]) : '') +
    chk('fmt.frame', '印邊框與底紋（取消勾選＝只印文字，印在現成的證書紙上）') + chk('fmt.showBirth', '印出生日期') + chk('fmt.showNo', '印證書字號') + chk('fmt.showEn', '中英對照（英文標題、英文姓名、英文本文）', true) + chk('fmt.qr', 'QR code（掃描看證書資料＋驗證碼）') +
    sel('fmt.subj', '科目表', [['none', '不印'], ['below', '印在本文下方（一行列出）'], ['back', '另印背面一頁（雙面列印）']]) +
    '<div class="go"><button class="btn gd big" data-act="print">🖨 列印／存 PDF</button><button class="btn alt" data-act="printTips">📋 列印小提醒</button></div>' +
    '<div class="go"><button class="btn alt sm" data-act="regXlsx">⬇ 核發清冊 .xlsx</button><button class="btn alt sm" data-act="regCsv">⬇ 清冊 CSV</button><button class="btn sm" data-act="issue">✅ 確認發證（記錄字號）</button></div>' +
    '<p class="small">印好、核對無誤後按「確認發證」，字號會記到「🗂 發證紀錄」，下一批從下一號接著編。</p>');
  el.innerHTML = h;
}

/* ---------- 事件 ---------- */
var lastTa = 'tBody';
document.addEventListener('input', function(e){
  var t = e.target;
  if(t.id === 'zoom'){ lsSet('zoom', +t.value / 100); applyZoom(); return; }
  if(!t.dataset || !t.dataset.b || t.type === 'checkbox' || t.tagName === 'SELECT') return;
  var p = t.dataset.b;
  if(p === 'cert.titleCustom') return;
  setPath(p, t.value); save(); refreshSoon();
});
document.addEventListener('change', function(e){
  var t = e.target;
  if(t.dataset && t.dataset.b && (t.type === 'checkbox' || t.tagName === 'SELECT')){
    var p = t.dataset.b, v = t.type === 'checkbox' ? t.checked : t.value;
    setPath(p, v);
    if(p === 'course.plan'){ var pl = P.PLANS[v]; S.rule = {ratio:pl.ratio, needScore:pl.needScore, pass:pl.pass, result:pl.result}; S.cert.title = pl.title; toast('已套用「' + pl.n + '」建議門檻：出席 ' + pl.ratio + (pl.needScore ? '、成績及格' : '') + '，請依計畫規定確認'); }
    save(); if(t.dataset.rp || p === 'course.plan') renderPanel(); else updateSums(); renderSheets(); return;
  }
  if(t.dataset && t.dataset.b === 'cert.titleCustom'){ var v2 = t.value.trim(); if(v2){ S.cert.title = v2; save(); renderPanel(); renderSheets(); } return; }
  if(t.dataset && t.dataset.b && t.type !== 'checkbox'){ if(t.dataset.b === 'course.subjects' || t.dataset.b === 'course.start' || t.dataset.b === 'course.end' || t.dataset.b === 'course.hours'){ renderPanel(); } return; }
  if(t.dataset && t.dataset.inc != null){ ROSTER[+t.dataset.inc].include = t.checked; save(); renderPanel(); renderSheets(); return; }
  if(t.dataset && t.dataset.img){ readImg(t.files[0], t.dataset.img); return; }
  if(t.id === 'rFile' && t.files[0]){ IO.readFile(t.files[0]).then(function(d){ setRoster(P.rowsToRoster(d.rows)); }).catch(function(err){ toast('⚠ ' + err.message); }); return; }
  if(t.id === 'mkFile' && t.files[0]){ var mf = new FileReader(); mf.onload = function(){ t.value = ''; var r = MKCourse.fromText(mf.result); if(r.error){ toast('⚠ ' + r.error); return; } var last = null; r.docs.forEach(function(x){ last = MK.store.put(x) || last; }); if(!last){ toast('⚠ 存不進這台電腦（瀏覽器空間不足或封鎖網站資料）'); return; } if(r.docs.length === 1) mkAsk(last.id); else openModal(mkPickHtml()); }; mf.readAsText(t.files[0]); return; }
  if(t.id === 'projFile' && t.files[0]){ var fr = new FileReader(); fr.onload = function(){ try{ var o = JSON.parse(fr.result); if(o.app !== 'training-certificate-generator') throw new Error('不是本工具的設定檔'); applyData(o.data || {}); if(Array.isArray(o.roster)) setRoster(o.roster.map(function(r){ return Object.assign({include:true}, r); })); toast('已開啟設定檔'); }catch(err){ toast('⚠ ' + err.message); } }; fr.readAsText(t.files[0]); }
});
document.addEventListener('focusin', function(e){ if(e.target.id === 'tBody' || e.target.id === 'tEn') lastTa = e.target.id; });
document.addEventListener('toggle', function(e){ var d = e.target; if(d.classList && d.classList.contains('card')){ S.open[d.dataset.card] = d.open; save(); } }, true);
document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeModal(); if(e.key === 'Enter' && e.target.dataset && e.target.dataset.b === 'cert.titleCustom'){ e.target.blur(); } });
document.addEventListener('click', function(e){
  var t = e.target.closest('[data-act],[data-ex],[data-style],[data-view],[data-tok],[data-delimg],[data-fontsize],[data-hist]');
  if(e.target === $('modal')){ closeModal(); return; }
  if(!t) return;
  if(t.tagName === 'A' && t.dataset.act) e.preventDefault();
  if(t.dataset.ex){ loadExample(t.dataset.ex); return; }
  if(t.dataset.style){ S.style = t.dataset.style; save(); renderPanel(); renderSheets(); applyZoom(); return; }
  if(t.dataset.view){ S.view = t.dataset.view; save(); renderSheets(); return; }
  if(t.dataset.tok){ insertTok(t.dataset.tok, t.parentNode.dataset.for || lastTa); return; }
  if(t.dataset.delimg){ S.unit[t.dataset.delimg] = ''; save(); renderPanel(); renderSheets(); return; }
  if(t.dataset.fontsize){ lsSet('fs', t.dataset.fontsize); applyView(); openSettings(); return; }
  if(t.dataset.hist != null && t.dataset.hk){ HACT[t.dataset.hk](+t.dataset.hist); return; }
  var a = ACT[t.dataset.act]; if(a) a(t);
});
function insertTok(tok, id){
  var ta = $(id); if(!ta) return;
  var s = ta.selectionStart == null ? ta.value.length : ta.selectionStart, en = ta.selectionEnd == null ? s : ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + tok + ta.value.slice(en); ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.length;
  setPath(ta.dataset.b, ta.value); save(); refreshSoon();
}
function readImg(file, key){
  if(!file) return;
  if(file.size > 8 * 1024 * 1024){ toast('圖片太大（超過 8MB）'); return; }
  var fr = new FileReader();
  fr.onload = function(){
    var im = new Image();
    im.onload = function(){
      var max = key === 'logo' ? 600 : 500, k = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement('canvas');
      cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      S.unit[key] = cv.toDataURL('image/png'); save(); renderPanel(); renderSheets(); toast('圖片已放上證書');
    };
    im.onerror = function(){ toast('讀不到這張圖片'); };
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function setRoster(list){
  ROSTER = list.slice(0, 500); save(); renderPanel(); renderSheets();
  var bad = ROSTER.filter(function(r){ return P.checkId(r.id) === 'bad'; }).length;
  toast(ROSTER.length ? '讀到 ' + ROSTER.length + ' 位學員' + (bad ? '，' + bad + ' 位身分證檢查碼不對，請核對' : '') : '沒有讀到姓名，請確認第一欄是姓名或有「姓名」標題');
}
function applyData(d){
  var keepRoster = S.keepRoster, open = S.open, view = S.view;
  S = merge(Object.assign({}, d, {open:open, view:view, keepRoster:keepRoster}));
  save(); renderPanel(); renderSheets(); applyZoom();
}
function loadExample(id){
  var e = P.EXAMPLES.filter(function(x){ return x.id === id; })[0]; if(!e) return;
  var pl = P.PLANS[e.course.plan];
  var d = {unit:Object.assign({}, P.DEF.unit, e.unit), course:Object.assign({}, P.DEF.course, e.course), cert:Object.assign({}, P.DEF.cert, e.cert, {secret:'DEMO'}),
    rule:{ratio:pl.ratio, needScore:pl.needScore, pass:pl.pass, result:pl.result}, fmt:Object.assign({}, S.fmt, {showEn:id === 'tims', subj:id === 'tims' ? 'back' : 'none', qr:true}), style:e.style, orient:'auto', color:'', src:id};
  applyData(d); setRoster(P.parseRosterText(e.roster));
}
/* ---------- 課程專案（course-link.js；沒有也照常運作） ---------- */
var MK = window.MKCourse && window.MKCourse.store ? window.MKCourse : null;
function mkPickHtml(){
  var list = MK.store.list();
  return '<h2>📥 從課程專案帶入</h2><p class="small">課程專案是同一台電腦上各辦訓工具共用的課程與名單。出席簽到 QR 按「📤 存到課程專案」後，這裡就能帶入名單、身分證字號和每個人的出席時數。</p>' +
    (list.length ? '<div class="go" style="flex-direction:column;align-items:stretch">' + list.map(function(d){ return '<button class="btn alt" data-act="mkIn" data-id="' + esc(d.id) + '">' + esc(MKCourse.label(d)) + ' <small>' + esc(MKCourse.when(d)) + (S.mk === d.id ? '・目前連結' : '') + '</small></button>'; }).join('') + '</div>' : '<p>這台電腦還沒有課程專案。</p>') +
    '<div class="go"><label class="btn alt" style="cursor:pointer">📂 開啟課程專案檔（.json）<input type="file" id="mkFile" accept=".json,application/json" hidden></label><button class="btn alt" data-act="close">取消</button></div>';
}
var MKPICK = null;
function mkAsk(id){
  var d = MK.store.get(id); if(!d){ toast('找不到這個課程專案'); return; }
  MKPICK = id;
  var att = d.results['attendance-qr'];
  openModal('<h2>📥 帶入「' + esc(d.course.title) + '」</h2><p>會換掉：課程名稱、班別、開結訓日期、訓練總時數、地點' + (d.course.org ? '、單位名稱' : '') + '' + (d.students.length ? '，以及<b>整份學員名單（' + d.students.length + ' 人）</b>' : '。課程專案還沒有學員名單，<b>目前名單保留</b>') + '。證書版型、本文、字號設定不動。</p>' +
    (!d.students.length ? '' : att ? '<p class="small">出席時數：來自出席簽到 QR（' + esc(MKCourse.when({updated:att.updated})) + ' 更新，應到 ' + esc(att.planned) + ' 小時）。</p>' : '<div class="alert warn">這個課程專案還沒有出席時數。帶入後出席欄是空白，<b>空白會當作全勤</b>，請自己補上或先到出席簽到 QR 存一次。</div>') +
    '<div class="go"><button class="btn" data-act="mkOk">帶入</button><button class="btn alt" data-act="close">取消</button></div>');
}
function mkApply(){
  var d = MK.store.get(MKPICK); if(!d){ closeModal(); return; }
  var c = d.course, att = d.results['attendance-qr'], hrs = att && att.hours || {};
  ['name', 'term', 'start', 'end', 'place'].forEach(function(k){ var v = c[k === 'name' ? 'title' : k]; if(v) S.course[k] = v; });
  if(c.hours !== '') S.course.hours = String(c.hours);
  if(c.org) S.unit.name = c.org;
  S.mk = d.id;
  closeModal(); save();
  if(!d.students.length){ renderPanel(); renderSheets(); toast('已帶入課程資料（課程專案還沒有名單，目前名單保留）'); return; }
  setRoster(d.students.map(function(s){ var k = MKCourse.studentKey(s); return {sid:s.sid || '', name:s.name, ename:s.ename || '', id:s.idNo || '', birth:s.birth || '', att:hrs[k] != null ? String(hrs[k]) : '', score:s.score != null ? String(s.score) : '', note:'', include:true}; }));
}
function mkMarkIssued(list){
  if(!MK || !S.mk || !MK.store.get(S.mk)) return;
  var old = (MK.store.get(S.mk).results['training-certificate'] || {}).issued || {}, issued = Object.assign({}, old);
  list.forEach(function(x){ issued[MKCourse.studentKey({sid:x.r.sid, name:x.r.name})] = {no:x.no, date:S.cert.date}; });
  MK.store.save(S.mk, {result:{issued:issued}}, 'training-certificate');
}
function tplData(){ return {unit:S.unit, course:S.course, cert:S.cert, rule:S.rule, fmt:S.fmt, style:S.style, orient:S.orient, color:S.color}; }

var ACT = {
  close:closeModal, settings:function(){ openSettings(); }, warn:function(){ showWarn(); }, install:function(){ install(); },
  blank:function(){ applyData({cert:{date:today()}}); ROSTER = []; save(); renderPanel(); renderSheets(); toast('已換成空白設定'); },
  applyRoster:function(){ setRoster(P.parseRosterText($('rText').value)); },
  clearRoster:function(){ ROSTER = []; save(); renderPanel(); renderSheets(); toast('名單已清空'); },
  rosterTpl:function(){ download(IO.xlsxBlob([['姓名', '英文姓名', '身分證字號', '出生日期', '出席時數', '成績', '備註'], ['（範例）王小明', 'WANG XIAO-MING', 'A123456789', '1990-05-12', 36, 88, '']], '學員名單', [12, 20, 14, 12, 10, 8, 16]), '學員名單範本.xlsx'); },
  resetBody:function(){ S.cert.body = P.DEF_BODY; S.cert.en = P.DEF_EN; save(); renderPanel(); renderSheets(); },
  resetColor:function(){ S.color = ''; save(); renderPanel(); renderSheets(); },
  tplSave:function(){
    var name = (S.unit.name || '未命名') + '・' + (S.course.name || S.cert.title);
    openModal('<h2>💾 存成範本</h2><label class="fld">範本名稱<input id="tplName" maxlength="40" value="' + esc(name) + '"></label><p class="small">存在這台電腦的瀏覽器，最多 20 個；不含學員名單。</p><div class="stack"><button class="btn" data-act="tplSaveYes">儲存</button><button class="btn alt" data-act="close">取消</button></div>');
  },
  tplSaveYes:function(){
    var n = $('tplName').value.trim() || '未命名', i = TPLS.findIndex(function(t){ return t.name === n; }), item = {name:n, data:P.clone(tplData())};
    if(i >= 0) TPLS[i] = item; else { if(TPLS.length >= 20){ toast('範本最多 20 個'); return; } TPLS.push(item); }
    if(!lsSet('tpls', JSON.stringify(TPLS))) toast('⚠ 空間不足，請把圖片換小一點'); else toast('已存成範本「' + n + '」');
    closeModal(); renderPanel();
  },
  tplLoad:function(){ var i = $('tplSel').value; if(i === ''){ toast('先選一個範本'); return; } applyData(P.clone(TPLS[+i].data)); toast('已套用「' + TPLS[+i].name + '」'); },
  tplDel:function(){ var i = $('tplSel').value; if(i === ''){ toast('先選一個範本'); return; } var n = TPLS[+i].name; TPLS.splice(+i, 1); lsSet('tpls', JSON.stringify(TPLS)); renderPanel(); toast('已刪除「' + n + '」'); },
  exportProj:function(){
    openModal('<h2>⬇ 匯出設定檔</h2><p>把單位、課程、證書格式、版型、圖片存成一個 .json 檔，可以在另一台電腦開啟。</p>' + (ROSTER.length ? '<label class="chk"><input type="checkbox" id="expRoster">一起匯出學員名單（含個資，請小心保管）</label>' : '') + '<label class="chk"><input type="checkbox" id="expSecret">包含單位密語</label><div class="stack"><button class="btn" data-act="exportYes">下載</button><button class="btn alt" data-act="close">取消</button></div>');
  },
  exportYes:function(){
    var d = P.clone(tplData()); if(!($('expSecret') || {}).checked) d.cert.secret = '';
    var o = {app:'training-certificate-generator', v:1, data:d}; if(($('expRoster') || {}).checked) o.roster = ROSTER;
    download(new Blob([JSON.stringify(o, null, 1)], {type:'application/json'}), '證書設定_' + safeName(S.course.name || S.unit.name) + '.json'); closeModal();
  },
  print:function(){
    var all = items(), n = S.view === 'reg' ? all.filter(function(x){ return x.r.include !== false; }).length : all.filter(function(x){ return x.issue; }).length;
    if(!n){ toast('沒有可以列印的內容'); return; }
    var bad = all.filter(function(x){ return x.issue && x.idc === 'bad'; }).length;
    if(bad) toast('提醒：' + bad + ' 位的身分證檢查碼不對，印之前請核對');
    toast('準備列印中…'); PENDING.then(function(){ setTimeout(function(){ window.print(); }, 150); });
  },
  printTips:function(){ openModal('<h2>📋 列印小提醒</h2><ol><li>紙張選 <b>A4</b>，縮放選 <b>100%／實際大小</b>，邊界選<b>無</b>；勾選<b>背景圖形</b>，花紋框和底色才印得出來。</li><li>橫式版型會自動用橫向頁面；如果你的印表機沒有自動轉向，請在列印對話框把「版面配置」改成橫向。</li><li>要存成 PDF：印表機選「另存為 PDF」。</li><li>有「背面科目表」時：選<b>雙面列印</b>（橫式選短邊翻頁、直式選長邊翻頁），先印一張試試。</li><li>證書建議用 150～200 磅的證書紙或象牙卡紙；有底紋的現成證書紙可選「黑白省墨」版型只印文字與框。</li><li>選「留用印處」的話，印好再親自蓋單位印信。</li></ol><div class="stack"><button class="btn" data-act="close">知道了</button></div>'); },
  regXlsx:function(){ var r = regRows(); if(r.length < 2){ toast('還沒有名單'); return; } download(IO.xlsxBlob(r, '核發清冊', [6, 24, 12, 14, 12, 10, 8, 10, 30, 12]), '核發清冊_' + safeName(S.course.name) + '.xlsx'); },
  regCsv:function(){ var r = regRows(); if(r.length < 2){ toast('還沒有名單'); return; } download(new Blob([IO.csvText(r)], {type:'text/csv'}), '核發清冊_' + safeName(S.course.name) + '.csv'); },
  issue:function(){
    var list = items().filter(function(x){ return x.issue; });
    if(!list.length){ toast('沒有要發證的學員'); return; }
    var dup = HIST.some(function(b){ return b.rows.some(function(r){ return r.no === list[0].no; }); });
    openModal('<h2>✅ 確認發證</h2><p>這一批共 <b>' + list.length + '</b> 張：<br>' + esc(list[0].no) + (list.length > 1 ? ' ～ ' + esc(list[list.length - 1].no) : '') + '</p>' + (dup ? '<div class="alert warn">發證紀錄裡已經有「' + esc(list[0].no) + '」，可能會重號，請確認起始流水號。</div>' : '') + '<p class="small">紀錄只存字號、姓名、身分證遮罩、驗證碼，存在這台電腦。記錄後起始流水號會改成 ' + (+S.cert.next + list.length) + '。</p><div class="stack"><button class="btn" data-act="issueYes">確認並記錄</button><button class="btn alt" data-act="close">取消</button></div>');
  },
  issueYes:function(){
    var list = items().filter(function(x){ return x.issue; });
    Promise.all(list.map(function(x){ return codeFor({no:x.no, name:x.r.name, course:S.course.name, date:S.cert.date, hours:S.course.hours}); })).then(function(codes){
      HIST.unshift({t:Date.now(), unit:S.unit.name, title:S.cert.title, course:S.course.name, term:S.course.term, start:S.course.start, end:S.course.end, hours:S.course.hours, date:S.cert.date,
        rows:list.map(function(x, i){ return {no:x.no, name:x.r.name, id:P.maskId(x.r.id, 'mask'), code:codes[i]}; })});
      HIST = HIST.slice(0, 200); lsSet('hist', JSON.stringify(HIST));
      mkMarkIssued(list);
      S.cert.next = +S.cert.next + list.length; save(); closeModal(); renderPanel(); renderSheets(); toast('已記錄 ' + list.length + ' 張，下一號從 ' + S.cert.next + ' 開始');
    });
  },
  hist:function(){ openHist(); },
  mkPick:function(){ openModal(mkPickHtml()); },
  mkIn:function(t){ mkAsk(t.dataset.id); },
  mkOk:function(){ mkApply(); },
  logout:function(){ closeModal(); gateLogout(); },
  verify:function(){ openVerify(null); },
  verifyGo:function(){ verifyGo(); },
  wipeAll:function(){ openModal('<h2>確定嗎？</h2><p>單位與課程設定、圖片、名單、我的範本、發證紀錄都會刪掉，無法復原（字體設定保留）。</p><div class="stack"><button class="btn red" data-act="wipeAllYes">清除全部資料</button><button class="btn alt" data-act="close">取消</button></div>'); },
  wipeAllYes:function(){ var keep = {fs:1, fold:1, warnSeen:1, marquee:1}; try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf(PFX) === 0 && !keep[k.slice(PFX.length)]) localStorage.removeItem(k); }); }catch(e){} location.hash = ''; location.reload(); },
  wipeRoster:function(){ ROSTER = []; S.keepRoster = false; save(); closeModal(); renderPanel(); renderSheets(); toast('名單已清除'); },
  foldall:function(){ var all = document.querySelectorAll('.set-sec'), any = [].some.call(all, function(d){ return !d.open; }); all.forEach(function(d){ d.open = any; }); }
};
function regRows(){
  var idm = S.fmt.idMode === 'full' ? 'full' : 'mask';
  return [['序號', '證書字號', '姓名', '身分證字號', '出生日期', '出席時數', '成績', '是否發證', '說明', '課程']].concat(items().filter(function(x){ return x.r.include !== false; }).map(function(x, i){
    return [i + 1, x.no, x.r.name, P.maskId(x.r.id, idm), P.fmtDate(x.r.birth, 'rocs'), x.ev.att === '' ? '' : x.ev.att, x.r.score, x.issue ? '發證' : '未發證', x.issue ? x.r.note || '' : x.ev.reasons.join('；'), S.course.name + (S.course.term ? ' ' + S.course.term : '')];
  }));
}

/* ---------- 發證紀錄 ---------- */
var HACT = {
  csv:function(i){ var b = HIST[i]; download(new Blob([IO.csvText([['證書字號', '姓名', '身分證字號（遮罩）', '驗證碼', '課程', '發證日期']].concat(b.rows.map(function(r){ return [r.no, r.name, r.id, r.code, b.course + (b.term ? ' ' + b.term : ''), P.fmtDate(b.date, 'rocs')]; })))], {type:'text/csv'}), '發證紀錄_' + safeName(b.course) + '.csv'); },
  del:function(i){ HIST.splice(i, 1); lsSet('hist', JSON.stringify(HIST)); openHist(); toast('已刪除這一批紀錄'); },
};
function openHist(){
  var h = '<h2>🗂 發證紀錄</h2><p class="small">按「確認發證」的批次會記在這裡（只存在這台電腦）。最多 200 批。</p>';
  if(!HIST.length) h += '<div class="alert warn">還沒有紀錄。</div>';
  HIST.forEach(function(b, i){
    h += '<div class="vcard"><b>' + esc(b.course + (b.term ? ' ' + b.term : '')) + '</b><br><span class="small">' + esc(P.fmtDate(b.date, 'rocn')) + ' 發證・' + b.rows.length + ' 張・' + esc(b.rows[0].no) + (b.rows.length > 1 ? ' ～ ' + esc(b.rows[b.rows.length - 1].no) : '') + '</span>' +
      '<details><summary class="small" style="cursor:pointer">名單</summary><div class="tw"><table class="rs"><tr><th>字號</th><th>姓名</th><th>身分證</th><th>驗證碼</th></tr>' + b.rows.map(function(r){ return '<tr><td>' + esc(r.no) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.id) + '</td><td>' + esc(r.code || '—') + '</td></tr>'; }).join('') + '</table></div></details>' +
      '<div class="go"><button class="btn alt sm" data-hist="' + i + '" data-hk="csv">⬇ CSV</button><button class="btn alt sm" data-hist="' + i + '" data-hk="del">🗑 刪除</button></div></div>';
  });
  openModal(h + '<div class="stack"><button class="btn" data-act="close">關閉</button></div>');
}

/* ---------- 查驗 ---------- */
var VDATA = null;
function openVerify(d){
  VDATA = d;
  var h = '<h2>🔍 查驗證書</h2>';
  if(d){
    h += '<p class="small">以下是證書 QR code 裡的資料：</p><div class="vcard"><dl><dt>發證單位</dt><dd>' + esc(d.unit) + '</dd><dt>證書</dt><dd>' + esc(d.title) + '</dd><dt>證書字號</dt><dd>' + esc(d.no) + '</dd><dt>姓名</dt><dd>' + esc(d.name) + '</dd><dt>課程</dt><dd>' + esc(d.course) + '</dd>' + (d.start ? '<dt>訓練期間</dt><dd>' + esc(P.fmtDate(d.start, 'rocn') + (d.end && d.end !== d.start ? '～' + P.fmtDate(d.end, 'rocn') : '')) + '</dd>' : '') + '<dt>時數</dt><dd>' + esc(d.hours) + ' 小時</dd><dt>發證日期</dt><dd>' + esc(P.fmtDate(d.date, 'rocn')) + '</dd><dt>驗證碼</dt><dd>' + esc(d.code || '（未設定）') + '</dd></dl></div>' +
      '<div class="alert warn">這只是 QR code 裡記載的內容，<b>不代表證書一定是真的</b>。要確認真偽，請比對紙本證書是否一致，並向發證單位查詢' + (d.tel ? '（電話 ' + esc(d.tel) + '）' : '') + '。</div>' +
      '<p style="margin-top:.8rem"><b>我是發證單位：</b>輸入單位密語檢查驗證碼。</p>';
  } else {
    h += '<p class="small">發證單位用：輸入證書上的資料與單位密語，檢查驗證碼是否相符。也可以直接用手機掃證書上的 QR code。</p>' +
      '<div class="row2"><label class="fld">證書字號<input id="vNo" maxlength="40"></label><label class="fld">姓名<input id="vName" maxlength="20"></label></div>' +
      '<div class="row2"><label class="fld">課程名稱<input id="vCourse" maxlength="60" value="' + esc(S.course.name) + '"></label><label class="fld">訓練時數<input id="vHours" maxlength="6" value="' + esc(S.course.hours) + '"></label></div>' +
      '<div class="row2"><label class="fld">發證日期<input id="vDate" type="date" value="' + esc(S.cert.date) + '"></label><label class="fld">證書上的驗證碼<input id="vCode" maxlength="9" placeholder="XXXX-XXXX"></label></div>';
  }
  h += '<label class="fld">單位密語<input id="vSecret" type="password" maxlength="40" value="' + esc(S.cert.secret || '') + '"></label><div class="go"><button class="btn" data-act="verifyGo">檢查</button></div><div id="vOut"></div>';
  var hit = d && HIST.filter(function(b){ return b.rows.some(function(r){ return r.no === d.no; }); })[0];
  if(hit){ var rr = hit.rows.filter(function(r){ return r.no === d.no; })[0]; h += '<div class="alert ' + (rr.name === d.name ? 'ok' : 'bad') + '">這台電腦的發證紀錄：' + esc(rr.no) + ' 發給「' + esc(rr.name) + '」（' + esc(P.fmtDate(hit.date, 'rocn')) + '）' + (rr.name === d.name ? '，姓名相符。' : '，<b>姓名不符！</b>') + '</div>'; }
  openModal(h + '<div class="stack"><button class="btn alt" data-act="close">關閉</button></div>');
}
function verifyGo(){
  var d = VDATA, f = d ? {no:d.no, name:d.name, course:d.course, date:d.date, hours:d.hours, code:d.code} : {no:$('vNo').value.trim(), name:$('vName').value.trim(), course:$('vCourse').value.trim(), date:$('vDate').value, hours:$('vHours').value.trim(), code:$('vCode').value.trim().toUpperCase()};
  var sec = $('vSecret').value, out = $('vOut');
  if(!sec){ out.innerHTML = '<div class="alert warn">請輸入單位密語。</div>'; return; }
  if(!f.code){ out.innerHTML = '<div class="alert warn">沒有驗證碼可以比對。</div>'; return; }
  P.verifyCode(sec, f).then(function(c){
    out.innerHTML = c === f.code ? '<div class="alert ok">✓ 驗證碼相符：這組資料是用這個密語發出的。</div>' : '<div class="alert bad">✗ 驗證碼不符：資料被改過、密語不對，或不是這個單位發的。</div>';
  });
}

/* ---------- 警語、設定、安裝 ---------- */
var WARN_HTML = '<h2>⚠ 使用警語</h2><ul>' +
  '<li>本工具只協助排版、計算出席率與編號。<b>發證條件（出席門檻、成績）請依各計畫最新規定與主管機關公告</b>，內建的預設門檻僅供參考，不是法規解釋；政府計畫若規定證書格式或須由系統核發，以計畫規定為準。</li>' +
  '<li>證書上的單位名稱、負責人、印信必須是<b>貴單位的真實資料</b>。不得冒用其他機關、學校或單位名義，也不得製作未實際參訓的證書；偽造、變造證書可能觸犯偽造文書等刑責。</li>' +
  '<li>「程式產生的印章」只是排版示意，不是印信。正式證書請上傳貴單位的印信圖檔，或列印後親自用印。</li>' +
  '<li>學員名單含個資（身分證字號、出生日期）：<b>只在你的瀏覽器處理、不會上傳</b>；預設不記住名單。請依個人資料保護法的蒐集目的使用，公用電腦用完請到 ⚙ 清除資料。</li>' +
  '<li>QR 驗證碼是用單位密語算出來的檢查碼，可以協助發證單位查驗，但<b>不是電子簽章</b>，也沒有線上資料庫。密語外流的話，別人也算得出驗證碼。</li>' +
  '<li>範例中的單位、人名、身分證字號全部虛構。列印前請逐張核對姓名、字號、時數與日期。</li></ul>';
function showWarn(){ openModal(WARN_HTML + '<div class="stack"><button class="btn" data-act="close">我知道了</button></div>'); }
function sec(id, title, val, body){ return '<details class="set-sec" data-sec="' + id + '"><summary><span class="sst">' + title + '</span><span class="ssv">' + esc(val) + '</span></summary><div class="set-body">' + body + '</div></details>'; }
function openSettings(){
  var h = '<div class="top"><h2 style="flex:1 1 0">⚙ 常用設定</h2><button class="btn alt" data-act="foldall">全部展開／收合</button></div>' +
    sec('view', '顯示', lsGet('fs') === 'xl' ? '大字' : '標準字', '<div class="stack"><button class="btn' + (lsGet('fs') === 'xl' ? ' alt' : '') + '" data-fontsize="m">標準字</button><button class="btn' + (lsGet('fs') === 'xl' ? '' : ' alt') + '" data-fontsize="xl">大字</button></div><p class="small">只影響操作畫面，不影響證書。</p>') +
    sec('lic', '登入序號', gateOpen ? (gateExp(LICINFO) ? '到期日 ' + expText(gateExp(LICINFO)) : '已登入') : '', '<span id="licBadge" class="lic ' + gateInfo.cls + '">' + esc(gateInfo.text) + '</span><div><span id="headcountBadge" class="lic ' + gateInfo.hcls + '">' + esc(gateInfo.head) + '</span></div><div class="stack"><button class="btn alt" data-act="logout">登出</button></div><p class="small">登出後這台電腦要重新輸入序號；單位設定、範本、發證紀錄不會刪掉。</p>') +
    sec('tpl', '我的範本', TPLS.length + ' 個', '<p class="small">在「例 範例與我的範本」管理。</p>') +
    sec('hist', '發證紀錄', HIST.length + ' 批', '<div class="stack"><button class="btn alt" data-act="hist">🗂 打開發證紀錄</button></div>') +
    sec('privacy', '🔒 清除名單', ROSTER.length + ' 人', '<p class="small">只清掉學員名單（含個資），單位與課程設定保留。</p><div class="stack"><button class="btn red" data-act="wipeRoster">清除名單</button></div>') +
    sec('wipe', '🧹 清除全部資料', '', '<p class="small">清掉設定、圖片、名單、範本、發證紀錄。字體設定保留。</p><div class="stack"><button class="btn red" data-act="wipeAll">清除全部資料</button></div>') +
    sec('about', '關於本工具', '', '<p>👤 創作者 Mark Tsai（蔡豐全）<br><a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a></p><div class="stack"><a class="btn alt" href="manual.html">📖 操作手冊</a><a class="btn alt" href="manual.html#creator">👤 創作者資訊</a><button class="btn alt" data-act="warn">⚠ 使用警語</button>' +
      (standalone ? '' : '<button class="btn alt" data-act="install">📲 加入主畫面</button>') + '</div><p class="small" style="margin-top:.5rem">訪客數 <img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.trainingcertificategenerator" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle"></p>') +
    '<div class="stack"><button class="btn" data-act="close">關閉</button></div>';
  openModal(h);
  var open = lsJson('fold', []);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.open = open.indexOf(d.dataset.sec) >= 0; d.addEventListener('toggle', saveFold); });
}
function saveFold(){ var o = []; document.querySelectorAll('.set-sec').forEach(function(d){ if(d.open) o.push(d.dataset.sec); }); lsSet('fold', JSON.stringify(o)); }
function applyView(){ document.documentElement.dataset.fs = lsGet('fs') === 'xl' ? 'xl' : 'm'; }
function install(){
  if(window._dp){ window._dp.prompt(); window._dp = null; return; }
  openModal('<h2>📲 加入主畫面</h2><ul><li><b>電腦（Chrome／Edge）</b>：網址列右邊的安裝圖示。</li><li><b>iPhone／iPad（Safari）</b>：「分享」→「加入主畫面」。</li><li><b>Android（Chrome）</b>：右上角「⋮」→「安裝應用程式」。</li></ul><div class="stack"><button class="btn" data-act="close">知道了</button></div>');
}

/* ---------- 跑馬燈（工作區共用公告，不可關） ---------- */
function initMarquee(){
  var URL_ = "https://script.google.com/macros/s/AKfycbwKX0DNNbY8y4nf90BFTHtxgfqJcHHcZasRrgycl4QAe52_hkjMWSkYk4xOsqU-JPCROw/exec";
  var REFRESH = 20 * 60 * 1000, bar = $('marqueeBar'), track = $('marqueeTrack'), lastKey = null;
  function appendText(c, text){ var re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, li = 0, m; while((m = re.exec(text))){ if(m.index > li) c.appendChild(document.createTextNode(text.slice(li, m.index))); var a = document.createElement('a'); a.href = m[2]; a.textContent = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = 'inherit'; a.style.textDecoration = 'underline'; c.appendChild(a); li = re.lastIndex; } if(li < text.length) c.appendChild(document.createTextNode(text.slice(li))); }
  function renderM(items){
    if(!items || !items.length) return;
    var k = JSON.stringify(items); if(k === lastKey) return; lastKey = k; track.innerHTML = '';
    var fr = document.createDocumentFragment();
    function pass(){ items.forEach(function(it, i){ if(i > 0) fr.appendChild(document.createTextNode('　★　')); appendText(fr, String(it)); }); }
    pass(); fr.appendChild(document.createTextNode('　★　')); pass(); track.appendChild(fr);
    bar.classList.add('show'); document.body.classList.add('has-marquee');
    track.style.animationDuration = Math.max(track.scrollWidth / 2 / 60, 12) + 's';
  }
  function fetchM(){ fetch(URL_, {method:'POST', body:JSON.stringify({serial:''})}).then(function(r){ return r.json(); }).then(function(d){ if(d && Array.isArray(d.marquee) && d.marquee.length){ lsSet('marquee', JSON.stringify(d.marquee)); renderM(d.marquee); } }).catch(function(){}); }
  renderM(lsJson('marquee', [])); fetchM(); setInterval(fetchM, REFRESH);
}

window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); window._dp = e; });
if('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('service-worker.js').catch(function(){});
window.addEventListener('resize', function(){ if(!lsGet('zoom')) applyZoom(); });
function checkHash(){ var m = location.hash.match(/^#v=([A-Za-z0-9_-]+)/); if(m){ VERIFY_MODE = true; $('entryGate').classList.add('hidden'); if(!gateOpen) document.body.classList.add('verify-only'); var d = P.readPayload(m[1]); if(d) openVerify(d); else openModal('<h2>🔍 查驗證書</h2><div class="alert bad">讀不懂這個 QR code 的內容，可能不完整或被改過。</div><div class="stack"><button class="btn" data-act="close">關閉</button></div>'); return true; } return false; }
window.addEventListener('hashchange', checkHash);
/* ---------- 登入序號閘門（複製自 小工具/next-bus-helper）----------
   序號在試算表「辦訓相關」的分頁「辦訓單位課程訓練證書」，由綁定的 Apps Script（gas/Code.js）驗證。
   開啟時 fail-closed：驗證沒通過就整個工具都不能用。已登入後的背景重驗只有連線失敗或 server_error 不上鎖（正在排版列印不要被打斷），
   序號過期、查無序號才上鎖。序號存 tcgEntrySerial（刻意不用 tcg. 前綴，⚙ 清除資料不會登出）。
   例外：從證書 QR 進來的 #v= 查驗畫面不需要序號（拿證書的人沒有序號）。 */
var LICENSE_CHECK_URL = 'https://script.google.com/macros/s/AKfycbw2qz-sTKRVkVHGQZLTj73xlJdDiaHG8eNexjAN9XWMrly5BnxVcP8dC0qE3kADHeIl/exec';
var SERIAL_KEY = 'tcgEntrySerial', CLIENT_KEY = 'tcgEntryClientId', RECHECK_MS = 20 * 60 * 1000;
// 公開在登入頁的免費試用序號（使用者 2026-11-17 指定；試算表那一列：到 2027/5/17、人數上限 10）。停用時改成 '' 就不顯示。
var FREE_SERIAL = 'FLf9M6zAX8pe';
function rawGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function rawSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
function rawDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
var gateInfo = {cls:'', text:'尚未驗證', hcls:'', head:''};
var REASON_LABEL = {
  missing_serial:'請輸入登入序號',
  serial_not_found:'查無此序號，請確認有沒有打錯',
  expired:'這組序號已經過期了',
  network_error:'連不上網路，請確認網路後再按一次確認',
  server_error:'驗證暫時失敗，請等一下再試'
};
function clientId(){
  var id = rawGet(CLIENT_KEY);
  if(!id){ id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2); rawSet(CLIENT_KEY, id); }
  return id;
}
function gateStatus(cls, text){
  gateInfo.cls = cls; gateInfo.text = text;
  var e = $('entryGateStatus'); e.className = 'lic ' + cls; e.textContent = text;
  var b = $('licBadge'); if(b){ b.className = 'lic ' + cls; b.textContent = text; }
}
function gateHead(l){
  var limited = l && typeof l.headcountLimit === 'number', free = l && l.valid && !limited, left = limited ? Math.max(l.headcountRemaining || 0, 0) : 0;
  gateInfo.head = !l ? '' : free ? '此序號不限登入人數' : limited ? '此序號還可登入 ' + left + ' 人（上限 ' + l.headcountLimit + ' 人）' : '';
  gateInfo.hcls = free || left > 0 ? 'ok' : 'bad';
  var g = $('entryGateHeadcount'); g.textContent = l && l.reason === 'headcount_exceeded' ? gateInfo.head : '';
  var b = $('headcountBadge'); if(b){ b.className = 'lic ' + gateInfo.hcls; b.textContent = gateInfo.head; }
}
function checkLicense(serial, attempt, renew){
  attempt = attempt || 1;
  if(!LICENSE_CHECK_URL) return Promise.reject(new Error('尚未設定授權伺服器'));
  var ctl = window.AbortController ? new AbortController() : null, tm = ctl && setTimeout(function(){ ctl.abort(); }, 20000);
  // Apps Script 不回應 OPTIONS 預檢，所以不設 Content-Type
  return fetch(LICENSE_CHECK_URL, {method:'POST', body:JSON.stringify({serial:serial, clientId:clientId(), renew:!!renew}), signal:ctl ? ctl.signal : undefined}).catch(function(){
    throw new Error(REASON_LABEL.network_error);
  }).then(function(r){
    clearTimeout(tm);
    if(!r.ok) throw new Error(REASON_LABEL.server_error);
    return r.text();
  }).then(function(t){
    var d; try{ d = JSON.parse(t); }catch(e){ d = null; }
    if(!d || typeof d.valid !== 'boolean'){
      if(attempt < 3) return checkLicense(serial, attempt + 1, renew);
      throw new Error(REASON_LABEL.server_error);
    }
    return d;
  });
}
// 到期日：後端回傳結束日期當天 00:00（台北）的 ISO，當天結束前都有效。用瀏覽器本地日期顯示、算剩幾天。
function gateExp(l){
  if(!l || !l.expiresAt) return null;
  var e = new Date(l.expiresAt); if(isNaN(e)) return null;
  var end = new Date(e.getFullYear(), e.getMonth(), e.getDate()), t = new Date(Date.now()), today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return {y:end.getFullYear(), m:end.getMonth() + 1, d:end.getDate(), left:Math.max(Math.round((end - today) / 86400000), 0)};
}
function expText(x){ return x.y + '/' + x.m + '/' + x.d; }
function gateDays(l){
  var x = gateExp(l); if(!x) return '序號有效';
  return '序號有效，可以用到 ' + expText(x) + '（還有 ' + x.left + ' 天）';
}
var LICINFO = null;
function showLicTop(){
  var el = $('licTop'); if(!el) return;
  var x = gateExp(LICINFO);
  el.hidden = !gateOpen || !LICINFO;
  if(el.hidden) return;
  el.className = 'ibtn lictop' + (x && x.left <= 14 ? ' soon' : '');
  el.innerHTML = x ? '🔑 序號到期日 <b>' + expText(x) + '</b><small>（還有 ' + x.left + ' 天）</small>' : '🔑 序號有效';
  el.title = '登入序號的使用期限' + (typeof LICINFO.headcountLimit === 'number' ? '；此序號同時最多 ' + LICINFO.headcountLimit + ' 人登入' : '') + '。點一下看詳細';
}
function gateUnlock(l){
  LICINFO = l; gateStatus('ok', '✓ ' + gateDays(l)); gateHead(l);
  $('entryGate').classList.add('hidden'); document.body.classList.remove('verify-only');
  var first = !gateOpen; gateOpen = true; showLicTop();
  if(first){
    if(!saved && !ROSTER.length) loadExample('tims');
    if(!lsGet('warnSeen') && !VERIFY_MODE){ lsSet('warnSeen', '1'); showWarn(); }
  }
}
function gateLock(text, l){
  gateOpen = false; LICINFO = null; showLicTop();
  gateStatus('bad', '✗ ' + text); gateHead(l && l.reason === 'headcount_exceeded' ? l : null);
  if(!VERIFY_MODE){ closeModal(); $('entryGate').classList.remove('hidden'); }
}
function gateRun(serial, renew){
  if(!serial){ gateLock(REASON_LABEL.missing_serial); return Promise.resolve(); }
  return checkLicense(serial, 1, renew).then(function(l){
    if(l.valid) gateUnlock(l);
    else if(l.reason === 'server_error' && gateOpen) return;
    else gateLock(REASON_LABEL[l.reason] || l.message || '序號驗證失敗', l);
  }).catch(function(e){ if(!gateOpen) gateLock(e.message); });
}
function gateRenew(){ var s = rawGet(SERIAL_KEY); if(s && gateOpen) gateRun(s, true); }
function gateRelease(serial){
  if(!serial || !navigator.sendBeacon || !LICENSE_CHECK_URL) return;
  try{ navigator.sendBeacon(LICENSE_CHECK_URL, new Blob([JSON.stringify({serial:serial, clientId:clientId(), release:true})], {type:'text/plain'})); }catch(e){}
}
function gateLogout(){
  gateRelease(rawGet(SERIAL_KEY)); rawDel(SERIAL_KEY);
  $('entryGateSerial').value = ''; gateLock('已登出，請輸入登入序號');
}
function initGate(){
  var input = $('entryGateSerial'), btn = $('btnEntryGateConfirm');
  btn.onclick = function(){ var s = input.value.trim(); rawSet(SERIAL_KEY, s); gateStatus('', '驗證中…'); gateRun(s, false); };
  if(FREE_SERIAL){
    $('gateFreeCode').textContent = FREE_SERIAL;
    $('btnGateFree').onclick = function(){ input.value = FREE_SERIAL; btn.click(); };
    $('btnGateFreeCopy').onclick = function(){
      var b = this, done = function(){ b.textContent = '已複製 ✓'; setTimeout(function(){ b.textContent = '複製序號'; }, 1800); };
      var fb = function(){ var t = document.createElement('textarea'); t.value = FREE_SERIAL; document.body.appendChild(t); t.select(); try{ document.execCommand('copy'); }catch(e){} t.remove(); done(); };
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(FREE_SERIAL).then(done, fb); else fb();
    };
  } else $('gateFree').hidden = true;
  input.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); btn.click(); } });
  function maskSerial(hide){ // 預設隱藏，免得旁人看到；要核對時才按顯示
    var t = $('btnEntryGateToggle');
    input.type = hide ? 'password' : 'text';
    t.textContent = hide ? '👁 顯示' : '🙈 隱藏';
    t.setAttribute('aria-pressed', String(!hide)); t.setAttribute('aria-label', hide ? '顯示序號' : '隱藏序號');
  }
  $('btnEntryGateToggle').onclick = function(){ maskSerial(input.type === 'text'); };
  btn.addEventListener('click', function(){ maskSerial(true); });
  input.value = rawGet(SERIAL_KEY) || '';
  if(input.value){ gateStatus('', '驗證中…'); gateRun(input.value, false); }
  setInterval(gateRenew, RECHECK_MS);
  window.addEventListener('pagehide', function(){ gateRelease(rawGet(SERIAL_KEY)); }); // 送不出去也沒關係，後端 40 分鐘逾時兜底
}

applyView(); render(); initMarquee(); initGate();
checkHash();
window._tcg = {get gateOpen(){ return gateOpen; }, get S(){ return S; }, get ROSTER(){ return ROSTER; }, get HIST(){ return HIST; }, ACT:ACT, items:items, loadExample:loadExample, setRoster:setRoster, get PENDING(){ return PENDING; }};
})();
