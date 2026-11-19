/* course-link.js — 課程專案檔（mk-course/1）共用資料層
 * 正本在 課程平台/course-link/，各工具放的是複製檔；改正本後跑 `node sync.mjs --write`。
 * 原則：工具沒有課程專案也要完整可用；這裡只做讀取、驗證、合併、寫入，不碰任何工具自己的狀態。
 * 共用區 course／students 任何工具都能讀，寫入要由使用者按按鈕；results 底下每個工具只寫自己那一格。
 * 看不懂的欄位一律原樣保留。身分證字號只存在本機（localStorage 或使用者下載的檔案），不可放進網址。
 */
(function(root){
'use strict';
var VERSION = '1.0.0';
var SCHEMA = 'mk-course/1', LIB_SCHEMA = 'mk-course-lib/1', KEY = 'mk.course.v1', MAX_COURSES = 30, MAX_STUDENTS = 1000;

function isObj(o){ return !!o && typeof o === 'object' && !Array.isArray(o); }
function str(v, n){ v = v == null ? '' : String(v).replace(/[\u0000-\u001f]/g, ' ').trim(); return n ? v.slice(0, n) : v; }
function date(v){ v = str(v); var m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(v); return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : ''; }
function num(v){ if(v === '' || v == null) return ''; var n = parseFloat(v); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : ''; }
function iso(v){ var t = Date.parse(v); return isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(); }
function newId(){ var s = ''; try{ var a = new Uint8Array(6); (root.crypto || require('crypto').webcrypto).getRandomValues(a); for(var i = 0; i < 6; i++) s += ('0' + a[i].toString(16)).slice(-2); }catch(e){ s = Math.random().toString(16).slice(2, 14); } return 'mc' + s; }
function cleanId(v){ v = str(v); return /^[A-Za-z0-9_-]{4,40}$/.test(v) ? v : ''; }
function major(s){ var m = /\/(\d+)$/.exec(str(s)); return m ? +m[1] : 0; }

/* ---------- 正規化（看不懂的欄位保留） ---------- */
function normCourse(c){
  c = isObj(c) ? c : {};
  var o = Object.assign({}, c);
  ['title', 'term', 'org', 'teacher', 'place', 'url', 'plan'].forEach(function(k){ o[k] = str(c[k], k === 'url' ? 300 : 80); });
  o.start = date(c.start); o.end = date(c.end); o.hours = num(c.hours);
  return o;
}
function normStudent(s){
  s = isObj(s) ? s : {};
  var o = Object.assign({}, s);
  o.sid = str(s.sid, 30); o.name = str(s.name, 30); o.idNo = str(s.idNo, 20).toUpperCase();
  ['group', 'ename', 'email'].forEach(function(k){ if(s[k] != null) o[k] = str(s[k], 60); });
  if(s.birth != null) o.birth = date(s.birth) || str(s.birth, 20);
  return o;
}
// 學生鍵：有學號用學號（大寫），沒有用姓名——與出席簽到 QR 的 keyOf 相同
function studentKey(s){ return s && s.sid ? 'n:' + String(s.sid).toUpperCase() : 'm:' + str(s && s.name); }
function norm(d){
  if(!isObj(d)) return null;
  if(d.schema && major(d.schema) !== 1) return null;
  var o = Object.assign({}, d);
  o.schema = SCHEMA; o.id = cleanId(d.id) || newId(); o.updated = iso(d.updated);
  o.course = normCourse(d.course);
  var seen = {};
  o.students = (Array.isArray(d.students) ? d.students : []).map(normStudent).filter(function(s){
    if(!s.name && !s.sid) return false;
    var k = studentKey(s); if(seen[k]) return false; seen[k] = 1; return true;
  }).slice(0, MAX_STUDENTS);
  o.results = {};
  if(isObj(d.results)) Object.keys(d.results).forEach(function(k){ if(isObj(d.results[k])) o.results[k] = d.results[k]; });
  return o;
}

/* ---------- 合併：共用區整份換掉（使用者已確認），results 只換自己那一格 ---------- */
function merge(base, patch, tool){
  var b = norm(base) || norm({}), out = Object.assign({}, b);
  if(!isObj(patch)) return out;
  if(patch.id && !base) out.id = cleanId(patch.id) || out.id;
  if(isObj(patch.course)) out.course = normCourse(Object.assign({}, b.course, patch.course));
  if(Array.isArray(patch.students)) out.students = norm({students:patch.students}).students;
  if(tool && isObj(patch.result)){ out.results = Object.assign({}, b.results); out.results[tool] = Object.assign({}, patch.result, {updated:new Date().toISOString()}); }
  out.updated = new Date().toISOString();
  return out;
}

/* ---------- 儲存（可注入 storage，node 測試用） ---------- */
function create(storage){
  function read(){
    var lib;
    try{ lib = JSON.parse(storage.getItem(KEY)); }catch(e){ lib = null; }
    if(!isObj(lib) || major(lib.schema) !== 1 || !Array.isArray(lib.courses)) lib = {schema:LIB_SCHEMA, courses:[]};
    lib.courses = lib.courses.map(norm).filter(Boolean);
    return lib;
  }
  function write(lib){
    lib.courses.sort(function(a, b){ return a.updated < b.updated ? 1 : -1; });
    lib.courses = lib.courses.slice(0, MAX_COURSES);
    try{ storage.setItem(KEY, JSON.stringify(lib)); return true; }catch(e){ return false; }
  }
  var api = {
    available:function(){ try{ storage.setItem(KEY + '.t', '1'); storage.removeItem(KEY + '.t'); return true; }catch(e){ return false; } },
    list:function(){ return read().courses; },
    get:function(id){ return read().courses.filter(function(c){ return c.id === id; })[0] || null; },
    // 寫入或更新；patch = {id?, course?, students?, result?}；回傳存好的課程（存不進去回 null）
    save:function(id, patch, tool){
      var lib = read(), i = -1;
      lib.courses.forEach(function(c, j){ if(c.id === id) i = j; });
      var doc = merge(i >= 0 ? lib.courses[i] : null, Object.assign({}, patch, i < 0 && id ? {id:id} : {}), tool);
      if(i >= 0) lib.courses[i] = doc; else lib.courses.push(doc);
      return write(lib) ? doc : null;
    },
    // 匯入整份（開檔）：同 id 以較新的為準，回傳匯入的課程
    put:function(doc){
      doc = norm(doc); if(!doc) return null;
      var lib = read(), i = -1;
      lib.courses.forEach(function(c, j){ if(c.id === doc.id) i = j; });
      if(i >= 0) lib.courses[i] = doc; else lib.courses.push(doc);
      return write(lib) ? doc : null;
    },
    remove:function(id){ var lib = read(); lib.courses = lib.courses.filter(function(c){ return c.id !== id; }); return write(lib); },
    clear:function(){ try{ storage.removeItem(KEY); return true; }catch(e){ return false; } }
  };
  return api;
}

/* ---------- 檔案 ---------- */
function toText(doc){ return JSON.stringify(norm(doc), null, 2); }
// 回傳 {docs:[...]} 或 {error:'…'}；接受單一課程或整個課程庫
function fromText(t){
  var d;
  try{ d = JSON.parse(String(t || '').replace(/^﻿/, '')); }catch(e){ return {error:'不是課程專案檔（JSON 格式不對）'}; }
  var arr = isObj(d) && Array.isArray(d.courses) ? d.courses : [d];
  if(isObj(d) && d.schema && /^mk-course/.test(d.schema) && major(d.schema) > 1) return {error:'這個檔案是較新版本的課程專案檔，請先更新本工具'};
  var docs = arr.map(norm).filter(function(x){ return x && (x.course.title || x.students.length); });
  return docs.length ? {docs:docs} : {error:'檔案裡沒有課程資料'};
}
function fileName(doc){ return (str(doc && doc.course && doc.course.title, 40) || '課程').replace(/[\\/:*?"<>|]/g, '_') + '_課程專案.json'; }

/* ---------- 網址（只帶課程基本資料，絕不含學員） ---------- */
function b64e(s){ var b = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'); return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64d(s){ s = String(s).replace(/-/g, '+').replace(/_/g, '/'); return typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'); }
function toHash(doc){
  var c = normCourse(doc && doc.course), o = {};
  ['title', 'term', 'org', 'teacher', 'start', 'end', 'hours', 'place', 'url'].forEach(function(k){ if(c[k] !== '') o[k] = c[k]; });
  return 'course=' + b64e(JSON.stringify(o));
}
function fromHash(h){
  var m = /(?:^|[#&])course=([A-Za-z0-9_-]+)/.exec(String(h || ''));
  if(!m) return null;
  try{ var c = JSON.parse(b64d(m[1])); return isObj(c) ? normCourse(c) : null; }catch(e){ return null; }
}

/* ---------- 顯示用 ---------- */
function label(doc){
  if(!doc) return '';
  var c = doc.course || {}, r = Object.keys(doc.results || {});
  return (c.title || '（未命名課程）') + (c.term ? ' ' + c.term : '') + '・' + (doc.students || []).length + ' 人' + (r.length ? '・已有：' + r.map(toolName).join('、') : '');
}
var TOOL_NAMES = {'attendance-qr':'出席時數', 'training-certificate':'發證紀錄', 'peer-review':'互評分數', 'enrollment':'報名數'};
function toolName(k){ return TOOL_NAMES[k] || k; }
function when(doc){ var d = new Date(doc && doc.updated); return isFinite(d) ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) : ''; }

var API = {VERSION:VERSION, SCHEMA:SCHEMA, KEY:KEY, norm:norm, normCourse:normCourse, normStudent:normStudent, studentKey:studentKey, merge:merge, create:create,
  toText:toText, fromText:fromText, fileName:fileName, toHash:toHash, fromHash:fromHash, label:label, when:when, newId:newId};
try{ if(typeof localStorage !== 'undefined' && localStorage) API.store = create(localStorage); }catch(e){} // 隱私模式或封鎖網站資料時沒有 store，工具要照常運作
if(typeof module === 'object' && module.exports) module.exports = API;
root.MKCourse = API;
})(typeof window !== 'undefined' ? window : globalThis);
