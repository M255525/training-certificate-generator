/* course-link.js — 課程專案檔（mk-course/1）共用資料層
 * 正本在 課程平台/course-link/，各工具放的是複製檔；改正本後跑 `node sync.mjs --write`。
 * 原則：工具沒有課程專案也要完整可用；這裡只做讀取、驗證、合併、寫入，不碰任何工具自己的狀態。
 * 共用區 course／students 任何工具都能讀，寫入要由使用者按按鈕；results 底下每個工具只寫自己那一格。
 * 看不懂的欄位一律原樣保留。身分證字號只存在本機（localStorage 或使用者下載的檔案），不可放進網址。
 */
(function(root){
'use strict';
var VERSION = '1.1.0';
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
  var now = new Date().toISOString(), t = Object.assign({}, isObj(b._t) ? b._t : {});
  // _t：各區塊最後修改時間，雲端同步兩邊都改過時用來決定誰贏（舊資料沒有 _t 就看 updated）
  if(isObj(patch.course)){ out.course = normCourse(Object.assign({}, b.course, patch.course)); t.course = now; }
  if(Array.isArray(patch.students)){ out.students = norm({students:patch.students}).students; t.students = now; }
  if(t.course || t.students) out._t = t;
  if(tool && isObj(patch.result)){ out.results = Object.assign({}, b.results); out.results[tool] = Object.assign({}, patch.result, {updated:new Date().toISOString()}); }
  out.updated = new Date().toISOString();
  return out;
}

/* ---------- 儲存（可注入 storage，node 測試用） ---------- */
function create(storage, opts){
  var max = opts && opts.max || MAX_COURSES, listeners = [], quiet = 0;
  function emit(id, kind){ if(quiet) return; listeners.forEach(function(f){ try{ f(id, kind); }catch(e){} }); }
  function read(){
    var lib;
    try{ lib = JSON.parse(storage.getItem(KEY)); }catch(e){ lib = null; }
    if(!isObj(lib) || major(lib.schema) !== 1 || !Array.isArray(lib.courses)) lib = {schema:LIB_SCHEMA, courses:[]};
    lib.courses = lib.courses.map(norm).filter(Boolean);
    return lib;
  }
  function write(lib){
    lib.courses.sort(function(a, b){ return a.updated < b.updated ? 1 : -1; });
    lib.courses = lib.courses.slice(0, max);
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
      if(!write(lib)) return null;
      emit(doc.id, 'save'); return doc;
    },
    // 匯入整份（開檔）：同 id 以較新的為準，回傳匯入的課程
    put:function(doc){
      doc = norm(doc); if(!doc) return null;
      var lib = read(), i = -1;
      lib.courses.forEach(function(c, j){ if(c.id === doc.id) i = j; });
      if(i >= 0) lib.courses[i] = doc; else lib.courses.push(doc);
      if(!write(lib)) return null;
      emit(doc.id, 'put'); return doc;
    },
    remove:function(id){ var lib = read(); lib.courses = lib.courses.filter(function(c){ return c.id !== id; }); if(!write(lib)) return false; emit(id, 'remove'); return true; },
    // 變動通知（雲端同步用）；silently(fn) 期間的寫入不通知，避免同步自己寫回去又觸發上傳
    onChange:function(f){ listeners.push(f); },
    silently:function(f){ quiet++; try{ return f(); }finally{ quiet--; } },
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

/* ======================================================================
 * 雲端同步（v1.1，辦訓管理平台）——選用：沒設定 API、沒登入、沒網路、沒有 WebCrypto 時完全不作用，行為同 v1.0。
 * 端對端加密：PBKDF2(單位密語, 單位 salt) → AES-GCM 256 金鑰（不可匯出），整份課程加密成 v1.<iv>.<密文> 才上傳；
 * 伺服器只存密文。金鑰放 IndexedDB（同網域的工具共用），沒勾「記住」最多 12 小時，登出立即清除。
 * 本機課程庫是雲端的鏡像：store 有變動就上傳；載入、回到分頁、恢復連線時下載。兩邊都改過時用 mergeDocs 合併。
 * ====================================================================== */
var CLOUD_STATE = 'mk.cloud.v1', KEYCHECK_TEXT = 'mk-course-keycheck', REMEMBER_MS = 30 * 86400000, SESSION_MS = 12 * 3600000;
var DEFAULT_API = 'https://training-ops-api.content-workflow.workers.dev'; // 辦訓管理平台正式 Worker（2026-11-19 部署）；本機測試可在 localhost 用 localStorage 'mk.cloud.api' 覆寫

function u8b64(u8){ var s = ''; for(var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64u8(s){ s = String(s).replace(/-/g, '+').replace(/_/g, '/'); var b = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'), u = new Uint8Array(b.length); for(var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function subtle(){ var c = null; try{ c = root.crypto || (typeof require === 'function' ? require('crypto').webcrypto : null); }catch(e){} return c && c.subtle ? c : null; }
function deriveKey(pass, salt, iter){
  var c = subtle(), te = new TextEncoder();
  return c.subtle.importKey('raw', te.encode(String(pass).normalize('NFC')), 'PBKDF2', false, ['deriveKey']).then(function(base){
    return c.subtle.deriveKey({name:'PBKDF2', salt:b64u8(salt), iterations:iter || 310000, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
  });
}
function encryptJSON(key, obj){
  var c = subtle(), iv = c.getRandomValues(new Uint8Array(12));
  return c.subtle.encrypt({name:'AES-GCM', iv:iv}, key, new TextEncoder().encode(JSON.stringify(obj))).then(function(ct){ return 'v1.' + u8b64(iv) + '.' + u8b64(new Uint8Array(ct)); });
}
function decryptJSON(key, blob){
  var m = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(blob || ''));
  if(!m) return Promise.reject(new Error('密文格式不對'));
  return subtle().subtle.decrypt({name:'AES-GCM', iv:b64u8(m[1])}, key, b64u8(m[2])).then(function(pt){ return JSON.parse(new TextDecoder().decode(pt)); });
}
function randSalt(){ return u8b64(subtle().getRandomValues(new Uint8Array(16))); }

// 兩份同 id 的課程合併：course／students 各看 _t（沒有就看 updated），results 逐工具看 updated，其餘欄位跟較新的那份
// 沒有 _t 的那份＝這個區塊從沒被改過（或是 v1.0 的舊資料），輸給有 _t 的；兩邊都沒有才看整份 updated
function partTime(d, k){ return isObj(d._t) && d._t[k] || ''; }
function mergeDocs(a, b){
  a = norm(a); b = norm(b);
  if(!a) return b; if(!b) return a;
  var newer = a.updated >= b.updated ? a : b, out = Object.assign({}, newer), t = {};
  ['course', 'students'].forEach(function(k){
    var ta = partTime(a, k), tb = partTime(b, k), w = ta || tb ? (ta >= tb ? a : b) : newer;
    out[k] = w[k]; if(partTime(w, k)) t[k] = partTime(w, k);
  });
  out._t = t; out.results = {};
  Object.keys(Object.assign({}, a.results, b.results)).forEach(function(k){
    var x = a.results[k], y = b.results[k];
    out.results[k] = !x ? y : !y ? x : (String(x.updated || '') >= String(y.updated || '') ? x : y);
  });
  out.updated = a.updated > b.updated ? a.updated : b.updated;
  return norm(out);
}

// 金鑰保存：瀏覽器用 IndexedDB（CryptoKey 可以 structured clone，不必匯出）；node 測試用記憶體
function idbKeystore(){
  var NAME = 'mk-cloud', STORE = 'keys';
  function db(){ return new Promise(function(ok, no){ var r = indexedDB.open(NAME, 1); r.onupgradeneeded = function(){ r.result.createObjectStore(STORE); }; r.onsuccess = function(){ ok(r.result); }; r.onerror = function(){ no(r.error); }; }); }
  function tx(mode, f){ return db().then(function(d){ return new Promise(function(ok, no){ var t = d.transaction(STORE, mode), q = f(t.objectStore(STORE)); t.oncomplete = function(){ ok(q && q.result); d.close(); }; t.onerror = function(){ no(t.error); d.close(); }; }); }); }
  return {
    get:function(){ return tx('readonly', function(s){ return s.get('org'); }).catch(function(){ return null; }); },
    set:function(v){ return tx('readwrite', function(s){ s.put(v, 'org'); }).catch(function(){}); },
    clear:function(){ return tx('readwrite', function(s){ s['delete']('org'); }).catch(function(){}); }
  };
}
function memKeystore(){ var v = null; return {get:function(){ return Promise.resolve(v); }, set:function(x){ v = x; return Promise.resolve(); }, clear:function(){ v = null; return Promise.resolve(); }}; }

function createCloud(o){
  var store = o.store, storage = o.storage, keystore = o.keystore, doFetch = o.fetch, now = o.now || function(){ return Date.now(); };
  var key = null, timers = {}, busy = null, listeners = [], last = {error:'', syncedAt:0}, pendingSerial = '', cloud;
  function api(){ return typeof o.api === 'function' ? o.api() : o.api; }
  function st(){ try{ var s = JSON.parse(storage.getItem(CLOUD_STATE)); return isObj(s) ? s : {}; }catch(e){ return {}; } }
  function save(s){ try{ storage.setItem(CLOUD_STATE, JSON.stringify(s)); }catch(e){} }
  function patchSt(p){ var s = Object.assign(st(), p); save(s); return s; }
  function vers(){ var v = st().vers; return isObj(v) ? v : {}; }
  function setVer(id, v){ var s = st(); s.vers = isObj(s.vers) ? s.vers : {}; if(v) s.vers[id] = v; else delete s.vers[id]; save(s); }
  function emit(){ var x = cloud.status(); listeners.forEach(function(f){ try{ f(x); }catch(e){} }); }

  function call(action, payload, token){
    var h = {'Content-Type':'application/json'};
    if(token) h.Authorization = 'Bearer ' + token;
    return doFetch(api() + '/api', {method:'POST', headers:h, body:JSON.stringify({action:action, payload:payload || {}})}).then(function(r){ return r.json(); }, function(){ throw new Error('連不上雲端，請確認網路'); });
  }
  function authed(action, payload){
    var s = st();
    if(!s.token && !s.serial) return Promise.reject(new Error('請先登入雲端'));
    var go = s.token ? call(action, payload, s.token) : Promise.resolve({ok:false, code:'AUTH'});
    return go.then(function(r){
      if(r.ok || r.code !== 'AUTH') return r;
      return relogin().then(function(){ return call(action, payload, st().token); });
    });
  }
  // token 過期：有記住序號就靜默重新登入（金鑰還在才行），否則要使用者重新登入
  function relogin(){
    var s = st();
    if(!s.serial){ patchSt({token:''}); key = null; keystore.clear(); return Promise.reject(new Error('雲端登入已過期，請重新登入')); }
    return call('auth.login', {serial:s.serial, clientId:s.clientId}).then(function(r){
      if(!r.ok){ patchSt({token:''}); throw new Error(r.message || '雲端登入已過期'); }
      if(r.org.keycheck !== s.keycheck){ key = null; keystore.clear(); patchSt({token:'', serial:'', keycheck:r.org.keycheck, salt:r.org.salt}); throw new Error('單位密語已經更換，請重新登入'); }
      patchSt({token:r.token, exp:r.exp, licenseExpiresAt:r.licenseExpiresAt || ''});
    });
  }
  function loadKey(){
    if(key) return Promise.resolve(key);
    return keystore.get().then(function(k){
      if(k && k.key && k.exp > now() && k.keycheck === st().keycheck){ key = k.key; return key; }
      if(k) keystore.clear();
      return null;
    });
  }

  function pushNow(id, tries){
    tries = tries || 0;
    var doc = store.get(id), v = vers()[id];
    if(!doc || v && v.skip) return Promise.resolve();
    return encryptJSON(key, doc).then(function(blob){
      return authed('courses.put', {id:id, baseVer:v && v.ver || 0, blob:blob});
    }).then(function(r){
      if(r.ok){ setVer(id, {ver:r.ver, synced:doc.updated}); return; }
      if(r.code !== 'CONFLICT' || tries >= 3) throw new Error(r.message || '上傳失敗');
      var cur = r.current;
      if(!cur){ setVer(id, null); return pushNow(id, tries + 1); }
      if(cur.deleted){ setVer(id, {ver:cur.ver, synced:''}); return pushNow(id, tries + 1); } // 別人刪了但這邊有改：復原
      return decryptJSON(key, cur.blob).then(function(remote){
        var m = mergeDocs(store.get(id), remote);
        store.silently(function(){ store.put(m); });
        setVer(id, {ver:cur.ver, synced:''});
        return pushNow(id, tries + 1);
      });
    });
  }
  function removeNow(id){
    var v = vers()[id];
    if(!v || v.skip || !v.ver){ setVer(id, null); return Promise.resolve(); }
    return authed('courses.delete', {id:id, baseVer:v.ver}).then(function(r){
      if(r.ok || !r.current || r.current.deleted){ setVer(id, null); return; }
      // 雲端在這期間被別人改過：不刪，改成下載回來（以免誤刪別人的新資料）
      return decryptJSON(key, r.current.blob).then(function(remote){ remote = norm(remote); store.silently(function(){ store.put(remote); }); setVer(id, {ver:r.current.ver, synced:remote.updated}); });
    });
  }
  function applyRemote(c){
    var v = vers()[c.id], local = store.get(c.id), clean = local && v && !v.skip && local.updated === v.synced;
    if(c.deleted){
      if(local && v && !v.skip && !clean){ setVer(c.id, {ver:c.ver, synced:''}); return Promise.resolve(c.id); } // 這邊有改：之後上傳＝復原
      if(local && v && !v.skip) store.silently(function(){ store.remove(c.id); });
      if(!v || !v.skip) setVer(c.id, null);
      return Promise.resolve();
    }
    return decryptJSON(key, c.blob).then(function(remote){
      remote = norm(remote);
      if(!local || clean){ store.silently(function(){ store.put(remote); }); setVer(c.id, {ver:c.ver, synced:remote.updated}); return; }
      if(JSON.stringify(local) === JSON.stringify(remote)){ setVer(c.id, {ver:c.ver, synced:remote.updated}); return; }
      var m = mergeDocs(local, remote);
      store.silently(function(){ store.put(m); });
      setVer(c.id, {ver:c.ver, synced:''});
      return c.id; // 合併過，要再上傳
    }, function(){ last.error = '有課程解不開（可能是用舊密語加密的）'; });
  }
  function syncNow(){
    return authed('courses.pull', {since:st().since || 0}).then(function(r){
      if(!r.ok) throw new Error(r.message || '下載失敗');
      return r.courses.reduce(function(p, c){ return p.then(function(acc){ return applyRemote(c).then(function(id){ if(id) acc.push(id); return acc; }); }); }, Promise.resolve([])).then(function(again){
        patchSt({since:r.now});
        var v = vers(), dirty = store.list().filter(function(d){ var x = v[d.id]; return !x || !x.skip && d.updated !== x.synced; }).map(function(d){ return d.id; });
        again.forEach(function(id){ if(dirty.indexOf(id) < 0) dirty.push(id); });
        return dirty.reduce(function(p, id){ return p.then(function(){ return pushNow(id); }); }, Promise.resolve());
      });
    });
  }
  // 同一時間只跑一件事；後來的排在後面
  function guarded(f){
    var job = function(){
      return loadKey().then(function(k){
        if(!k) return;
        return f().then(function(){ last.error = ''; last.syncedAt = now(); }, function(e){ last.error = e && e.message || String(e); });
      });
    };
    var p = (busy || Promise.resolve()).then(job, job);
    busy = p;
    emit();
    return p.then(function(){ if(busy === p) busy = null; emit(); });
  }

  store.onChange(function(id, kind){
    if(!key) return;
    clearTimeout(timers[id]);
    timers[id] = setTimeout(function(){ delete timers[id]; guarded(function(){ return kind === 'remove' ? removeNow(id) : pushNow(id); }); }, o.debounce == null ? 600 : o.debounce);
    emit();
  });

  cloud = {
    enabled:function(){ return !!(api() && subtle() && store); },
    loggedIn:function(){ return !!key; },
    status:function(){ var s = st(); return {enabled:cloud.enabled(), loggedIn:!!key, pending:Object.keys(timers).length > 0 || !!busy, error:last.error, syncedAt:last.syncedAt, remember:!!s.serial, licenseExpiresAt:s.licenseExpiresAt || ''}; },
    on:function(f){ listeners.push(f); },
    // 第一步：驗序號。回傳 {isNew}：單位第一次使用要設定密語
    check:function(serial){
      serial = String(serial || '').trim();
      if(!serial) return Promise.reject(new Error('請輸入序號'));
      var s = st(), cid = s.clientId || 'mk-' + randSalt();
      return call('auth.login', {serial:serial, clientId:cid}).then(function(r){
        if(!r.ok) throw new Error(r.message || '登入失敗');
        pendingSerial = serial;
        if(s.keycheck && r.org.keycheck !== s.keycheck) save({clientId:cid}); // 換了單位或換了密語：舊的同步紀錄作廢
        patchSt({clientId:cid, token:r.token, exp:r.exp, salt:r.org.salt, iter:r.org.iter, keycheck:r.org.keycheck || '', licenseExpiresAt:r.licenseExpiresAt || '', serial:''});
        return {isNew:!r.org.keycheck};
      });
    },
    // 第二步：輸入密語（新單位＝設定）。opts {remember, upload}：upload=false 時這台電腦上原有、還沒上過雲端的課程不上傳
    unlock:function(pass, opts){
      opts = opts || {};
      var s = st();
      if(!s.token) return Promise.reject(new Error('請先輸入序號'));
      if(String(pass || '').length < 8) return Promise.reject(new Error('單位密語至少 8 個字'));
      return deriveKey(pass, s.salt, s.iter).then(function(k){
        if(s.keycheck){
          return decryptJSON(k, s.keycheck).catch(function(){ return null; }).then(function(t){ if(t !== KEYCHECK_TEXT) throw new Error('單位密語不正確'); return k; });
        }
        return encryptJSON(k, KEYCHECK_TEXT).then(function(kc){
          return authed('org.init', {keycheck:kc}).then(function(r){ if(!r.ok) throw new Error(r.message || '設定密語失敗'); patchSt({keycheck:kc}); return k; });
        });
      }).then(function(k){
        key = k;
        var exp = opts.remember ? now() + REMEMBER_MS : Math.min(now() + SESSION_MS, st().exp || now() + SESSION_MS);
        var v = vers();
        if(opts.upload === false) store.list().forEach(function(d){ if(!v[d.id]) v[d.id] = {skip:true}; });
        patchSt({serial:opts.remember ? pendingSerial : '', vers:v});
        pendingSerial = '';
        return keystore.set({key:k, exp:exp, keycheck:st().keycheck});
      }).then(function(){ return cloud.sync(); });
    },
    sync:function(){ return guarded(syncNow); },
    // 這台電腦上沒上傳的課程（登入時選了不上傳的）之後想上傳
    include:function(id){ var v = vers()[id]; if(v && v.skip) setVer(id, null); return cloud.sync(); },
    isLocalOnly:function(id){ var v = vers()[id]; return !!(v && v.skip); },
    logout:function(){
      var s = st(); key = null; pendingSerial = '';
      Object.keys(timers).forEach(function(id){ clearTimeout(timers[id]); delete timers[id]; });
      if(s.token) call('auth.logout', {}, s.token).catch(function(){});
      save({clientId:s.clientId});
      return keystore.clear().then(emit);
    },
    // 換單位密語：下載全部、用新金鑰重新加密、整批送出（期間有人改過會失敗，要重來）
    rekey:function(oldPass, newPass){
      var s = st(), oldKey, newKey, salt = randSalt(), kc;
      if(String(newPass || '').length < 8) return Promise.reject(new Error('新密語至少 8 個字'));
      return deriveKey(oldPass, s.salt, s.iter).then(function(k){ oldKey = k; return decryptJSON(k, s.keycheck); }).then(function(t){ if(t !== KEYCHECK_TEXT) throw 0; }).catch(function(){ throw new Error('目前的密語不正確'); })
        .then(function(){ return deriveKey(newPass, salt, s.iter); }).then(function(k){ newKey = k; return encryptJSON(k, KEYCHECK_TEXT); }).then(function(x){ kc = x; return authed('courses.pull', {since:0}); })
        .then(function(r){
          if(!r.ok) throw new Error(r.message);
          return Promise.all(r.courses.filter(function(c){ return !c.deleted; }).map(function(c){
            return decryptJSON(oldKey, c.blob).then(function(d){ return encryptJSON(newKey, d); }).then(function(blob){ return {id:c.id, baseVer:c.ver, blob:blob}; });
          }));
        }).then(function(list){ return authed('org.rekey', {oldKeycheck:s.keycheck, keycheck:kc, salt:salt, courses:list}); })
        .then(function(r){
          if(!r.ok) throw new Error(r.message || '換密語失敗');
          key = newKey;
          var v = vers(); Object.keys(v).forEach(function(id){ if(v[id].ver) v[id].ver++; });
          patchSt({keycheck:kc, salt:salt, vers:v});
          return keystore.get().then(function(old){ return keystore.set({key:newKey, exp:old && old.exp || now() + SESSION_MS, keycheck:kc}); });
        }).then(function(){ return cloud.sync(); });
    },
    audit:function(){ return authed('audit.list', {}).then(function(r){ if(!r.ok) throw new Error(r.message); return r.items; }); },
    // 啟動：這台電腦有有效金鑰就同步
    start:function(){ return loadKey().then(function(k){ emit(); if(k) return cloud.sync(); }); }
  };
  return cloud;
}

/* ---------- 雲端小徽章＋登入視窗（只在瀏覽器；只有登入中或網址帶 #mkcloud= 時出現，沒訂閱的人看不到） ---------- */
function mountCloudUI(cloud, opts){
  opts = opts || {};
  var doc = root.document; if(!doc) return;
  var wantId = (/(?:^|[#&])mkcloud=([A-Za-z0-9_-]{4,40})/.exec(root.location.hash) || [])[1] || '';
  var css = '.mkc-pill{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147483000;font:600 13px/1.2 system-ui,"Noto Sans TC",sans-serif;background:#1f2a44;color:#fff;border:0;border-radius:999px;padding:8px 14px;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}'
    + '.mkc-pill.err{background:#b3261e}.mkc-pill.off{background:#5b6475}'
    + '.mkc-back{position:fixed;inset:0;z-index:2147483001;background:rgba(10,15,30,.55);display:flex;align-items:center;justify-content:center;padding:16px}'
    + '.mkc-box{background:#fff;color:#1b1f2a;border-radius:14px;max-width:420px;width:100%;padding:20px;font:15px/1.6 system-ui,"Noto Sans TC",sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.3)}'
    + '.mkc-box h3{margin:0 0 8px;font-size:18px}.mkc-box label{display:block;margin:10px 0 4px;font-weight:600}.mkc-box input[type=password],.mkc-box input[type=text]{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #c5cad6;border-radius:8px;font:inherit}'
    + '.mkc-box .chk{display:flex;gap:8px;align-items:flex-start;font-weight:400;margin-top:10px}.mkc-box .chk input{margin-top:5px}'
    + '.mkc-box .row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}.mkc-box button{font:inherit;padding:8px 16px;border-radius:8px;border:1px solid #c5cad6;background:#fff;cursor:pointer}.mkc-box button.pri{background:#1f2a44;color:#fff;border-color:#1f2a44}'
    + '.mkc-box .msg{color:#b3261e;min-height:1.4em;margin-top:8px}.mkc-box .note{color:#5b6475;font-size:13px}.mkc-box .warn{background:#fff4e5;border:1px solid #f0c27a;border-radius:8px;padding:8px 10px;font-size:13px;margin-top:10px}'
    + '.mkc-toast{position:fixed;left:50%;bottom:calc(64px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483002;background:#1f2a44;color:#fff;padding:10px 16px;border-radius:10px;font:14px/1.5 system-ui,"Noto Sans TC",sans-serif;max-width:min(90vw,480px);box-shadow:0 6px 20px rgba(0,0,0,.3)}'
    + '@media print{.mkc-pill,.mkc-back,.mkc-toast{display:none!important}}';
  var styled = false, pill = null;
  function el(tag, cls, html){ var e = doc.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]; }); }
  function style(){ if(styled) return; styled = true; var s = el('style'); s.textContent = css; doc.head.appendChild(s); }
  function toast(t){ style(); var x = el('div', 'mkc-toast'); x.textContent = t; doc.body.appendChild(x); setTimeout(function(){ x.remove(); }, 5000); }
  function render(s){
    var show = s.enabled && (s.loggedIn || wantId) && !opts.noPill;
    if(!show){ if(pill){ pill.remove(); pill = null; } return; }
    style();
    if(!pill){ pill = el('button', 'mkc-pill'); pill.type = 'button'; pill.onclick = function(){ cloud.loggedIn() ? openMenu() : openLogin(); }; doc.body.appendChild(pill); }
    pill.className = 'mkc-pill' + (!s.loggedIn ? ' off' : s.error ? ' err' : '');
    pill.textContent = !s.loggedIn ? '☁ 登入雲端同步' : s.error ? '☁ 同步有問題' : s.pending ? '☁ 同步中…' : '☁ 已同步';
    pill.title = s.error || (s.syncedAt ? '最後同步 ' + new Date(s.syncedAt).toLocaleTimeString() : '');
  }
  function modal(html){ style(); var b = el('div', 'mkc-back'), box = el('div', 'mkc-box', html); b.appendChild(box); b.addEventListener('click', function(e){ if(e.target === b) b.remove(); }); doc.body.appendChild(b); return {back:b, box:box, q:function(s){ return box.querySelector(s); }}; }
  function openMenu(){
    var s = cloud.status();
    var m = modal('<h3>☁ 雲端同步</h3><div>' + (s.error ? '<b style="color:#b3261e">' + esc(s.error) + '</b>' : '課程專案已和雲端同步。') + '</div>'
      + '<div class="note">' + (s.syncedAt ? '最後同步：' + new Date(s.syncedAt).toLocaleString() + '<br>' : '') + (s.remember ? '這台電腦會記住登入 30 天。' : '關閉瀏覽器 12 小時內有效。') + '</div>'
      + '<div class="row"><button data-a="out">登出雲端</button><button data-a="sync">立即同步</button><button class="pri" data-a="x">關閉</button></div>');
    m.q('[data-a=x]').onclick = function(){ m.back.remove(); };
    m.q('[data-a=sync]').onclick = function(){ m.back.remove(); cloud.sync(); };
    m.q('[data-a=out]').onclick = function(){ m.back.remove(); cloud.logout().then(function(){ toast('已登出雲端。這台電腦上的課程專案還在，只是不再同步。'); }); };
  }
  function openLogin(done){
    var local = (opts.store && opts.store.list().length) || 0;
    var m = modal('<h3>☁ 登入辦訓管理平台</h3><div class="note">課程專案會用「單位密語」加密後才上傳，平台看不到內容。</div>'
      + '<form data-step="1"><label for="mkcSerial">單位序號</label><input id="mkcSerial" type="password" autocomplete="off" required>'
      + '<div class="msg"></div><div class="row"><button type="button" data-a="x">取消</button><button class="pri" type="submit">下一步</button></div></form>');
    var f = m.q('form'), msg = m.q('.msg');
    m.q('[data-a=x]').onclick = function(){ m.back.remove(); };
    m.q('#mkcSerial').focus();
    f.onsubmit = function(e){
      e.preventDefault(); msg.textContent = '驗證中…';
      cloud.check(m.q('#mkcSerial').value).then(function(r){
        f.innerHTML = (r.isNew
          ? '<div class="warn">這是貴單位第一次使用，請設定<b>單位密語</b>（至少 8 個字）。同單位的同事都用同一組密語。<br><b>密語遺失就無法救回雲端資料</b>，平台也沒有辦法幫你重設。</div>'
            + '<label for="mkcPass">設定單位密語</label><input id="mkcPass" type="password" autocomplete="new-password" minlength="8" required>'
            + '<label for="mkcPass2">再輸入一次</label><input id="mkcPass2" type="password" autocomplete="new-password" minlength="8" required>'
            + '<label class="chk"><input type="checkbox" id="mkcAck" required> 我了解密語遺失無法救回，已另外抄寫保存</label>'
          : '<label for="mkcPass">單位密語</label><input id="mkcPass" type="password" autocomplete="current-password" required>')
          + '<label class="chk"><input type="checkbox" id="mkcRem"> 這台電腦記住 30 天（共用電腦請不要勾）</label>'
          + (local ? '<label class="chk"><input type="checkbox" id="mkcUp" checked> 把這台電腦上原有的 ' + local + ' 個課程專案也上傳到雲端</label>' : '')
          + '<div class="msg"></div><div class="row"><button type="button" data-a="x">取消</button><button class="pri" type="submit">' + (r.isNew ? '設定並登入' : '登入') + '</button></div>';
        msg = f.querySelector('.msg');
        f.querySelector('[data-a=x]').onclick = function(){ m.back.remove(); };
        f.querySelector('#mkcPass').focus();
        f.onsubmit = function(e){
          e.preventDefault();
          var p = f.querySelector('#mkcPass').value, p2 = f.querySelector('#mkcPass2');
          if(p2 && p2.value !== p){ msg.textContent = '兩次輸入的密語不一樣'; return; }
          msg.textContent = '解鎖中…';
          var up = f.querySelector('#mkcUp');
          cloud.unlock(p, {remember:f.querySelector('#mkcRem').checked, upload:up ? up.checked : true}).then(function(){
            m.back.remove(); afterLogin(); if(done) done();
          }, function(err){ msg.textContent = err.message; });
        };
      }, function(err){ msg.textContent = err.message; });
    };
  }
  function afterLogin(){
    if(!wantId || !opts.store) return;
    var d = opts.store.get(wantId);
    if(d) toast('已從雲端取得「' + (d.course.title || '未命名課程') + '」，請按「📥 從課程專案帶入」選這門課。');
    else toast('雲端找不到這門課，可能已被刪除。');
    wantId = '';
  }
  cloud.on(render);
  cloud.start().then(function(){
    render(cloud.status());
    if(wantId){ if(cloud.loggedIn()) afterLogin(); else if(cloud.enabled()) openLogin(); }
  });
  root.addEventListener('online', function(){ cloud.sync(); });
  doc.addEventListener('visibilitychange', function(){ if(doc.visibilityState === 'visible' && cloud.loggedIn()) cloud.sync(); });
  return {openLogin:openLogin, toast:toast};
}

var API = {VERSION:VERSION, SCHEMA:SCHEMA, KEY:KEY, norm:norm, normCourse:normCourse, normStudent:normStudent, studentKey:studentKey, merge:merge, create:create,
  toText:toText, fromText:fromText, fileName:fileName, toHash:toHash, fromHash:fromHash, label:label, when:when, newId:newId};
try{ if(typeof localStorage !== 'undefined' && localStorage) API.store = create(localStorage, {max:root.MK_MAX_COURSES}); }catch(e){} // 隱私模式或封鎖網站資料時沒有 store，工具要照常運作
API.mergeDocs = mergeDocs; API.createCloud = createCloud; API.memKeystore = memKeystore; API.crypto = {deriveKey:deriveKey, encryptJSON:encryptJSON, decryptJSON:decryptJSON};
// 瀏覽器：建立雲端同步並掛上小徽章。正式 API 是 DEFAULT_API；只有在本機（localhost）才可用 localStorage 'mk.cloud.api' 覆寫，方便測試
try{
  if(API.store && root.document && typeof fetch === 'function' && typeof indexedDB !== 'undefined'){
    var local = /^(localhost|127\.0\.0\.1)$/.test(root.location.hostname);
    API.cloud = createCloud({store:API.store, storage:localStorage, keystore:idbKeystore(), fetch:function(u, o){ return fetch(u, o); },
      api:function(){ var o = null; try{ o = local && localStorage.getItem('mk.cloud.api'); }catch(e){} return o || root.MK_CLOUD_API || DEFAULT_API; }});
    var boot = function(){ API.cloudUI = mountCloudUI(API.cloud, {store:API.store, noPill:!!root.MK_CLOUD_NO_PILL}); };
    if(root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot); else boot();
  }
}catch(e){}
if(typeof module === 'object' && module.exports) module.exports = API;
root.MKCourse = API;
})(typeof window !== 'undefined' ? window : globalThis);
