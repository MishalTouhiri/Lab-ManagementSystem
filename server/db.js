/* قاعدة البيانات: SQLite المدمجة في Node.js (بدون مكتبات خارجية) */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

/*
 * لكل مجموعة جدول بأعمدة حقيقية + أعمدة JSON للقوائم المتداخلة (السجلات والمرفقات)
 * fk: [العمود، الجدول المرجعي، سلوك الحذف]
 */
const SCHEMA = {
  campuses: { table: 'campuses', cols: ['code', 'name', 'city', 'address'] },
  users: { table: 'users', cols: ['name', 'username', 'role', 'email', 'phone', 'dept', 'active'], bool: ['active'] },
  departments: { table: 'departments', cols: ['code', 'name', 'managerId', 'ext', 'building'], fk: [['managerId', 'users', 'SET NULL']] },
  deviceTypes: { table: 'device_types', cols: ['name', 'calibration'], bool: ['calibration'] },
  semesters: { table: 'semesters', cols: ['name', 'start', 'end'] },
  labs: {
    table: 'labs', cols: ['code', 'name', 'type', 'campusId', 'building', 'room', 'capacity', 'supervisorId', 'status', 'open', 'close', 'dept', 'description'], int: ['capacity'],
    fk: [['campusId', 'campuses', 'RESTRICT'], ['supervisorId', 'users', 'SET NULL']]
  },
  stations: { table: 'stations', cols: ['labId', 'code', 'name', 'note'], fk: [['labId', 'labs', 'CASCADE']] },
  devices: {
    table: 'devices', cols: ['tag', 'name', 'type', 'labId', 'stationId', 'model', 'serial', 'barcode', 'status', 'purchaseDate', 'warrantyEnd', 'calibrationDue', 'notes'], json: ['history'],
    fk: [['type', 'device_types', 'RESTRICT'], ['labId', 'labs', 'CASCADE'], ['stationId', 'stations', 'SET NULL']]
  },
  bookings: {
    table: 'bookings', cols: ['labId', 'title', 'userId', 'date', 'start', 'end', 'attendees', 'status', 'notes', 'reason', 'createdAt'], int: ['attendees'],
    fk: [['labId', 'labs', 'CASCADE'], ['userId', 'users', 'SET NULL']]
  },
  tickets: {
    table: 'tickets', cols: ['ref', 'labId', 'stationId', 'deviceId', 'title', 'description', 'issueType', 'priority', 'status', 'reporterId', 'assigneeId', 'createdAt', 'resolvedAt', 'semesterId', 'resolution', 'forwardedIT'],
    bool: ['forwardedIT'], json: ['deviceIds', 'log', 'attachments', 'approval', 'guest'],
    fk: [['labId', 'labs', 'CASCADE'], ['stationId', 'stations', 'SET NULL'], ['deviceId', 'devices', 'SET NULL'], ['reporterId', 'users', 'SET NULL'], ['assigneeId', 'users', 'SET NULL'], ['semesterId', 'semesters', 'SET NULL']]
  },
  requests: {
    table: 'requests', cols: ['ref', 'type', 'title', 'fromDept', 'toDept', 'requesterId', 'assigneeId', 'priority', 'status', 'dueDate', 'createdAt', 'completedAt', 'deviceId', 'labId', 'date', 'start', 'end', 'attendees', 'targetLabId', 'qty', 'loanFrom', 'loanTo', 'bookingId', 'description'],
    int: ['attendees', 'qty'], json: ['items', 'log'], fk: [['requesterId', 'users', 'SET NULL']]
  },
  activity: { table: 'activity', cols: ['at', 'userId', 'text'], fk: [['userId', 'users', 'SET NULL']] }
};
const ORDER = ['campuses', 'users', 'departments', 'deviceTypes', 'semesters', 'labs', 'stations', 'devices', 'bookings', 'tickets', 'requests', 'activity'];
const snake = (k) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const q = (n) => '"' + n + '"';

function open(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  for (const name of ORDER) {
    const t = SCHEMA[name];
    const fkCols = new Map((t.fk || []).map((f) => [f[0], f]));
    const cols = t.cols.map((c) => {
      const type = (t.int || []).includes(c) || (t.bool || []).includes(c) ? 'INTEGER' : 'TEXT';
      const f = fkCols.get(c);
      return q(snake(c)) + ' ' + type + (f ? ' REFERENCES ' + q(f[1]) + '(id) ON DELETE ' + f[2] : '');
    });
    (t.json || []).forEach((c) => cols.push(q(snake(c)) + ' TEXT'));
    if (name === 'users') cols.push('password_hash TEXT', 'password_salt TEXT');
    db.exec('CREATE TABLE IF NOT EXISTS ' + q(t.table) + ' (id TEXT PRIMARY KEY, ' + cols.join(', ') + ', extra TEXT)');
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users(username);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_devices_tag ON devices(tag);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_tickets_ref ON tickets(ref);
    CREATE INDEX IF NOT EXISTS ix_bookings_lab_date ON bookings(lab_id, date);
    CREATE INDEX IF NOT EXISTS ix_devices_lab ON devices(lab_id);
    CREATE INDEX IF NOT EXISTS ix_tickets_lab ON tickets(lab_id, status);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  return db;
}

function toRow(name, obj) {
  const t = SCHEMA[name];
  const fks = new Set((t.fk || []).map((f) => f[0]));
  const row = { id: obj.id };
  const known = new Set(['id', ...t.cols, ...(t.json || []), 'password']);
  t.cols.forEach((c) => {
    let v = obj[c];
    if ((t.bool || []).includes(c)) v = v ? 1 : 0;
    else if ((t.int || []).includes(c)) v = v === '' || v === undefined || v === null ? null : Number(v);
    else if (v === undefined || v === null) v = fks.has(c) ? null : '';
    else v = String(v);
    if (fks.has(c) && v === '') v = null;
    row[snake(c)] = v;
  });
  (t.json || []).forEach((c) => { row[snake(c)] = obj[c] === undefined ? null : JSON.stringify(obj[c]); });
  const extra = {};
  Object.keys(obj).forEach((k) => { if (!known.has(k)) extra[k] = obj[k]; });
  row.extra = Object.keys(extra).length ? JSON.stringify(extra) : null;
  return row;
}
function fromRow(name, row) {
  if (!row) return null;
  const t = SCHEMA[name];
  const o = { id: row.id };
  t.cols.forEach((c) => {
    let v = row[snake(c)];
    if ((t.bool || []).includes(c)) v = !!v;
    else if ((t.int || []).includes(c)) v = v === null ? '' : Number(v);
    else if (v === null) v = '';
    o[c] = v;
  });
  (t.json || []).forEach((c) => { const v = row[snake(c)]; if (v !== null && v !== undefined) o[c] = JSON.parse(v); });
  if (row.extra) Object.assign(o, JSON.parse(row.extra));
  return o;
}

function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(String(pw), salt, 32).toString('hex') };
}
function checkPassword(pw, salt, hash) {
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(pw), salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

function createRepo(db) {
  const stmtCache = new Map();
  const st = (sql) => { if (!stmtCache.has(sql)) stmtCache.set(sql, db.prepare(sql)); return stmtCache.get(sql); };
  const repo = {
    db,
    SCHEMA, ORDER,
    all(name) { return st('SELECT * FROM ' + q(SCHEMA[name].table) + ' ORDER BY rowid').all().map((r) => fromRow(name, r)); },
    get(name, id) { return fromRow(name, st('SELECT * FROM ' + q(SCHEMA[name].table) + ' WHERE id = ?').get(id)); },
    find(name, col, val) { return fromRow(name, st('SELECT * FROM ' + q(SCHEMA[name].table) + ' WHERE ' + q(snake(col)) + ' = ?').get(val)); },
    upsert(name, obj) {
      const row = toRow(name, obj);
      const keys = Object.keys(row);
      const sql = 'INSERT INTO ' + q(SCHEMA[name].table) + ' (' + keys.map(q).join(', ') + ') VALUES (' + keys.map(() => '?').join(', ') + ') ON CONFLICT(id) DO UPDATE SET ' + keys.filter((k) => k !== 'id').map((k) => q(k) + ' = excluded.' + q(k)).join(', ');
      st(sql).run(...keys.map((k) => row[k]));
      if (name === 'users' && obj.password) repo.setPassword(obj.id, obj.password);
      repo.bump();
      return repo.get(name, obj.id);
    },
    remove(name, id) { st('DELETE FROM ' + q(SCHEMA[name].table) + ' WHERE id = ?').run(id); repo.bump(); },
    setPassword(userId, pw) { const p = hashPassword(pw); st('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(p.hash, p.salt, userId); },
    verifyLogin(username, pw) {
      const row = st('SELECT * FROM users WHERE lower(username) = lower(?)').get(String(username || ''));
      if (!row || !checkPassword(pw, row.password_salt, row.password_hash)) return null;
      return fromRow('users', row);
    },
    verifyPassword(userId, pw) { const row = st('SELECT password_salt, password_hash FROM users WHERE id = ?').get(userId); return !!row && checkPassword(pw, row.password_salt, row.password_hash); },
    createSession(userId) {
      const token = crypto.randomBytes(32).toString('hex');
      const now = new Date(), exp = new Date(now.getTime() + 7 * 864e5);
      st('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, now.toISOString(), exp.toISOString());
      return token;
    },
    sessionUser(token) {
      if (!token) return null;
      const s = st('SELECT * FROM sessions WHERE token = ?').get(token);
      if (!s || s.expires_at < new Date().toISOString()) return null;
      const u = repo.get('users', s.user_id);
      return u && u.active ? u : null;
    },
    dropSession(token) { st('DELETE FROM sessions WHERE token = ?').run(token); },
    nextCounter(name, start) {
      const cur = st('SELECT value FROM counters WHERE name = ?').get(name);
      const v = (cur ? cur.value : start) + 1;
      st('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(name, v);
      return v;
    },
    setCounter(name, v) { st('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)').run(name, v); },
    counters() { const o = {}; st('SELECT * FROM counters').all().forEach((r) => { o[r.name] = r.value; }); return o; },
    version() { const r = st("SELECT value FROM meta WHERE key = 'version'").get(); return r ? Number(r.value) : 0; },
    bump() { st("INSERT INTO meta (key, value) VALUES ('version', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1").run(); },
    meta(key, val) {
      if (val === undefined) { const r = st('SELECT value FROM meta WHERE key = ?').get(key); return r ? r.value : null; }
      st('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(val));
    },
    /* استيراد مجموعة بيانات كاملة (البيانات التجريبية أو نسخة احتياطية) */
    importAll(data, keepPasswords) {
      const oldHashes = new Map();
      if (keepPasswords) st('SELECT id, password_hash, password_salt FROM users').all().forEach((r) => oldHashes.set(r.id, r));
      db.exec('PRAGMA foreign_keys = OFF; BEGIN');
      try {
        [...ORDER].reverse().forEach((n) => db.exec('DELETE FROM ' + q(SCHEMA[n].table)));
        db.exec('DELETE FROM sessions; DELETE FROM counters;');
        for (const n of ORDER) {
          (data[n] || []).forEach((o) => {
            const row = toRow(n, o);
            const keys = Object.keys(row);
            st('INSERT INTO ' + q(SCHEMA[n].table) + ' (' + keys.map(q).join(', ') + ') VALUES (' + keys.map(() => '?').join(', ') + ')').run(...keys.map((k) => row[k]));
            if (n === 'users') {
              if (o.password) repo.setPassword(o.id, o.password);
              else if (oldHashes.has(o.id)) st('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(oldHashes.get(o.id).password_hash, oldHashes.get(o.id).password_salt, o.id);
              else repo.setPassword(o.id, 'changeme123');
            }
          });
        }
        const c = data.counters || {};
        repo.setCounter('ticket', c.ticket || 1000);
        repo.setCounter('req', c.req || 100);
        repo.meta('seededAt', data.seededAt || new Date().toISOString());
        db.exec('COMMIT; PRAGMA foreign_keys = ON;');
      } catch (e) { db.exec('ROLLBACK; PRAGMA foreign_keys = ON;'); throw e; }
      repo.bump();
    },
    exportAll() {
      const out = { version: 1, seededAt: repo.meta('seededAt'), exportedAt: new Date().toISOString(), counters: repo.counters() };
      ORDER.forEach((n) => { out[n] = repo.all(n); });
      out.activity = out.activity.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      return out;
    },
    isEmpty() { return st('SELECT COUNT(*) AS c FROM users').get().c === 0; }
  };
  return repo;
}

module.exports = { open, createRepo, SCHEMA, ORDER, snake };
