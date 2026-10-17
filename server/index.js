/* خادم منصة مِختبَر: واجهة برمجية REST + ملفات الواجهة الأمامية
 * التشغيل: node server.js  ثم افتح http://localhost:3000
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { open, createRepo } = require('./db');
const LabSeed = require('../assets/js/seed.js');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'data', 'labms.db');
const COOKIE = 'labms_sid';

const repo = createRepo(open(DB_FILE));
if (repo.isEmpty()) { repo.importAll(LabSeed.seed()); console.log('• أُنشئت قاعدة البيانات بالبيانات التجريبية'); }

/* ===== أدوات ===== */
const nowISO = () => new Date().toISOString();
const today = () => LabSeed.util.iso(new Date());
const uid = LabSeed.util.uid;
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const strip = (u) => { if (!u) return u; const o = Object.assign({}, u); delete o.password; return o; };

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'حجم البيانات أكبر من المسموح')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new HttpError(400, 'صيغة البيانات غير صحيحة')); } });
    req.on('error', reject);
  });
}
function cookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
function send(res, status, body, headers) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(data);
}

/* ===== الصلاحيات ===== */
const isAdmin = (u) => u && u.role === 'admin';
const labOf = (id) => repo.get('labs', id);
const deptOf = (name) => repo.find('departments', 'name', name);
const manages = (u, labId) => isAdmin(u) || (u && u.role === 'supervisor' && (labOf(labId) || {}).supervisorId === u.id);
const actsFor = (u, dept) => isAdmin(u) || (u && u.dept === dept && (u.role === 'supervisor' || (deptOf(dept) || {}).managerId === u.id));
const canSeeTicket = (u, t) => isAdmin(u) || u.role === 'committee' || manages(u, t.labId) || t.reporterId === u.id || t.assigneeId === u.id || (u.role === 'it' && !!t.forwardedIT);
const processes = (u, t) => manages(u, t.labId) || (u.role === 'it' && !!t.forwardedIT) || u.role === 'committee';
const seesRequest = (u, r) => isAdmin(u) || u.dept === r.fromDept || u.dept === r.toDept || r.requesterId === u.id;
const devIdsOf = (t) => (t.deviceIds && t.deviceIds.length ? t.deviceIds : (t.deviceId ? [t.deviceId] : []));

/* البلاغ كما يراه مستخدم لا يعالجه: بدون الملاحظات الداخلية وبريد الزائر */
function ticketFor(u, t) {
  if (isAdmin(u) || processes(u, t)) return t;
  const c = Object.assign({}, t, { log: (t.log || []).filter((e) => !e.internal) });
  if (c.guest) c.guest = { name: c.guest.name, email: '' };
  return c;
}
/* ما يراه كل مستخدم من البيانات */
function dataFor(u) {
  const all = {};
  repo.ORDER.forEach((n) => { all[n] = repo.all(n); });
  all.activity.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  all.activity = all.activity.slice(0, 200);
  const base = { version: 1, seededAt: repo.meta('seededAt'), counters: repo.counters(), flags: { gp: true } };
  if (!u) {
    // الزائر: ما يلزم نموذج الإبلاغ فقط
    return Object.assign(base, {
      campuses: all.campuses, deviceTypes: all.deviceTypes, semesters: all.semesters,
      labs: all.labs.map((l) => ({ id: l.id, code: l.code, name: l.name, type: l.type, campusId: l.campusId, building: l.building, room: l.room, status: l.status, supervisorId: '', capacity: l.capacity, open: l.open, close: l.close, dept: l.dept, description: '' })),
      stations: all.stations, devices: all.devices.map((d) => ({ id: d.id, tag: d.tag, name: d.name, type: d.type, labId: d.labId, stationId: d.stationId, status: d.status })),
      users: [], departments: [], bookings: [], tickets: [], requests: [], activity: []
    });
  }
  all.users = all.users.map(strip);
  all.tickets = all.tickets.filter((t) => canSeeTicket(u, t)).map((t) => ticketFor(u, t));
  all.requests = all.requests.filter((r) => seesRequest(u, r));
  return Object.assign(base, all);
}

function canWrite(u, coll, item, old) {
  if (isAdmin(u)) return true;
  switch (coll) {
    case 'campuses': case 'deviceTypes': case 'semesters': case 'departments': return false;
    case 'users': return !!old && item.id === u.id;
    case 'labs': return !!old && manages(u, old.id) && item.supervisorId === old.supervisorId;
    case 'stations': case 'devices': return manages(u, item.labId) && (!old || manages(u, old.labId));
    case 'bookings': return old ? (old.userId === u.id || manages(u, old.labId)) : item.userId === u.id;
    case 'tickets': return old ? canSeeTicket(u, old) : item.reporterId === u.id;
    case 'requests': return old ? seesRequest(u, old) : (u.role !== 'student' && item.requesterId === u.id);
    default: return false;
  }
}
function canDelete(u, coll, old) {
  if (isAdmin(u)) return true;
  if (coll === 'stations' || coll === 'devices') return manages(u, old.labId);
  return false;
}

/* ===== قواعد العمل على الخادم ===== */
function bookingConflict(b) {
  return repo.all('bookings').find((x) => x.id !== b.id && x.labId === b.labId && x.date === b.date && (x.status === 'approved' || x.status === 'pending') && x.start < b.end && b.start < x.end);
}
function validateBooking(b, u) {
  const l = labOf(b.labId);
  if (!l) fail(400, 'المعمل غير موجود.');
  if (!(b.status === 'approved' || b.status === 'pending')) return;
  if (b.end <= b.start) fail(400, 'وقت النهاية يجب أن يكون بعد وقت البداية.');
  if (Number(b.attendees) > Number(l.capacity)) fail(400, 'عدد الحضور أكبر من سعة المعمل (' + l.capacity + ').');
  const c = bookingConflict(b);
  if (c) fail(409, 'يتعارض مع حجز «' + c.title + '» (' + c.start + '–' + c.end + ').');
  if (b.status === 'approved' && !manages(u, b.labId) && !(b.notes || '').startsWith('من الطلب')) b.status = 'pending';
}
function setDeviceStatus(id, to, text, userId) {
  const d = repo.get('devices', id);
  if (!d || d.status === to) return;
  d.history = (d.history || []).concat([{ at: nowISO(), userId: userId || '', kind: 'status', from: d.status, to, text: text || '' }]);
  d.status = to;
  repo.upsert('devices', d);
}
function ticketEffects(t, old, u) {
  const ids = devIdsOf(t);
  if (!old) ids.forEach((id) => { const d = repo.get('devices', id); if (d && d.status === 'working') setDeviceStatus(id, t.priority === 'urgent' ? 'broken' : 'maintenance', 'بسبب البلاغ ' + t.ref, u ? u.id : ''); });
  if (old && old.status !== 'resolved' && t.status === 'resolved') {
    const others = repo.all('tickets').filter((x) => x.id !== t.id && x.status !== 'resolved');
    ids.forEach((id) => { const d = repo.get('devices', id); if (d && (d.status === 'maintenance' || d.status === 'broken') && !others.some((x) => devIdsOf(x).includes(id))) setDeviceStatus(id, 'working', 'بعد حل البلاغ ' + t.ref, u.id); });
  }
  if (old && old.status === 'resolved' && t.status === 'open') ids.forEach((id) => { const d = repo.get('devices', id); if (d && d.status === 'working') setDeviceStatus(id, 'maintenance', 'إعادة فتح البلاغ ' + t.ref, u.id); });
  if (old && old.approval && old.approval.status === 'pending' && t.approval && t.approval.status === 'approved' && t.approval.kind === 'retire') ids.forEach((id) => setDeviceStatus(id, 'retired', 'بقرار لجنة المعامل · ' + t.ref, u.id));
}
function checkTicket(t, old, u) {
  if (!old) {
    if (!t.ref || repo.find('tickets', 'ref', t.ref)) t.ref = 'MT-' + repo.nextCounter('ticket', 1000);
    else { const n = parseInt(String(t.ref).replace(/\D/g, ''), 10); if (n) repo.setCounter('ticket', n); }
    return;
  }
  const pend = old.approval && old.approval.status === 'pending';
  if (pend && t.status === 'resolved' && old.status !== 'resolved') fail(409, 'لا يمكن إغلاق البلاغ قبل قرار لجنة المعامل.');
  if (pend && t.approval && t.approval.status !== 'pending' && !(isAdmin(u) || u.role === 'committee')) fail(403, 'قرار الموافقة من صلاحية لجنة المعامل.');
  if (t.status !== old.status && !processes(u, old) && !(t.reporterId === u.id && t.status === old.status)) fail(403, 'لا تملك صلاحية تغيير حالة هذا البلاغ.');
}
function requestEffects(r, old, u) {
  if (!old) {
    if (!r.ref || repo.find('requests', 'ref', r.ref)) r.ref = 'REQ-' + new Date().getFullYear() + '-' + String(repo.nextCounter('req', 100)).padStart(4, '0');
    else { const n = parseInt(String(r.ref).split('-').pop(), 10); if (n) repo.setCounter('req', n); }
    return;
  }
  if (old.status !== r.status && ['review', 'approved', 'info', 'rejected', 'progress', 'done'].includes(r.status) && !actsFor(u, old.toDept) && !(r.status === 'review' && old.status === 'info' && (old.requesterId === u.id || actsFor(u, old.fromDept)))) fail(403, 'القرار في هذا الطلب من صلاحية القسم المستلم.');
  if (old.status !== 'approved' && r.status === 'approved' && r.type === 'lab' && r.labId) {
    const l = labOf(r.labId) || {};
    const b = { id: r.bookingId || uid('bk'), labId: r.labId, title: r.title + ' (' + ((deptOf(r.fromDept) || {}).code || '') + ')', userId: r.requesterId, date: r.date, start: r.start, end: r.end, attendees: r.attendees, status: 'approved', notes: 'من الطلب ' + r.ref, createdAt: today() };
    if (!repo.get('bookings', b.id)) { const c = bookingConflict(b); if (c) fail(409, 'تعذّر إضافة الحجز: يتعارض مع «' + c.title + '».'); if (Number(b.attendees) > Number(l.capacity)) fail(400, 'عدد الحضور أكبر من سعة المعمل.'); repo.upsert('bookings', b); }
    r.bookingId = b.id;
  }
  if ((r.status === 'rejected' || r.status === 'cancelled') && r.bookingId && old.status !== r.status) {
    const b = repo.get('bookings', r.bookingId);
    if (b && b.status === 'approved') repo.upsert('bookings', Object.assign(b, { status: 'cancelled', reason: 'أُلغي الطلب ' + r.ref }));
  }
  if (old.status !== 'done' && r.status === 'done' && r.type === 'transfer' && r.deviceId && r.targetLabId) {
    const d = repo.get('devices', r.deviceId);
    if (d && d.labId !== r.targetLabId) {
      d.history = (d.history || []).concat([{ at: nowISO(), userId: u.id, kind: 'move', from: d.labId, to: r.targetLabId, text: 'بموجب الطلب ' + r.ref }]);
      d.labId = r.targetLabId; d.stationId = '';
      repo.upsert('devices', d);
    }
  }
}
function departmentRename(oldName, newName) {
  if (!oldName || oldName === newName) return;
  repo.all('users').filter((x) => x.dept === oldName).forEach((x) => repo.upsert('users', Object.assign(x, { dept: newName })));
  repo.all('labs').filter((x) => x.dept === oldName).forEach((x) => repo.upsert('labs', Object.assign(x, { dept: newName })));
  repo.all('requests').forEach((x) => { if (x.fromDept === oldName || x.toDept === oldName) repo.upsert('requests', Object.assign(x, { fromDept: x.fromDept === oldName ? newName : x.fromDept, toDept: x.toDept === oldName ? newName : x.toDept })); });
}
function logActivity(userId, text) { repo.upsert('activity', { id: uid('a'), at: nowISO(), userId: userId || '', text: String(text).slice(0, 300) }); }

/* ===== المسارات ===== */
async function api(req, res, url) {
  const method = req.method;
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // بعد /api
  const token = cookies(req)[COOKIE];
  const me = repo.sessionUser(token);
  const needUser = () => { if (!me) fail(401, 'سجّل الدخول أولًا.'); return me; };

  if (parts[0] === 'health') return send(res, 200, { ok: true, db: 'sqlite', version: repo.version() });
  if (parts[0] === 'version') return send(res, 200, { version: repo.version() });
  if (parts[0] === 'data' && method === 'GET') return send(res, 200, { user: strip(me), data: dataFor(me) });

  if (parts[0] === 'auth') {
    if (parts[1] === 'login' && method === 'POST') {
      const b = await readBody(req, 1e4);
      const u = repo.verifyLogin(b.username, b.password);
      if (!u) fail(401, 'اسم المستخدم أو كلمة المرور غير صحيحة.');
      if (!u.active) fail(403, 'هذا الحساب موقوف. تواصل مع مدير النظام.');
      const t = repo.createSession(u.id);
      return send(res, 200, { user: strip(u) }, { 'Set-Cookie': COOKIE + '=' + t + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800' });
    }
    if (parts[1] === 'logout' && method === 'POST') { if (token) repo.dropSession(token); return send(res, 200, { ok: true }, { 'Set-Cookie': COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }); }
    if (parts[1] === 'password' && method === 'POST') {
      const u = needUser(); const b = await readBody(req, 1e4);
      if (!repo.verifyPassword(u.id, b.current)) fail(400, 'كلمة المرور الحالية غير صحيحة.');
      if (!b.password || String(b.password).length < 6) fail(400, 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.');
      repo.setPassword(u.id, b.password);
      return send(res, 200, { ok: true });
    }
  }

  if (parts[0] === 'public') {
    const b = await readBody(req, 6e6);
    const findTicket = () => {
      const t = repo.find('tickets', 'ref', String(b.ref || '').toUpperCase());
      const email = String(b.email || '').toLowerCase();
      if (!t || !((t.guest && t.guest.email === email) || ((repo.get('users', t.reporterId) || {}).email || '').toLowerCase() === email)) fail(404, 'لا يوجد بلاغ بهذا الرقم مسجل بهذا البريد. تأكد من الرقم والبريد.');
      return t;
    };
    const publicView = (t) => Object.assign({}, t, { log: (t.log || []).filter((e) => !e.internal), guest: t.guest ? { name: t.guest.name, email: t.guest.email } : null });
    if (parts[1] === 'tickets' && method === 'POST') {
      const email = String(b.guest && b.guest.email || '').toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'اكتب بريدًا إلكترونيًا صحيحًا.');
      const l = labOf(b.labId); if (!l) fail(400, 'اختر المعمل.');
      if (!b.title || String(b.title).trim().length < 4) fail(400, 'اكتب عنوانًا واضحًا للبلاغ.');
      const sem = repo.all('semesters').find((s) => today() >= s.start && today() <= s.end) || {};
      const deviceIds = (b.deviceIds || []).filter((id) => { const d = repo.get('devices', id); return d && d.labId === l.id; });
      const t = { id: uid('tk'), ref: 'MT-' + repo.nextCounter('ticket', 1000), labId: l.id, stationId: b.stationId || '', deviceIds, deviceId: deviceIds[0] || '', title: String(b.title).slice(0, 200), description: String(b.description || '').slice(0, 4000), issueType: b.issueType || 'other', priority: ['low', 'medium', 'high'].includes(b.priority) ? b.priority : 'medium', status: 'open', reporterId: '', guest: { name: String(b.guest.name || '').slice(0, 100), email }, assigneeId: l.supervisorId, createdAt: today(), resolvedAt: '', semesterId: sem.id || '', attachments: (b.attachments || []).slice(0, 3), log: [{ at: nowISO(), userId: '', kind: 'status', status: 'open', text: '' }] };
      repo.upsert('tickets', t);
      ticketEffects(t, null, null);
      logActivity('', 'أبلغ زائر (' + email + ') عن عطل ' + t.ref + ' «' + t.title + '»');
      return send(res, 201, { item: publicView(repo.get('tickets', t.id)) });
    }
    if (parts[1] === 'track' && method === 'POST') return send(res, 200, { item: publicView(findTicket()) });
    if (parts[1] === 'comment' && method === 'POST') {
      const t = findTicket();
      if (!b.text || !String(b.text).trim()) fail(400, 'اكتب رسالتك.');
      t.log = (t.log || []).concat([{ at: nowISO(), userId: '', kind: 'comment', text: String(b.text).slice(0, 2000), internal: false }]);
      repo.upsert('tickets', t);
      return send(res, 200, { item: publicView(t) });
    }
  }

  if (parts[0] === 'activity' && method === 'POST') {
    const u = needUser(); const b = await readBody(req, 1e4);
    logActivity(u.id, b.text || '');
    return send(res, 201, { ok: true });
  }

  if (parts[0] === 'admin') {
    const u = needUser(); if (!isAdmin(u)) fail(403, 'هذه العملية لمدير النظام فقط.');
    if (parts[1] === 'reset' && method === 'POST') { repo.importAll(LabSeed.seed()); const t = repo.createSession(u.id); return send(res, 200, { ok: true }, { 'Set-Cookie': COOKIE + '=' + t + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800' }); }
    if (parts[1] === 'export' && method === 'GET') return send(res, 200, repo.exportAll());
    if (parts[1] === 'import' && method === 'POST') {
      const b = await readBody(req, 50e6);
      for (const k of ['users', 'labs', 'devices', 'bookings', 'tickets']) if (!Array.isArray(b[k])) fail(400, 'الملف لا يحتوي على «' + k + '»');
      LabSeed.migrate(b);
      repo.importAll(b, true);
      const t = repo.createSession(repo.get('users', u.id) ? u.id : (b.users.find((x) => x.role === 'admin') || {}).id);
      return send(res, 200, { ok: true }, { 'Set-Cookie': COOKIE + '=' + t + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800' });
    }
  }

  // CRUD عام: PUT/DELETE /api/:collection/:id
  const coll = parts[0], id = parts[1] ? decodeURIComponent(parts[1]) : '';
  if (repo.SCHEMA[coll] && coll !== 'activity' && id) {
    const u = needUser();
    const old = repo.get(coll, id);
    if (method === 'DELETE') {
      if (!old) return send(res, 200, { ok: true });
      if (!canDelete(u, coll, old)) fail(403, 'لا تملك صلاحية الحذف.');
      if (coll === 'users' && id === u.id) fail(400, 'لا يمكنك حذف حسابك.');
      if (coll === 'campuses' && repo.all('labs').some((l) => l.campusId === id)) fail(409, 'لا يمكن حذف حرم مرتبط بمعامل.');
      if (coll === 'deviceTypes' && repo.all('devices').some((d) => d.type === id)) fail(409, 'لا يمكن حذف نوع مستخدم في أجهزة.');
      repo.remove(coll, id);
      return send(res, 200, { ok: true });
    }
    if (method === 'PUT') {
      const item = await readBody(req, 8e6);
      item.id = id;
      if (!canWrite(u, coll, item, old)) fail(403, 'لا تملك صلاحية تعديل هذه البيانات.');
      if (coll === 'users') {
        if (!isAdmin(u)) { ['role', 'active', 'username', 'dept'].forEach((k) => { item[k] = old[k]; }); delete item.password; }
        if (repo.all('users').some((x) => x.id !== id && x.username.toLowerCase() === String(item.username || '').toLowerCase())) fail(409, 'اسم الدخول مستخدم مسبقًا.');
        if (!old && !item.password) fail(400, 'كلمة المرور مطلوبة للمستخدم الجديد.');
        if (item.password && String(item.password).length < 6) fail(400, 'كلمة المرور يجب ألا تقل عن 6 أحرف.');
      }
      if (coll === 'devices' && repo.all('devices').some((x) => x.id !== id && x.tag === item.tag)) fail(409, 'رقم الأصل ' + item.tag + ' مسجل لجهاز آخر.');
      if (coll === 'tickets' && old && !isAdmin(u) && !processes(u, old)) {
        // المبلّغ يضيف ردودًا فقط، ولا تُمس الملاحظات الداخلية التي لا يراها
        const lastAt = (old.log || []).reduce((m, e) => (e.at > m ? e.at : m), '');
        const added = (item.log || []).filter((e) => e.kind === 'comment' && e.at > lastAt).map((e) => Object.assign({}, e, { userId: u.id, internal: false }));
        Object.keys(item).forEach((k) => delete item[k]);
        Object.assign(item, old, { log: (old.log || []).concat(added) });
      }
      if (coll === 'bookings') validateBooking(item, u);
      if (coll === 'tickets') checkTicket(item, old, u);
      if (coll === 'requests') requestEffects(item, old, u);
      const saved = repo.upsert(coll, item);
      if (coll === 'tickets') ticketEffects(saved, old, u);
      if (coll === 'departments' && old) departmentRename(old.name, saved.name);
      return send(res, old ? 200 : 201, { item: coll === 'users' ? strip(saved) : coll === 'tickets' ? ticketFor(u, saved) : saved });
    }
  }
  fail(404, 'المسار غير موجود.');
}

/* ===== الملفات الثابتة ===== */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '/index.html') p = '/index.html';
  else if (!p.startsWith('/assets/')) { res.writeHead(404); return res.end('Not found'); }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(path.join(ROOT, 'assets')) && file !== path.join(ROOT, 'index.html')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
  try { await api(req, res, url); }
  catch (e) {
    const status = e.status || (/FOREIGN KEY/.test(e.message) ? 409 : /UNIQUE/.test(e.message) ? 409 : 500);
    if (status === 500) console.error(e);
    send(res, status, { error: e.status ? e.message : status === 409 ? 'تعذّر الحفظ: البيانات مرتبطة ببيانات أخرى أو مكررة.' : 'حدث خطأ في الخادم.' });
  }
});

if (require.main === module || process.env.LABMS_AUTOSTART) {
  server.listen(PORT, () => {
    console.log('\n  مِختبَر · نظام إدارة المعامل');
    console.log('  الخادم يعمل على:  http://localhost:' + PORT);
    console.log('  قاعدة البيانات:   ' + DB_FILE + '\n');
  });
}
module.exports = { server, repo };
