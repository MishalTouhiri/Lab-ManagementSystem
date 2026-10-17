/* مخزن البيانات
 * وضع الخادم: عند فتح المنصة من http://localhost:3000 تُقرأ البيانات وتُحفظ في قاعدة بيانات SQLite عبر الواجهة البرمجية
 * الوضع المحلي: عند فتح index.html مباشرة تُحفظ البيانات في متصفح الجهاز (للعرض بدون خادم)
 */
(function () {
  'use strict';

  const { seed, migrate, util } = window.LabSeed;
  const { iso, addDays, pad, uid, weekStart, workday, isWorkday } = util;
  const KEY = 'labms.data.v1';
  const SESSION_KEY = 'labms.session.v1';
  const memory = {};

  function readRaw(k) { try { return window.localStorage.getItem(k); } catch (e) { return memory[k] ?? null; } }
  function writeRaw(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { memory[k] = v; } }
  function removeRaw(k) { try { window.localStorage.removeItem(k); } catch (e) { delete memory[k]; } }

  let mode = 'local';
  let data = null;
  let serverUser = null;
  let version = 0;
  let localOnlyDepth = 0;
  let pending = 0;
  const handlers = { error: [], changed: [] };
  const emit = (ev, arg) => handlers[ev].forEach((fn) => { try { fn(arg); } catch (e) { console.error(e); } });

  async function api(method, url, body) {
    const res = await fetch(url, { method, credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    let json = null;
    try { json = await res.json(); } catch (e) { /* لا يوجد محتوى */ }
    if (!res.ok) { const err = new Error((json && json.error) || 'تعذّر الاتصال بالخادم (' + res.status + ')'); err.status = res.status; throw err; }
    return json;
  }

  /* ===== التشغيل ===== */
  async function init() {
    if (/^https?:$/.test(location.protocol)) {
      try { const h = await api('GET', '/api/health'); if (h && h.ok) { mode = 'server'; version = h.version; } } catch (e) { /* لا يوجد خادم */ }
    }
    if (mode === 'server') { await refresh(); startPolling(); } else loadLocal();
    return data;
  }
  function loadLocal() {
    const raw = readRaw(KEY);
    if (raw) { try { data = JSON.parse(raw); } catch (e) { data = null; } }
    if (!data || !Array.isArray(data.labs)) { data = seed(); saveLocal(); }
    else if (migrate(data)) saveLocal();
  }
  function saveLocal() {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { memory[KEY] = JSON.stringify(data); try { window.dispatchEvent(new CustomEvent('labms:savefail')); } catch (x) { /* ignore */ } }
  }
  async function refresh() {
    const r = await api('GET', '/api/data');
    serverUser = r.user ? r.user.id : null;
    data = r.data;
    try { version = (await api('GET', '/api/version')).version; } catch (e) { /* ignore */ }
  }
  /* تحديث تلقائي عند تغيّر البيانات من مستخدم آخر */
  function startPolling() {
    setInterval(async () => {
      if (pending || document.hidden) return;
      try {
        const v = (await api('GET', '/api/version')).version;
        if (v !== version) { await refresh(); emit('changed', { remote: true }); }
      } catch (e) { /* الخادم غير متاح مؤقتًا */ }
    }, 15000);
  }

  /* ===== القراءة والكتابة ===== */
  const coll = (name) => data[name] || (data[name] = []);
  const byId = (name, id) => coll(name).find((x) => x.id === id);

  function sync(method, url, body, name) {
    pending++;
    return api(method, url, body).then((res) => {
      if (res && res.item && name) {
        const arr = coll(name), i = arr.findIndex((x) => x.id === res.item.id);
        const before = i >= 0 ? JSON.stringify(arr[i]) : '';
        if (i >= 0) arr[i] = Object.assign({}, arr[i], res.item); else arr.push(res.item);
        if (before && res.item.ref && JSON.parse(before).ref !== res.item.ref) emit('changed', {});
      }
    }).catch((e) => {
      emit('error', e);
      return refresh().then(() => emit('changed', {})).catch(() => { /* ignore */ });
    }).finally(() => { pending--; api('GET', '/api/version').then((r) => { if (!pending) version = r.version; }).catch(() => { /* ignore */ }); });
  }
  function upsert(name, item, prefix) {
    if (!item.id) { item.id = uid(prefix || name[0]); coll(name).push(item); }
    else {
      const i = coll(name).findIndex((x) => x.id === item.id);
      if (i >= 0) data[name][i] = Object.assign({}, data[name][i], item); else coll(name).push(item);
    }
    const saved = byId(name, item.id);
    if (mode === 'server') { if (!localOnlyDepth) sync('PUT', '/api/' + name + '/' + encodeURIComponent(saved.id), item.password ? Object.assign({}, saved, { password: item.password }) : saved, name); if (saved.password) delete saved.password; }
    else saveLocal();
    return saved;
  }
  function remove(name, id) {
    data[name] = coll(name).filter((x) => x.id !== id);
    if (mode === 'server') { if (!localOnlyDepth) sync('DELETE', '/api/' + name + '/' + encodeURIComponent(id)); }
    else saveLocal();
  }
  /* آثار جانبية يطبقها الخادم بنفسه (تغيير حالة الأجهزة، الحجز الناتج عن طلب...) تُطبق محليًا فقط هنا */
  function localOnly(fn) { localOnlyDepth++; try { return fn(); } finally { localOnlyDepth--; } }
  function save() { if (mode === 'local') saveLocal(); }

  function log(userId, text) {
    coll('activity').unshift({ id: uid('a'), at: new Date().toISOString(), userId, text });
    data.activity = data.activity.slice(0, 200);
    if (mode === 'server') { if (userId) sync('POST', '/api/activity', { text }); }
    else saveLocal();
  }
  function nextTicketRef() { data.counters.ticket = (data.counters.ticket || 1000) + 1; save(); return 'MT-' + data.counters.ticket; }
  function nextRequestRef() { data.counters.req = (data.counters.req || 100) + 1; save(); return 'REQ-' + new Date().getFullYear() + '-' + String(data.counters.req).padStart(4, '0'); }

  /* ===== الحساب ===== */
  const session = {
    get() { return mode === 'server' ? serverUser : readRaw(SESSION_KEY); },
    set(id) { if (mode === 'local') writeRaw(SESSION_KEY, id); },
    clear() { if (mode === 'local') removeRaw(SESSION_KEY); }
  };
  const auth = {
    async login(username, password) {
      if (mode === 'server') { const r = await api('POST', '/api/auth/login', { username, password }); await refresh(); return r.user; }
      const u = coll('users').find((x) => x.username.toLowerCase() === String(username).toLowerCase() && x.password === password);
      if (!u) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
      if (!u.active) throw new Error('هذا الحساب موقوف. تواصل مع مدير النظام.');
      session.set(u.id); return u;
    },
    async logout() {
      if (mode === 'server') { try { await api('POST', '/api/auth/logout'); } catch (e) { /* ignore */ } await refresh(); }
      else session.clear();
    },
    async changePassword(userId, current, next) {
      if (mode === 'server') return api('POST', '/api/auth/password', { current, password: next });
      const u = byId('users', userId);
      if (!u || u.password !== current) throw new Error('كلمة المرور الحالية غير صحيحة.');
      upsert('users', { id: userId, password: next });
    }
  };

  /* ===== الإدارة ===== */
  async function reset() {
    if (mode === 'server') { await api('POST', '/api/admin/reset'); await refresh(); return data; }
    data = seed(); saveLocal(); return data;
  }
  async function importJSON(text) {
    const obj = JSON.parse(text);
    for (const k of ['users', 'labs', 'devices', 'bookings', 'tickets']) if (!Array.isArray(obj[k])) throw new Error('الملف لا يحتوي على «' + k + '»');
    obj.activity = obj.activity || [];
    obj.counters = obj.counters || { ticket: 1000 + obj.tickets.length };
    if (mode === 'server') { await api('POST', '/api/admin/import', obj); await refresh(); return; }
    migrate(obj); data = obj; saveLocal();
  }
  async function exportJSON() { return mode === 'server' ? api('GET', '/api/admin/export') : JSON.parse(JSON.stringify(data)); }

  /* ===== الواجهة العامة للزوار ===== */
  const pub = {
    async createTicket(t) { const r = await api('POST', '/api/public/tickets', t); await refresh(); return r.item; },
    async track(ref, email) { return (await api('POST', '/api/public/track', { ref, email })).item; },
    async comment(ref, email, text) { return (await api('POST', '/api/public/comment', { ref, email, text })).item; }
  };

  const prefs = {
    get(k, d) { const v = readRaw('labms.pref.' + k); return v === null ? d : v; },
    set(k, v) { writeRaw('labms.pref.' + k, v); }
  };

  window.Store = {
    init, refresh, save, reset, importJSON, exportJSON, coll, byId, upsert, remove, localOnly, log, nextTicketRef, nextRequestRef, session, auth, prefs, pub,
    on(ev, fn) { handlers[ev].push(fn); },
    get mode() { return mode; },
    get busy() { return pending > 0; },
    util: { iso, addDays, pad, uid, weekStart, workday, isWorkday },
    get data() { return data; }
  };
})();
