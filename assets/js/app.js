/* منصة مِختبَر لإدارة المعامل — التطبيق الرئيسي */
(function () {
  'use strict';

  const S = window.Store, U = window.UI;
  const { h, icon } = U;
  const { iso, addDays, weekStart, pad } = S.util;

  /* ===== القواميس ===== */
  const ROLE = { admin: ['مدير النظام', 'accent'], supervisor: ['مشرف معمل', 'info'], it: ['الدعم الفني', 'ok'], committee: ['عضو لجنة المعامل', 'warn'], faculty: ['عضو هيئة تدريس', ''], student: ['طالب', ''] };
  const LAB_TYPE = { computer: 'حاسب آلي', network: 'شبكات', physics: 'فيزياء', chemistry: 'كيمياء', electronics: 'إلكترونيات' };
  const LAB_STATUS = { active: ['متاح', 'ok'], maintenance: ['تحت الصيانة', 'warn'], closed: ['مغلق', 'bad'] };
  const DEV_TYPE = new Proxy({}, { get: (o, k) => (S.byId('deviceTypes', k) || {}).name || k, ownKeys: () => S.coll('deviceTypes').map((t) => t.id), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  const DEV_STATUS = { working: ['يعمل', 'ok'], maintenance: ['في الصيانة', 'warn'], broken: ['معطّل', 'bad'], retired: ['خارج الخدمة', ''] };
  const BK_STATUS = { approved: ['مؤكد', 'ok'], pending: ['بانتظار الموافقة', 'warn'], rejected: ['مرفوض', 'bad'], cancelled: ['ملغى', ''] };
  const TK_PRI = { low: ['منخفضة', ''], medium: ['متوسطة', 'info'], high: ['عالية', 'warn'], urgent: ['عاجلة', 'bad'] };
  const TK_STATUS = { open: ['مفتوح', 'bad'], in_progress: ['قيد المعالجة', 'warn'], resolved: ['تم الحل', 'ok'] };
  const PRI_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

  let me = null;
  const st = {
    labs: { q: '', type: '', status: '' },
    devices: { q: '', lab: '', status: '', type: '', campus: '' },
    bookings: { tab: '', q: '' },
    tickets: { tab: 'active', q: '', campus: '', type: '', sem: '' },
    schedule: { lab: '', week: 0 },
    reports: { period: 'month' },
    users: { q: '', role: '' },
    req: { box: '', group: 'all', type: '', dept: '', q: '', scroll: 0 },
    labTab: 'stations'
  };

  /* ===== أدوات مساعدة ===== */
  const today = () => iso(new Date());
  const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const lab = (id) => S.byId('labs', id);
  const user = (id) => S.byId('users', id);
  const dev = (id) => S.byId('devices', id);
  const labName = (id) => (lab(id) || {}).name || '—';
  const userName = (id) => (user(id) || {}).name || '—';
  const pill = (map, key) => { const v = map[key] || [key, '']; return '<span class="pill ' + v[1] + '">' + h(v[0]) + '</span>'; };
  const optsOf = (map) => Object.keys(map).map((k) => ({ value: k, label: Array.isArray(map[k]) ? map[k][0] : map[k] }));
  const daysTxt = (n) => n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n <= 10 ? n + ' أيام' : n + ' يومًا';
  const countTxt = (n, one, two, few, many) => n === 0 ? 'لا ' + many : n === 1 ? one : n === 2 ? two : n <= 10 ? n + ' ' + few : n + ' ' + many;
  const firstName = (u) => String(u.name).replace(/^(د\.|م\.|أ\.)\s*/, '').split(' ')[0];

  const isAdmin = () => me.role === 'admin';
  const isStaff = () => me.role === 'admin' || me.role === 'supervisor';
  const managesLab = (labId) => isAdmin() || (me.role === 'supervisor' && (lab(labId) || {}).supervisorId === me.id);
  const canApprove = (b) => managesLab(b.labId);
  const canCancel = (b) => (b.userId === me.id || managesLab(b.labId)) && (b.status === 'pending' || b.status === 'approved') && b.date >= today();
  const canEditBooking = (b) => b.status === 'pending' && b.date >= today() && (b.userId === me.id || managesLab(b.labId));

  const weekDates = (offset) => { const ws = addDays(weekStart(new Date()), offset * 7); return [0, 1, 2, 3, 4].map((i) => iso(addDays(ws, i))); };
  const durMin = (b) => U.toMin(b.end) - U.toMin(b.start);
  const byStart = (a, b) => (a.date + a.start).localeCompare(b.date + b.start);
  function labUtil(l, dates) {
    const avail = (U.toMin(l.close) - U.toMin(l.open)) * dates.length;
    const set = new Set(dates);
    const booked = S.coll('bookings').filter((b) => b.labId === l.id && b.status === 'approved' && set.has(b.date)).reduce((s, b) => s + durMin(b), 0);
    return avail > 0 ? Math.min(100, Math.round((booked / avail) * 100)) : 0;
  }
  function calState(d) {
    if (!d.calibrationDue || d.status === 'retired') return null;
    const days = Math.round((U.parseDate(d.calibrationDue) - U.parseDate(today())) / 864e5);
    return { days, cls: days < 0 ? 'bad' : days <= 14 ? 'warn' : 'ok' };
  }
  function calPill(d) {
    const c = calState(d);
    if (!c) return '<span class="muted small">' + (d.status === 'retired' ? '—' : 'لا تتطلب') + '</span>';
    const txt = c.days < 0 ? 'متأخرة ' + daysTxt(-c.days) : c.days === 0 ? 'مستحقة اليوم' : c.days <= 14 ? 'خلال ' + daysTxt(c.days) : U.fmtDate(d.calibrationDue);
    return '<span class="pill ' + c.cls + '">' + h(txt) + '</span>';
  }
  const pendingForMe = () => isStaff() ? S.coll('bookings').filter((b) => b.status === 'pending' && b.date >= today() && canApprove(b)).sort(byStart) : [];
  const openTicketsForMe = () => S.coll('tickets').filter((t) => t.status !== 'resolved' && (isStaff() ? managesLab(t.labId) : me.role === 'it' ? !!t.forwardedIT : me.role === 'committee' ? false : t.reporterId === me.id));
  const meterCls = (p) => p >= 85 ? 'bad' : p >= 65 ? 'warn' : '';
  const emptyState = (ic, msg) => '<div class="empty">' + icon(ic) + '<span>' + h(msg) + '</span></div>';
  const labElem = (l, size) => '<div class="elem t-' + l.type + '"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '><i>' + h(l.room) + '</i><b>' + h(l.code.split('-')[0]) + '</b><small>' + h(l.code.split('-')[1] || '') + '</small></div>';

  /* ===== المظهر ===== */
  function applyTheme() {
    const t = S.prefs.get('theme', 'system');
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  function isDark() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* ===== التنقل ===== */
  const NAV = [
    { group: 'الرئيسية', items: [{ id: 'dashboard', label: 'لوحة التحكم', icon: 'dashboard' }] },
    {
      group: 'المعامل والمعدات', items: [
        { id: 'campuses', label: 'الحرم الجامعي', icon: 'map' },
        { id: 'labs', label: 'المعامل والمحطات', icon: 'flask' },
        { id: 'devices', label: 'الأجهزة والمعدات', icon: 'cpu' },
        { id: 'schedule', label: 'الجدول الأسبوعي', icon: 'grid' },
        { id: 'bookings', label: 'الحجوزات', icon: 'calendar', count: () => pendingForMe().length }
      ]
    },
    {
      group: 'البلاغات والطلبات', items: [
        { id: 'maintenance', label: 'البلاغات والأعطال', icon: 'wrench', count: () => openTicketsForMe().length },
        { id: 'approvals', label: 'موافقات اللجنة', icon: 'flag', roles: ['admin', 'committee'], count: () => S.coll('tickets').filter(approvalPending).length },
        { id: 'requests', label: 'طلبات الأقسام', icon: 'swap', roles: ['admin', 'supervisor', 'faculty', 'it', 'committee'], count: () => rqInboxCount() }
      ]
    },
    {
      group: 'التقارير والإعدادات', items: [
        { id: 'reports', label: 'التقارير', icon: 'chart', roles: ['admin', 'supervisor', 'committee'] },
        { id: 'users', label: 'المستخدمون والأقسام', icon: 'users', roles: ['admin'] },
        { id: 'reference', label: 'البيانات المرجعية', icon: 'box', roles: ['admin'] },
        { id: 'settings', label: 'الإعدادات', icon: 'settings' }
      ]
    }
  ];
  const allowed = (item) => !item.roles || item.roles.includes(me.role);

  function route() { return (location.hash || '').replace(/^#/, '') || 'dashboard'; }
  function go(r) { if (route() === r) render(); else location.hash = r; }

  /* ===== العرض ===== */
  function render() {
    applyTheme();
    U.closeModal();
    const sid = S.session.get();
    me = sid ? user(sid) : null;
    if (me && !me.active) { S.session.clear(); me = null; }
    if (!me) { const r0 = route(); if (r0 === 'report' || r0 === 'track') return renderPublic(r0); return renderLogin(); }

    const r = route();
    let view;
    if (r.startsWith('lab-')) view = viewLab(r.slice(4));
    else if (r.startsWith('dev-')) view = viewDevicePage(r.slice(4));
    else if (r.startsWith('tk-')) view = viewTicketPage(r.slice(3));
    else if (r.startsWith('req-')) {
      if (me.role === 'student') { location.replace('#dashboard'); return; }
      view = viewRequests(r.slice(4));
    } else {
      const item = NAV.flatMap((g) => g.items).find((i) => i.id === r);
      if (!item || !allowed(item)) { location.replace('#dashboard'); return; }
      view = VIEWS[r]();
    }
    renderShell(view, r.startsWith('lab-') ? 'labs' : r.startsWith('req-') ? 'requests' : r.startsWith('dev-') ? 'devices' : r.startsWith('tk-') ? 'maintenance' : r);
  }

  function renderShell(view, active) {
    const notes = notifications();
    const seen = seenSet();
    const unseen = notes.filter((n) => !seen.has(n.key)).length;
    const nav = NAV.map((g) => {
      const items = g.items.filter(allowed);
      if (!items.length) return '';
      return '<div class="nav-label">' + h(g.group) + '</div><nav class="nav">' + items.map((i) => {
        const c = i.count ? i.count() : 0;
        return '<a href="#' + i.id + '" class="' + (i.id === active ? 'active' : '') + '"' + (i.id === active ? ' aria-current="page"' : '') + '>' + icon(i.icon) + '<span>' + h(i.label) + '</span>' + (c ? '<span class="count">' + c + '</span>' : '') + '</a>';
      }).join('') + '</nav>';
    }).join('');

    document.getElementById('app').innerHTML =
      '<div class="shell" id="shell">' +
      '<aside class="sidebar" aria-label="القائمة الرئيسية">' +
      '<div class="brand"><div class="brand-mark"><small>LM</small>Lb</div><div><div class="brand-name">مِختبَر</div><div class="brand-sub">نظام إدارة المعامل</div></div></div>' +
      nav +
      '<div class="side-foot"><div class="avatar">' + h(U.initials(me.name)) + '</div><div class="who"><b>' + h(me.name) + '</b><span>' + h(ROLE[me.role][0]) + '</span></div>' +
      '<button class="icon-btn" data-act="logout" title="تسجيل الخروج" aria-label="تسجيل الخروج">' + icon('logout') + '</button></div>' +
      '</aside>' +
      '<div class="drawer-backdrop" data-act="closeNav"></div>' +
      '<div class="main">' +
      '<header class="topbar">' +
      '<button class="icon-btn menu-btn" data-act="openNav" aria-label="فتح القائمة">' + icon('menu') + '</button>' +
      '<div style="min-width:0"><div class="crumb">' + h(view.crumb || 'مِختبَر') + '</div><h1>' + h(view.title) + '</h1></div>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-primary hide-sm" data-act="newBooking">' + icon('plus') + 'حجز جديد</button>' +
      '<button class="search-trigger" data-act="palette" aria-label="بحث سريع" title="بحث سريع (Ctrl+K)">' + icon('search') + '<span class="hide-sm">ابحث في المنصة…</span><kbd class="hide-sm">Ctrl K</kbd></button>' +
      '<button class="icon-btn" data-act="toggleTheme" title="تبديل المظهر" aria-label="تبديل المظهر">' + icon(isDark() ? 'sun' : 'moon') + '</button>' +
      '<div class="rel"><button class="icon-btn" data-act="toggleNotif" aria-label="الإشعارات" aria-expanded="false">' + icon('bell') + (unseen ? '<span class="dot">' + unseen + '</span>' : '') + '</button>' +
      '<div class="popover" id="notif-pop" hidden><div class="ph">الإشعارات</div><div class="list">' +
      (notes.length ? notes.map((n) => '<div class="list-item' + (seen.has(n.key) ? '' : ' unseen') + '" data-act="go" data-id="' + n.go + '"><div class="n-ico ' + n.cls + '">' + icon(n.icon) + '</div><div class="grow"><b>' + h(n.title) + '</b><span>' + h(n.sub) + '</span></div></div>').join('') : emptyState('bell', 'لا توجد إشعارات جديدة')) +
      '</div></div></div>' +
      '</header>' +
      '<main class="content" id="view">' + view.html + '</main>' +
      '</div></div>';
    if (view.mount) view.mount(document.getElementById('view'));
    // في عرض القائمة والتفاصيل جنبًا إلى جنب لا نعيد الصفحة للأعلى عند اختيار طلب
    if (active !== lastActive || !(window.matchMedia && window.matchMedia('(min-width: 1101px)').matches)) window.scrollTo(0, 0);
    lastActive = active;
  }
  let lastActive = '';

  function notifications() {
    const out = [];
    pendingForMe().slice(0, 5).forEach((b) => out.push({ key: 'bk:' + b.id, cls: 'warn', icon: 'calendar', title: 'طلب حجز: ' + b.title, sub: labName(b.labId) + ' · ' + U.fmtDay(b.date) + ' · ' + userName(b.userId), go: 'bookings' }));
    if (me.role !== 'student') {
      S.coll('requests').filter((r) => (r.status === 'new' && isReceiver(r) && (r.toDept === me.dept || isAdmin())) || (r.status === 'info' && isSender(r))).slice(0, 4)
        .forEach((r) => out.push({ key: 'rq:' + r.id + ':' + r.status, cls: r.status === 'info' ? 'warn' : 'info', icon: 'swap', title: (r.status === 'info' ? 'مطلوب استكمال: ' : 'طلب وارد من ' + r.fromDept + ': ') + r.title, sub: r.ref + ' · ' + RQ_TYPE[r.type][0], go: 'req-' + r.id }));
    }
    if (me.role === 'it') S.coll('tickets').filter((t) => t.forwardedIT && t.status !== 'resolved').forEach((t) => out.push({ key: 'fw:' + t.id, cls: 'info', icon: 'send', title: 'بلاغ محوّل إليك: ' + t.title, sub: t.ref + ' · ' + labName(t.labId), go: 'tk-' + t.id }));
    if (canDecide()) S.coll('tickets').filter(approvalPending).forEach((t) => out.push({ key: 'ap:' + t.id, cls: 'warn', icon: 'flag', title: 'طلب موافقة: ' + APPROVAL_KIND[t.approval.kind], sub: t.ref + ' · ' + (t.approval.cost ? fmtSAR(t.approval.cost) : 'بدون تكلفة'), go: 'tk-' + t.id }));
    if (isStaff()) {
      S.coll('tickets').filter((t) => t.guest && t.status === 'open' && managesLab(t.labId)).forEach((t) => out.push({ key: 'gs:' + t.id, cls: 'info', icon: 'wrench', title: 'بلاغ من زائر: ' + t.title, sub: t.ref + ' · ' + labName(t.labId), go: 'tk-' + t.id }));
      S.coll('devices').filter((d) => managesLab(d.labId)).forEach((d) => {
        const c = calState(d);
        if (c && c.days <= 7) out.push({ key: 'cal:' + d.id + ':' + d.calibrationDue + ':' + (c.days < 0), cls: c.days < 0 ? 'bad' : 'warn', icon: 'gauge', title: 'معايرة ' + (c.days < 0 ? 'متأخرة' : 'مستحقة') + ': ' + d.name, sub: d.tag + ' · ' + (c.days < 0 ? 'متأخرة ' + daysTxt(-c.days) : c.days === 0 ? 'اليوم' : 'خلال ' + daysTxt(c.days)), go: 'dev-' + d.id });
      });
      S.coll('tickets').filter((t) => t.status === 'open' && (t.priority === 'urgent' || t.priority === 'high') && managesLab(t.labId))
        .forEach((t) => out.push({ key: 'tk:' + t.id, cls: 'bad', icon: 'wrench', title: 'بلاغ ' + TK_PRI[t.priority][0] + ': ' + t.title, sub: t.ref + ' · ' + labName(t.labId), go: 'tk-' + t.id }));
    } else {
      S.coll('bookings').filter((b) => b.userId === me.id && b.date >= today() && (b.status === 'approved' || b.status === 'rejected')).sort(byStart).slice(0, 5)
        .forEach((b) => out.push({ key: 'my:' + b.id + ':' + b.status, cls: b.status === 'approved' ? 'info' : 'bad', icon: b.status === 'approved' ? 'check' : 'x', title: (b.status === 'approved' ? 'تم تأكيد حجزك: ' : 'تم رفض طلبك: ') + b.title, sub: labName(b.labId) + ' · ' + U.fmtDay(b.date), go: 'bookings' }));
    }
    return out;
  }
  /* الإشعارات المقروءة تُحفظ لكل مستخدم حتى لا يبقى العداد مرتفعًا بعد الاطلاع */
  function seenSet() { try { return new Set(JSON.parse(S.prefs.get('seen.' + me.id, '[]'))); } catch (e) { return new Set(); } }
  function markSeen(notes) {
    const seen = seenSet();
    notes.forEach((n) => seen.add(n.key));
    S.prefs.set('seen.' + me.id, JSON.stringify([...seen].slice(-300)));
  }

  /* ===== شاشة الدخول ===== */
  function renderLogin(err, username) {
    const demo = [['admin', 'admin123', 'مدير النظام'], ['supervisor', 'super123', 'مشرف معمل'], ['it', 'it123', 'الدعم الفني'], ['committee', 'committee123', 'لجنة المعامل'], ['faculty', 'faculty123', 'عضو هيئة تدريس'], ['student', 'student123', 'طالب']];
    const cells = S.coll('labs').slice(0, 6).map((l, i) => '<div class="cell' + (i % 2 === 0 ? ' on' : '') + '"><i>' + h(l.room) + '</i><b>' + h(l.code.split('-')[0]) + '</b><small>' + h(l.code.split('-')[1] || '') + '</small></div>').join('');
    const ghosts = ['Cu', 'Si', 'Ge', 'Na', 'Fe', 'Ag'].map((s, i) => '<div class="cell ghost"><i>' + [29, 14, 32, 11, 26, 47][i] + '</i><b>' + s + '</b></div>').join('');
    document.getElementById('app').innerHTML =
      '<div class="login">' +
      '<section class="login-art">' +
      '<div class="brand"><div class="brand-mark"><small>LM</small>Lb</div><div><div class="brand-name">مِختبَر</div><div class="brand-sub">نظام إدارة المعامل</div></div></div>' +
      '<div><h2>كل معامل الكلية في لوحة واحدة.</h2><p class="lead">من الحرم إلى المعمل إلى المحطة إلى الجهاز: حجز بلا تعارض، تتبع كامل لكل جهاز ومعايرته، وبلاغات أعطال تمر على مشرف المعمل ثم الدعم الفني ثم لجنة المعامل.</p></div>' +
      '<div class="ptable" aria-hidden="true">' + cells + ghosts + '</div>' +
      '<div class="foot">الإصدار 1.0 · تعمل البيانات محليًا على هذا الجهاز</div>' +
      '</section>' +
      '<section class="login-form"><form id="login-form" novalidate>' +
      '<div><h1>تسجيل الدخول</h1><p class="muted small">أدخل اسم المستخدم وكلمة المرور.</p></div>' +
      (err ? '<div class="form-error" role="alert">' + icon('alert') + '<span>' + h(err) + '</span></div>' : '') +
      U.field({ name: 'username', label: 'اسم المستخدم', required: true, ltr: true, autocomplete: 'username' }, username || '') +
      U.field({ name: 'password', label: 'كلمة المرور', type: 'password', required: true, ltr: true, autocomplete: 'current-password' }) +
      '<button type="submit" class="btn btn-primary btn-block" style="height:44px">دخول</button>' +
      '<div class="demo"><div class="demo-title">حسابات تجريبية للعرض — اضغط للدخول مباشرة</div><div class="demo-btns">' +
      demo.map((d) => '<button type="button" data-u="' + d[0] + '" data-p="' + d[1] + '"><b>' + h(d[2]) + '</b><span>' + d[0] + ' / ' + d[1] + '</span></button>').join('') +
      '</div></div>' +
      '<div class="guest-links"><a class="btn" href="#report">' + icon('wrench') + 'الإبلاغ عن عطل بدون حساب</a><a class="btn" href="#track">' + icon('search') + 'تتبع بلاغ</a></div>' +
      '</form></section></div>';
    const form = document.getElementById('login-form');
    const tryLogin = (u, p) => {
      const found = S.coll('users').find((x) => x.username.toLowerCase() === u.toLowerCase() && x.password === p);
      if (!u || !p) return renderLogin('أدخل اسم المستخدم وكلمة المرور.', u);
      if (!found) return renderLogin('اسم المستخدم أو كلمة المرور غير صحيحة.', u);
      if (!found.active) return renderLogin('هذا الحساب موقوف. تواصل مع مدير النظام.', u);
      S.session.set(found.id);
      if (route() !== 'dashboard') location.hash = 'dashboard'; else render();
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); const d = U.formData(form); tryLogin(d.username, d.password); });
    form.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => tryLogin(b.dataset.u, b.dataset.p)));
    const first = form.querySelector(username ? '#f-password' : '#f-username');
    if (first) first.focus();
  }

  /* ===== لوحة التحكم ===== */
  function viewDashboard() {
    const t = today();
    const labs = S.coll('labs'), devs = S.coll('devices'), bks = S.coll('bookings'), tks = S.coll('tickets');
    const activeLabs = labs.filter((l) => l.status === 'active').length;
    const inService = devs.filter((d) => d.status !== 'retired');
    const working = inService.filter((d) => d.status === 'working').length;
    const workingPct = inService.length ? Math.round((working / inService.length) * 100) : 0;
    // في عطلة نهاية الأسبوع تعرض اللوحة يوم العمل القادم
    const isToday = S.util.isWorkday(new Date());
    const dayISO = isToday ? t : iso(S.util.workday(new Date(), 0));
    const dayName = isToday ? 'اليوم' : U.DAYS[U.parseDate(dayISO).getDay()];
    const todays = bks.filter((b) => b.date === dayISO && b.status === 'approved').sort(byStart);
    const openT = tks.filter((x) => x.status !== 'resolved');
    const hot = openT.filter((x) => x.priority === 'urgent' || x.priority === 'high').length;
    const week = weekDates(0);
    const calDue = isStaff() ? devs.filter((d) => managesLab(d.labId) && calState(d) && calState(d).days <= 7) : [];
    const pend = pendingForMe();
    const hr = new Date().getHours();
    const now = nowHM();

    let alerts = '';
    if (calDue.length) {
      const late = calDue.filter((d) => calState(d).days < 0).length;
      alerts += '<div class="alert' + (late ? ' bad' : '') + '">' + icon('gauge') + '<div class="grow"><b>' + countTxt(calDue.length, 'جهاز واحد يحتاج', 'جهازان يحتاجان', 'أجهزة تحتاج', 'جهازًا يحتاج') + ' إلى معايرة خلال 7 أيام' + (late ? '، منها ' + late + ' متأخرة' : '') + '.</b> ' +
        h(calDue.map((d) => d.tag).join('، ')) + '</div><button class="btn btn-sm" data-act="devicesCal">عرض الأجهزة</button></div>';
    }
    if (me.role === 'it') {
      const fw = S.coll('tickets').filter((t) => t.forwardedIT && t.status !== 'resolved');
      if (fw.length) alerts += '<div class="alert info">' + icon('send') + '<div class="grow"><b>' + countTxt(fw.length, 'بلاغ واحد محوّل', 'بلاغان محوّلان', 'بلاغات محوّلة', 'بلاغًا محوّلًا') + ' إلى الدعم الفني.</b> ' + h(fw.map((t) => t.ref).join('، ')) + '</div><a class="btn btn-sm" href="#maintenance" data-act="tkTab" data-id="it">عرض البلاغات</a></div>';
    }
    if (canDecide()) {
      const ap = S.coll('tickets').filter(approvalPending);
      if (ap.length) alerts += '<div class="alert">' + icon('flag') + '<div class="grow"><b>' + countTxt(ap.length, 'طلب موافقة واحد', 'طلبا موافقة', 'طلبات موافقة', 'طلب موافقة') + ' بانتظار لجنة المعامل</b> بقيمة ' + fmtSAR(ap.reduce((s0, t) => s0 + (t.approval.cost || 0), 0)) + '.</div><a class="btn btn-sm" href="#approvals">مراجعة الطلبات</a></div>';
    }
    if (me.role !== 'student') {
      const rq = S.coll('requests').filter((r) => rqVisible(r) && rqNeedsMe(r) && (r.toDept === me.dept || r.fromDept === me.dept || r.requesterId === me.id));
      if (rq.length) alerts += '<div class="alert info">' + icon('swap') + '<div class="grow"><b>' + countTxt(rq.length, 'طلب واحد', 'طلبان', 'طلبات', 'طلبًا') + ' بين الأقسام بانتظار إجرائك</b>' + (rq.some(rqLate) ? '، منها ' + rq.filter(rqLate).length + ' متأخر' : '') + '.</div><a class="btn btn-sm" href="#requests">فتح الطلبات</a></div>';
    }
    if (!isStaff()) {
      const mine = bks.filter((b) => b.userId === me.id && b.status === 'pending' && b.date >= t).length;
      if (mine) alerts += '<div class="alert info">' + icon('info') + '<div class="grow">لديك ' + countTxt(mine, 'طلب حجز واحد', 'طلبا حجز', 'طلبات حجز', 'طلب حجز') + ' بانتظار موافقة مشرف المعمل.</div><a class="btn btn-sm" href="#bookings">متابعة الطلبات</a></div>';
    }

    const kpis =
      '<div class="grid grid-kpi">' +
      kpi('المعامل المتاحة', activeLabs + '<span class="muted" style="font-size:1rem"> / ' + labs.length + '</span>', 'flask', '', labs.length - activeLabs ? (labs.length - activeLabs) + ' تحت الصيانة أو مغلقة' : 'جميع المعامل تعمل') +
      kpi('الأجهزة العاملة', workingPct + '%', 'cpu', 'info', working + ' من ' + inService.length + ' جهازًا في الخدمة') +
      kpi('حجوزات ' + (isToday ? 'اليوم' : 'يوم ' + dayName), todays.length, 'calendar', 'warn', pend.length ? countTxt(pend.length, 'طلب واحد', 'طلبان', 'طلبات', 'طلبًا') + ' بانتظار موافقتك' : isToday ? todays.filter((b) => b.start <= now && b.end > now).length + ' جارية الآن' : 'أول يوم عمل قادم') +
      kpi('بلاغات مفتوحة', openT.length, 'wrench', 'bad', hot ? hot + ' بأولوية عالية أو عاجلة' : 'لا توجد بلاغات حرجة') +
      '</div>';

    const util = labs.map((l) => ({ l, p: labUtil(l, week) })).sort((a, b) => b.p - a.p);
    const utilCard = card(S.util.isWorkday(new Date()) ? 'إشغال المعامل هذا الأسبوع' : 'إشغال المعامل للأسبوع القادم', 'نسبة الساعات المحجوزة من ساعات العمل، الأحد إلى الخميس', '<div class="bars">' +
      util.map((x) => '<div class="meter-row"><a class="name" href="#lab-' + x.l.id + '" style="color:inherit;text-decoration:none">' + h(x.l.name) + '</a><div class="meter ' + meterCls(x.p) + '"><span style="width:' + x.p + '%"></span></div><span class="pct">' + (x.l.status === 'active' ? x.p + '%' : '<span class="pill warn">مغلق</span>') + '</span></div>').join('') +
      '</div>', '<a class="btn btn-sm" href="#schedule">الجدول الأسبوعي</a>');

    const counts = { working: 0, maintenance: 0, broken: 0, retired: 0 };
    devs.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });
    const devCard = card('حالة الأجهزة', devs.length + ' جهازًا مسجلًا', U.donut([
      { label: 'يعمل', value: counts.working, color: 'var(--ok)' },
      { label: 'في الصيانة', value: counts.maintenance, color: 'var(--warn)' },
      { label: 'معطّل', value: counts.broken, color: 'var(--bad)' },
      { label: 'خارج الخدمة', value: counts.retired, color: 'var(--muted)' }
    ], workingPct + '%', 'جاهزية'), '<a class="btn btn-sm" href="#devices">كل الأجهزة</a>');

    const todayCard = card(isToday ? 'جدول اليوم' : 'جدول يوم ' + dayName + ' القادم', U.fmtDay(dayISO), todays.length ? '<div class="list">' + todays.slice(0, 8).map((b) => {
      const live = isToday && b.start <= now && b.end > now, done = isToday && b.end <= now;
      return '<div class="list-item" data-act="viewBooking" data-id="' + b.id + '" style="cursor:pointer' + (done ? ';opacity:.6' : '') + '"><div class="time-chip">' + b.start + '<br>' + b.end + '</div><div class="grow"><b>' + h(b.title) + '</b><span>' + h(labName(b.labId)) + ' · ' + h(userName(b.userId)) + '</span></div>' + (live ? '<span class="pill ok">جارية الآن</span>' : done ? '<span class="pill">انتهت</span>' : '') + '</div>';
    }).join('') + '</div>' : emptyState('calendar', 'لا توجد حجوزات مؤكدة في هذا اليوم'), todays.length > 8 ? '<a class="btn btn-sm" href="#schedule">+' + (todays.length - 8) + ' في الجدول</a>' : '', true);

    let side;
    if (isStaff()) {
      side = card('بانتظار موافقتك', pend.length ? countTxt(pend.length, 'طلب واحد', 'طلبان', 'طلبات', 'طلبًا') : 'لا توجد طلبات', pend.length ? '<div class="list">' + pend.slice(0, 5).map((b) =>
        '<div class="list-item"><div class="grow"><b>' + h(b.title) + '</b><span>' + h(labName(b.labId)) + ' · ' + U.fmtDay(b.date) + ' · ' + U.fmtTime(b.start) + '</span></div>' +
        '<button class="icon-btn" style="color:var(--ok)" data-act="approve" data-id="' + b.id + '" title="موافقة" aria-label="موافقة">' + icon('check') + '</button>' +
        '<button class="icon-btn" style="color:var(--bad)" data-act="reject" data-id="' + b.id + '" title="رفض" aria-label="رفض">' + icon('x') + '</button></div>').join('') + '</div>' : emptyState('inbox', 'تمت معالجة كل الطلبات'), pend.length > 5 ? '<a class="btn btn-sm" href="#bookings">عرض الكل</a>' : '', true);
    } else {
      const mine = bks.filter((b) => b.userId === me.id && b.date >= t && b.status !== 'cancelled').sort(byStart).slice(0, 5);
      side = card('حجوزاتي القادمة', '', mine.length ? '<div class="list">' + mine.map((b) => '<div class="list-item" data-act="viewBooking" data-id="' + b.id + '" style="cursor:pointer"><div class="grow"><b>' + h(b.title) + '</b><span>' + h(labName(b.labId)) + ' · ' + U.fmtDay(b.date) + ' · ' + U.fmtTime(b.start) + '</span></div>' + pill(BK_STATUS, b.status) + '</div>').join('') + '</div>' : emptyState('calendar', 'ليس لديك حجوزات قادمة'), '<button class="btn btn-sm" data-act="newBooking">' + icon('plus') + 'حجز</button>', true);
    }

    const acts = S.coll('activity').filter((a) => !/^سجّل (الدخول|الخروج)/.test(a.text)).slice(0, 6);
    const actCard = card('آخر النشاطات', '', acts.length ? '<div class="timeline">' + acts.map((a) => '<div class="ev"><div class="avatar">' + h(U.initials(a.userId ? userName(a.userId) : 'زائر')) + '</div><div><p><b>' + h(a.userId ? userName(a.userId) : 'زائر') + '</b> ' + h(a.text) + '</p><time>' + U.timeAgo(a.at) + '</time></div></div>').join('') + '</div>' : emptyState('clock', 'لا توجد نشاطات بعد'), '', true);

    return {
      title: 'لوحة التحكم', crumb: (hr < 12 ? 'صباح الخير' : 'مساء الخير') + '، ' + firstName(me),
      html: alerts + kpis +
        '<div class="grid grid-2">' + utilCard + devCard + '</div>' +
        '<div class="grid grid-3">' + todayCard + side + actCard + '</div>'
    };
  }
  function kpi(label, value, ic, cls, foot) {
    return '<div class="card kpi"><span class="label">' + h(label) + '</span><div class="ico ' + cls + '">' + icon(ic) + '</div><div class="value">' + value + '</div><div class="foot">' + h(foot) + '</div></div>';
  }
  function card(title, sub, body, actions, flush) {
    return '<section class="card"><div class="card-head"><div><h2>' + h(title) + '</h2>' + (sub ? '<div class="sub">' + h(sub) + '</div>' : '') + '</div>' + (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div><div class="card-body' + (flush ? ' flush' : '') + '">' + body + '</div></section>';
  }

  /* ===== المعامل ===== */
  function viewLabs() {
    const f = st.labs;
    const html =
      '<div class="page-head"><div class="t"><h2>المعامل</h2><p>' + S.coll('labs').length + ' معامل في ' + new Set(S.coll('labs').map((l) => l.building)).size + ' مبانٍ</p></div><div class="actions">' +
      (isAdmin() ? '<button class="btn btn-primary" data-act="newLab">' + icon('plus') + 'إضافة معمل</button>' : '') + '</div></div>' +
      '<div class="card"><div class="toolbar" style="border:0">' +
      '<div class="search">' + icon('search') + '<input class="input" id="lab-q" type="search" placeholder="ابحث باسم المعمل أو رمزه أو المبنى" value="' + h(f.q) + '"></div>' +
      '<select class="select" id="lab-type" aria-label="نوع المعمل"><option value="">كل الأنواع</option>' + optsOf(LAB_TYPE).map((o) => '<option value="' + o.value + '"' + (f.type === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select>' +
      '<select class="select" id="lab-status" aria-label="حالة المعمل"><option value="">كل الحالات</option>' + optsOf(LAB_STATUS).map((o) => '<option value="' + o.value + '"' + (f.status === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select>' +
      '</div></div>' +
      '<div id="lab-list"></div>';
    return {
      title: 'المعامل', crumb: 'التشغيل', html,
      mount(root) {
        const list = root.querySelector('#lab-list');
        const week = weekDates(0);
        const draw = () => {
          const q = f.q.toLowerCase();
          const items = S.coll('labs').filter((l) => (!f.type || l.type === f.type) && (!f.status || l.status === f.status) && (!q || (l.name + ' ' + l.code + ' ' + l.building + ' ' + l.room).toLowerCase().includes(q)));
          list.innerHTML = items.length ? '<div class="lab-grid">' + items.map((l) => {
            const devs = S.coll('devices').filter((d) => d.labId === l.id && d.status !== 'retired');
            const ok = devs.filter((d) => d.status === 'working').length;
            const p = labUtil(l, week);
            const tix = S.coll('tickets').filter((t) => t.labId === l.id && t.status !== 'resolved').length;
            return '<article class="card lab-card"><div class="top">' + labElem(l) +
              '<div style="min-width:0"><h3>' + h(l.name) + '</h3><div class="loc">' + h(campusName(l.campusId)) + ' · ' + h(l.building) + ' · قاعة ' + h(l.room) + '</div></div>' + pill(LAB_STATUS, l.status) + '</div>' +
              '<p class="desc">' + h(l.description) + '</p>' +
              '<div class="stats"><div><b>' + l.capacity + '</b><span>مقعدًا</span></div><div><b>' + ok + '/' + devs.length + '</b><span>أجهزة تعمل</span></div><div><b>' + tix + '</b><span>بلاغات مفتوحة</span></div></div>' +
              '<div class="occ"><div style="display:flex;justify-content:space-between" class="small"><span class="muted">إشغال الأسبوع</span><b class="num">' + p + '%</b></div><div class="meter ' + meterCls(p) + '"><span style="width:' + p + '%"></span></div></div>' +
              '<div class="foot"><a class="btn btn-sm" href="#lab-' + l.id + '">' + icon('eye') + 'التفاصيل</a>' +
              (l.status === 'active' ? '<button class="btn btn-sm btn-primary" data-act="bookLab" data-id="' + l.id + '">' + icon('calendar') + 'حجز</button>' : '<button class="btn btn-sm" disabled>غير متاح للحجز</button>') + '</div></article>';
          }).join('') + '</div>' : '<div class="card">' + emptyState('search', 'لا توجد معامل مطابقة للبحث') + '</div>';
        };
        bindFilters(root, { '#lab-q': ['q', f], '#lab-type': ['type', f], '#lab-status': ['status', f] }, draw);
        draw();
      }
    };
  }

  function viewLab(id) {
    const l = lab(id);
    if (!l) return { title: 'معمل غير موجود', crumb: 'المعامل', html: '<div class="card">' + emptyState('flask', 'لم يتم العثور على المعمل. ربما تم حذفه.') + '<div style="text-align:center;padding-bottom:24px"><a class="btn" href="#labs">العودة إلى المعامل</a></div></div>' };
    const devs = S.coll('devices').filter((d) => d.labId === id);
    const week = weekDates(0);
    const wk = S.coll('bookings').filter((b) => b.labId === id && b.date >= week[0] && b.date <= week[4] && b.status !== 'cancelled').sort(byStart);
    const tix = S.coll('tickets').filter((t) => t.labId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const sup = user(l.supervisorId);
    const p = labUtil(l, week);

    const info = '<section class="card"><div class="card-body" style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">' + labElem(l, 76) +
      '<div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2 style="font-size:var(--fs-xl)">' + h(l.name) + '</h2>' + pill(LAB_STATUS, l.status) + '</div>' +
      '<p class="muted">' + h(l.description) + '</p></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      (l.status === 'active' ? '<button class="btn btn-primary" data-act="bookLab" data-id="' + l.id + '">' + icon('calendar') + 'حجز المعمل</button>' : '') +
      '<button class="btn" data-act="newTicket" data-id="' + l.id + '">' + icon('wrench') + 'إبلاغ عن عطل</button>' +
      (managesLab(l.id) ? '<button class="btn" data-act="editLab" data-id="' + l.id + '">' + icon('edit') + 'تعديل</button>' : '') +
      (isAdmin() ? '<button class="btn btn-danger" data-act="deleteLab" data-id="' + l.id + '">' + icon('trash') + 'حذف</button>' : '') +
      '</div></div>' +
      '<div class="card-body" style="border-top:1px solid var(--line)"><dl class="dl">' +
      '<dt>رمز المعمل</dt><dd><span class="tag">' + h(l.code) + '</span></dd>' +
      '<dt>الموقع</dt><dd>' + h(campusName(l.campusId)) + ' · ' + h(l.building) + ' · قاعة ' + h(l.room) + '</dd>' +
      '<dt>النوع</dt><dd>' + h(LAB_TYPE[l.type]) + '</dd>' +
      '<dt>القسم</dt><dd>' + h(l.dept || '—') + '</dd>' +
      '<dt>السعة</dt><dd>' + l.capacity + ' مقعدًا</dd>' +
      '<dt>ساعات العمل</dt><dd>' + U.fmtTime(l.open) + ' – ' + U.fmtTime(l.close) + ' (الأحد إلى الخميس)</dd>' +
      '<dt>المشرف</dt><dd>' + (sup ? h(sup.name) + ' · <span class="ltr">' + h(sup.email) + '</span>' : '—') + '</dd>' +
      '<dt>إشغال الأسبوع</dt><dd><div style="display:flex;gap:10px;align-items:center;max-width:320px"><div class="meter ' + meterCls(p) + '" style="flex:1"><span style="width:' + p + '%"></span></div><b class="num">' + p + '%</b></div></dd>' +
      '</dl></div></section>';

    const lev = labEvents(id);
    const tabs = [['stations', 'المحطات', S.coll('stations').filter((x) => x.labId === id).length], ['devices', 'الأجهزة', devs.length], ['log', 'سجل الأحداث', lev.length], ['bookings', 'حجوزات هذا الأسبوع', wk.length], ['tickets', 'بلاغات الصيانة', tix.length]];
    const html = info + '<section class="card"><div class="tabs" role="tablist">' + tabs.map((t) => '<button role="tab" data-tab="' + t[0] + '" class="' + (st.labTab === t[0] ? 'on' : '') + '">' + t[1] + '<span class="count">' + t[2] + '</span></button>').join('') + '</div><div id="lab-tab"></div></section>';

    return {
      title: l.name, crumb: 'المعامل / ' + l.code, html,
      mount(root) {
        const box = root.querySelector('#lab-tab');
        const draw = () => {
          root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === st.labTab));
          if (st.labTab === 'stations') box.innerHTML = '<div class="card-body">' + stationsMap(l) + '</div>';
          else if (st.labTab === 'devices') box.innerHTML = devicesTable(devs, true) + (managesLab(l.id) ? '<div style="padding:14px 20px;border-top:1px solid var(--line)"><button class="btn btn-sm" data-act="newDevice" data-id="' + l.id + '">' + icon('plus') + 'إضافة جهاز لهذا المعمل</button></div>' : '');
          else if (st.labTab === 'bookings') box.innerHTML = bookingsTable(wk, true);
          else if (st.labTab === 'log') box.innerHTML = timeline(lev, true, 'لا توجد أحداث مسجلة لهذا المعمل');
          else box.innerHTML = ticketsTable(tix, true);
        };
        root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.labTab = b.dataset.tab; draw(); }));
        draw();
      }
    };
  }

  function labModal(existing) {
    const sups = S.coll('users').filter((u) => (u.role === 'supervisor' || u.role === 'admin') && u.active).map((u) => ({ value: u.id, label: u.name }));
    const v = existing || { type: 'computer', status: 'active', capacity: 24, open: '08:00', close: '18:00', campusId: (S.coll('campuses')[0] || {}).id, supervisorId: me.role === 'supervisor' ? me.id : '' };
    const fields = [
      { name: 'name', label: 'اسم المعمل', required: true, placeholder: 'مثال: معمل الحاسب الآلي 2' },
      { name: 'code', label: 'رمز المعمل', required: true, ltr: true, placeholder: 'CS-102', hint: 'حروف إنجليزية وأرقام، يظهر على باب المعمل' },
      { name: 'type', label: 'نوع المعمل', type: 'select', options: optsOf(LAB_TYPE), required: true },
      { name: 'status', label: 'الحالة', type: 'select', options: optsOf(LAB_STATUS), required: true },
      { name: 'building', label: 'المبنى', required: true, placeholder: 'مبنى 7' },
      { name: 'room', label: 'رقم القاعة', required: true, ltr: true, placeholder: '1.14' },
      { name: 'capacity', label: 'السعة (مقاعد)', type: 'number', min: 1, max: 500, required: true },
      { name: 'supervisorId', label: 'المشرف', type: 'select', options: sups, placeholder: 'اختر المشرف', required: true },
      { name: 'open', label: 'بداية الدوام', type: 'time', required: true },
      { name: 'close', label: 'نهاية الدوام', type: 'time', required: true },
      { name: 'campusId', label: 'الحرم', type: 'select', required: true, options: S.coll('campuses').map((c) => ({ value: c.id, label: c.name })) },
      { name: 'dept', label: 'القسم المالك', type: 'select', required: true, placeholder: 'اختر القسم', options: S.coll('departments').map((d) => ({ value: d.name, label: d.name })) },
      { name: 'description', label: 'وصف وتجهيزات المعمل', type: 'textarea', span: true }
    ];
    U.modal({
      title: existing ? 'تعديل بيانات المعمل' : 'إضافة معمل جديد', body: U.formGrid(fields, v), submitText: existing ? 'حفظ التعديلات' : 'إضافة المعمل',
      onSubmit(form) {
        const d = U.formData(form);
        for (const f of fields) if (f.required && !d[f.name]) return 'الحقل «' + f.label + '» مطلوب.';
        d.code = d.code.toUpperCase();
        if (!/^[A-Z0-9-]{2,12}$/.test(d.code)) return 'رمز المعمل يجب أن يكون من حروف إنجليزية وأرقام وشرطة فقط.';
        if (S.coll('labs').some((x) => x.code === d.code && (!existing || x.id !== existing.id))) return 'الرمز ' + d.code + ' مستخدم لمعمل آخر.';
        d.capacity = parseInt(d.capacity, 10);
        if (!(d.capacity >= 1)) return 'السعة يجب أن تكون رقمًا أكبر من صفر.';
        if (d.close <= d.open) return 'نهاية الدوام يجب أن تكون بعد بدايته.';
        if (existing) d.id = existing.id;
        const saved = S.upsert('labs', d, 'lab');
        S.log(me.id, (existing ? 'عدّل بيانات ' : 'أضاف ') + saved.name);
        U.toast(existing ? 'تم حفظ التعديلات' : 'تمت إضافة المعمل');
        setTimeout(() => existing ? render() : go('lab-' + saved.id));
      }
    });
  }

  /* ===== الأجهزة ===== */
  function devicesTable(items, compact) {
    if (!items.length) return emptyState('cpu', 'لا توجد أجهزة مطابقة');
    return '<div class="table-wrap"><table class="table stack"><thead><tr><th>رقم الأصل</th><th>الجهاز</th>' + (compact ? '' : '<th>المعمل</th>') + '<th>الحالة</th><th>المعايرة القادمة</th><th class="hide-sm">الضمان</th><th></th></tr></thead><tbody>' +
      items.map((d) => {
        const warrantyOk = d.warrantyEnd && d.warrantyEnd >= today();
        return '<tr><td><a class="tag" href="#dev-' + d.id + '">' + h(d.tag) + '</a></td><td><div class="cell-main"><a href="#dev-' + d.id + '" style="color:inherit;text-decoration:none">' + h(d.name) + '</a></div><div class="cell-sub">' + h(d.model) + '</div></td>' +
          (compact ? '' : '<td><a href="#lab-' + d.labId + '" style="color:inherit">' + h(labName(d.labId)) + '</a><div class="cell-sub">' + h(station(d.stationId) ? station(d.stationId).name : '—') + '</div></td>') +
          '<td>' + pill(DEV_STATUS, d.status) + '</td><td>' + calPill(d) + '</td>' +
          '<td class="hide-sm small ' + (warrantyOk ? '' : 'muted') + '">' + (d.warrantyEnd ? (warrantyOk ? 'حتى ' : 'انتهى ') + U.fmtDate(d.warrantyEnd) : '—') + '</td>' +
          '<td><div class="row-actions"><button class="icon-btn" data-act="viewDevice" data-id="' + d.id + '" title="عرض" aria-label="عرض">' + icon('eye') + '</button>' +
          (managesLab(d.labId) ? '<button class="icon-btn" data-act="editDevice" data-id="' + d.id + '" title="تعديل" aria-label="تعديل">' + icon('edit') + '</button><button class="icon-btn" data-act="deleteDevice" data-id="' + d.id + '" title="حذف" aria-label="حذف">' + icon('trash') + '</button>'
            : '<button class="icon-btn" data-act="reportDevice" data-id="' + d.id + '" title="إبلاغ عن عطل" aria-label="إبلاغ عن عطل">' + icon('wrench') + '</button>') +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function viewDevices() {
    const f = st.devices;
    const all = S.coll('devices');
    const counts = { working: 0, maintenance: 0, broken: 0, retired: 0 };
    all.forEach((d) => counts[d.status]++);
    const html =
      '<div class="page-head"><div class="t"><h2>الأجهزة والمعدات</h2><p>' + all.length + ' جهازًا · ' + counts.working + ' يعمل · ' + counts.maintenance + ' في الصيانة · ' + counts.broken + ' معطّل</p></div><div class="actions">' +
      (isStaff() ? '<button class="btn" data-act="exportDevices">' + icon('download') + 'تصدير CSV</button><button class="btn btn-primary" data-act="newDevice">' + icon('plus') + 'إضافة جهاز</button>' : '') + '</div></div>' +
      '<section class="card"><div class="toolbar">' +
      '<div class="search">' + icon('search') + '<input class="input" id="dev-q" type="search" placeholder="ابحث برقم الأصل أو الباركود أو الاسم أو الرقم التسلسلي" value="' + h(f.q) + '"></div>' +
      '<select class="select" id="dev-campus" aria-label="الحرم"><option value="">كل المواقع</option>' + S.coll('campuses').map((c) => '<option value="' + c.id + '"' + (f.campus === c.id ? ' selected' : '') + '>' + h(c.name) + '</option>').join('') + '</select>' +
      '<select class="select" id="dev-lab" aria-label="المعمل"><option value="">كل المعامل</option>' + S.coll('labs').map((l) => '<option value="' + l.id + '"' + (f.lab === l.id ? ' selected' : '') + '>' + h(l.name) + '</option>').join('') + '</select>' +
      '<select class="select" id="dev-status" aria-label="الحالة"><option value="">كل الحالات</option>' + optsOf(DEV_STATUS).map((o) => '<option value="' + o.value + '"' + (f.status === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('') + '<option value="cal"' + (f.status === 'cal' ? ' selected' : '') + '>تستحق المعايرة (14 يومًا)</option></select>' +
      '<select class="select" id="dev-type" aria-label="النوع"><option value="">كل الأنواع</option>' + optsOf(DEV_TYPE).map((o) => '<option value="' + o.value + '"' + (f.type === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select>' +
      '</div><div id="dev-list"></div><div class="muted small" id="dev-count" style="padding:12px 20px;border-top:1px solid var(--line)"></div></section>';
    return {
      title: 'الأجهزة والمعدات', crumb: 'التشغيل', html,
      mount(root) {
        const list = root.querySelector('#dev-list'), cnt = root.querySelector('#dev-count');
        const draw = () => {
          const q = f.q.toLowerCase();
          const items = filteredDevices(f, q);
          list.innerHTML = devicesTable(items);
          cnt.textContent = 'عرض ' + items.length + ' من ' + all.length;
        };
        bindFilters(root, { '#dev-q': ['q', f], '#dev-campus': ['campus', f], '#dev-lab': ['lab', f], '#dev-status': ['status', f], '#dev-type': ['type', f] }, draw);
        draw();
      }
    };
  }
  function filteredDevices(f, q) {
    return S.coll('devices').filter((d) => (!f.lab || d.labId === f.lab) && (!f.type || d.type === f.type) &&
      (!f.status || (f.status === 'cal' ? (calState(d) && calState(d).days <= 14) : d.status === f.status)) &&
      (!f.campus || (lab(d.labId) || {}).campusId === f.campus) &&
      (!q || (d.tag + ' ' + d.name + ' ' + d.model + ' ' + d.serial + ' ' + (d.barcode || '')).toLowerCase().includes(q)))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }

  function deviceModal(existing, labId) {
    const labsOpt = S.coll('labs').filter((l) => managesLab(l.id)).map((l) => ({ value: l.id, label: l.name }));
    if (!labsOpt.length) { U.toast('لا يوجد معمل تشرف عليه لإضافة الأجهزة إليه', 'bad'); return; }
    const v = existing || { labId: labId || labsOpt[0].value, status: 'working', type: 'computer', purchaseDate: today() };
    const fields = [
      { name: 'name', label: 'اسم الجهاز', required: true, placeholder: 'مثال: راسم إشارة رقمي' },
      { name: 'tag', label: 'رقم الأصل', required: true, ltr: true, placeholder: 'EE220-OS-05', hint: 'الرقم الملصق على الجهاز' },
      { name: 'type', label: 'التصنيف', type: 'select', options: optsOf(DEV_TYPE), required: true },
      { name: 'labId', label: 'المعمل', type: 'select', options: labsOpt, required: true },
      { name: 'model', label: 'الطراز', ltr: true, placeholder: 'Rigol DS1054Z' },
      { name: 'serial', label: 'الرقم التسلسلي', ltr: true },
      { name: 'stationId', label: 'المحطة', type: 'select', options: S.coll('stations').filter((x) => x.labId === v.labId).map((x) => ({ value: x.id, label: x.name + ' · ' + x.code })), placeholder: 'بدون محطة' },
      { name: 'barcode', label: 'الباركود', ltr: true, placeholder: 'يُولّد تلقائيًا إذا تُرك فارغًا' },
      { name: 'status', label: 'الحالة', type: 'select', options: optsOf(DEV_STATUS), required: true },
      { name: 'purchaseDate', label: 'تاريخ الشراء', type: 'date' },
      { name: 'warrantyEnd', label: 'نهاية الضمان', type: 'date' },
      { name: 'calibrationDue', label: 'موعد المعايرة القادم', type: 'date', hint: 'اتركه فارغًا إذا لم يتطلب الجهاز معايرة' },
      { name: 'notes', label: 'ملاحظات', type: 'textarea', span: true }
    ];
    U.modal({
      title: existing ? 'تعديل بيانات الجهاز' : 'إضافة جهاز', body: U.formGrid(fields, v), submitText: existing ? 'حفظ التعديلات' : 'إضافة الجهاز',
      onOpen(form) {
        const lSel = form.querySelector('#f-labId'), sSel = form.querySelector('#f-stationId');
        lSel.addEventListener('change', () => { sSel.innerHTML = '<option value="">بدون محطة</option>' + S.coll('stations').filter((x) => x.labId === lSel.value).map((x) => '<option value="' + x.id + '">' + h(x.name + ' · ' + x.code) + '</option>').join(''); });
      },
      onSubmit(form) {
        const d = U.formData(form);
        for (const f of fields) if (f.required && !d[f.name]) return 'الحقل «' + f.label + '» مطلوب.';
        d.tag = d.tag.toUpperCase();
        if (S.coll('devices').some((x) => x.tag === d.tag && (!existing || x.id !== existing.id))) return 'رقم الأصل ' + d.tag + ' مسجل لجهاز آخر.';
        if (!d.barcode) d.barcode = '628' + String(Date.now()).slice(-9);
        if (!/^\d{6,14}$/.test(d.barcode)) return 'الباركود أرقام فقط (6 إلى 14 رقمًا).';
        if (S.coll('devices').some((x) => x.barcode === d.barcode && (!existing || x.id !== existing.id))) return 'الباركود مستخدم لجهاز آخر.';
        if (d.warrantyEnd && d.purchaseDate && d.warrantyEnd < d.purchaseDate) return 'نهاية الضمان لا يمكن أن تسبق تاريخ الشراء.';
        const stamp = { at: nowISO(), userId: me.id };
        if (existing) {
          d.id = existing.id;
          const entries = [];
          if (existing.status !== d.status) entries.push({ kind: 'status', from: existing.status, to: d.status, text: '' });
          if (existing.labId !== d.labId) entries.push({ kind: 'move', from: existing.labId, to: d.labId, text: '' });
          const changed = fields.filter((f) => !['status', 'labId'].includes(f.name) && String(existing[f.name] || '') !== String(d[f.name] || '')).map((f) => f.label);
          if (changed.length) entries.push({ kind: 'edit', text: 'عُدّل: ' + changed.join('، ') });
          d.history = (existing.history || []).concat(entries.map((e) => Object.assign({}, stamp, e)));
        } else d.history = [Object.assign({}, stamp, { kind: 'created', to: d.labId, text: '' })];
        const saved = S.upsert('devices', d, 'dev');
        S.log(me.id, (existing ? 'عدّل بيانات الجهاز ' : 'أضاف الجهاز ') + d.tag);
        U.toast(existing ? 'تم حفظ التعديلات' : 'تمت إضافة الجهاز');
        setTimeout(() => existing ? render() : go('dev-' + saved.id));
      }
    });
  }

  /* ===== تتبع الأجهزة: السجل والحالة والنقل ===== */
  const nowISO = () => new Date().toISOString();
  const fmtFull = (s) => { const d = new Date(s); return d.getDate() + ' ' + U.MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + U.fmtTime(pad(d.getHours()) + ':' + pad(d.getMinutes())); };
  const addMonthsISO = (ds, n) => { const [y, m, dd] = ds.split('-').map(Number); return iso(new Date(y, m - 1 + n, dd)); };
  function devPush(id, changes, entries) {
    const d = dev(id); if (!d) return;
    S.upsert('devices', Object.assign({}, d, changes || {}, { history: (d.history || []).concat(entries.map((e) => Object.assign({ at: nowISO(), userId: me ? me.id : '' }, e))) }));
  }
  function setDevStatus(id, to, text) { const d = dev(id); if (d && d.status !== to) devPush(id, { status: to }, [{ kind: 'status', from: d.status, to, text: text || '' }]); }
  function moveDev(id, toLab, text) { const d = dev(id); if (d && d.labId !== toLab) devPush(id, { labId: toLab }, [{ kind: 'move', from: d.labId, to: toLab, text: text || '' }]); }

  function deviceEvents(d) {
    const ev = (d.history || []).map((e) => Object.assign({ d }, e));
    S.coll('tickets').filter((t) => tkHas(t, d.id)).forEach((t) => (t.log || []).filter((e) => e.kind === 'status').forEach((e) => ev.push({ d, at: e.at, userId: e.userId, kind: 'ticket', t, status: e.status, text: e.text })));
    S.coll('requests').filter((r) => r.deviceId === d.id).forEach((r) => (r.log || []).filter((e) => e.kind === 'status' && ['new', 'approved', 'done', 'rejected'].includes(e.status)).forEach((e) => ev.push({ d, at: e.at, userId: e.userId, kind: 'request', r, status: e.status, text: e.text })));
    return ev.sort((a, b) => b.at.localeCompare(a.at));
  }
  function eventHTML(e, withDevice) {
    let ic = 'info', cls = '', title = '', sub = '', link = '', note = e.text || '';
    if (e.kind === 'created') { ic = 'plus'; cls = 'info'; title = 'سُجّل الجهاز في ' + labName(e.to); }
    else if (e.kind === 'status') { ic = e.to === 'working' ? 'check' : e.to === 'retired' ? 'x' : 'alert'; cls = (DEV_STATUS[e.to] || [])[1] || ''; title = 'تغيّرت الحالة إلى «' + (DEV_STATUS[e.to] || [e.to])[0] + '»'; sub = 'كانت: ' + (DEV_STATUS[e.from] || [e.from || '—'])[0]; }
    else if (e.kind === 'move') { ic = 'swap'; cls = 'info'; title = 'نُقل إلى ' + labName(e.to); sub = 'من ' + labName(e.from); }
    else if (e.kind === 'calibration') { ic = 'gauge'; cls = e.result === 'pass' ? 'ok' : 'bad'; title = 'معايرة ' + (e.result === 'pass' ? 'مطابقة' : 'غير مطابقة'); sub = [e.cert ? 'شهادة ' + e.cert : '', e.next ? 'المعايرة القادمة ' + U.fmtDate(e.next) : ''].filter(Boolean).join(' · '); }
    else if (e.kind === 'edit') { ic = 'edit'; title = 'تعديل بيانات الجهاز'; sub = note; note = ''; }
    else if (e.kind === 'ticket') { ic = 'wrench'; cls = e.status === 'resolved' ? 'ok' : e.status === 'open' ? 'bad' : 'warn'; title = { open: 'بلاغ عطل', in_progress: 'بدأت معالجة البلاغ', resolved: 'حُلّ البلاغ' }[e.status] + ' ' + e.t.ref; sub = e.t.title; link = 'tk-' + e.t.id; }
    else if (e.kind === 'request') { ic = 'swap'; cls = e.status === 'done' ? 'ok' : e.status === 'rejected' ? 'bad' : 'info'; title = RQ_TYPE[e.r.type][0] + ': ' + RQ_STATUS[e.status][0] + ' · ' + e.r.ref; sub = e.r.fromDept + ' ← ' + e.r.toDept; link = 'req-' + e.r.id; }
    return '<div class="tl-ev"><div class="tl-dot ' + cls + '">' + icon(ic) + '</div><div class="tl-body">' +
      '<div class="tl-title">' + (withDevice && e.d ? '<a class="tag" href="#dev-' + e.d.id + '">' + h(e.d.tag) + '</a> ' : '') + (link ? '<a href="#' + link + '">' + h(title) + '</a>' : h(title)) + '</div>' +
      (sub ? '<div class="tl-sub">' + h(sub) + '</div>' : '') + (note ? '<div class="tl-note">' + h(note) + '</div>' : '') +
      '<div class="tl-meta">' + h(userName(e.userId)) + ' · ' + fmtFull(e.at) + '</div></div></div>';
  }
  const timeline = (events, withDevice, empty) => events.length ? '<div class="tl">' + events.map((e) => eventHTML(e, withDevice)).join('') + '</div>' : emptyState('clock', empty || 'لا توجد أحداث مسجلة');
  function labEvents(labId) {
    const ev = [];
    S.coll('devices').filter((d) => d.labId === labId || (d.history || []).some((x) => x.kind === 'move' && x.from === labId)).forEach((d) => ev.push(...deviceEvents(d).filter((e) => e.kind !== 'request')));
    S.coll('tickets').filter((t) => t.labId === labId && !tkDevIds(t).length).forEach((t) => (t.log || []).filter((e) => e.kind === 'status').forEach((e) => ev.push({ at: e.at, userId: e.userId, kind: 'ticket', t, status: e.status, text: e.text })));
    const seen = new Set();
    return ev.filter((e) => { const k = e.kind + e.at + (e.t ? e.t.id : '') + (e.d ? e.d.id : ''); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  }

  function viewDevicePage(id) {
    const d = dev(id);
    if (!d) return { title: 'جهاز غير موجود', crumb: 'الأجهزة', html: '<div class="card">' + emptyState('cpu', 'لم يتم العثور على الجهاز. ربما تم حذفه.') + '<div style="text-align:center;padding-bottom:24px"><a class="btn" href="#devices">العودة إلى الأجهزة</a></div></div>' };
    const l = lab(d.labId) || {};
    const tix = S.coll('tickets').filter((t) => tkHas(t, d.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const openT = tix.filter((t) => t.status !== 'resolved');
    const canM = managesLab(d.labId);
    const c = calState(d);
    const lastCal = (d.history || []).filter((e) => e.kind === 'calibration').pop();
    const ageY = d.purchaseDate ? (U.parseDate(today()) - U.parseDate(d.purchaseDate)) / (365.25 * 864e5) : 0;
    const warrantyOk = d.warrantyEnd && d.warrantyEnd >= today();
    const fact = (k, v) => '<div class="fact"><span>' + h(k) + '</span><b>' + v + '</b></div>';
    const events = deviceEvents(d);

    const hero = '<section class="card"><div class="card-body dev-hero">' +
      '<div class="asset-plate" aria-label="لوحة رقم الأصل"><span>رقم الأصل</span><b>' + h(d.tag) + '</b><small>S/N ' + h(d.serial || '—') + '</small>' + barcodeSVG(d.barcode) + '<small class="bc-digits">' + h(d.barcode || '') + '</small></div>' +
      '<div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + pill(DEV_STATUS, d.status) + '<span class="type-chip">' + icon('cpu') + h(DEV_TYPE[d.type] || d.type) + '</span>' + (openT.length ? '<span class="pill bad">' + openT.length + ' بلاغ مفتوح</span>' : '') + '</div>' +
      '<h2 style="font-size:var(--fs-xl)">' + h(d.name) + '</h2><p class="muted small"><span class="ltr">' + h(d.model || '') + '</span> · <a href="#lab-' + d.labId + '">' + h(l.name || '—') + '</a></p></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      (d.status !== 'retired' ? '<button class="btn btn-primary" data-act="reportDevice" data-id="' + d.id + '">' + icon('wrench') + 'إبلاغ عن عطل</button>' : '') +
      (canM && d.status !== 'retired' ? '<button class="btn" data-act="recordCal" data-id="' + d.id + '">' + icon('gauge') + 'تسجيل معايرة</button>' : '') +
      (canM ? '<button class="btn" data-act="editDevice" data-id="' + d.id + '">' + icon('edit') + 'تعديل</button>' : '') +
      '</div></div>' +
      '<div class="card-body" style="border-top:1px solid var(--line)"><div class="facts facts-4">' +
      fact('الحرم', h(campusName(l.campusId))) +
      fact('المعمل', '<a href="#lab-' + d.labId + '">' + h(l.name || '—') + '</a>') +
      fact('المحطة', h(stationLabel(d.stationId))) +
      fact('القسم', h(l.dept || '—')) +
      fact('تاريخ الشراء', U.fmtDate(d.purchaseDate) + (ageY >= 0.1 ? ' <span class="muted small">(' + (Math.round(ageY * 10) / 10) + ' سنة)</span>' : '')) +
      fact('الضمان', d.warrantyEnd ? (warrantyOk ? '<span class="pill ok">ساري حتى ' + U.fmtDate(d.warrantyEnd) + '</span>' : '<span class="pill">انتهى ' + U.fmtDate(d.warrantyEnd) + '</span>') : '—') +
      fact('المعايرة القادمة', calPill(d) + (d.calibrationDue && c && c.days > 14 ? '' : d.calibrationDue ? ' <span class="muted small">' + U.fmtDate(d.calibrationDue) + '</span>' : '')) +
      fact('آخر معايرة', lastCal ? U.fmtDate(lastCal.at.slice(0, 10)) + ' · ' + (lastCal.result === 'pass' ? 'مطابقة' : 'غير مطابقة') : '—') +
      fact('عدد البلاغات', tix.length + (openT.length ? ' <span class="muted small">(' + openT.length + ' مفتوح)</span>' : '')) +
      fact('المشرف المسؤول', h(userName(l.supervisorId))) + fact('الباركود', '<span class="mono">' + h(d.barcode || '—') + '</span>') + fact('النوع', h(DEV_TYPE[d.type])) +
      '</div>' + (d.notes ? '<p class="small" style="margin-top:14px"><span class="muted">ملاحظات: </span>' + h(d.notes) + '</p>' : '') + '</div></section>';

    const alerts = (c && c.days < 0 ? '<div class="alert bad">' + icon('gauge') + '<div class="grow"><b>المعايرة متأخرة ' + daysTxt(-c.days) + '.</b> لا يُنصح باستخدام الجهاز في القياسات حتى تتم معايرته.</div>' + (canM ? '<button class="btn btn-sm" data-act="recordCal" data-id="' + d.id + '">تسجيل معايرة</button>' : '') + '</div>' : '');

    const ticketsCard = card('بلاغات الجهاز', tix.length ? countTxt(tix.length, 'بلاغ واحد', 'بلاغان', 'بلاغات', 'بلاغًا') : 'لا توجد بلاغات', tix.length ? '<div class="list">' + tix.map((t) => '<a class="list-item" href="#tk-' + t.id + '" style="color:inherit;text-decoration:none"><span class="tag">' + h(t.ref) + '</span><div class="grow"><b>' + h(t.title) + '</b><span>' + U.fmtDate(t.createdAt) + ' · ' + h(userName(t.reporterId)) + '</span></div>' + pill(TK_STATUS, t.status) + '</a>').join('') + '</div>' : emptyState('check', 'لم يُبلّغ عن أي عطل لهذا الجهاز'), '', true);

    return {
      title: d.name + ' · ' + d.tag, crumb: 'الأجهزة / ' + (l.code || ''),
      html: alerts + hero + '<div class="grid grid-2">' + card('سجل الجهاز', events.length + ' حدثًا · من التسجيل حتى اليوم', timeline(events), '', true) + '<div style="display:flex;flex-direction:column;gap:20px;min-width:0">' + ticketsCard + '</div></div>'
    };
  }

  function calModal(d) {
    const fields = [
      { name: 'date', label: 'تاريخ المعايرة', type: 'date', required: true, max: today() },
      { name: 'result', label: 'النتيجة', type: 'select', required: true, options: [{ value: 'pass', label: 'مطابقة للمواصفات' }, { value: 'fail', label: 'غير مطابقة' }] },
      { name: 'cert', label: 'رقم الشهادة', ltr: true, placeholder: 'CAL-2026-0418' },
      { name: 'next', label: 'المعايرة القادمة', type: 'date', required: true, hint: 'عادة بعد 6 أو 12 شهرًا' },
      { name: 'text', label: 'الجهة المعايرة والملاحظات', type: 'textarea', span: true, placeholder: 'مثال: مختبر المعايرة المعتمد، انحراف 0.2%' }
    ];
    U.modal({
      title: 'تسجيل معايرة · ' + d.tag, body: U.formGrid(fields, { date: today(), result: 'pass', next: addMonthsISO(today(), 6) }), submitText: 'حفظ المعايرة',
      onSubmit(form) {
        const v = U.formData(form);
        if (!v.date || v.date > today()) return 'تاريخ المعايرة لا يمكن أن يكون في المستقبل.';
        if (!v.next || v.next <= v.date) return 'موعد المعايرة القادمة يجب أن يكون بعد تاريخ المعايرة.';
        const [y, m, dd] = v.date.split('-').map(Number);
        const at = new Date(y, m - 1, dd, new Date().getHours(), new Date().getMinutes()).toISOString();
        const entries = [{ at, kind: 'calibration', result: v.result, cert: v.cert, next: v.next, text: v.text }];
        const changes = { calibrationDue: v.next };
        if (v.result === 'fail' && d.status === 'working') { changes.status = 'maintenance'; entries.push({ kind: 'status', from: d.status, to: 'maintenance', text: 'نتيجة المعايرة غير مطابقة' }); }
        devPush(d.id, changes, entries);
        S.log(me.id, 'سجّل معايرة ' + (v.result === 'pass' ? 'مطابقة' : 'غير مطابقة') + ' للجهاز ' + d.tag);
        U.toast(v.result === 'pass' ? 'تم تسجيل المعايرة. القادمة ' + U.fmtDate(v.next) : 'سُجلت المعايرة وحُوّل الجهاز إلى الصيانة', v.result === 'pass' ? 'ok' : 'bad');
        setTimeout(render);
      }
    });
  }

  /* ===== البلاغات: معالجة متعددة المستويات (مشرف المعمل ← الدعم الفني ← لجنة المعامل) ===== */
  const ISSUE_TYPE = { hardware: ['عتاد وأجهزة', 'cpu'], software: ['برمجيات وتراخيص', 'doc'], network: ['شبكة وإنترنت', 'swap'], electrical: ['كهرباء وتكييف', 'alert'], furniture: ['أثاث ومرافق', 'box'], other: ['أخرى', 'info'] };
  const APPROVAL_KIND = { purchase: 'شراء قطع أو معدات', replace: 'استبدال الجهاز', retire: 'إخراج الجهاز من الخدمة', external: 'صيانة خارجية لدى المورد' };
  const AP_STATUS = { pending: ['بانتظار قرار اللجنة', 'warn'], approved: ['معتمد من اللجنة', 'ok'], rejected: ['مرفوض من اللجنة', 'bad'] };
  const tkDevIds = (t) => (t.deviceIds && t.deviceIds.length ? t.deviceIds : (t.deviceId ? [t.deviceId] : []));
  const tkDevices = (t) => tkDevIds(t).map(dev).filter(Boolean);
  const tkHas = (t, id) => tkDevIds(t).includes(id);
  const reporterName = (t) => t.guest ? (t.guest.name || 'زائر') + ' (زائر)' : userName(t.reporterId);
  const canProcess = (t) => managesLab(t.labId) || (me.role === 'it' && !!t.forwardedIT);
  const canDecide = () => isAdmin() || me.role === 'committee';
  const canSeeTicket = (t) => isAdmin() || me.role === 'committee' || managesLab(t.labId) || t.reporterId === me.id || t.assigneeId === me.id || (me.role === 'it' && !!t.forwardedIT);
  const approvalPending = (t) => !!(t.approval && t.approval.status === 'pending');
  const station = (id) => S.byId('stations', id);
  const campus = (id) => S.byId('campuses', id);
  const campusName = (id) => (campus(id) || {}).name || '—';
  const stationLabel = (id) => { const s = station(id); return s ? s.name + ' · ' + s.code : '—'; };
  const currentSemester = () => {
    const t = today(), ss = S.coll('semesters') || [];
    return ss.find((s) => t >= s.start && t <= s.end) || ss.filter((s) => s.start > t).sort((a, b) => a.start.localeCompare(b.start))[0] || ss[ss.length - 1] || { id: '', name: '—' };
  };
  const semName = (id) => (S.byId('semesters', id) || {}).name || '—';
  const fmtSAR = (n) => Number(n || 0).toLocaleString('en-US') + ' ر.س';

  /* ضغط الصور المرفقة قبل حفظها في المتصفح */
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('يُقبل إرفاق الصور فقط'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('تعذرت قراءة الملف'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('الملف ليس صورة صالحة'));
        img.onload = () => {
          const k = Math.min(1, 1000 / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve({ name: file.name, data: c.toDataURL('image/jpeg', 0.72) });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function bindAttachments(input, preview, holder, max) {
    holder._att = holder._att || [];
    const draw = () => { preview.innerHTML = holder._att.map((a, i) => '<span class="att-thumb"><img src="' + a.data + '" alt="' + h(a.name) + '"><button type="button" data-rm-att="' + i + '" aria-label="إزالة المرفق">' + icon('x') + '</button></span>').join(''); };
    input.addEventListener('change', async () => {
      for (const f of [...input.files]) {
        if (holder._att.length >= max) { U.toast('الحد الأقصى ' + max + ' صور', 'bad'); break; }
        try { holder._att.push(await compressImage(f)); } catch (e) { U.toast(e.message, 'bad'); }
      }
      input.value = ''; draw();
    });
    preview.addEventListener('click', (e) => { const b = e.target.closest('[data-rm-att]'); if (b) { holder._att.splice(+b.dataset.rmAtt, 1); draw(); } });
  }
  const attGallery = (list) => list.length ? '<div class="att-gallery">' + list.map((a, i) => '<button type="button" class="att-thumb lg" data-lightbox="' + i + '" title="' + h(a.name || '') + '"><img src="' + a.data + '" alt="' + h(a.name || 'مرفق') + '"></button>').join('') + '</div>' : '';
  function lightbox(src, name) {
    U.modal({ title: name || 'مرفق', body: '<img src="' + src + '" alt="' + h(name || '') + '" style="width:100%;border-radius:8px">' });
  }

  /* نموذج البلاغ المشترك: للمستخدمين وللزوار */
  function ticketFormHTML(guest) {
    const campuses = S.coll('campuses');
    return (guest ? U.formGrid([{ name: 'gname', label: 'الاسم أو الجهة', placeholder: 'اختياري' }, { name: 'gemail', label: 'البريد الإلكتروني', type: 'email', required: true, ltr: true, hint: 'نحتاجه لتتبع البلاغ' }]) : '') +
      U.formGrid([
        { name: 'title', label: 'عنوان البلاغ', required: true, span: true, placeholder: 'مثال: الجهاز لا يعمل بعد التشغيل' },
        { name: 'issueType', label: 'نوع العطل', type: 'select', required: true, options: optsOf(ISSUE_TYPE) },
        guest ? { name: 'priority', label: 'مدى التأثير', type: 'select', options: [{ value: 'medium', label: 'يؤثر على الاستخدام' }, { value: 'low', label: 'بسيط' }, { value: 'high', label: 'يوقف العمل في المعمل' }] } : { name: 'priority', label: 'الأولوية', type: 'select', required: true, options: optsOf(TK_PRI) },
        { name: 'campusId', label: 'الحرم', type: 'select', required: true, options: campuses.map((c) => ({ value: c.id, label: c.name })) },
        { name: 'labId', label: 'المعمل', type: 'select', required: true, options: [] },
        { name: 'stationId', label: 'المحطة', type: 'select', span: true, options: [] }
      ], { priority: 'medium', issueType: 'hardware' }) +
      '<div class="field"><label>الأجهزة المتأثرة <span class="muted small">(اختر جهازًا أو أكثر، اختياري)</span></label><div class="dev-picks" id="f-devices"></div></div>' +
      U.field({ name: 'description', label: 'وصف العطل', type: 'textarea', placeholder: 'متى بدأ العطل؟ ما الرسالة التي تظهر؟ ما الذي جربته؟' }) +
      '<div class="field"><label for="f-files">صور مرفقة <span class="muted small">(حتى 3 صور)</span></label><input type="file" id="f-files" accept="image/*" multiple class="input" style="padding-top:6px"><div class="att-preview" id="f-preview"></div></div>';
  }
  function bindTicketForm(form, pre) {
    pre = pre || {};
    const cSel = form.querySelector('#f-campusId'), lSel = form.querySelector('#f-labId'), sSel = form.querySelector('#f-stationId'), box = form.querySelector('#f-devices');
    const opt = (v, l, sel) => '<option value="' + h(v) + '"' + (sel ? ' selected' : '') + '>' + h(l) + '</option>';
    const preLab = pre.labId ? lab(pre.labId) : null;
    if (preLab) cSel.value = preLab.campusId;
    const chosen = new Set(pre.deviceIds || []);
    const fillLabs = (keep) => { const ls = S.coll('labs').filter((l) => l.campusId === cSel.value); lSel.innerHTML = opt('', 'اختر المعمل') + ls.map((l) => opt(l.id, l.name + ' · ' + l.code, l.id === keep)).join(''); };
    const fillStations = (keep) => { const ss = S.coll('stations').filter((s) => s.labId === lSel.value); sSel.innerHTML = opt('', lSel.value ? 'المعمل كاملًا (بدون محطة محددة)' : 'اختر المعمل أولًا') + ss.map((s) => opt(s.id, s.name + ' · ' + s.code, s.id === keep)).join(''); sSel.disabled = !lSel.value; };
    const fillDevices = () => {
      const ds = S.coll('devices').filter((d) => d.status !== 'retired' && d.labId === lSel.value && (!sSel.value || d.stationId === sSel.value));
      box.innerHTML = !lSel.value ? '<span class="muted small">اختر المعمل لعرض أجهزته</span>' : ds.length ? ds.map((d) => '<label class="dev-pick"><input type="checkbox" name="dev" value="' + d.id + '"' + (chosen.has(d.id) ? ' checked' : '') + '><span class="dot ' + DEV_STATUS[d.status][1] + '"></span><b class="mono">' + h(d.tag) + '</b><span>' + h(d.name) + '</span></label>').join('') : '<span class="muted small">لا توجد أجهزة مسجلة هنا</span>';
    };
    box.addEventListener('change', (e) => { if (e.target.name === 'dev') { if (e.target.checked) chosen.add(e.target.value); else chosen.delete(e.target.value); } });
    cSel.addEventListener('change', () => { fillLabs(''); fillStations(''); fillDevices(); });
    lSel.addEventListener('change', () => { fillStations(''); fillDevices(); });
    sSel.addEventListener('change', fillDevices);
    fillLabs(pre.labId || ''); fillStations(pre.stationId || ''); fillDevices();
    bindAttachments(form.querySelector('#f-files'), form.querySelector('#f-preview'), form, 3);
  }
  function readTicketForm(form, guest) {
    const v = U.formData(form);
    if (guest && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.gemail || '')) return { err: 'اكتب بريدًا إلكترونيًا صحيحًا لتتمكن من تتبع البلاغ.' };
    if (!v.title || v.title.length < 4) return { err: 'اكتب عنوانًا واضحًا للبلاغ.' };
    if (!v.labId) return { err: 'اختر الحرم والمعمل الذي فيه العطل.' };
    const deviceIds = [...form.querySelectorAll('input[name=dev]:checked')].map((x) => x.value);
    return { data: { title: v.title, issueType: v.issueType, priority: v.priority || 'medium', labId: v.labId, stationId: v.stationId || '', deviceIds, description: v.description || '', attachments: form._att || [], guest: guest ? { name: v.gname || '', email: v.gemail.toLowerCase() } : null } };
  }
  function createTicket(d) {
    const l = lab(d.labId);
    const uid0 = me ? me.id : '';
    const tk = { ref: S.nextTicketRef(), labId: d.labId, stationId: d.stationId, deviceIds: d.deviceIds, deviceId: d.deviceIds[0] || '', title: d.title, description: d.description, issueType: d.issueType, priority: d.priority, status: 'open', reporterId: uid0, assigneeId: l.supervisorId, createdAt: today(), resolvedAt: '', semesterId: currentSemester().id, attachments: d.attachments, log: [{ at: nowISO(), userId: uid0, kind: 'status', status: 'open', text: '' }] };
    if (d.guest) tk.guest = d.guest;
    const saved = S.upsert('tickets', tk, 'tk');
    d.deviceIds.forEach((id) => { const dv = dev(id); if (dv && dv.status === 'working') setDevStatus(id, d.priority === 'urgent' ? 'broken' : 'maintenance', 'بسبب البلاغ ' + tk.ref); });
    S.log(uid0, (d.guest ? 'أبلغ زائر (' + d.guest.email + ') عن عطل ' : 'فتح بلاغ صيانة ') + tk.ref + ' «' + tk.title + '»');
    return saved;
  }
  function ticketModal(pre) {
    U.modal({
      title: 'بلاغ عطل جديد', body: ticketFormHTML(false) + '<p class="muted small">يصل البلاغ إلى مشرف المعمل مباشرة، وتتحول الأجهزة المختارة إلى «في الصيانة» حتى يُحل.</p>', submitText: 'إرسال البلاغ',
      onOpen(form) { bindTicketForm(form, pre); },
      onSubmit(form) {
        const r = readTicketForm(form, false);
        if (r.err) return r.err;
        const saved = createTicket(r.data);
        U.toast('تم إرسال البلاغ ' + saved.ref + ' إلى ' + userName(saved.assigneeId));
        setTimeout(() => go('tk-' + saved.id));
      }
    });
  }

  const TK_FLOW = {
    start: { to: 'in_progress', verb: 'بدأ معالجة البلاغ', toast: 'بدأت معالجة البلاغ' },
    resolve: { to: 'resolved', verb: 'أغلق البلاغ', toast: 'تم حل البلاغ', note: 'required', title: 'إغلاق البلاغ', label: 'الإجراء المتخذ لإصلاح العطل', btn: 'تأكيد الحل' },
    reopen: { to: 'open', verb: 'أعاد فتح البلاغ', toast: 'أُعيد فتح البلاغ', note: 'required', title: 'إعادة فتح البلاغ', label: 'سبب إعادة الفتح', btn: 'إعادة فتح' }
  };
  function tkSave(t, changes, entry) {
    const cur = S.byId('tickets', t.id) || t;
    S.upsert('tickets', Object.assign({}, cur, changes, { log: (cur.log || []).concat(entry ? [Object.assign({ at: nowISO(), userId: me ? me.id : '' }, entry)] : []) }));
  }
  function tkApply(t, action, text) {
    const fl = TK_FLOW[action];
    if (action === 'resolve' && approvalPending(t)) return 'لا يمكن إغلاق البلاغ قبل قرار لجنة المعامل على طلب الموافقة.';
    const changes = { status: fl.to, resolvedAt: fl.to === 'resolved' ? today() : fl.to === 'open' ? '' : t.resolvedAt };
    if (action === 'resolve') changes.resolution = text;
    if (action === 'start' && !t.assigneeId) changes.assigneeId = me.id;
    tkSave(t, changes, { kind: 'status', status: fl.to, text: text || '' });
    let back = 0;
    tkDevices(t).forEach((d) => {
      if (fl.to === 'resolved' && (d.status === 'maintenance' || d.status === 'broken') && !S.coll('tickets').some((x) => x.id !== t.id && tkHas(x, d.id) && x.status !== 'resolved')) { setDevStatus(d.id, 'working', 'بعد حل البلاغ ' + t.ref); back++; }
      if (fl.to === 'open' && d.status === 'working') setDevStatus(d.id, 'maintenance', 'إعادة فتح البلاغ ' + t.ref);
    });
    S.log(me.id, fl.verb + ' ' + t.ref + ' «' + t.title + '»');
    U.toast(fl.toast + (back ? (back === 1 ? ' وعاد الجهاز للخدمة' : ' وعادت ' + back + ' أجهزة للخدمة') : ''));
    setTimeout(render);
    return '';
  }
  function tkAct(t, action) {
    const staffOpts = (roles) => S.coll('users').filter((u) => u.active && roles.includes(u.role)).map((u) => ({ value: u.id, label: u.name + ' · ' + ROLE[u.role][0] }));
    if (action === 'assign' || action === 'forward') {
      const fwd = action === 'forward';
      const opts = staffOpts(fwd ? ['it'] : ['admin', 'supervisor', 'it']);
      if (!opts.length) { U.toast('لا يوجد مستخدم بدور الدعم الفني. أضفه من صفحة المستخدمين.', 'bad'); return; }
      U.modal({
        title: (fwd ? 'تحويل إلى الدعم الفني · ' : 'إسناد البلاغ · ') + t.ref, size: 'sm',
        body: U.field({ name: 'to', label: fwd ? 'موظف الدعم الفني' : 'المسؤول عن المعالجة', type: 'select', options: opts, required: true }, fwd ? opts[0].value : t.assigneeId) + U.field({ name: 'text', label: fwd ? 'سبب التحويل' : 'ملاحظة', type: 'textarea', placeholder: fwd ? 'مثال: العطل في إعدادات الشبكة ويحتاج صلاحيات الدعم الفني' : 'اختياري' }),
        submitText: fwd ? 'تحويل' : 'إسناد',
        onSubmit(form) {
          const v = U.formData(form);
          if (!v.to) return 'اختر المستخدم.';
          if (!fwd && v.to === t.assigneeId) return 'البلاغ مسند إلى ' + userName(v.to) + ' بالفعل.';
          tkSave(t, fwd ? { assigneeId: v.to, forwardedIT: true } : { assigneeId: v.to }, { kind: fwd ? 'forward' : 'assign', to: v.to, text: v.text || '' });
          S.log(me.id, (fwd ? 'حوّل البلاغ ' + t.ref + ' إلى الدعم الفني (' : 'أسند البلاغ ' + t.ref + ' إلى ') + userName(v.to) + (fwd ? ')' : ''));
          U.toast(fwd ? 'حُوّل البلاغ إلى الدعم الفني: ' + userName(v.to) : 'تم إسناد البلاغ إلى ' + userName(v.to));
          setTimeout(render);
        }
      });
      return;
    }
    if (action === 'escalate') {
      U.modal({
        title: 'طلب موافقة لجنة المعامل · ' + t.ref, size: 'sm',
        body: '<p class="small muted">يُرفع الطلب إلى لجنة المعامل عندما يحتاج الإصلاح شراءً أو استبدالًا أو إخراج الجهاز من الخدمة. لا يُغلق البلاغ قبل قرار اللجنة.</p>' +
          U.field({ name: 'kind', label: 'نوع الطلب', type: 'select', required: true, options: optsOf(APPROVAL_KIND) }) +
          U.field({ name: 'cost', label: 'التكلفة التقديرية (ر.س)', type: 'number', min: 0, placeholder: '0' }) +
          U.field({ name: 'reason', label: 'المبررات', type: 'textarea', required: true, placeholder: 'لماذا يلزم هذا الإجراء؟ ما البدائل التي جُربت؟' }),
        submitText: 'رفع للجنة',
        onSubmit(form) {
          const v = U.formData(form);
          if (!v.reason) return 'اكتب مبررات الطلب.';
          const cost = v.cost ? Math.max(0, parseFloat(v.cost)) : 0;
          tkSave(t, { approval: { status: 'pending', kind: v.kind, cost, reason: v.reason, requestedBy: me.id, at: nowISO() } }, { kind: 'escalate', text: APPROVAL_KIND[v.kind] + (cost ? ' · ' + fmtSAR(cost) : '') + ' — ' + v.reason });
          S.log(me.id, 'رفع البلاغ ' + t.ref + ' إلى لجنة المعامل للموافقة');
          U.toast('رُفع الطلب إلى لجنة المعامل');
          setTimeout(render);
        }
      });
      return;
    }
    if (action === 'approve' || action === 'decline') {
      const ok = action === 'approve';
      U.modal({
        title: (ok ? 'اعتماد الطلب · ' : 'رفض الطلب · ') + t.ref, size: 'sm',
        body: '<p class="small">' + h(APPROVAL_KIND[t.approval.kind]) + (t.approval.cost ? ' · <b>' + fmtSAR(t.approval.cost) + '</b>' : '') + '</p><p class="small muted">' + h(t.approval.reason) + '</p>' +
          U.field({ name: 'note', label: ok ? 'ملاحظة القرار' : 'سبب الرفض', type: 'textarea', required: !ok, placeholder: ok ? 'اختياري' : '' }),
        submitText: ok ? 'اعتماد' : 'رفض', submitClass: ok ? 'btn-ok' : 'btn-danger',
        onSubmit(form) {
          const note = U.formData(form).note;
          if (!ok && !note) return 'اكتب سبب الرفض.';
          tkSave(t, { approval: Object.assign({}, t.approval, { status: ok ? 'approved' : 'rejected', decidedBy: me.id, decidedAt: nowISO(), note: note || '' }) }, { kind: 'approval', decision: ok ? 'approved' : 'rejected', text: note || '' });
          let extra = '';
          if (ok && t.approval.kind === 'retire') { tkDevices(t).forEach((d) => setDevStatus(d.id, 'retired', 'بقرار لجنة المعامل · ' + t.ref)); extra = ' وأُخرجت الأجهزة من الخدمة'; }
          S.log(me.id, (ok ? 'اعتمد' : 'رفض') + ' طلب الموافقة على البلاغ ' + t.ref);
          U.toast((ok ? 'تم اعتماد الطلب' : 'تم رفض الطلب') + extra, ok ? 'ok' : 'bad');
          setTimeout(render);
        }
      });
      return;
    }
    const fl = TK_FLOW[action];
    if (!fl) return;
    if (!fl.note) { const err = tkApply(t, action); if (err) U.toast(err, 'bad'); return; }
    U.modal({
      title: fl.title + ' · ' + t.ref, size: 'sm',
      body: '<p class="small">«' + h(t.title) + '»</p>' + U.field({ name: 'note', label: fl.label, type: 'textarea', required: true, placeholder: action === 'resolve' ? 'مثال: استبدال وحدة التخزين واختبار الجهاز 30 دقيقة' : '' }),
      submitText: fl.btn, submitClass: action === 'resolve' ? 'btn-ok' : 'btn-primary',
      onSubmit(form) { const text = U.formData(form).note; if (!text) return 'اكتب ' + fl.label + '.'; return tkApply(t, action, text); }
    });
  }

  function ticketThread(t, viewer) {
    const internalOK = viewer !== 'public' && (canProcess(t) || canDecide());
    const log = (t.log || []).filter((e) => internalOK || !e.internal);
    return '<div class="thread">' + log.map((e, idx) => {
      const name = e.userId ? userName(e.userId) : (t.guest ? reporterName(t) : 'زائر');
      const att = e.attachments && e.attachments.length ? attGallery(e.attachments) : '';
      if (e.kind === 'comment') return '<div class="ev"><div class="avatar">' + h(U.initials(name)) + '</div><div style="min-width:0"><div class="hd"><b>' + h(name) + '</b>' + (e.internal ? '<span class="pill">ملاحظة داخلية</span>' : '') + '<time>' + U.timeAgo(e.at) + '</time></div><div class="bubble' + (e.internal ? ' internal' : '') + '">' + h(e.text) + '</div>' + att + '</div></div>';
      let verb = '', ic = 'refresh', pl = '';
      if (e.kind === 'status') { verb = { open: idx === 0 ? 'أبلغ عن العطل' : 'أعاد فتح البلاغ', in_progress: 'بدأ المعالجة', resolved: 'أغلق البلاغ' }[e.status]; ic = e.status === 'resolved' ? 'check' : e.status === 'open' ? 'alert' : 'refresh'; pl = pill(TK_STATUS, e.status); }
      else if (e.kind === 'assign') { verb = 'أسند البلاغ إلى ' + userName(e.to); ic = 'users'; }
      else if (e.kind === 'forward') { verb = 'حوّل البلاغ إلى الدعم الفني: ' + userName(e.to); ic = 'send'; pl = '<span class="pill info">المستوى 2</span>'; }
      else if (e.kind === 'escalate') { verb = 'رفع طلب موافقة إلى لجنة المعامل'; ic = 'flag'; pl = '<span class="pill warn">المستوى 3</span>'; }
      else if (e.kind === 'approval') { verb = e.decision === 'approved' ? 'اعتمدت اللجنة الطلب' : 'رفضت اللجنة الطلب'; ic = e.decision === 'approved' ? 'check' : 'x'; pl = pill(AP_STATUS, e.decision); }
      return '<div class="ev sys"><div class="avatar">' + icon(ic).replace('<svg', '<svg width="15" height="15"') + '</div><div style="min-width:0"><div class="hd"><b>' + h(name) + '</b><span>' + h(verb) + '</span>' + pl + '<time>' + U.timeAgo(e.at) + '</time></div>' + (e.text ? '<div class="bubble">' + h(e.text) + '</div>' : '') + att + '</div></div>';
    }).join('') + '</div>';
  }
  const tkStepper = (t) => {
    const log = t.log || [];
    const stamp = (st0) => { const e = log.filter((x) => x.kind === 'status' && x.status === st0).pop(); return e ? fmtStamp(e.at) : ''; };
    const steps = [['الإبلاغ', stamp('open')], ['المعالجة', stamp('in_progress')], ['الحل', stamp('resolved')]];
    const cur = t.status === 'resolved' ? 3 : 1;
    const hint = t.status === 'open' ? 'بانتظار البدء' : t.status === 'in_progress' ? (approvalPending(t) ? 'بانتظار اللجنة' : 'جارية') : '';
    return '<div class="stepper" style="grid-template-columns:repeat(3,minmax(0,1fr))">' + steps.map((s, i) => {
      const cls = i < cur ? 'done' : i === cur ? (approvalPending(t) ? 'hold' : 'cur') : '';
      const sub = i < cur ? s[1] : i === cur ? hint : '';
      return '<div class="step ' + cls + '"><div class="dot">' + (i < cur ? icon('check') : i + 1) + '</div><div>' + s[0] + (sub ? '<small>' + h(sub) + '</small>' : '') + '</div></div>';
    }).join('') + '</div>';
  };
  const locPath = (t) => {
    const l = lab(t.labId) || {}, s = station(t.stationId);
    const seg = (lbl, val, href) => '<' + (href ? 'a href="' + href + '"' : 'div') + ' class="loc-seg"><span>' + h(lbl) + '</span><b>' + h(val) + '</b></' + (href ? 'a' : 'div') + '>';
    return '<div class="loc-path">' + seg('الحرم', campusName(l.campusId), '#campuses') + icon('chevronL') + seg('المعمل', l.name || '—', '#lab-' + t.labId) + icon('chevronL') + seg('المحطة', s ? s.name + ' · ' + s.code : 'المعمل كاملًا') + '</div>';
  };

  function viewTicketPage(id) {
    const t = S.byId('tickets', id);
    if (!t || !canSeeTicket(t)) return { title: 'بلاغ غير موجود', crumb: 'البلاغات', html: '<div class="card">' + emptyState('wrench', 'البلاغ غير موجود أو ليس لديك صلاحية عرضه') + '<div style="text-align:center;padding-bottom:24px"><a class="btn" href="#maintenance">العودة إلى البلاغات</a></div></div>' };
    const l = lab(t.labId) || {};
    const devs = tkDevices(t);
    const can = canProcess(t);
    const ap = t.approval;
    const btn = (a, label, cls, ic) => '<button class="btn ' + (cls || '') + '" data-act="tkAct" data-id="' + t.id + '|' + a + '">' + (ic ? icon(ic) : '') + label + '</button>';
    let b = '';
    if (can) {
      if (t.status === 'open') b += btn('start', 'بدء المعالجة', 'btn-primary', 'refresh');
      if (t.status !== 'resolved') b += btn('resolve', 'تم الحل', 'btn-ok', 'check');
      if (t.status !== 'resolved' && managesLab(t.labId) && !t.forwardedIT) b += btn('forward', 'تحويل للدعم الفني', '', 'send');
      if (t.status !== 'resolved' && !approvalPending(t)) b += btn('escalate', 'طلب موافقة اللجنة', '', 'flag');
      if (t.status !== 'resolved' && managesLab(t.labId)) b += btn('assign', 'إسناد', 'btn-ghost', 'users');
      if (t.status === 'resolved') b += btn('reopen', 'إعادة فتح', '', 'refresh');
    }
    if (approvalPending(t) && canDecide()) b = btn('approve', 'اعتماد طلب اللجنة', 'btn-ok', 'check') + btn('decline', 'رفض', 'btn-danger', 'x') + b;
    const note = t.status === 'resolved' ? 'البلاغ مغلق' : approvalPending(t) ? 'بانتظار قرار لجنة المعامل' : 'المسؤول الآن: ' + userName(t.assigneeId);
    const created = (t.log || [])[0] ? t.log[0].at : t.createdAt;
    const days = Math.round((U.parseDate(t.resolvedAt || today()) - U.parseDate(t.createdAt)) / 864e5);
    const fact = (k, v) => '<div class="fact"><span>' + h(k) + '</span><b>' + v + '</b></div>';
    const fwdE = (t.log || []).filter((e) => e.kind === 'forward').pop();
    const lvl = (n, title, who, state, cls) => '<div class="lvl ' + cls + '"><span class="lvl-n">' + n + '</span><div><span class="lbl">' + h(title) + '</span><b>' + h(who) + '</b><small>' + h(state) + '</small></div></div>';
    const levels = '<div class="levels">' +
      lvl(1, 'مشرف المعمل', userName(l.supervisorId), t.forwardedIT ? 'حوّل البلاغ' : t.status === 'resolved' ? 'تمت المعالجة' : 'يعالج البلاغ', t.forwardedIT || t.status === 'resolved' ? 'done' : 'cur') +
      lvl(2, 'الدعم الفني', t.forwardedIT && fwdE ? userName(fwdE.to) : '—', t.forwardedIT ? (t.status === 'resolved' ? 'تمت المعالجة' : 'محوّل إليه') : 'لم يُحوّل', t.forwardedIT ? (t.status === 'resolved' ? 'done' : 'cur') : '') +
      lvl(3, 'لجنة المعامل', ap ? APPROVAL_KIND[ap.kind] + (ap.cost ? ' · ' + fmtSAR(ap.cost) : '') : '—', ap ? AP_STATUS[ap.status][0] : 'لا يتطلب موافقة', ap ? (ap.status === 'pending' ? 'hold' : ap.status === 'approved' ? 'done' : 'stop') : '') +
      '</div>';
    let banner = '';
    if (t.status === 'resolved' && t.resolution) banner = '<div class="alert rq-banner" style="background:var(--ok-soft);color:var(--ok)">' + icon('check') + '<div class="grow"><b>الإجراء المتخذ:</b> ' + h(t.resolution) + '</div></div>';
    else if (approvalPending(t)) banner = '<div class="alert rq-banner">' + icon('flag') + '<div class="grow"><b>بانتظار لجنة المعامل:</b> ' + h(APPROVAL_KIND[ap.kind]) + (ap.cost ? ' بتكلفة تقديرية ' + fmtSAR(ap.cost) : '') + '. ' + h(ap.reason) + '</div></div>';
    else if (ap && ap.status === 'rejected') banner = '<div class="alert bad rq-banner">' + icon('x') + '<div class="grow"><b>رفضت اللجنة الطلب:</b> ' + h(ap.note || '') + '</div></div>';
    else if (t.priority === 'urgent' && t.status !== 'resolved') banner = '<div class="alert bad rq-banner">' + icon('alert') + '<div class="grow"><b>بلاغ عاجل</b>، مفتوح منذ ' + (days ? daysTxt(days) : 'اليوم') + '.</div></div>';
    const allAtt = (t.attachments || []).concat(...(t.log || []).filter((e) => e.attachments && (!e.internal || can || canDecide())).map((e) => e.attachments));

    const html = '<section class="card req-detail" style="max-width:1040px">' +
      '<a class="btn btn-sm" href="#maintenance" style="margin:14px 24px 0">' + icon('chevronR') + 'كل البلاغات</a>' +
      '<div class="rq-head"><div class="top"><span class="tag">' + h(t.ref) + '</span><span class="type-chip">' + icon(ISSUE_TYPE[t.issueType || 'other'][1]) + h(ISSUE_TYPE[t.issueType || 'other'][0]) + '</span>' + pill(TK_PRI, t.priority) + pill(TK_STATUS, t.status) + (t.forwardedIT ? '<span class="pill info">محوّل للدعم الفني</span>' : '') + (ap ? pill(AP_STATUS, ap.status) : '') + '</div>' +
      '<h2>' + h(t.title) + '</h2><div class="meta">أبلغ عنه ' + h(reporterName(t)) + ' · ' + U.timeAgo(created) + ' · ' + h(semName(t.semesterId)) + '</div></div>' +
      '<div class="route-band" style="grid-template-columns:minmax(0,1fr);gap:12px">' + locPath(t) +
      (devs.length ? '<div class="dev-chips">' + devs.map((d) => '<a class="dev-chip" href="#dev-' + d.id + '"><span class="dot ' + DEV_STATUS[d.status][1] + '"></span><b class="mono">' + h(d.tag) + '</b><span>' + h(d.name) + '</span></a>').join('') + '</div>' : '<div class="muted small">لم تُحدد أجهزة بعينها</div>') + '</div>' +
      tkStepper(t) + levels +
      (banner ? banner + '<div style="height:16px"></div>' : '') +
      '<div class="rq-actions"><span class="note">' + icon('info') + h(note) + '</span>' + b + '</div>' +
      '<div class="rq-section"><h3>تفاصيل البلاغ</h3><div class="facts">' +
      fact('المبلّغ', h(reporterName(t)) + (t.guest && (can || canDecide()) ? '<div class="muted small ltr" style="text-align:right">' + h(t.guest.email) + '</div>' : '')) + fact('المسؤول الآن', h(userName(t.assigneeId))) + fact('الفصل الدراسي', h(semName(t.semesterId))) +
      fact('تاريخ البلاغ', U.fmtDate(t.createdAt)) + fact(t.status === 'resolved' ? 'تاريخ الحل' : 'مفتوح منذ', t.status === 'resolved' ? U.fmtDate(t.resolvedAt) : (days ? daysTxt(days) : 'اليوم')) + fact('مدة المعالجة', t.status === 'resolved' ? (days ? daysTxt(days) : 'في نفس اليوم') : '—') + '</div></div>' +
      (t.description ? '<div class="rq-section"><h3>وصف العطل</h3><p class="rq-desc">' + h(t.description) + '</p></div>' : '') +
      (allAtt.length ? '<div class="rq-section"><h3>المرفقات (' + allAtt.length + ')</h3>' + attGallery(allAtt) + '</div>' : '') +
      '<div class="rq-section"><h3>سجل التتبع والمراسلات</h3>' + ticketThread(t, 'staff') + '</div>' +
      '<form class="composer composer-tk" id="tk-comment" data-id="' + t.id + '"><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px"><textarea class="textarea" name="text" id="tk-text" placeholder="اكتب تحديثًا أو استفسارًا…" aria-label="الرد"></textarea>' +
      '<div class="composer-opts">' + (can || canDecide() ? '<label class="chk"><input type="checkbox" id="tk-public" checked> مرئي للمبلّغ</label>' : '') + '<label class="btn btn-sm btn-ghost" for="tk-files" style="cursor:pointer">' + icon('upload') + 'إرفاق صورة</label><input type="file" id="tk-files" accept="image/*" multiple hidden><div class="att-preview" id="tk-preview"></div></div></div>' +
      '<button class="btn btn-primary" type="submit">' + icon('send') + 'إرسال</button></form>' +
      '</section>';
    return {
      title: t.ref + ' · ' + t.title, crumb: 'البلاغات والأعطال', html,
      mount(root) {
        const form = root.querySelector('#tk-comment');
        bindAttachments(root.querySelector('#tk-files'), root.querySelector('#tk-preview'), form, 3);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const text = (form.querySelector('textarea').value || '').trim();
          if (!text && !(form._att || []).length) return;
          const pub = root.querySelector('#tk-public');
          tkSave(t, {}, { kind: 'comment', text: text || 'أرفق صورًا', internal: pub ? !pub.checked : false, attachments: form._att || [] });
          U.toast(pub && !pub.checked ? 'أُضيفت ملاحظة داخلية' : 'تم إرسال التحديث');
          render();
        });
        root.addEventListener('click', (e) => { const b = e.target.closest('[data-lightbox]'); if (b) { const img = b.querySelector('img'); lightbox(img.src, img.alt); } });
      }
    };
  }

  /* ===== موافقات لجنة المعامل ===== */
  function viewApprovals() {
    const all = S.coll('tickets').filter((t) => t.approval);
    const pend = all.filter(approvalPending).sort((a, b) => a.approval.at.localeCompare(b.approval.at));
    const done = all.filter((t) => !approvalPending(t)).sort((a, b) => (b.approval.decidedAt || '').localeCompare(a.approval.decidedAt || ''));
    const sumPend = pend.reduce((s, t) => s + (t.approval.cost || 0), 0);
    const sumOk = done.filter((t) => t.approval.status === 'approved').reduce((s, t) => s + (t.approval.cost || 0), 0);
    const cards = pend.length ? '<div class="ap-list">' + pend.map((t) => {
      const a = t.approval;
      return '<article class="card ap-card"><div class="ap-top"><a class="tag" href="#tk-' + t.id + '">' + h(t.ref) + '</a><span class="pill warn">' + h(APPROVAL_KIND[a.kind]) + '</span><span class="muted small">' + h(labName(t.labId)) + '</span></div>' +
        '<h3><a href="#tk-' + t.id + '">' + h(t.title) + '</a></h3><div class="ap-cost"><span>التكلفة التقديرية</span><b>' + (a.cost ? fmtSAR(a.cost) : 'بدون تكلفة') + '</b></div>' +
        '<p class="small">' + h(a.reason) + '</p><div class="muted small">رفعه ' + h(userName(a.requestedBy)) + ' · ' + U.timeAgo(a.at) + '</div>' +
        (canDecide() ? '<div class="ap-actions"><button class="btn btn-ok" data-act="tkAct" data-id="' + t.id + '|approve">' + icon('check') + 'اعتماد</button><button class="btn btn-danger" data-act="tkAct" data-id="' + t.id + '|decline">رفض</button><a class="btn btn-ghost" href="#tk-' + t.id + '">التفاصيل</a></div>' : '') + '</article>';
    }).join('') + '</div>' : '<div class="card">' + emptyState('check', 'لا توجد طلبات بانتظار اللجنة') + '</div>';
    const hist = done.length ? '<div class="table-wrap"><table class="table stack"><thead><tr><th>البلاغ</th><th>نوع الطلب</th><th>التكلفة</th><th>القرار</th><th class="hide-sm">بواسطة</th><th class="hide-sm">التاريخ</th></tr></thead><tbody>' +
      done.map((t) => '<tr><td><a class="tag" href="#tk-' + t.id + '">' + h(t.ref) + '</a> <span class="small">' + h(t.title) + '</span></td><td>' + h(APPROVAL_KIND[t.approval.kind]) + '</td><td class="num">' + (t.approval.cost ? fmtSAR(t.approval.cost) : '—') + '</td><td>' + pill(AP_STATUS, t.approval.status) + '</td><td class="hide-sm">' + h(userName(t.approval.decidedBy)) + '</td><td class="hide-sm small">' + (t.approval.decidedAt ? fmtStamp(t.approval.decidedAt) : '—') + '</td></tr>').join('') + '</tbody></table></div>' : emptyState('clock', 'لم تُتخذ قرارات بعد');
    return {
      title: 'موافقات لجنة المعامل', crumb: 'البلاغات والطلبات',
      html: '<div class="page-head"><div class="t"><h2>موافقات لجنة المعامل</h2><p>المستوى الثالث في معالجة البلاغات: الشراء والاستبدال وإخراج الأجهزة من الخدمة</p></div></div>' +
        '<div class="grid grid-kpi">' + kpi('بانتظار القرار', pend.length, 'flag', 'warn', 'أقدمها منذ ' + (pend[0] ? U.timeAgo(pend[0].approval.at).replace('قبل ', '') : '—')) + kpi('قيمة الطلبات المعلقة', '<span style="font-size:1.4rem">' + fmtSAR(sumPend) + '</span>', 'box', 'info', 'تكلفة تقديرية') +
        kpi('معتمدة', done.filter((t) => t.approval.status === 'approved').length, 'check', '', 'بقيمة ' + fmtSAR(sumOk)) + kpi('مرفوضة', done.filter((t) => t.approval.status === 'rejected').length, 'x', 'bad', 'مع ذكر السبب') + '</div>' +
        cards + card('سجل القرارات', done.length + ' قرارًا', hist, '', true)
    };
  }

  /* ===== الواجهة العامة: إبلاغ الزوار وتتبع البلاغ ===== */
  const pub = { done: null, track: null, trackErr: '' };
  function renderPublic(r) {
    const nav = '<header class="pub-top"><a class="brand" href="#" style="text-decoration:none"><div class="brand-mark"><small>LM</small>Lb</div><div><div class="brand-name">مِختبَر</div><div class="brand-sub">نظام إدارة المعامل</div></div></a>' +
      '<nav class="pub-nav"><a href="#report" class="' + (r === 'report' ? 'on' : '') + '">' + icon('wrench') + 'الإبلاغ عن عطل</a><a href="#track" class="' + (r === 'track' ? 'on' : '') + '">' + icon('search') + 'تتبع بلاغ</a><a href="#" class="btn btn-sm">' + icon('key') + 'تسجيل الدخول</a></nav></header>';
    let body;
    if (r === 'report' && pub.done) {
      const t = pub.done;
      body = '<div class="pub-card" style="text-align:center"><div class="pub-ok">' + icon('check') + '</div><h1>تم استلام بلاغك</h1><p class="muted">احتفظ برقم البلاغ لتتابع حالته. سيصل البلاغ إلى مشرف ' + h(labName(t.labId)) + '.</p>' +
        '<div class="pub-ref ltr">' + h(t.ref) + '</div><p class="small muted">البريد المسجل: <span class="ltr">' + h(t.guest.email) + '</span></p>' +
        '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn btn-primary" id="pub-go-track">' + icon('search') + 'تتبع البلاغ</button><button class="btn" id="pub-new">بلاغ آخر</button></div></div>';
    } else if (r === 'report') {
      body = '<form class="pub-card" id="pub-report" novalidate><div class="pub-head">' + icon('flask') + '<h1>الإبلاغ عن عطل</h1><p class="muted">لا تحتاج حسابًا. اكتب بريدك لتتابع البلاغ لاحقًا.</p></div><div class="form-error" hidden></div>' + ticketFormHTML(true) + '<button type="submit" class="btn btn-primary btn-block" style="height:46px">' + icon('send') + 'إرسال البلاغ</button></form>';
    } else {
      const t = pub.track ? S.byId('tickets', pub.track) : null;
      body = '<form class="pub-card" id="pub-track" novalidate><div class="pub-head">' + icon('search') + '<h1>تتبع حالة البلاغ</h1><p class="muted">أدخل رقم البلاغ والبريد الذي استخدمته عند الإبلاغ.</p></div>' +
        (pub.trackErr ? '<div class="form-error">' + icon('alert') + '<span>' + h(pub.trackErr) + '</span></div>' : '') +
        U.formGrid([{ name: 'ref', label: 'رقم البلاغ', required: true, ltr: true, placeholder: 'MT-1043' }, { name: 'email', label: 'البريد الإلكتروني', type: 'email', required: true, ltr: true }], { ref: t ? t.ref : '', email: t && t.guest ? t.guest.email : '' }) +
        '<button type="submit" class="btn btn-primary btn-block">' + icon('search') + 'عرض الحالة</button></form>';
      if (t) {
        const l = lab(t.labId) || {};
        body += '<section class="pub-card pub-wide"><div class="rq-head" style="padding:0 0 12px"><div class="top"><span class="tag">' + h(t.ref) + '</span>' + pill(TK_STATUS, t.status) + (approvalPending(t) ? '<span class="pill warn">بانتظار موافقة لجنة المعامل</span>' : '') + '</div><h2>' + h(t.title) + '</h2><div class="meta">' + h(l.name || '') + ' · ' + U.fmtDate(t.createdAt) + '</div></div>' +
          locPath(t) + tkStepper(t) +
          (t.status === 'resolved' && t.resolution ? '<div class="alert" style="background:var(--ok-soft);color:var(--ok)">' + icon('check') + '<div class="grow"><b>تم الحل:</b> ' + h(t.resolution) + '</div></div>' : '') +
          '<h3 style="font-size:var(--fs-sm);margin:18px 0 12px">سجل التتبع</h3>' + ticketThread(t, 'public') +
          (t.status !== 'resolved' ? '<form id="pub-comment" class="composer" style="padding:16px 0 0;border-top:1px solid var(--line);margin-top:16px"><textarea class="textarea" name="text" placeholder="أضف معلومة أو استفسارًا لفريق المعامل…" aria-label="رد"></textarea><button class="btn btn-primary" type="submit">' + icon('send') + 'إرسال</button></form>' : '') + '</section>';
      }
    }
    document.getElementById('app').innerHTML = '<div class="pub">' + nav + '<main class="pub-main">' + body + '</main><footer class="pub-foot">مِختبَر · نظام إدارة المعامل</footer></div>';
    const rep = document.getElementById('pub-report');
    if (rep) {
      bindTicketForm(rep, {});
      rep.addEventListener('submit', (e) => {
        e.preventDefault();
        const res = readTicketForm(rep, true);
        const err = rep.querySelector('.form-error');
        if (res.err) { err.innerHTML = icon('alert') + '<span>' + h(res.err) + '</span>'; err.hidden = false; err.scrollIntoView({ block: 'center' }); return; }
        pub.done = createTicket(res.data);
        renderPublic('report');
        window.scrollTo(0, 0);
      });
    }
    const gt = document.getElementById('pub-go-track');
    if (gt) gt.addEventListener('click', () => { pub.track = pub.done.id; pub.trackErr = ''; pub.done = null; location.hash = 'track'; });
    const nw = document.getElementById('pub-new');
    if (nw) nw.addEventListener('click', () => { pub.done = null; renderPublic('report'); });
    const tr = document.getElementById('pub-track');
    if (tr) tr.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = U.formData(tr);
      const t = S.coll('tickets').find((x) => x.ref.toLowerCase() === (v.ref || '').toLowerCase());
      const email = (v.email || '').toLowerCase();
      const ok = t && ((t.guest && t.guest.email === email) || (user(t.reporterId) || {}).email === email);
      pub.track = ok ? t.id : null;
      pub.trackErr = ok ? '' : 'لا يوجد بلاغ بهذا الرقم مسجل بهذا البريد. تأكد من الرقم والبريد.';
      renderPublic('track');
    });
    const pc = document.getElementById('pub-comment');
    if (pc) pc.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = (pc.querySelector('textarea').value || '').trim();
      if (!text) return;
      const t = S.byId('tickets', pub.track);
      S.upsert('tickets', Object.assign({}, t, { log: (t.log || []).concat([{ at: nowISO(), userId: '', kind: 'comment', text, internal: false }]) }));
      U.toast('أُرسلت رسالتك إلى فريق المعامل');
      renderPublic('track');
    });
  }

  /* ===== الحرم الجامعي ===== */
  function viewCampuses() {
    const cs = S.coll('campuses');
    const html = '<div class="page-head"><div class="t"><h2>الحرم الجامعي</h2><p>' + cs.length + ' مواقع · ' + S.coll('labs').length + ' معامل · ' + S.coll('stations').length + ' محطة · ' + S.coll('devices').length + ' جهازًا</p></div><div class="actions">' + (isAdmin() ? '<button class="btn btn-primary" data-act="newCampus">' + icon('plus') + 'إضافة حرم</button>' : '') + '</div></div>' +
      '<div class="grid grid-2e">' + cs.map((c) => {
        const ls = S.coll('labs').filter((l) => l.campusId === c.id);
        const ids = new Set(ls.map((l) => l.id));
        const ds = S.coll('devices').filter((d) => ids.has(d.labId));
        const st = S.coll('stations').filter((s) => ids.has(s.labId)).length;
        const ot = S.coll('tickets').filter((t) => ids.has(t.labId) && t.status !== 'resolved').length;
        const ok = ds.filter((d) => d.status === 'working').length, svc = ds.filter((d) => d.status !== 'retired').length;
        return '<section class="card"><div class="card-head"><div style="display:flex;gap:12px;align-items:center"><div class="dcode">' + h(c.code) + '</div><div><h2>' + h(c.name) + '</h2><div class="sub">' + h([c.city, c.address].filter(Boolean).join(' · ')) + '</div></div></div>' +
          (isAdmin() ? '<div class="actions"><button class="icon-btn" data-act="editCampus" data-id="' + c.id + '" aria-label="تعديل">' + icon('edit') + '</button>' + (!ls.length ? '<button class="icon-btn" data-act="deleteCampus" data-id="' + c.id + '" aria-label="حذف">' + icon('trash') + '</button>' : '') + '</div>' : '') + '</div>' +
          '<div class="card-body"><div class="facts facts-4">' + '<div class="fact"><span>المعامل</span><b>' + ls.length + '</b></div><div class="fact"><span>المحطات</span><b>' + st + '</b></div><div class="fact"><span>الأجهزة العاملة</span><b>' + ok + ' / ' + svc + '</b></div><div class="fact"><span>بلاغات مفتوحة</span><b' + (ot ? ' style="color:var(--bad)"' : '') + '>' + ot + '</b></div></div></div>' +
          '<div class="list">' + (ls.length ? ls.map((l) => '<a class="list-item" href="#lab-' + l.id + '" style="color:inherit;text-decoration:none">' + labElem(l, 40) + '<div class="grow"><b>' + h(l.name) + '</b><span>' + h(l.building) + ' · قاعة ' + h(l.room) + ' · ' + S.coll('stations').filter((s) => s.labId === l.id).length + ' محطات</span></div>' + pill(LAB_STATUS, l.status) + '</a>').join('') : emptyState('flask', 'لا توجد معامل في هذا الحرم')) + '</div></section>';
      }).join('') + '</div>';
    return { title: 'الحرم الجامعي', crumb: 'المعامل والمعدات', html };
  }
  function campusModal(existing) {
    const fields = [{ name: 'name', label: 'اسم الحرم', required: true, span: true }, { name: 'code', label: 'الرمز', required: true, ltr: true, placeholder: 'MAIN' }, { name: 'city', label: 'المدينة' }, { name: 'address', label: 'العنوان', span: true }];
    U.modal({
      title: existing ? 'تعديل الحرم' : 'إضافة حرم', body: U.formGrid(fields, existing || {}), submitText: 'حفظ',
      onSubmit(form) {
        const v = U.formData(form);
        if (!v.name || !v.code) return 'الاسم والرمز مطلوبان.';
        v.code = v.code.toUpperCase();
        if (S.coll('campuses').some((c) => c.code === v.code && (!existing || c.id !== existing.id))) return 'الرمز مستخدم لحرم آخر.';
        if (existing) v.id = existing.id;
        S.upsert('campuses', v, 'C'); U.toast('تم الحفظ'); setTimeout(render);
      }
    });
  }

  /* ===== محطات المعمل ===== */
  function stationsMap(l) {
    const sts = S.coll('stations').filter((s) => s.labId === l.id);
    const can = managesLab(l.id);
    const cards = sts.map((s) => {
      const ds = S.coll('devices').filter((d) => d.stationId === s.id);
      const live = ds.filter((d) => d.status !== 'retired');
      const worst = live.some((d) => d.status === 'broken') ? 'bad' : live.some((d) => d.status === 'maintenance') ? 'warn' : live.length ? 'ok' : '';
      const ot = S.coll('tickets').filter((t) => t.stationId === s.id && t.status !== 'resolved').length;
      return '<div class="st-card ' + worst + '"><div class="st-head"><b>' + h(s.name) + '</b><span class="mono">' + h(s.code.split('-').pop()) + '</span></div>' +
        (ds.length ? '<div class="st-devs">' + ds.map((d) => '<a href="#dev-' + d.id + '" class="st-dev" title="' + h(d.name + ' · ' + DEV_STATUS[d.status][0]) + '"><span class="dot ' + DEV_STATUS[d.status][1] + '"></span>' + h(d.tag.split('-').slice(-2).join('-')) + '</a>').join('') + '</div>' : '<div class="muted small">لا توجد أجهزة</div>') +
        '<div class="st-foot"><span>' + live.length + ' في الخدمة' + (ot ? ' · <b style="color:var(--bad)">' + ot + ' بلاغ</b>' : '') + '</span>' +
        '<span style="display:flex;gap:2px"><button class="icon-btn" data-act="reportStation" data-id="' + s.id + '" title="إبلاغ عن عطل في المحطة" aria-label="إبلاغ عن عطل">' + icon('wrench') + '</button>' + (can ? '<button class="icon-btn" data-act="editStation" data-id="' + s.id + '" title="تعديل المحطة" aria-label="تعديل المحطة">' + icon('edit') + '</button>' : '') + '</span></div></div>';
    }).join('');
    return '<div class="st-legend small muted"><span><i class="dot ok"></i>كل الأجهزة تعمل</span><span><i class="dot warn"></i>جهاز في الصيانة</span><span><i class="dot bad"></i>جهاز معطّل</span></div>' +
      '<div class="st-map">' + (cards || '') + (can ? '<button class="st-add" data-act="newStation" data-id="' + l.id + '">' + icon('plus') + 'إضافة محطة</button>' : '') + '</div>' + (!sts.length && !can ? emptyState('grid', 'لا توجد محطات مسجلة في هذا المعمل') : '');
  }
  function stationModal(existing, labId) {
    const l = lab(existing ? existing.labId : labId);
    const n = S.coll('stations').filter((s) => s.labId === l.id).length;
    const v = existing || { name: 'محطة ' + n, code: l.code + '-S' + pad(n) };
    const nDev = existing ? S.coll('devices').filter((d) => d.stationId === existing.id).length : 0;
    U.modal({
      title: (existing ? 'تعديل المحطة · ' : 'إضافة محطة · ') + l.name, size: 'sm',
      body: U.formGrid([{ name: 'name', label: 'اسم المحطة', required: true, span: true }, { name: 'code', label: 'الرمز', required: true, ltr: true, span: true }, { name: 'note', label: 'ملاحظات', type: 'textarea', span: true, placeholder: 'مثال: بجانب النافذة، فيها منفذ شبكة إضافي' }], v),
      submitText: 'حفظ',
      extraFoot: existing && !nDev ? '<button class="btn btn-danger" data-act="deleteStation" data-id="' + existing.id + '">' + icon('trash') + 'حذف</button>' : '',
      onSubmit(form) {
        const d = U.formData(form);
        if (!d.name || !d.code) return 'الاسم والرمز مطلوبان.';
        d.code = d.code.toUpperCase();
        if (S.coll('stations').some((s) => s.code === d.code && (!existing || s.id !== existing.id))) return 'الرمز ' + d.code + ' مستخدم لمحطة أخرى.';
        d.labId = l.id; if (existing) d.id = existing.id;
        S.upsert('stations', d, 'st'); S.log(me.id, (existing ? 'عدّل المحطة ' : 'أضاف المحطة ') + d.code); U.toast('تم الحفظ'); setTimeout(render);
      }
    });
  }

  /* ===== البيانات المرجعية: أنواع الأجهزة والفصول الدراسية ===== */
  function viewReference() {
    const types = S.coll('deviceTypes'), sems = S.coll('semesters').slice().sort((a, b) => a.start.localeCompare(b.start));
    const cur = currentSemester();
    const tTable = '<div class="table-wrap"><table class="table stack"><thead><tr><th>النوع</th><th>يتطلب معايرة</th><th>عدد الأجهزة</th><th></th></tr></thead><tbody>' + types.map((t) => {
      const n = S.coll('devices').filter((d) => d.type === t.id).length;
      return '<tr><td class="cell-main">' + h(t.name) + '</td><td>' + (t.calibration ? '<span class="pill warn">نعم</span>' : '<span class="muted small">لا</span>') + '</td><td class="num">' + n + '</td><td><div class="row-actions"><button class="icon-btn" data-act="editType" data-id="' + t.id + '" aria-label="تعديل">' + icon('edit') + '</button>' + (!n ? '<button class="icon-btn" data-act="deleteType" data-id="' + t.id + '" aria-label="حذف">' + icon('trash') + '</button>' : '') + '</div></td></tr>';
    }).join('') + '</tbody></table></div>';
    const sTable = '<div class="table-wrap"><table class="table stack"><thead><tr><th>الفصل</th><th>البداية</th><th>النهاية</th><th>الحالة</th><th>البلاغات</th><th></th></tr></thead><tbody>' + sems.map((s) => {
      const n = S.coll('tickets').filter((t) => t.semesterId === s.id).length;
      const state = s.id === cur.id ? '<span class="pill ok">الحالي</span>' : s.end < today() ? '<span class="pill">منتهٍ</span>' : '<span class="pill info">قادم</span>';
      return '<tr><td class="cell-main">' + h(s.name) + '</td><td>' + U.fmtDate(s.start) + '</td><td>' + U.fmtDate(s.end) + '</td><td>' + state + '</td><td class="num">' + n + '</td><td><div class="row-actions"><button class="icon-btn" data-act="editSem" data-id="' + s.id + '" aria-label="تعديل">' + icon('edit') + '</button>' + (!n ? '<button class="icon-btn" data-act="deleteSem" data-id="' + s.id + '" aria-label="حذف">' + icon('trash') + '</button>' : '') + '</div></td></tr>';
    }).join('') + '</tbody></table></div>';
    return {
      title: 'البيانات المرجعية', crumb: 'الإعدادات',
      html: '<div class="page-head"><div class="t"><h2>البيانات المرجعية</h2><p>القوائم التي تعتمد عليها بقية الشاشات</p></div></div>' +
        '<div class="grid grid-2e">' + card('أنواع الأجهزة', types.length + ' أنواع', tTable, '<button class="btn btn-sm" data-act="newType">' + icon('plus') + 'إضافة نوع</button>', true) +
        card('الفصول الدراسية', 'الحالي: ' + cur.name, sTable, '<button class="btn btn-sm" data-act="newSem">' + icon('plus') + 'إضافة فصل</button>', true) + '</div>'
    };
  }
  function typeModal(existing) {
    U.modal({
      title: existing ? 'تعديل نوع الجهاز' : 'إضافة نوع جهاز', size: 'sm',
      body: U.formGrid([{ name: 'name', label: 'اسم النوع', required: true, span: true, placeholder: 'مثال: طابعة' }, { name: 'calibration', label: 'يتطلب معايرة دورية', type: 'select', span: true, options: [{ value: '0', label: 'لا' }, { value: '1', label: 'نعم' }] }], existing ? { name: existing.name, calibration: existing.calibration ? '1' : '0' } : { calibration: '0' }),
      submitText: 'حفظ',
      onSubmit(form) {
        const v = U.formData(form);
        if (!v.name) return 'اسم النوع مطلوب.';
        if (S.coll('deviceTypes').some((t) => t.name === v.name && (!existing || t.id !== existing.id))) return 'يوجد نوع بنفس الاسم.';
        S.upsert('deviceTypes', { id: existing ? existing.id : undefined, name: v.name, calibration: v.calibration === '1' }, 'dt'); U.toast('تم الحفظ'); setTimeout(render);
      }
    });
  }
  function semModal(existing) {
    U.modal({
      title: existing ? 'تعديل الفصل الدراسي' : 'إضافة فصل دراسي', size: 'sm',
      body: U.formGrid([{ name: 'name', label: 'اسم الفصل', required: true, span: true, placeholder: 'الفصل الثاني 2026–2027' }, { name: 'start', label: 'البداية', type: 'date', required: true }, { name: 'end', label: 'النهاية', type: 'date', required: true }], existing || {}),
      submitText: 'حفظ',
      onSubmit(form) {
        const v = U.formData(form);
        if (!v.name || !v.start || !v.end) return 'كل الحقول مطلوبة.';
        if (v.end <= v.start) return 'نهاية الفصل يجب أن تكون بعد بدايته.';
        const clash = S.coll('semesters').find((s) => (!existing || s.id !== existing.id) && s.start <= v.end && v.start <= s.end);
        if (clash) return 'يتداخل مع ' + clash.name + '.';
        if (existing) v.id = existing.id;
        S.upsert('semesters', v, 'S'); U.toast('تم الحفظ'); setTimeout(render);
      }
    });
  }
  const barcodeSVG = (code) => {
    let x = 0, bars = '';
    String(code || '').split('').forEach((ch, i) => { const n = (+ch || 0) + i; const w1 = 1 + (n % 3), g = 1 + ((n * 7) % 2), w2 = 1 + ((n * 3) % 2); bars += '<rect x="' + x + '" y="0" width="' + w1 + '" height="26"/>'; x += w1 + g; bars += '<rect x="' + x + '" y="0" width="' + w2 + '" height="26"/>'; x += w2 + 2; });
    return '<svg class="barcode-svg" viewBox="0 0 ' + x + ' 26" preserveAspectRatio="none" aria-hidden="true">' + bars + '</svg>';
  };

  /* ===== الجدول الأسبوعي ===== */
  const H0 = 8, H1 = 20, HH = 52;
  function viewSchedule() {
    const f = st.schedule;
    const labs = S.coll('labs');
    if (!f.lab || !lab(f.lab)) f.lab = (labs.find((l) => managesLab(l.id) && l.status === 'active') || labs.find((l) => l.status === 'active') || labs[0] || {}).id || '';
    const l = lab(f.lab);
    const dates = weekDates(f.week);
    const t = today();
    const label = U.fmtDate(dates[0]) + ' – ' + U.fmtDate(dates[4]);
    const head = '<div class="page-head"><div class="t"><h2>الجدول الأسبوعي</h2><p>' + h(label) + '</p></div><div class="actions">' +
      '<select class="select" id="sch-lab" aria-label="المعمل" style="width:auto">' + labs.map((x) => '<option value="' + x.id + '"' + (x.id === f.lab ? ' selected' : '') + '>' + h(x.name) + (x.status !== 'active' ? ' (' + LAB_STATUS[x.status][0] + ')' : '') + '</option>').join('') + '</select>' +
      '<div class="seg"><button data-act="weekPrev" aria-label="الأسبوع السابق">' + icon('chevronR', '') .replace('<svg', '<svg width="16" height="16"') + '</button><button data-act="weekNow" class="' + (f.week === 0 ? 'on' : '') + '">هذا الأسبوع</button><button data-act="weekNext" aria-label="الأسبوع التالي">' + icon('chevronL').replace('<svg', '<svg width="16" height="16"') + '</button></div>' +
      '</div></div>';
    if (!l) return { title: 'الجدول الأسبوعي', crumb: 'التشغيل', html: head + '<div class="card">' + emptyState('flask', 'أضف معملًا أولًا لعرض جدوله') + '</div>' };

    const bks = S.coll('bookings').filter((b) => b.labId === l.id && (b.status === 'approved' || b.status === 'pending'));
    const total = (H1 - H0) * HH;
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const openM = U.toMin(l.open), closeM = U.toMin(l.close);
    let grid = '<div class="hd"></div>' + dates.map((d) => '<div class="hd' + (d === t ? ' today' : '') + '">' + U.DAYS[U.parseDate(d).getDay()] + '<small>' + U.fmtDate(d).replace(/ \d{4}$/, '') + '</small></div>').join('');
    grid += '<div class="hours">' + Array.from({ length: H1 - H0 }, (_, i) => '<div>' + pad(H0 + i) + ':00</div>').join('') + '</div>';
    dates.forEach((d) => {
      let col = '';
      const yMin = (m) => ((m - H0 * 60) / 60) * HH;
      if (openM > H0 * 60) col += '<div class="closed-band" style="top:0;height:' + yMin(openM) + 'px"></div>';
      if (closeM < H1 * 60) col += '<div class="closed-band" style="top:' + yMin(closeM) + 'px;bottom:0"></div>';
      if (l.status === 'active' && d >= t) {
        for (let hr = H0; hr < H1; hr++) {
          const m = hr * 60;
          if (m < openM || m + 60 > closeM || (d === t && m + 60 <= nowMin)) continue;
          col += '<button class="slot-btn" style="top:' + yMin(m) + 'px" data-act="slot" data-id="' + d + '|' + pad(hr) + ':00" aria-label="حجز ' + U.fmtDay(d) + ' الساعة ' + U.fmtTime(pad(hr) + ':00') + '"></button>';
        }
      }
      bks.filter((b) => b.date === d).forEach((b) => {
        const top = yMin(U.toMin(b.start)), ht = Math.max((durMin(b) / 60) * HH - 3, 22);
        col += '<button class="blk ' + b.status + '" style="top:' + top + 'px;height:' + ht + 'px" data-act="viewBooking" data-id="' + b.id + '" title="' + h(b.title) + '"><b>' + h(b.title) + '</b><span>' + b.start + '–' + b.end + '</span>' + (ht > 60 ? '<div class="muted" style="font-size:11px">' + h(userName(b.userId)) + ' · ' + b.attendees + ' حضور</div>' : '') + '</button>';
      });
      if (d === t && nowMin >= H0 * 60 && nowMin <= H1 * 60) col += '<div class="now-line" style="top:' + yMin(nowMin) + 'px"></div>';
      grid += '<div class="col' + (d === t ? ' today' : '') + (l.status !== 'active' ? ' closed' : '') + '" style="height:' + total + 'px">' + col + '</div>';
    });

    const html = head +
      (l.status !== 'active' ? '<div class="alert">' + icon('alert') + '<div class="grow"><b>' + h(l.name) + ' ' + LAB_STATUS[l.status][0] + '.</b> لا يمكن إنشاء حجوزات جديدة فيه حاليًا.</div></div>' : '') +
      '<section class="card"><div class="card-head"><div style="display:flex;gap:12px;align-items:center">' + labElem(l, 44) + '<div><h2>' + h(l.name) + '</h2><div class="sub">السعة ' + l.capacity + ' · ' + U.fmtTime(l.open) + ' – ' + U.fmtTime(l.close) + '</div></div></div>' +
      '<div class="actions small" style="align-items:center;gap:14px"><span style="display:inline-flex;gap:6px;align-items:center"><i style="width:12px;height:12px;border-radius:3px;background:var(--accent-soft);border-inline-start:3px solid var(--accent)"></i>مؤكد</span><span style="display:inline-flex;gap:6px;align-items:center"><i style="width:12px;height:12px;border-radius:3px;background:var(--warn-soft);border-inline-start:3px solid var(--warn)"></i>بانتظار الموافقة</span>' +
      (l.status === 'active' ? '<span class="muted">اضغط على أي ساعة فارغة للحجز</span>' : '') + '</div></div>' +
      '<div class="sched-scroll"><div class="sched" style="--days:5;--hh:' + HH + 'px">' + grid + '</div></div></section>';
    return {
      title: 'الجدول الأسبوعي', crumb: 'التشغيل', html,
      mount(root) { root.querySelector('#sch-lab').addEventListener('change', (e) => { f.lab = e.target.value; render(); }); }
    };
  }

  /* ===== الحجوزات ===== */
  function bookingsTable(items, compact) {
    if (!items.length) return emptyState('calendar', 'لا توجد حجوزات في هذا القسم');
    return '<div class="table-wrap"><table class="table stack"><thead><tr><th>الحجز</th>' + (compact ? '' : '<th>المعمل</th>') + '<th>الموعد</th><th class="hide-sm">مقدم الطلب</th><th>الحضور</th><th>الحالة</th><th></th></tr></thead><tbody>' +
      items.map((b) => {
        const l = lab(b.labId) || { capacity: 0 };
        let acts = '<button class="icon-btn" data-act="viewBooking" data-id="' + b.id + '" title="التفاصيل" aria-label="التفاصيل">' + icon('eye') + '</button>';
        if (b.status === 'pending' && canApprove(b) && b.date >= today()) acts = '<button class="btn btn-sm btn-ok" data-act="approve" data-id="' + b.id + '">' + icon('check') + 'موافقة</button><button class="btn btn-sm btn-danger" data-act="reject" data-id="' + b.id + '">رفض</button>' + acts;
        return '<tr><td><div class="cell-main">' + h(b.title) + '</div>' + (b.notes ? '<div class="cell-sub">' + h(b.notes) + '</div>' : '') + '</td>' +
          (compact ? '' : '<td>' + h(labName(b.labId)) + '</td>') +
          '<td style="white-space:nowrap"><div>' + U.fmtDay(b.date) + '</div><div class="cell-sub">' + U.fmtTime(b.start) + ' – ' + U.fmtTime(b.end) + '</div></td>' +
          '<td class="hide-sm">' + h(userName(b.userId)) + '</td>' +
          '<td class="num">' + b.attendees + '<span class="muted small"> / ' + l.capacity + '</span></td>' +
          '<td>' + pill(BK_STATUS, b.status) + '</td><td><div class="row-actions">' + acts + '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function viewBookings() {
    const f = st.bookings;
    const t = today();
    const scope = () => S.coll('bookings').filter((b) => isAdmin() || b.userId === me.id || managesLab(b.labId));
    const tabs = [
      ...(isStaff() ? [['pending', 'بانتظار الموافقة', (b) => b.status === 'pending' && b.date >= t && canApprove(b)]] : []),
      ['upcoming', 'القادمة', (b) => b.date >= t && (b.status === 'approved' || b.status === 'pending')],
      ['past', 'السابقة', (b) => b.date < t],
      ['closed', 'المرفوضة والملغاة', (b) => b.status === 'rejected' || b.status === 'cancelled'],
      ['all', 'الكل', () => true]
    ];
    if (!tabs.some((x) => x[0] === f.tab)) f.tab = isStaff() && pendingForMe().length ? 'pending' : 'upcoming';
    const html =
      '<div class="page-head"><div class="t"><h2>' + (isStaff() ? 'الحجوزات' : 'حجوزاتي') + '</h2><p>' + (isAdmin() ? 'كل حجوزات المعامل' : isStaff() ? 'حجوزات المعامل التي تشرف عليها وحجوزاتك' : 'الطلبات التي قدّمتها وحالتها') + '</p></div><div class="actions">' +
      (isStaff() ? '<button class="btn" data-act="exportBookings">' + icon('download') + 'تصدير CSV</button>' : '') +
      '<button class="btn btn-primary" data-act="newBooking">' + icon('plus') + 'حجز جديد</button></div></div>' +
      '<section class="card"><div class="tabs" role="tablist" id="bk-tabs"></div>' +
      '<div class="toolbar"><div class="search">' + icon('search') + '<input class="input" id="bk-q" type="search" placeholder="ابحث بعنوان الحجز أو المعمل أو مقدم الطلب" value="' + h(f.q) + '"></div></div>' +
      '<div id="bk-list"></div></section>';
    return {
      title: 'الحجوزات', crumb: 'التشغيل', html,
      mount(root) {
        const tabsEl = root.querySelector('#bk-tabs'), list = root.querySelector('#bk-list');
        const draw = () => {
          const all = scope();
          const q = f.q.toLowerCase();
          tabsEl.innerHTML = tabs.map((x) => '<button role="tab" data-t="' + x[0] + '" class="' + (f.tab === x[0] ? 'on' : '') + '">' + x[1] + '<span class="count">' + all.filter(x[2]).length + '</span></button>').join('');
          const fn = tabs.find((x) => x[0] === f.tab)[2];
          let items = all.filter(fn).filter((b) => !q || (b.title + ' ' + labName(b.labId) + ' ' + userName(b.userId)).toLowerCase().includes(q)).sort(byStart);
          if (f.tab === 'past' || f.tab === 'all' || f.tab === 'closed') items = items.reverse();
          list.innerHTML = bookingsTable(items);
        };
        tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { f.tab = b.dataset.t; draw(); } });
        bindFilters(root, { '#bk-q': ['q', f] }, draw);
        draw();
      }
    };
  }

  function validateBooking(d, excludeId) {
    const l = lab(d.labId);
    if (!d.title) return 'اكتب عنوانًا للحجز، مثل اسم المقرر أو النشاط.';
    if (!l) return 'اختر المعمل.';
    if (l.status !== 'active') return l.name + ' ' + LAB_STATUS[l.status][0] + ' حاليًا ولا يقبل الحجوزات.';
    if (!d.date) return 'اختر تاريخ الحجز.';
    const day = U.parseDate(d.date).getDay();
    if (day === 5 || day === 6) return 'المعامل لا تعمل يومي الجمعة والسبت. اختر يومًا من الأحد إلى الخميس.';
    if (!d.start || !d.end) return 'حدد وقت البداية والنهاية.';
    if (d.end <= d.start) return 'وقت النهاية يجب أن يكون بعد وقت البداية.';
    if (durMin(d) < 30) return 'أقل مدة للحجز 30 دقيقة.';
    if (durMin(d) > 240) return 'أطول مدة للحجز الواحد 4 ساعات.';
    if (d.date < today() || (d.date === today() && d.end <= nowHM())) return 'لا يمكن الحجز في وقت مضى.';
    if (d.start < l.open || d.end > l.close) return 'ساعات عمل ' + l.name + ' من ' + U.fmtTime(l.open) + ' إلى ' + U.fmtTime(l.close) + '.';
    if (!(d.attendees >= 1)) return 'عدد الحضور يجب أن يكون 1 على الأقل.';
    if (d.attendees > l.capacity) return 'عدد الحضور (' + d.attendees + ') أكبر من سعة المعمل (' + l.capacity + ' مقعدًا).';
    const clash = S.coll('bookings').find((b) => b.id !== excludeId && b.labId === d.labId && b.date === d.date && (b.status === 'approved' || b.status === 'pending') && b.start < d.end && d.start < b.end);
    if (clash) return 'يتعارض مع حجز «' + clash.title + '» (' + U.fmtTime(clash.start) + ' – ' + U.fmtTime(clash.end) + ')' + (clash.status === 'pending' ? ' وهو بانتظار الموافقة' : '') + '. اختر وقتًا آخر.';
    return '';
  }

  function bookingModal(pre, existing) {
    const labsOpt = S.coll('labs').filter((l) => l.status === 'active').map((l) => ({ value: l.id, label: l.name + ' · ' + l.code }));
    if (!labsOpt.length) { U.toast('لا يوجد معمل متاح للحجز حاليًا', 'bad'); return; }
    let v = existing ? Object.assign({}, existing) : Object.assign({ labId: '', date: nextWorkday(), start: '10:00', end: '11:40', attendees: '', title: '', notes: '' }, pre || {});
    const fields = [
      { name: 'title', label: 'عنوان الحجز', required: true, span: true, placeholder: 'مثال: برمجة 1 (CS 111) — شعبة 3' },
      { name: 'labId', label: 'المعمل', type: 'select', options: labsOpt, required: true, placeholder: 'اختر المعمل', span: true },
      { name: 'date', label: 'التاريخ', type: 'date', required: true, min: today() },
      { name: 'attendees', label: 'عدد الحضور', type: 'number', min: 1, required: true },
      { name: 'start', label: 'من', type: 'time', required: true, step: 300 },
      { name: 'end', label: 'إلى', type: 'time', required: true, step: 300 },
      { name: 'notes', label: 'ملاحظات للمشرف', type: 'textarea', span: true, placeholder: 'برامج يجب تثبيتها، أدوات أو مواد مطلوبة…' }
    ];
    const willApprove = (labId) => labId && managesLab(labId);
    U.modal({
      title: existing ? 'تعديل طلب الحجز' : 'حجز معمل',
      body: U.formGrid(fields, v) + '<div class="alert info" id="bk-hint" hidden></div>',
      submitText: existing ? 'حفظ التعديلات' : 'إرسال',
      onOpen(form) {
        const hint = form.querySelector('#bk-hint');
        const submit = form.querySelector('[type=submit]');
        const upd = () => {
          const d = U.formData(form);
          const l = lab(d.labId);
          submit.textContent = existing ? 'حفظ التعديلات' : willApprove(d.labId) ? 'تأكيد الحجز' : 'إرسال الطلب للمشرف';
          if (!l) { hint.hidden = true; return; }
          const same = d.date ? S.coll('bookings').filter((b) => b.labId === l.id && b.date === d.date && (b.status === 'approved' || b.status === 'pending') && (!existing || b.id !== existing.id)).sort(byStart) : [];
          hint.hidden = false;
          hint.innerHTML = icon('info') + '<div class="grow"><b>' + h(l.name) + '</b> · السعة ' + l.capacity + ' · الدوام ' + U.fmtTime(l.open) + ' – ' + U.fmtTime(l.close) +
            (d.date ? '<br>' + (same.length ? 'المحجوز في ' + U.fmtDay(d.date) + ': ' + same.map((b) => '<span class="mono">' + b.start + '–' + b.end + '</span>').join('، ') : 'لا توجد حجوزات في ' + U.fmtDay(d.date) + ' حتى الآن.') : '') +
            (willApprove(d.labId) ? '' : '<br>سيُرسل الطلب إلى ' + h(userName(l.supervisorId)) + ' للموافقة.') + '</div>';
        };
        form.addEventListener('input', upd);
        form.addEventListener('change', upd);
        upd();
      },
      onSubmit(form) {
        const d = U.formData(form);
        d.attendees = parseInt(d.attendees, 10);
        const err = validateBooking(d, existing && existing.id);
        if (err) return err;
        if (existing) {
          S.upsert('bookings', Object.assign({}, existing, d));
          S.log(me.id, 'عدّل طلب الحجز «' + d.title + '»');
          U.toast('تم حفظ التعديلات');
        } else {
          const auto = willApprove(d.labId);
          Object.assign(d, { userId: me.id, status: auto ? 'approved' : 'pending', createdAt: today() });
          S.upsert('bookings', d, 'bk');
          S.log(me.id, (auto ? 'حجز ' : 'أرسل طلب حجز ') + '«' + d.title + '» في ' + labName(d.labId));
          U.toast(auto ? 'تم تأكيد الحجز' : 'تم إرسال الطلب إلى مشرف المعمل');
        }
        setTimeout(render);
      }
    });
  }
  function nextWorkday() {
    let d = new Date();
    if (d.getHours() >= 16) d = addDays(d, 1);
    while (d.getDay() === 5 || d.getDay() === 6) d = addDays(d, 1);
    return iso(d);
  }

  function bookingView(b) {
    const l = lab(b.labId) || {};
    let foot = '';
    if (b.status === 'pending' && canApprove(b) && b.date >= today()) foot += '<button class="btn btn-ok" data-act="approve" data-id="' + b.id + '">' + icon('check') + 'موافقة</button><button class="btn btn-danger" data-act="reject" data-id="' + b.id + '">رفض</button>';
    if (canEditBooking(b)) foot += '<button class="btn" data-act="editBooking" data-id="' + b.id + '">' + icon('edit') + 'تعديل</button>';
    if (canCancel(b)) foot += '<button class="btn btn-danger" data-act="cancelBooking" data-id="' + b.id + '">إلغاء الحجز</button>';
    U.modal({
      title: b.title,
      body: '<dl class="dl"><dt>الحالة</dt><dd>' + pill(BK_STATUS, b.status) + '</dd><dt>المعمل</dt><dd>' + h(l.name || '—') + ' <span class="tag">' + h(l.code || '') + '</span></dd>' +
        '<dt>الموعد</dt><dd>' + U.fmtDay(b.date) + ' · ' + U.fmtTime(b.start) + ' – ' + U.fmtTime(b.end) + ' <span class="muted small">(' + durMin(b) + ' دقيقة)</span></dd>' +
        '<dt>مقدم الطلب</dt><dd>' + h(userName(b.userId)) + ' · ' + h(ROLE[(user(b.userId) || {}).role] ? ROLE[user(b.userId).role][0] : '') + '</dd>' +
        '<dt>الحضور</dt><dd>' + b.attendees + ' من ' + (l.capacity || '—') + ' مقعدًا</dd>' +
        '<dt>ملاحظات</dt><dd>' + h(b.notes || '—') + '</dd>' +
        (b.reason ? '<dt>سبب الرفض / الإلغاء</dt><dd>' + h(b.reason) + '</dd>' : '') +
        '<dt>تاريخ الطلب</dt><dd>' + U.fmtDate(b.createdAt) + '</dd></dl>',
      extraFoot: foot
    });
  }

  function setBookingStatus(b, status, reason) {
    if (status === 'approved') {
      const clash = S.coll('bookings').find((x) => x.id !== b.id && x.labId === b.labId && x.date === b.date && x.status === 'approved' && x.start < b.end && b.start < x.end);
      if (clash) { U.toast('لا يمكن الموافقة: يتعارض مع «' + clash.title + '»', 'bad'); return; }
    }
    S.upsert('bookings', Object.assign({}, b, { status, reason: reason || b.reason || '' }));
    const verb = { approved: 'وافق على', rejected: 'رفض', cancelled: 'ألغى' }[status];
    S.log(me.id, verb + ' حجز «' + b.title + '»');
    U.toast({ approved: 'تمت الموافقة على الحجز', rejected: 'تم رفض الطلب', cancelled: 'تم إلغاء الحجز' }[status]);
    setTimeout(render);
  }
  function reasonModal(b, status) {
    U.modal({
      title: status === 'rejected' ? 'رفض طلب الحجز' : 'إلغاء الحجز', size: 'sm',
      body: '<p class="small">«' + h(b.title) + '» · ' + U.fmtDay(b.date) + ' · ' + U.fmtTime(b.start) + '</p>' + U.field({ name: 'reason', label: status === 'rejected' ? 'سبب الرفض (يظهر لمقدم الطلب)' : 'سبب الإلغاء', type: 'textarea', placeholder: 'اختياري' }),
      submitText: status === 'rejected' ? 'رفض الطلب' : 'إلغاء الحجز', submitClass: 'btn-danger',
      onSubmit(form) { setBookingStatus(b, status, U.formData(form).reason); }
    });
  }

  /* ===== الصيانة ===== */
  function ticketsTable(items, compact) {
    if (!items.length) return emptyState('wrench', 'لا توجد بلاغات في هذا القسم');
    return '<div class="table-wrap"><table class="table stack"><thead><tr><th>الرقم</th><th>البلاغ</th>' + (compact ? '' : '<th>الموقع</th>') + '<th>النوع</th><th>الأولوية</th><th>الحالة</th><th class="hide-sm">المبلّغ</th><th class="hide-sm">التاريخ</th><th></th></tr></thead><tbody>' +
      items.map((t) => {
        const ds = tkDevices(t), s0 = station(t.stationId);
        const where = ds.length ? h(ds[0].tag) + (ds.length > 1 ? ' +' + (ds.length - 1) : '') : s0 ? h(s0.name) : 'المعمل كاملًا';
        const it = ISSUE_TYPE[t.issueType || 'other'] || ISSUE_TYPE.other;
        return '<tr><td><a class="tag" href="#tk-' + t.id + '">' + h(t.ref) + '</a></td><td><div class="cell-main"><a href="#tk-' + t.id + '" style="color:inherit;text-decoration:none">' + h(t.title) + '</a></div><div class="cell-sub">' + where + '</div></td>' +
          (compact ? '' : '<td>' + h(labName(t.labId)) + '<div class="cell-sub">' + h(s0 ? s0.name : campusName((lab(t.labId) || {}).campusId)) + '</div></td>') +
          '<td class="small">' + h(it[0]) + '</td><td>' + pill(TK_PRI, t.priority) + '</td>' +
          '<td><div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">' + pill(TK_STATUS, t.status) + (approvalPending(t) ? '<span class="pill warn">بانتظار اللجنة</span>' : t.forwardedIT && t.status !== 'resolved' ? '<span class="pill info">الدعم الفني</span>' : '') + '</div></td>' +
          '<td class="hide-sm">' + h(reporterName(t)) + '</td><td class="hide-sm small" style="white-space:nowrap">' + U.fmtDate(t.createdAt) + '</td>' +
          '<td><div class="row-actions"><button class="icon-btn" data-act="viewTicket" data-id="' + t.id + '" title="التفاصيل" aria-label="التفاصيل">' + icon('eye') + '</button>' +
          (isAdmin() ? '<button class="icon-btn" data-act="deleteTicket" data-id="' + t.id + '" title="حذف" aria-label="حذف">' + icon('trash') + '</button>' : '') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function viewMaintenance() {
    const f = st.tickets;
    const scope = () => S.coll('tickets').filter(canSeeTicket);
    const tabs = [
      ['active', 'المفتوحة', (t) => t.status !== 'resolved'], ['open', 'جديدة', (t) => t.status === 'open'], ['in_progress', 'قيد المعالجة', (t) => t.status === 'in_progress'],
      ['it', 'محوّلة للدعم الفني', (t) => !!t.forwardedIT && t.status !== 'resolved'], ['approval', 'بانتظار اللجنة', approvalPending],
      ['guest', 'من الزوار', (t) => !!t.guest], ['resolved', 'تم حلها', (t) => t.status === 'resolved'], ['all', 'الكل', () => true]
    ];
    const all = scope();
    const open = all.filter((t) => t.status !== 'resolved');
    const sem = currentSemester();
    const res = all.filter((t) => t.status === 'resolved' && t.resolvedAt);
    const avg = res.length ? (res.reduce((s, t) => s + (U.parseDate(t.resolvedAt) - U.parseDate(t.createdAt)) / 864e5, 0) / res.length) : 0;
    const sel = (id, label, opts, val) => '<select class="select" id="' + id + '" aria-label="' + label + '"><option value="">' + label + '</option>' + opts.map((o) => '<option value="' + h(o.value) + '"' + (val === o.value ? ' selected' : '') + '>' + h(o.label) + '</option>').join('') + '</select>';
    const html =
      '<div class="page-head"><div class="t"><h2>البلاغات والأعطال</h2><p>' + (isStaff() || me.role === 'it' || me.role === 'committee' ? 'بلاغات المعامل وسير معالجتها · ' + h(sem.name) : 'البلاغات التي أرسلتها') + '</p></div><div class="actions">' +
      (isStaff() ? '<button class="btn" data-act="exportTickets">' + icon('download') + 'تصدير CSV</button>' : '') +
      '<button class="btn btn-primary" data-act="newTicket">' + icon('plus') + 'بلاغ جديد</button></div></div>' +
      '<div class="grid grid-kpi">' +
      kpi('بلاغات مفتوحة', open.length, 'inbox', 'bad', open.filter((t) => t.status === 'open').length + ' لم تبدأ معالجتها') +
      kpi('عند الدعم الفني', open.filter((t) => t.forwardedIT).length, 'send', 'info', 'المستوى الثاني') +
      kpi('بانتظار اللجنة', all.filter(approvalPending).length, 'flag', 'warn', 'المستوى الثالث') +
      kpi('متوسط مدة الحل', (Math.round(avg * 10) / 10) + '<span class="muted" style="font-size:1rem"> يوم</span>', 'clock', '', res.length + ' بلاغًا تم حله') +
      '</div>' +
      '<section class="card"><div class="tabs" role="tablist" id="tk-tabs"></div>' +
      '<div class="toolbar"><div class="search">' + icon('search') + '<input class="input" id="tk-q" type="search" placeholder="ابحث برقم البلاغ أو العنوان أو رقم الأصل أو البريد" value="' + h(f.q) + '"></div>' +
      sel('tk-campus', 'كل المواقع', S.coll('campuses').map((c) => ({ value: c.id, label: c.name })), f.campus) +
      sel('tk-type', 'كل الأنواع', optsOf(ISSUE_TYPE), f.type) +
      sel('tk-sem', 'كل الفصول', S.coll('semesters').map((x) => ({ value: x.id, label: x.name })), f.sem) +
      '</div><div id="tk-list"></div></section>';
    return {
      title: 'البلاغات والأعطال', crumb: 'البلاغات والطلبات', html,
      mount(root) {
        const tabsEl = root.querySelector('#tk-tabs'), list = root.querySelector('#tk-list');
        const draw = () => {
          const q = f.q.toLowerCase();
          const items0 = scope().filter((t) => (!f.campus || (lab(t.labId) || {}).campusId === f.campus) && (!f.type || t.issueType === f.type) && (!f.sem || t.semesterId === f.sem));
          tabsEl.innerHTML = tabs.map((x) => { const n = items0.filter(x[2]).length; return (x[0] === 'it' || x[0] === 'approval' || x[0] === 'guest') && !n && f.tab !== x[0] ? '' : '<button role="tab" data-t="' + x[0] + '" class="' + (f.tab === x[0] ? 'on' : '') + '">' + x[1] + '<span class="count">' + n + '</span></button>'; }).join('');
          const fn = (tabs.find((x) => x[0] === f.tab) || tabs[0])[2];
          const items = items0.filter(fn).filter((t) => !q || (t.ref + ' ' + t.title + ' ' + tkDevices(t).map((d) => d.tag).join(' ') + ' ' + (t.guest ? t.guest.email : '')).toLowerCase().includes(q))
            .sort((a, b) => (a.status === 'resolved') - (b.status === 'resolved') || PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || b.createdAt.localeCompare(a.createdAt));
          list.innerHTML = ticketsTable(items);
        };
        tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { f.tab = b.dataset.t; draw(); } });
        bindFilters(root, { '#tk-q': ['q', f], '#tk-campus': ['campus', f], '#tk-type': ['type', f], '#tk-sem': ['sem', f] }, draw);
        draw();
      }
    };
  }

  /* ===== التقارير ===== */
  function viewReports() {
    const f = st.reports;
    const t = U.parseDate(today());
    let from, to;
    if (f.period === 'week') { from = iso(weekStart(t)); to = iso(addDays(weekStart(t), 6)); }
    else if (f.period === 'month') { from = iso(new Date(t.getFullYear(), t.getMonth(), 1)); to = iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)); }
    else if (f.period === '30') { from = iso(addDays(t, -29)); to = iso(t); }
    else if (f.period === 'sem') { const sm = currentSemester(); from = sm.start || iso(t); to = sm.end || iso(t); }
    else { const ds = S.coll('bookings').map((b) => b.date).sort(); from = ds[0] || iso(t); to = ds[ds.length - 1] || iso(t); }
    const workdays = [];
    for (let d = U.parseDate(from); iso(d) <= to; d = addDays(d, 1)) if (d.getDay() <= 4) workdays.push(iso(d));
    const labs = S.coll('labs').filter((l) => isAdmin() || me.role === 'committee' || managesLab(l.id));
    const labIds = new Set(labs.map((l) => l.id));
    const inRange = S.coll('bookings').filter((b) => labIds.has(b.labId) && b.date >= from && b.date <= to);
    const approved = inRange.filter((b) => b.status === 'approved');
    const hours = approved.reduce((s, b) => s + durMin(b), 0) / 60;
    const decided = inRange.filter((b) => b.status === 'approved' || b.status === 'rejected').length;
    const approveRate = decided ? Math.round((approved.length / decided) * 100) : 0;
    const activeLabs = labs.filter((l) => l.status === 'active');
    const avgUtil = activeLabs.length ? Math.round(activeLabs.reduce((s, l) => s + labUtil(l, workdays), 0) / activeLabs.length) : 0;
    const byDay = [0, 1, 2, 3, 4].map((i) => ({ label: U.DAYS[i], value: approved.filter((b) => U.parseDate(b.date).getDay() === i).length }));
    const maxDay = Math.max(...byDay.map((x) => x.value));
    byDay.forEach((x) => { x.hi = x.value === maxDay && maxDay > 0; });
    const tks = S.coll('tickets').filter((x) => labIds.has(x.labId) && x.createdAt >= from && x.createdAt <= to);

    const rows = labs.map((l) => {
      const lb = approved.filter((b) => b.labId === l.id);
      const hrs = lb.reduce((s, b) => s + durMin(b), 0) / 60;
      const fill = lb.length ? Math.round(lb.reduce((s, b) => s + b.attendees / l.capacity, 0) / lb.length * 100) : 0;
      const u = labUtil(l, workdays);
      return '<tr><td><div class="cell-main">' + h(l.name) + '</div><div class="cell-sub">' + h(l.code) + '</div></td><td class="num">' + lb.length + '</td><td class="num">' + (Math.round(hrs * 10) / 10) + '</td>' +
        '<td style="min-width:160px">' + (l.status !== 'active' && !lb.length ? pill(LAB_STATUS, l.status) : '<div style="display:flex;gap:8px;align-items:center"><div class="meter ' + meterCls(u) + '" style="flex:1"><span style="width:' + u + '%"></span></div><b class="num small">' + u + '%</b></div>') + '</td>' +
        '<td class="num">' + (lb.length ? fill + '%' : '—') + '</td><td class="num">' + S.coll('tickets').filter((x) => x.labId === l.id && x.createdAt >= from && x.createdAt <= to).length + '</td></tr>';
    }).join('');

    const pri = Object.keys(TK_PRI).map((k) => ({ k, n: tks.filter((x) => x.priority === k).length }));
    const maxPri = Math.max(1, ...pri.map((x) => x.n));
    const periods = [['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['sem', 'الفصل الحالي'], ['all', 'كل الفترات']];

    const html =
      '<div class="page-head"><div class="t"><h2>التقارير والإحصاءات</h2><p>' + U.fmtDate(from) + ' – ' + U.fmtDate(to) + ' · ' + workdays.length + ' يوم عمل' + (isAdmin() ? '' : ' · المعامل التي تشرف عليها') + '</p></div><div class="actions">' +
      '<div class="seg" id="rp-period">' + periods.map((p) => '<button data-p="' + p[0] + '" class="' + (f.period === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div>' +
      '<button class="btn" data-act="exportBookings">' + icon('download') + 'تصدير الحجوزات</button></div></div>' +
      '<div class="grid grid-kpi">' +
      kpi('حجوزات مؤكدة', approved.length, 'calendar', '', inRange.filter((b) => b.status === 'pending').length + ' طلبات معلقة في الفترة') +
      kpi('ساعات الاستخدام', Math.round(hours), 'clock', 'info', 'إجمالي الساعات المحجوزة') +
      kpi('متوسط الإشغال', avgUtil + '%', 'gauge', 'warn', 'للمعامل المتاحة خلال أيام العمل') +
      kpi('نسبة القبول', approveRate + '%', 'check', '', decided + ' طلبًا تم البت فيه') +
      '</div>' +
      '<div class="grid grid-2">' +
      card('الحجوزات حسب أيام الأسبوع', 'عدد الحجوزات المؤكدة · الأكثر ازدحامًا مميّز', U.columns(byDay, { label: 'الحجوزات حسب اليوم' })) +
      card('بلاغات الصيانة حسب الأولوية', tks.length + ' بلاغًا في الفترة', '<div class="bars">' + pri.map((x) => '<div class="meter-row" style="grid-template-columns:90px minmax(0,1fr) 36px"><span>' + pill(TK_PRI, x.k) + '</span><div class="meter ' + (x.k === 'urgent' ? 'bad' : x.k === 'high' ? 'warn' : '') + '"><span style="width:' + Math.round(x.n / maxPri * 100) + '%"></span></div><span class="pct">' + x.n + '</span></div>').join('') + '</div>' +
        '<div class="muted small" style="margin-top:16px">' + tks.filter((x) => x.status === 'resolved').length + ' تم حلها · ' + tks.filter((x) => x.status !== 'resolved').length + ' مفتوحة</div>') +
      '</div>' +
      card('أداء المعامل', 'الإشغال = الساعات المحجوزة ÷ ساعات الدوام · الامتلاء = متوسط الحضور ÷ السعة', '<div class="table-wrap"><table class="table"><thead><tr><th>المعمل</th><th>الحجوزات</th><th>الساعات</th><th>الإشغال</th><th>الامتلاء</th><th>البلاغات</th></tr></thead><tbody>' + rows + '</tbody></table></div>', '', true) + issuesReport(from, to, labs) + reqReport(from, to);
    return {
      title: 'التقارير', crumb: 'الإدارة', html,
      mount(root) { root.querySelector('#rp-period').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { f.period = b.dataset.p; render(); } }); }
    };
  }

  function issuesReport(from, to, labs) {
    const ids = new Set(labs.map((l) => l.id));
    const tks = S.coll('tickets').filter((t) => ids.has(t.labId) && t.createdAt >= from && t.createdAt <= to);
    const types = Object.keys(ISSUE_TYPE).map((k) => ({ k, n: tks.filter((t) => (t.issueType || 'other') === k).length }));
    const maxT = Math.max(1, ...types.map((x) => x.n));
    const rows = S.coll('campuses').map((c) => {
      const cl = labs.filter((l) => l.campusId === c.id), cids = new Set(cl.map((l) => l.id));
      const ct = tks.filter((t) => cids.has(t.labId)), done = ct.filter((t) => t.status === 'resolved' && t.resolvedAt);
      const avg = done.length ? done.reduce((s0, t) => s0 + (U.parseDate(t.resolvedAt) - U.parseDate(t.createdAt)) / 864e5, 0) / done.length : null;
      const ds = S.coll('devices').filter((d) => cids.has(d.labId) && d.status !== 'retired');
      return '<tr><td><span class="tag">' + h(c.code) + '</span> <span class="cell-main">' + h(c.name) + '</span></td><td class="num">' + cl.length + '</td><td class="num">' + (ds.length ? Math.round(ds.filter((d) => d.status === 'working').length / ds.length * 100) : 0) + '%</td><td class="num">' + ct.length + '</td><td class="num">' + ct.filter((t) => t.forwardedIT).length + '</td><td class="num">' + ct.filter((t) => t.approval).length + '</td><td class="num">' + (avg === null ? '—' : (Math.round(avg * 10) / 10) + ' يوم') + '</td></tr>';
    }).join('');
    return '<div class="grid grid-2">' +
      card('البلاغات حسب الحرم', 'الجاهزية = الأجهزة العاملة ÷ الأجهزة في الخدمة', '<div class="table-wrap"><table class="table"><thead><tr><th>الحرم</th><th>المعامل</th><th>الجاهزية</th><th>البلاغات</th><th>للدعم الفني</th><th>للجنة</th><th>متوسط الحل</th></tr></thead><tbody>' + rows + '</tbody></table></div>', '', true) +
      card('البلاغات حسب نوع العطل', tks.length + ' بلاغًا في الفترة', '<div class="bars">' + types.map((x) => '<div class="meter-row" style="grid-template-columns:120px minmax(0,1fr) 36px"><span class="name">' + h(ISSUE_TYPE[x.k][0]) + '</span><div class="meter"><span style="width:' + Math.round(x.n / maxT * 100) + '%"></span></div><span class="pct">' + x.n + '</span></div>').join('') + '</div>') +
      '</div>';
  }
  function reqReport(from, to) {
    const depts = S.coll('departments').filter((d) => isAdmin() || d.name === me.dept);
    if (!depts.length) return '';
    const inRange = S.coll('requests').filter((r) => r.createdAt >= from && r.createdAt <= to);
    const rows = depts.map((d) => {
      const inc = inRange.filter((r) => r.toDept === d.name), out = inRange.filter((r) => r.fromDept === d.name);
      const done = inc.filter((r) => r.status === 'done' && r.completedAt);
      const avg = done.length ? done.reduce((s, r) => s + (U.parseDate(r.completedAt) - U.parseDate(r.createdAt)) / 864e5, 0) / done.length : null;
      const late = inc.filter(rqLate).length, open = inc.filter(rqOpen).length;
      return '<tr><td><div style="display:flex;gap:10px;align-items:center"><span class="tag">' + h(d.code) + '</span><span class="cell-main">' + h(d.name) + '</span></div></td><td class="num">' + inc.length + '</td><td class="num">' + out.length + '</td><td class="num">' + open + '</td><td class="num">' + done.length + '</td>' +
        '<td>' + (late ? '<span class="pill bad">' + late + ' متأخر</span>' : '<span class="muted small">لا يوجد</span>') + '</td><td class="num">' + (avg === null ? '—' : Number.isInteger(Math.round(avg * 10) / 10) ? daysTxt(Math.round(avg)) : (Math.round(avg * 10) / 10) + ' يوم') + '</td></tr>';
    }).join('');
    const types = Object.keys(RQ_TYPE).map((k) => ({ label: RQ_TYPE[k][0], value: inRange.filter((r) => r.type === k && (isAdmin() || r.toDept === me.dept || r.fromDept === me.dept)).length }));
    const maxT = Math.max(1, ...types.map((x) => x.value));
    return '<div class="grid grid-2">' +
      card('الطلبات بين الأقسام', 'وارد وصادر كل قسم في الفترة · مدة الإنجاز من الإرسال حتى الإكمال', '<div class="table-wrap"><table class="table"><thead><tr><th>القسم</th><th>وارد</th><th>صادر</th><th>مفتوح</th><th>مكتمل</th><th>متأخر</th><th>متوسط الإنجاز</th></tr></thead><tbody>' + rows + '</tbody></table></div>', '<a class="btn btn-sm" href="#requests">فتح الطلبات</a>', true) +
      card('الطلبات حسب النوع', inRange.length + ' طلبًا في الفترة', '<div class="bars">' + types.map((x) => '<div class="meter-row" style="grid-template-columns:110px minmax(0,1fr) 36px"><span class="name">' + h(x.label) + '</span><div class="meter"><span style="width:' + Math.round(x.value / maxT * 100) + '%"></span></div><span class="pct">' + x.value + '</span></div>').join('') + '</div>') +
      '</div>';
  }

  /* ===== الأقسام ===== */
  function departmentsCard() {
    const ds = S.coll('departments');
    return card('الأقسام', ds.length + ' أقسام · رئيس القسم يبت في الطلبات الواردة لقسمه', '<div class="table-wrap"><table class="table stack"><thead><tr><th>القسم</th><th>رئيس القسم</th><th class="hide-sm">التحويلة</th><th class="hide-sm">المبنى</th><th>المعامل</th><th>المستخدمون</th><th></th></tr></thead><tbody>' +
      ds.map((d) => {
        const nl = S.coll('labs').filter((l) => l.dept === d.name).length, nu = S.coll('users').filter((u) => u.dept === d.name).length;
        return '<tr><td><div style="display:flex;gap:10px;align-items:center"><div class="dcode" style="width:38px;height:38px;font-size:11px">' + h(d.code) + '</div><span class="cell-main">' + h(d.name) + '</span></div></td><td>' + h(userName(d.managerId)) + '</td><td class="hide-sm"><span class="mono">' + h(d.ext || '—') + '</span></td><td class="hide-sm">' + h(d.building || '—') + '</td><td class="num">' + nl + '</td><td class="num">' + nu + '</td>' +
          '<td><div class="row-actions"><button class="icon-btn" data-act="editDept" data-id="' + d.id + '" title="تعديل" aria-label="تعديل">' + icon('edit') + '</button>' + (!nl && !nu ? '<button class="icon-btn" data-act="deleteDept" data-id="' + d.id + '" title="حذف" aria-label="حذف">' + icon('trash') + '</button>' : '') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>', '<button class="btn btn-sm" data-act="newDept">' + icon('plus') + 'إضافة قسم</button>', true);
  }
  function deptModal(existing) {
    const mgrs = S.coll('users').filter((u) => u.active && u.role !== 'student').map((u) => ({ value: u.id, label: u.name + ' · ' + (u.dept || '') }));
    const fields = [
      { name: 'name', label: 'اسم القسم', required: true, span: true, placeholder: 'مثال: الرياضيات' },
      { name: 'code', label: 'الرمز', required: true, ltr: true, placeholder: 'MATH', hint: 'حروف إنجليزية من 2 إلى 5' },
      { name: 'ext', label: 'رقم التحويلة', ltr: true, placeholder: '2500' },
      { name: 'managerId', label: 'رئيس القسم', type: 'select', options: mgrs, placeholder: 'بدون', span: true },
      { name: 'building', label: 'المبنى', span: true, placeholder: 'مبنى 5' }
    ];
    U.modal({
      title: existing ? 'تعديل القسم' : 'إضافة قسم', body: U.formGrid(fields, existing || {}), submitText: existing ? 'حفظ التعديلات' : 'إضافة القسم',
      onSubmit(form) {
        const d = U.formData(form);
        if (!d.name) return 'اسم القسم مطلوب.';
        d.code = (d.code || '').toUpperCase();
        if (!/^[A-Z]{2,5}$/.test(d.code)) return 'الرمز من 2 إلى 5 حروف إنجليزية.';
        if (S.coll('departments').some((x) => (x.code === d.code || x.name === d.name) && (!existing || x.id !== existing.id))) return 'يوجد قسم آخر بنفس الاسم أو الرمز.';
        if (existing && existing.name !== d.name) {
          // تحديث كل ما يشير إلى اسم القسم القديم
          const oldN = existing.name;
          S.coll('users').forEach((u) => { if (u.dept === oldN) u.dept = d.name; });
          S.coll('labs').forEach((l) => { if (l.dept === oldN) l.dept = d.name; });
          S.coll('requests').forEach((r) => { if (r.fromDept === oldN) r.fromDept = d.name; if (r.toDept === oldN) r.toDept = d.name; });
          if (me.dept === oldN) me.dept = d.name;
        }
        if (existing) d.id = existing.id;
        S.upsert('departments', d, 'D');
        S.log(me.id, (existing ? 'عدّل بيانات قسم ' : 'أضاف قسم ') + d.name);
        U.toast(existing ? 'تم حفظ التعديلات' : 'تمت إضافة القسم');
        setTimeout(render);
      }
    });
  }

  /* ===== المستخدمون ===== */
  function viewUsers() {
    const f = st.users;
    const all = S.coll('users');
    const html =
      '<div class="page-head"><div class="t"><h2>المستخدمون والصلاحيات</h2><p>' + all.length + ' مستخدمًا · ' + all.filter((u) => u.active).length + ' نشط</p></div><div class="actions"><button class="btn btn-primary" data-act="newUser">' + icon('plus') + 'إضافة مستخدم</button></div></div>' +
      '<section class="card"><div class="toolbar"><div class="search">' + icon('search') + '<input class="input" id="us-q" type="search" placeholder="ابحث بالاسم أو اسم المستخدم أو القسم" value="' + h(f.q) + '"></div>' +
      '<select class="select" id="us-role" aria-label="الدور"><option value="">كل الأدوار</option>' + optsOf(ROLE).map((o) => '<option value="' + o.value + '"' + (f.role === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select></div>' +
      '<div id="us-list"></div></section>' +
      departmentsCard() +
      card('مصفوفة الصلاحيات', 'ستة أدوار كما في مشروع التخرج، والزائر يبلّغ ويتتبع بدون حساب', '<div class="table-wrap"><table class="table"><thead><tr><th>الصلاحية</th><th>مدير النظام</th><th>مشرف معمل</th><th>الدعم الفني</th><th>لجنة المعامل</th><th>هيئة التدريس</th><th>طالب</th><th>زائر</th></tr></thead><tbody>' +
        [['عرض المعامل والمحطات والجدول', 1, 1, 1, 1, 1, 1, 0], ['الإبلاغ عن عطل', 1, 1, 1, 1, 1, 1, 1], ['تتبع البلاغ', 1, 1, 1, 1, 1, 1, 1], ['حجز معمل', 1, 1, 1, 1, 1, 1, 0], ['الموافقة على الحجوزات', 1, 'معامله', 0, 0, 0, 0, 0],
          ['إدارة الأجهزة والمحطات', 1, 'معامله', 0, 0, 0, 0, 0], ['معالجة البلاغات (المستوى 1)', 1, 'معامله', 0, 0, 0, 0, 0], ['معالجة البلاغات المحوّلة (المستوى 2)', 1, 0, 1, 0, 0, 0, 0],
          ['قرار الشراء والاستبدال (المستوى 3)', 1, 0, 0, 1, 0, 0, 0], ['الملاحظات الداخلية على البلاغ', 1, 1, 1, 1, 0, 0, 0], ['التقارير', 1, 'معامله', 0, 1, 0, 0, 0],
          ['الطلبات بين الأقسام', 1, 'قسمه', 1, 1, 'رئيس القسم', 0, 0], ['الحرم والمعامل والبيانات المرجعية', 1, 0, 0, 0, 0, 0, 0], ['إدارة المستخدمين', 1, 0, 0, 0, 0, 0, 0]]
          .map((r) => '<tr><td>' + r[0] + '</td>' + r.slice(1).map((c) => '<td>' + (c === 1 ? '<span style="color:var(--ok)">' + icon('check').replace('<svg', '<svg width="18" height="18"') + '</span>' : c === 0 ? '<span class="muted">—</span>' : '<span class="small muted">' + c + (c === 'رئيس القسم' ? '' : ' فقط') + '</span>') + '</td>').join('') + '</tr>').join('') +
        '</tbody></table></div>', '', true);
    return {
      title: 'المستخدمون', crumb: 'الإدارة', html,
      mount(root) {
        const list = root.querySelector('#us-list');
        const draw = () => {
          const q = f.q.toLowerCase();
          const items = S.coll('users').filter((u) => (!f.role || u.role === f.role) && (!q || (u.name + ' ' + u.username + ' ' + u.dept + ' ' + u.email).toLowerCase().includes(q)));
          list.innerHTML = items.length ? '<div class="table-wrap"><table class="table stack"><thead><tr><th>المستخدم</th><th>اسم الدخول</th><th>الدور</th><th class="hide-sm">القسم</th><th class="hide-sm">التواصل</th><th>الحالة</th><th></th></tr></thead><tbody>' +
            items.map((u) => '<tr><td><div style="display:flex;gap:10px;align-items:center"><div class="avatar">' + h(U.initials(u.name)) + '</div><div class="cell-main">' + h(u.name) + (u.id === me.id ? ' <span class="muted small">(أنت)</span>' : '') + '</div></div></td>' +
              '<td><span class="mono">' + h(u.username) + '</span></td><td>' + pill(ROLE, u.role) + '</td><td class="hide-sm">' + h(u.dept) + '</td>' +
              '<td class="hide-sm small"><div class="ltr" style="text-align:right">' + h(u.email) + '</div><div class="muted ltr" style="text-align:right">' + h(u.phone || '') + '</div></td>' +
              '<td>' + (u.active ? '<span class="pill ok">نشط</span>' : '<span class="pill">موقوف</span>') + '</td>' +
              '<td><div class="row-actions"><button class="icon-btn" data-act="editUser" data-id="' + u.id + '" title="تعديل" aria-label="تعديل">' + icon('edit') + '</button>' +
              (u.id !== me.id ? '<button class="icon-btn" data-act="deleteUser" data-id="' + u.id + '" title="حذف" aria-label="حذف">' + icon('trash') + '</button>' : '') + '</div></td></tr>').join('') +
            '</tbody></table></div>' : emptyState('users', 'لا يوجد مستخدمون مطابقون');
        };
        bindFilters(root, { '#us-q': ['q', f], '#us-role': ['role', f] }, draw);
        draw();
      }
    };
  }

  function userModal(existing) {
    const v = existing ? Object.assign({}, existing, { password: '', active: existing.active ? '1' : '0' }) : { role: 'student', active: '1' };
    const self = existing && existing.id === me.id;
    const fields = [
      { name: 'name', label: 'الاسم الكامل', required: true, span: true, placeholder: 'مثال: د. سلمان العنزي' },
      { name: 'username', label: 'اسم الدخول', required: true, ltr: true, placeholder: 'salman' },
      { name: 'password', label: existing ? 'كلمة مرور جديدة' : 'كلمة المرور', type: 'password', required: !existing, ltr: true, autocomplete: 'new-password', hint: existing ? 'اتركها فارغة للإبقاء على الحالية' : '6 أحرف على الأقل' },
      { name: 'role', label: 'الدور', type: 'select', options: optsOf(ROLE), required: true },
      { name: 'active', label: 'حالة الحساب', type: 'select', options: [{ value: '1', label: 'نشط' }, { value: '0', label: 'موقوف' }] },
      { name: 'dept', label: 'القسم', type: 'select', placeholder: 'اختر القسم', options: S.coll('departments').map((d) => ({ value: d.name, label: d.name })) },
      { name: 'phone', label: 'الجوال', ltr: true, placeholder: '05XXXXXXXX' },
      { name: 'email', label: 'البريد الإلكتروني', type: 'email', ltr: true, span: true }
    ];
    U.modal({
      title: existing ? 'تعديل المستخدم' : 'إضافة مستخدم', body: U.formGrid(fields, v), submitText: existing ? 'حفظ التعديلات' : 'إضافة المستخدم',
      onSubmit(form) {
        const d = U.formData(form);
        if (!d.name || !d.username) return 'الاسم واسم الدخول مطلوبان.';
        d.username = d.username.toLowerCase();
        if (!/^[a-z0-9._-]{3,30}$/.test(d.username)) return 'اسم الدخول: حروف إنجليزية صغيرة وأرقام فقط (3 أحرف على الأقل).';
        if (S.coll('users').some((u) => u.username === d.username && (!existing || u.id !== existing.id))) return 'اسم الدخول «' + d.username + '» مستخدم مسبقًا.';
        if (!existing && !d.password) return 'كلمة المرور مطلوبة.';
        if (d.password && d.password.length < 6) return 'كلمة المرور يجب ألا تقل عن 6 أحرف.';
        if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return 'صيغة البريد الإلكتروني غير صحيحة.';
        if (d.phone && !/^05\d{8}$/.test(d.phone)) return 'رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.';
        if (self && (d.role !== 'admin' || d.active !== '1')) return 'لا يمكنك إزالة صلاحية المدير أو إيقاف حسابك بنفسك.';
        d.active = d.active === '1';
        if (!d.password) delete d.password;
        if (existing) d.id = existing.id;
        S.upsert('users', d, 'u');
        S.log(me.id, (existing ? 'عدّل حساب ' : 'أضاف المستخدم ') + d.name);
        U.toast(existing ? 'تم حفظ التعديلات' : 'تمت إضافة المستخدم');
        setTimeout(render);
      }
    });
  }

  /* ===== الإعدادات ===== */
  function viewSettings() {
    const theme = S.prefs.get('theme', 'system');
    const d = S.data;
    const html =
      '<div class="page-head"><div class="t"><h2>الإعدادات</h2><p>الملف الشخصي والمظهر وإدارة البيانات</p></div></div>' +
      '<div class="grid grid-2e">' +
      '<section class="card"><div class="card-head"><h2>الملف الشخصي</h2></div><form class="card-body" id="profile-form" novalidate style="display:flex;flex-direction:column;gap:14px">' +
      '<div style="display:flex;gap:12px;align-items:center"><div class="avatar" style="width:48px;height:48px;font-size:16px">' + h(U.initials(me.name)) + '</div><div><b>' + h(me.name) + '</b><div>' + pill(ROLE, me.role) + '</div></div></div>' +
      '<div class="form-error" hidden></div>' +
      U.formGrid([
        { name: 'name', label: 'الاسم', required: true, span: true },
        { name: 'email', label: 'البريد الإلكتروني', type: 'email', ltr: true },
        { name: 'phone', label: 'الجوال', ltr: true },
        { name: 'current', label: 'كلمة المرور الحالية', type: 'password', ltr: true, autocomplete: 'current-password' },
        { name: 'password', label: 'كلمة مرور جديدة', type: 'password', ltr: true, autocomplete: 'new-password', hint: 'اتركها فارغة إذا لا تريد تغييرها' }
      ], { name: me.name, email: me.email, phone: me.phone }) +
      '<div><button class="btn btn-primary" type="submit">حفظ</button></div></form></section>' +
      '<div style="display:flex;flex-direction:column;gap:20px;min-width:0">' +
      card('المظهر', 'يُحفظ على هذا الجهاز', '<div class="seg" id="theme-seg">' + [['system', 'حسب النظام'], ['light', 'فاتح'], ['dark', 'داكن']].map((x) => '<button data-th="' + x[0] + '" class="' + (theme === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>') +
      (isAdmin() ? card('البيانات', 'تُحفظ في متصفح هذا الجهاز', '<div style="display:flex;flex-direction:column;gap:14px">' +
        '<p class="small muted">' + d.labs.length + ' معامل · ' + d.devices.length + ' جهازًا · ' + d.bookings.length + ' حجزًا · ' + d.tickets.length + ' بلاغًا · ' + d.users.length + ' مستخدمًا</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="exportJSON">' + icon('download') + 'نسخة احتياطية</button>' +
        '<label class="btn" for="import-file" style="cursor:pointer">' + icon('upload') + 'استعادة من ملف</label><input type="file" id="import-file" accept="application/json,.json" hidden>' +
        '<button class="btn btn-danger" data-act="resetData">' + icon('refresh') + 'إعادة البيانات التجريبية</button></div></div>') : '') +
      card('عن النظام', '', '<dl class="dl"><dt>الإصدار</dt><dd>1.0</dd><dt>آخر تهيئة للبيانات</dt><dd>' + U.fmtDate(String(d.seededAt || '').slice(0, 10)) + '</dd><dt>التخزين</dt><dd>محلي على هذا المتصفح، بدون خادم</dd></dl>') +
      '</div></div>';
    return {
      title: 'الإعدادات', crumb: 'الإدارة', html,
      mount(root) {
        root.querySelector('#theme-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-th]'); if (b) { S.prefs.set('theme', b.dataset.th); render(); } });
        const form = root.querySelector('#profile-form');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const v = U.formData(form);
          const errEl = form.querySelector('.form-error');
          const fail = (m) => { errEl.innerHTML = icon('alert') + '<span>' + h(m) + '</span>'; errEl.hidden = false; };
          if (!v.name) return fail('الاسم مطلوب.');
          if (v.password) {
            if (v.current !== me.password) return fail('كلمة المرور الحالية غير صحيحة.');
            if (v.password.length < 6) return fail('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.');
          }
          const upd = { id: me.id, name: v.name, email: v.email, phone: v.phone };
          if (v.password) upd.password = v.password;
          S.upsert('users', upd);
          U.toast(v.password ? 'تم حفظ الملف وتغيير كلمة المرور' : 'تم حفظ الملف الشخصي');
          render();
        });
        const file = root.querySelector('#import-file');
        if (file) file.addEventListener('change', () => {
          const fl = file.files[0];
          if (!fl) return;
          const reader = new FileReader();
          reader.onload = () => {
            try { S.importJSON(String(reader.result)); U.toast('تمت استعادة البيانات'); if (!user(me.id)) S.session.clear(); render(); }
            catch (err) { U.toast('تعذرت الاستعادة: ' + err.message, 'bad'); }
          };
          reader.readAsText(fl);
        });
      }
    };
  }

  /* ===== الطلبات بين الأقسام ===== */
  const RQ_TYPE = {
    loan: ['إعارة جهاز', 'cpu', 'استعارة جهاز من معامل قسم آخر لفترة محددة'],
    lab: ['استخدام معمل', 'flask', 'حجز معمل يتبع قسمًا آخر'],
    supplies: ['مواد ومستلزمات', 'box', 'مواد أو قطع من مخزون قسم آخر'],
    support: ['دعم فني', 'wrench', 'تثبيت برامج أو شبكات أو صيانة'],
    transfer: ['نقل عهدة', 'swap', 'نقل جهاز من معامل قسمك إلى قسم آخر'],
    other: ['طلب عام', 'doc', 'أي طلب آخر بين الأقسام']
  };
  const RQ_STATUS = { new: ['جديد', 'info'], review: ['قيد المراجعة', 'info'], info: ['بحاجة لاستكمال', 'warn'], approved: ['معتمد', 'accent'], progress: ['قيد التنفيذ', 'accent'], done: ['مكتمل', 'ok'], rejected: ['مرفوض', 'bad'], cancelled: ['ملغى', ''] };
  const RQ_FLOW = {
    review: { to: 'review', verb: 'استلم الطلب للمراجعة', toast: 'تم استلام الطلب للمراجعة' },
    approve: { to: 'approved', verb: 'اعتمد الطلب', toast: 'تم اعتماد الطلب' },
    info: { to: 'info', verb: 'طلب استكمال معلومات', toast: 'أُعيد الطلب إلى القسم المرسل لاستكماله', note: 'required', title: 'طلب استكمال معلومات', label: 'ما المعلومات المطلوبة من القسم المرسل؟', btn: 'إرسال' },
    reject: { to: 'rejected', verb: 'رفض الطلب', toast: 'تم رفض الطلب', note: 'required', title: 'رفض الطلب', label: 'سبب الرفض (يظهر للقسم المرسل)', btn: 'رفض الطلب', danger: true },
    progress: { to: 'progress', verb: 'بدأ التنفيذ', toast: 'بدأ تنفيذ الطلب' },
    done: { to: 'done', verb: 'أكمل الطلب', toast: 'تم إكمال الطلب', note: 'optional', title: 'إكمال الطلب', label: 'ملاحظة الإكمال', btn: 'تأكيد الإكمال' },
    resubmit: { to: 'review', verb: 'أرسل المعلومات المطلوبة', toast: 'أُرسل الاستكمال إلى القسم المستلم', note: 'required', title: 'إرسال الاستكمال', label: 'المعلومات المطلوبة', btn: 'إرسال' },
    cancel: { to: 'cancelled', verb: 'ألغى الطلب', toast: 'تم إلغاء الطلب', note: 'optional', title: 'إلغاء الطلب', label: 'سبب الإلغاء', btn: 'إلغاء الطلب', danger: true }
  };
  const rqOpen = (r) => !['done', 'rejected', 'cancelled'].includes(r.status);
  const deptOf = (name) => S.coll('departments').find((d) => d.name === name);
  const dCode = (name) => (deptOf(name) || {}).code || '—';
  const actsFor = (name) => isAdmin() || (me.dept === name && (me.role === 'supervisor' || (deptOf(name) || {}).managerId === me.id));
  const isReceiver = (r) => actsFor(r.toDept);
  const isSender = (r) => r.requesterId === me.id || actsFor(r.fromDept);
  const rqVisible = (r) => isAdmin() || me.dept === r.fromDept || me.dept === r.toDept || r.requesterId === me.id;
  const rqLate = (r) => rqOpen(r) && r.dueDate && r.dueDate < today();
  const rqNeedsMe = (r) => (isReceiver(r) && ['new', 'review', 'approved', 'progress'].includes(r.status) && (!isAdmin() || r.toDept === me.dept || r.status === 'new')) || (r.status === 'info' && isSender(r));
  const rqInboxCount = () => me.role === 'student' ? 0 : S.coll('requests').filter((r) => (r.status === 'new' && isReceiver(r)) || (r.status === 'info' && r.requesterId === me.id)).length;
  const fmtStamp = (s) => { const d = new Date(s); return d.getDate() + ' ' + U.MONTHS[d.getMonth()]; };
  const shortRef = (r) => '#' + String(r.ref).split('-').pop();
  const routeMini = (r) => '<span class="route" title="من ' + h(r.fromDept) + ' إلى ' + h(r.toDept) + '"><b>' + h(dCode(r.fromDept)) + '</b>' + icon('arrowL') + '<b>' + h(dCode(r.toDept)) + '</b></span>';
  const priMini = (p) => '<span class="pri ' + p + '">' + icon('flag') + h(TK_PRI[p][0]) + '</span>';
  function dueTxt(r) {
    if (!r.dueDate) return '';
    const days = Math.round((U.parseDate(r.dueDate) - U.parseDate(today())) / 864e5);
    if (!rqOpen(r)) return '<span class="due">' + icon('flag') + U.fmtDate(r.dueDate).replace(/ \d{4}$/, '') + '</span>';
    if (days < 0) return '<span class="due late">' + icon('clock') + 'متأخر ' + daysTxt(-days) + '</span>';
    if (days === 0) return '<span class="due soon">' + icon('clock') + 'مستحق اليوم</span>';
    return '<span class="due' + (days <= 2 ? ' soon' : '') + '">' + icon('clock') + 'خلال ' + daysTxt(days) + '</span>';
  }

  function rqItem(r, sel) {
    const t = RQ_TYPE[r.type] || RQ_TYPE.other;
    const unread = r.status === 'new' && isReceiver(r);
    return '<a class="rq-item' + (sel ? ' sel' : '') + (unread ? ' unread' : '') + '" href="#req-' + r.id + '"' + (sel ? ' aria-current="true"' : '') + '>' +
      '<div class="rq-ico" title="' + h(t[0]) + '">' + icon(t[1]) + '</div>' +
      '<div style="min-width:0"><div class="t">' + h(r.title) + '</div><div class="sub"><span class="tag">' + h(shortRef(r)) + '</span>' + routeMini(r) + priMini(r.priority) + '</div></div>' +
      '<div class="rq-side">' + pill(RQ_STATUS, r.status) + dueTxt(r) + '</div></a>';
  }

  function viewRequests(selId) {
    const f = st.req;
    const vis = () => S.coll('requests').filter(rqVisible);
    const boxes = [
      ['in', 'الوارد لقسمي', (r) => r.toDept === me.dept],
      ['out', 'الصادر من قسمي', (r) => r.fromDept === me.dept || r.requesterId === me.id],
      ...(isAdmin() ? [['all', 'كل الطلبات', () => true]] : [])
    ];
    if (!boxes.some((b) => b[0] === f.box)) f.box = isAdmin() ? 'all' : 'in';
    const groups = [
      ['all', 'الكل', () => true],
      ['action', 'بانتظار إجرائي', rqNeedsMe],
      ['open', 'مفتوحة', rqOpen],
      ['late', 'متأخرة', rqLate],
      ['done', 'مكتملة', (r) => r.status === 'done'],
      ['closed', 'مرفوضة وملغاة', (r) => r.status === 'rejected' || r.status === 'cancelled']
    ];
    const sortFn = (a, b) => rqOpen(b) - rqOpen(a) || rqNeedsMe(b) - rqNeedsMe(a) || PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || b.createdAt.localeCompare(a.createdAt) || b.ref.localeCompare(a.ref);
    const filtered = () => {
      const q = f.q.toLowerCase();
      const bx = boxes.find((b) => b[0] === f.box)[2];
      const g = (groups.find((x) => x[0] === f.group) || groups[0])[2];
      return vis().filter(bx).filter(g)
        .filter((r) => !f.type || r.type === f.type)
        .filter((r) => !f.dept || r.fromDept === f.dept || r.toDept === f.dept)
        .filter((r) => !q || (r.ref + ' ' + r.title + ' ' + r.fromDept + ' ' + r.toDept + ' ' + userName(r.requesterId)).toLowerCase().includes(q))
        .sort(sortFn);
    };
    const wide = window.matchMedia && window.matchMedia('(min-width: 1101px)').matches;
    let sel = selId ? S.byId('requests', selId) : null;
    if (sel && !rqVisible(sel)) sel = null;
    if (!selId && wide) sel = filtered()[0] || null;
    const all = vis();
    const monthStart = today().slice(0, 8) + '01';

    const html =
      '<div class="page-head"><div class="t"><h2>الطلبات بين الأقسام</h2><p>' + (me.dept ? 'قسمك: ' + h(me.dept) + (actsFor(me.dept) && !isAdmin() ? ' · لديك صلاحية البت في الطلبات الواردة' : '') : '') + (isAdmin() ? ' · مدير النظام يرى طلبات كل الأقسام' : '') + '</p></div>' +
      '<div class="actions"><button class="btn btn-primary" data-act="newRequest">' + icon('plus') + 'طلب جديد</button></div></div>' +
      '<div class="grid grid-kpi rq-kpis' + (sel ? ' has-sel' : '') + '">' +
      kpi('وارد جديد', all.filter((r) => r.toDept === me.dept && r.status === 'new').length, 'inbox', 'info', 'طلبات لم تُستلم بعد') +
      kpi('بانتظار إجرائي', all.filter(rqNeedsMe).length, 'flag', 'warn', 'مراجعة أو تنفيذ أو استكمال') +
      kpi('متأخرة', all.filter(rqLate).length, 'clock', 'bad', 'تجاوزت الموعد المطلوب') +
      kpi('مكتملة هذا الشهر', all.filter((r) => r.status === 'done' && (r.completedAt || '') >= monthStart).length, 'check', '', 'منذ ' + U.fmtDate(monthStart)) +
      '</div>' +
      '<div class="req-layout' + (sel ? ' has-sel' : '') + '">' +
      '<section class="card req-list-card" aria-label="قائمة الطلبات"><div class="tabs" role="tablist" id="rq-boxes"></div>' +
      '<div class="req-filters"><div class="search">' + icon('search') + '<input class="input" id="rq-q" type="search" placeholder="ابحث برقم الطلب أو العنوان أو القسم" value="' + h(f.q) + '"></div>' +
      '<div class="row"><select class="select" id="rq-type" aria-label="نوع الطلب"><option value="">كل الأنواع</option>' + Object.keys(RQ_TYPE).map((k) => '<option value="' + k + '"' + (f.type === k ? ' selected' : '') + '>' + RQ_TYPE[k][0] + '</option>').join('') + '</select>' +
      '<select class="select" id="rq-dept" aria-label="القسم"><option value="">كل الأقسام</option>' + S.coll('departments').map((d) => '<option value="' + h(d.name) + '"' + (f.dept === d.name ? ' selected' : '') + '>' + h(d.name) + '</option>').join('') + '</select></div>' +
      '<div class="chips" id="rq-groups"></div></div>' +
      '<div class="rq-list" id="rq-list"></div></section>' +
      '<section class="card req-detail" aria-label="تفاصيل الطلب">' + (sel ? rqDetail(sel) : selId ? emptyState('doc', 'الطلب غير موجود أو ليس لديك صلاحية عرضه') : emptyState('swap', 'اختر طلبًا من القائمة لعرض تفاصيله')) + '</section>' +
      '</div>';

    return {
      title: 'الطلبات بين الأقسام', crumb: 'التشغيل', html,
      mount(root) {
        const list = root.querySelector('#rq-list'), boxesEl = root.querySelector('#rq-boxes'), groupsEl = root.querySelector('#rq-groups');
        const draw = () => {
          const v = vis();
          boxesEl.innerHTML = boxes.map((b) => '<button role="tab" data-b="' + b[0] + '" class="' + (f.box === b[0] ? 'on' : '') + '">' + b[1] + '<span class="count">' + v.filter(b[2]).length + '</span></button>').join('');
          const inBox = v.filter(boxes.find((b) => b[0] === f.box)[2]);
          groupsEl.innerHTML = groups.map((g) => { const n = inBox.filter(g[2]).length; return '<button type="button" class="chip' + (f.group === g[0] ? ' on' : '') + ((g[0] === 'late' || g[0] === 'action') && n ? ' alert-chip' : '') + '" data-g="' + g[0] + '">' + g[1] + '<span class="n">' + n + '</span></button>'; }).join('');
          const items = filtered();
          list.innerHTML = items.length ? items.map((r) => rqItem(r, sel && sel.id === r.id)).join('') : emptyState('inbox', 'لا توجد طلبات مطابقة');
        };
        boxesEl.addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (b) { f.box = b.dataset.b; f.scroll = 0; draw(); list.scrollTop = 0; } });
        groupsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) { f.group = b.dataset.g; f.scroll = 0; draw(); list.scrollTop = 0; } });
        bindFilters(root, { '#rq-q': ['q', f], '#rq-type': ['type', f], '#rq-dept': ['dept', f] }, draw);
        draw();
        list.scrollTop = f.scroll || 0;
        list.addEventListener('scroll', () => { f.scroll = list.scrollTop; });
        const form = root.querySelector('#rq-comment');
        if (form) form.addEventListener('submit', (e) => {
          e.preventDefault();
          const text = (form.querySelector('textarea').value || '').trim();
          if (!text) return;
          const r = S.byId('requests', form.dataset.id);
          S.upsert('requests', Object.assign({}, r, { log: r.log.concat([{ at: new Date().toISOString(), userId: me.id, kind: 'comment', text }]) }));
          U.toast('تم إرسال الرد');
          render();
        });
      }
    };
  }

  function rqDetail(r) {
    const t = RQ_TYPE[r.type] || RQ_TYPE.other;
    const fromD = deptOf(r.fromDept) || {}, toD = deptOf(r.toDept) || {};
    const requester = user(r.requesterId) || {}, assignee = user(r.assigneeId);
    const toMgr = user(toD.managerId);
    const created = r.log[0] ? r.log[0].at : r.createdAt;

    // مراحل الطلب
    const steps = ['الإرسال', 'المراجعة', 'الاعتماد', 'التنفيذ', 'الإكمال'];
    const CUR = { new: 1, review: 1, info: 1, approved: 3, progress: 3, done: 5 };
    const stamp = (statuses) => { const e = r.log.filter((x) => x.kind === 'status' && statuses.includes(x.status)).pop(); return e ? fmtStamp(e.at) : ''; };
    const stamps = [stamp(['new']), stamp(['review', 'info']), stamp(['approved']), stamp(['progress']), stamp(['done'])];
    let cur = CUR[r.status], stopAt = -1;
    if (r.status === 'rejected') stopAt = 2;
    if (r.status === 'cancelled') { const prev = r.log.filter((x) => x.kind === 'status' && x.status !== 'cancelled').pop(); stopAt = Math.min(CUR[prev ? prev.status : 'new'] || 1, 4); }
    const hint = { new: 'بانتظار الاستلام', review: 'جارية', info: 'بانتظار الاستكمال', approved: 'لم يبدأ', progress: 'جارٍ' }[r.status];
    const stepper = '<div class="stepper" aria-label="مراحل الطلب">' + steps.map((s, i) => {
      let cls = '', dot = String(i + 1), sub = '';
      if (stopAt >= 0) {
        if (i < stopAt) { cls = 'done'; dot = icon('check'); sub = stamps[i]; }
        else if (i === stopAt) { cls = 'stop'; dot = icon('x'); s = r.status === 'rejected' ? 'مرفوض' : 'ملغى'; sub = stamp([r.status]); }
      } else if (i < cur) { cls = 'done'; dot = icon('check'); sub = stamps[i]; }
      else if (i === cur) { cls = r.status === 'info' ? 'hold' : 'cur'; sub = hint; }
      return '<div class="step ' + cls + '"><div class="dot">' + dot + '</div><div>' + h(s) + (sub ? '<small>' + h(sub) + '</small>' : '') + '</div></div>';
    }).join('') + '</div>';

    // شريط الإجراءات حسب دور المستخدم
    const btn = (a, label, cls, ic) => '<button class="btn ' + (cls || '') + '" data-act="reqAct" data-id="' + r.id + '|' + a + '">' + (ic ? icon(ic) : '') + label + '</button>';
    let b = '', note;
    if (isReceiver(r)) {
      if (r.status === 'new') b += btn('review', 'استلام للمراجعة', 'btn-primary', 'eye');
      if (r.status === 'new' || r.status === 'review') b += btn('approve', 'اعتماد', 'btn-ok', 'check') + btn('info', 'طلب استكمال', '', 'edit') + btn('reject', 'رفض', 'btn-danger', 'x');
      if (r.status === 'approved') b += btn('progress', 'بدء التنفيذ', 'btn-primary', 'refresh');
      if (r.status === 'progress') b += btn('done', 'تم التنفيذ', 'btn-ok', 'check');
    }
    if (isSender(r) && r.status === 'info') b += btn('resubmit', 'إرسال الاستكمال', 'btn-primary', 'send');
    if (isSender(r) && ['new', 'review', 'info', 'approved'].includes(r.status)) b += btn('cancel', 'إلغاء الطلب', 'btn-ghost');
    if (!rqOpen(r)) note = 'الطلب مغلق · ' + RQ_STATUS[r.status][0];
    else if (r.status === 'info') note = isSender(r) ? 'القسم المستلم طلب معلومات إضافية منك' : 'بانتظار استكمال ' + r.fromDept;
    else if (isReceiver(r) && b) note = 'القرار عند قسم ' + r.toDept;
    else note = 'بانتظار إجراء قسم ' + r.toDept;
    if (canPrint) b += '<button class="btn btn-ghost" data-act="printReq" data-id="' + r.id + '" title="طباعة نموذج الطلب">' + icon('doc') + 'طباعة</button>';
    const actions = '<div class="rq-actions"><span class="note">' + icon('info') + h(note) + '</span>' + b + '</div>';

    // تنبيه أعلى التفاصيل
    const lastNote = (st0) => { const e = r.log.filter((x) => x.kind === 'status' && x.status === st0).pop(); return e && e.text ? e.text : ''; };
    let banner = '';
    if (r.status === 'info') banner = '<div class="alert rq-banner">' + icon('edit') + '<div class="grow"><b>مطلوب استكمال:</b> ' + h(lastNote('info')) + '</div></div>';
    else if (r.status === 'rejected') banner = '<div class="alert bad rq-banner">' + icon('x') + '<div class="grow"><b>سبب الرفض:</b> ' + h(lastNote('rejected') || '—') + '</div></div>';
    else if (rqLate(r)) banner = '<div class="alert bad rq-banner">' + icon('clock') + '<div class="grow"><b>تجاوز الطلب الموعد المطلوب</b> (' + U.fmtDate(r.dueDate) + ').</div></div>';
    if (r.bookingId && S.byId('bookings', r.bookingId)) banner += '<div class="alert info rq-banner">' + icon('calendar') + '<div class="grow">أُضيف حجز مؤكد إلى جدول ' + h(labName(r.labId)) + '.</div><a class="btn btn-sm" href="#schedule" data-act="schedLab" data-id="' + r.labId + '">عرض الجدول</a></div>';

    // معلومات حسب نوع الطلب
    const fact = (k, v) => '<div class="fact"><span>' + h(k) + '</span><b>' + v + '</b></div>';
    const d = dev(r.deviceId);
    const devTxt = d ? '<span class="tag">' + h(d.tag) + '</span> ' + h(d.name) : '—';
    let facts = fact('الأولوية', pill(TK_PRI, r.priority)) + fact('الموعد المطلوب', U.fmtDate(r.dueDate) + ' ' + (rqOpen(r) ? dueTxt(r) : '')) + fact('المسؤول في القسم المستلم', assignee ? h(assignee.name) : '<span class="muted">لم يُسند بعد</span>');
    if (r.type === 'loan') facts += fact('الجهاز المطلوب', devTxt) + fact('الكمية', (r.qty || 1) + ' ' + (r.qty > 2 ? 'أجهزة' : r.qty === 2 ? '(جهازان)' : '')) + fact('فترة الإعارة', U.fmtDate(r.loanFrom) + ' ← ' + U.fmtDate(r.loanTo));
    if (r.type === 'lab') facts += fact('المعمل', h(labName(r.labId))) + fact('الموعد', U.fmtDay(r.date) + ' · ' + U.fmtTime(r.start) + ' – ' + U.fmtTime(r.end)) + fact('عدد الحضور', r.attendees);
    if (r.type === 'transfer') facts += fact('الجهاز', devTxt) + fact('من معمل', h(d ? labName(d.labId) : '—')) + fact('إلى معمل', h(labName(r.targetLabId)));
    if (r.type === 'support' && d) facts += fact('الجهاز المعني', devTxt);

    const items = r.items && r.items.length ? '<div class="rq-section"><h3>' + icon('box').replace('<svg', '<svg width="16" height="16"') + 'البنود المطلوبة (' + r.items.length + ')</h3><div class="items-tbl table-wrap"><table class="table"><thead><tr><th>البند</th><th>الكمية</th><th>الوحدة</th></tr></thead><tbody>' +
      r.items.map((it) => '<tr><td>' + h(it.name) + '</td><td class="num">' + h(it.qty) + '</td><td>' + h(it.unit || '—') + '</td></tr>').join('') + '</tbody></table></div></div>' : '';

    const verbOf = (e) => e.action && RQ_FLOW[e.action] ? RQ_FLOW[e.action].verb : e.status === 'new' ? 'أرسل الطلب' : (Object.values(RQ_FLOW).find((x) => x.to === e.status) || {}).verb || '';
    const thread = '<div class="thread">' + r.log.map((e) => {
      const u = user(e.userId) || { name: '—' };
      if (e.kind === 'comment') return '<div class="ev"><div class="avatar">' + h(U.initials(u.name)) + '</div><div style="min-width:0"><div class="hd"><b>' + h(u.name) + '</b><time>' + U.timeAgo(e.at) + '</time></div><div class="bubble">' + h(e.text) + '</div></div></div>';
      return '<div class="ev sys"><div class="avatar">' + icon(e.status === 'rejected' || e.status === 'cancelled' ? 'x' : e.status === 'info' ? 'edit' : 'check').replace('<svg', '<svg width="15" height="15"') + '</div><div style="min-width:0"><div class="hd"><b>' + h(u.name) + '</b><span>' + h(verbOf(e)) + '</span>' + pill(RQ_STATUS, e.status) + '<time>' + U.timeAgo(e.at) + '</time></div>' + (e.text ? '<div class="bubble">' + h(e.text) + '</div>' : '') + '</div></div>';
    }).join('') + '</div>';

    return '<a class="btn btn-sm back-btn" href="#requests">' + icon('chevronR') + 'كل الطلبات</a>' +
      '<div class="rq-head"><div class="top"><span class="tag">' + h(r.ref) + '</span><span class="type-chip">' + icon(t[1]) + h(t[0]) + '</span>' + pill(RQ_STATUS, r.status) + '</div>' +
      '<h2>' + h(r.title) + '</h2><div class="meta">أنشأه ' + h(requester.name || '—') + ' · ' + U.timeAgo(created) + ' · ' + U.fmtDate(r.createdAt) + '</div></div>' +
      '<div class="route-band">' +
      '<div class="dept-box"><div class="dcode">' + h(dCode(r.fromDept)) + '</div><div><span class="lbl">من قسم</span><b>' + h(r.fromDept) + '</b><div class="who">' + h(requester.name || '') + (fromD.ext ? ' · تحويلة ' + h(fromD.ext) : '') + '</div></div></div>' +
      '<div class="route-arrow" aria-hidden="true">' + icon('arrowL') + '</div>' +
      '<div class="dept-box to"><div class="dcode">' + h(dCode(r.toDept)) + '</div><div><span class="lbl">إلى قسم</span><b>' + h(r.toDept) + '</b><div class="who">' + h(toMgr ? 'رئيس القسم: ' + toMgr.name : '') + (toD.ext ? ' · تحويلة ' + h(toD.ext) : '') + '</div></div></div>' +
      '</div>' +
      stepper + banner + (banner ? '<div style="height:16px"></div>' : '') + actions +
      '<div class="rq-section"><h3>تفاصيل الطلب</h3><div class="facts">' + facts + '</div></div>' +
      items +
      (r.description ? '<div class="rq-section"><h3>الوصف</h3><p class="rq-desc">' + h(r.description) + '</p></div>' : '') +
      '<div class="rq-section"><h3>سجل الطلب والمراسلات</h3>' + thread + '</div>' +
      '<form class="composer" id="rq-comment" data-id="' + r.id + '"><textarea class="textarea" name="text" id="rq-text" placeholder="اكتب ردًا أو استفسارًا للقسم ' + (isReceiver(r) && !isSender(r) ? 'المرسل' : 'المستلم') + '…" aria-label="الرد"></textarea><button class="btn btn-primary" type="submit">' + icon('send') + 'إرسال</button></form>';
  }

  function rqApply(r, action, text) {
    const fl = RQ_FLOW[action];
    const upd = Object.assign({}, r, { status: fl.to, log: r.log.concat([{ at: new Date().toISOString(), userId: me.id, kind: 'status', status: fl.to, action, text: text || '' }]) });
    if (isReceiver(r) && action !== 'cancel' && action !== 'resubmit' && !r.assigneeId) upd.assigneeId = me.id;
    if (action === 'done') upd.completedAt = today();
    let extra = '';
    if (action === 'approve' && r.type === 'lab' && r.labId) {
      const err = validateBooking({ labId: r.labId, title: r.title, date: r.date, start: r.start, end: r.end, attendees: r.attendees });
      if (err) return 'تعذّر إضافة الحجز إلى جدول المعمل: ' + err;
      const bk = S.upsert('bookings', { labId: r.labId, title: r.title + ' (' + dCode(r.fromDept) + ')', userId: r.requesterId, date: r.date, start: r.start, end: r.end, attendees: r.attendees, status: 'approved', notes: 'من الطلب ' + r.ref, createdAt: today() }, 'bk');
      upd.bookingId = bk.id;
      extra = ' وأُضيف الحجز إلى جدول المعمل';
    }
    if ((action === 'reject' || action === 'cancel') && r.bookingId) {
      const bk = S.byId('bookings', r.bookingId);
      if (bk && bk.status === 'approved') S.upsert('bookings', Object.assign({}, bk, { status: 'cancelled', reason: 'أُلغي الطلب ' + r.ref }));
    }
    if (action === 'done' && r.type === 'transfer' && r.deviceId && r.targetLabId) {
      const d = dev(r.deviceId);
      if (d) { moveDev(d.id, r.targetLabId, 'بموجب الطلب ' + r.ref); extra = ' ونُقل الجهاز ' + d.tag + ' إلى ' + labName(r.targetLabId); }
    }
    S.upsert('requests', upd);
    S.log(me.id, fl.verb + ' ' + r.ref + ' «' + r.title + '»');
    U.toast(fl.toast + extra);
    setTimeout(render);
    return '';
  }
  function rqAct(r, action) {
    const fl = RQ_FLOW[action];
    if (!fl) return;
    if (!fl.note) { const err = rqApply(r, action); if (err) U.toast(err, 'bad'); return; }
    U.modal({
      title: fl.title + ' · ' + r.ref, size: 'sm',
      body: '<p class="small">«' + h(r.title) + '»</p>' + U.field({ name: 'note', label: fl.label, type: 'textarea', required: fl.note === 'required', placeholder: fl.note === 'required' ? '' : 'اختياري' }),
      submitText: fl.btn, submitClass: fl.danger ? 'btn-danger' : 'btn-primary',
      onSubmit(form) {
        const text = U.formData(form).note;
        if (fl.note === 'required' && !text) return 'اكتب ' + fl.label.replace(/ \(.*\)$/, '') + '.';
        return rqApply(r, action, text);
      }
    });
  }

  function requestModal(preType) {
    if (!me.dept) { U.toast('حدد قسمك من الإعدادات أولًا', 'bad'); return; }
    const depts = S.coll('departments').filter((d) => d.name !== me.dept);
    const labsOf = (dn) => S.coll('labs').filter((l) => l.dept === dn);
    const tiles = Object.keys(RQ_TYPE).map((k) => '<div class="type-tile"><input type="radio" name="type" id="rt-' + k + '" value="' + k + '"' + (k === (preType || 'loan') ? ' checked' : '') + '><label for="rt-' + k + '">' + icon(RQ_TYPE[k][1]) + '<b>' + RQ_TYPE[k][0] + '</b><span>' + RQ_TYPE[k][2] + '</span></label></div>').join('');
    const itemRow = () => '<div class="item-row"><input class="input" data-k="name" placeholder="اسم البند" aria-label="اسم البند"><input class="input" data-k="qty" type="number" min="1" value="1" aria-label="الكمية"><input class="input unit" data-k="unit" placeholder="الوحدة" aria-label="الوحدة"><button type="button" class="icon-btn" data-rm aria-label="حذف البند">' + icon('trash') + '</button></div>';
    const body =
      '<div class="fieldset-title">نوع الطلب</div><div class="type-tiles">' + tiles + '</div>' +
      '<div class="fieldset-title">بيانات الطلب · يُرسل باسم قسم ' + h(me.dept) + '</div>' +
      U.formGrid([
        { name: 'toDept', label: 'إلى قسم', type: 'select', required: true, placeholder: 'اختر القسم المستلم', options: depts.map((d) => ({ value: d.name, label: d.name + ' (' + d.code + ')' })) },
        { name: 'priority', label: 'الأولوية', type: 'select', options: optsOf(TK_PRI), required: true },
        { name: 'title', label: 'عنوان الطلب', required: true, span: true, placeholder: 'مثال: إعارة راسمي إشارة لتجربة الدوائر' },
        { name: 'dueDate', label: 'مطلوب قبل', type: 'date', required: true, min: today() }
      ], { priority: 'medium', dueDate: iso(S.util.workday(new Date(), 5)) }) +
      '<div class="form-grid" data-for="loan transfer support"><div class="field span-2"><label for="f-deviceId">الجهاز</label><select class="select" id="f-deviceId" name="deviceId"></select><span class="hint" id="dev-hint"></span></div></div>' +
      '<div class="form-grid" data-for="loan">' + U.field({ name: 'qty', label: 'الكمية', type: 'number', min: 1 }, 1) + '<div></div>' + U.field({ name: 'loanFrom', label: 'من تاريخ', type: 'date', min: today() }) + U.field({ name: 'loanTo', label: 'إلى تاريخ', type: 'date', min: today() }) + '</div>' +
      '<div class="form-grid" data-for="lab"><div class="field span-2"><label for="f-labId">المعمل</label><select class="select" id="f-labId" name="labId"></select></div>' +
      U.field({ name: 'date', label: 'التاريخ', type: 'date', min: today() }, iso(S.util.workday(new Date(), 2))) + U.field({ name: 'attendees', label: 'عدد الحضور', type: 'number', min: 1 }) + U.field({ name: 'start', label: 'من', type: 'time', step: 300 }, '10:00') + U.field({ name: 'end', label: 'إلى', type: 'time', step: 300 }, '11:40') + '</div>' +
      '<div class="form-grid" data-for="transfer"><div class="field span-2"><label for="f-targetLabId">إلى معمل</label><select class="select" id="f-targetLabId" name="targetLabId"></select></div></div>' +
      '<div data-for="supplies" style="display:flex;flex-direction:column;gap:8px"><div class="fieldset-title">البنود المطلوبة</div><div class="item-rows" id="item-rows">' + itemRow() + '</div><div><button type="button" class="btn btn-sm" id="add-item">' + icon('plus') + 'إضافة بند</button></div></div>' +
      U.field({ name: 'description', label: 'الوصف والمبررات', type: 'textarea', placeholder: 'لماذا تحتاجون الطلب؟ وأي تفاصيل تساعد القسم المستلم على البت فيه.' });

    U.modal({
      title: 'طلب جديد إلى قسم آخر', body, submitText: 'إرسال الطلب',
      onOpen(form) {
        const typeOf = () => (form.querySelector('input[name=type]:checked') || {}).value || 'other';
        const toSel = form.querySelector('#f-toDept'), devSel = form.querySelector('#f-deviceId'), labSel = form.querySelector('#f-labId'), tgtSel = form.querySelector('#f-targetLabId'), devHint = form.querySelector('#dev-hint');
        const rows = form.querySelector('#item-rows');
        const opt = (v, l, sel) => '<option value="' + h(v) + '"' + (sel ? ' selected' : '') + '>' + h(l) + '</option>';
        const refill = () => {
          const type = typeOf(), to = toSel.value;
          form.querySelectorAll('[data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(type); });
          if (type === 'support' && !to && me.dept !== 'تقنية المعلومات') { toSel.value = 'تقنية المعلومات'; return refill(); }
          let devs = [], hint = '';
          if (type === 'loan') { devs = S.coll('devices').filter((d) => (lab(d.labId) || {}).dept === to && d.status === 'working'); hint = to ? 'الأجهزة العاملة في معامل قسم ' + to : 'اختر القسم أولًا'; }
          if (type === 'transfer') { devs = S.coll('devices').filter((d) => (lab(d.labId) || {}).dept === me.dept && d.status !== 'retired'); hint = 'أجهزة معامل قسمك'; }
          if (type === 'support') { devs = S.coll('devices').filter((d) => (lab(d.labId) || {}).dept === me.dept && d.status !== 'retired'); hint = 'اختياري: الجهاز المرتبط بالطلب في معامل قسمك'; }
          const cur = devSel.value;
          devSel.innerHTML = (type === 'support' ? opt('', 'بدون جهاز محدد') : opt('', devs.length ? 'اختر الجهاز' : 'لا توجد أجهزة متاحة')) + devs.map((d) => opt(d.id, d.tag + ' · ' + d.name + ' · ' + labName(d.labId), d.id === cur)).join('');
          devHint.textContent = hint;
          const ls = labsOf(to);
          const curL = labSel.value, curT = tgtSel.value;
          labSel.innerHTML = opt('', ls.length ? 'اختر المعمل' : 'لا توجد معامل لهذا القسم') + ls.filter((l) => l.status === 'active').map((l) => opt(l.id, l.name + ' · السعة ' + l.capacity, l.id === curL)).join('');
          tgtSel.innerHTML = opt('', ls.length ? 'اختر المعمل' : 'لا توجد معامل لهذا القسم') + ls.map((l) => opt(l.id, l.name, l.id === curT)).join('');
        };
        form.addEventListener('change', (e) => { if (e.target.name === 'type' || e.target === toSel) refill(); });
        form.querySelector('#add-item').addEventListener('click', () => { rows.insertAdjacentHTML('beforeend', itemRow()); rows.lastElementChild.querySelector('input').focus(); });
        rows.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b && rows.children.length > 1) b.closest('.item-row').remove(); });
        refill();
      },
      onSubmit(form) {
        const d = U.formData(form);
        const type = d.type;
        if (!d.toDept) return 'اختر القسم المستلم.';
        if (!d.title || d.title.length < 5) return 'اكتب عنوانًا واضحًا للطلب.';
        if (!d.dueDate || d.dueDate < today()) return 'حدد تاريخًا مطلوبًا من اليوم فصاعدًا.';
        const req = { type, title: d.title, fromDept: me.dept, toDept: d.toDept, requesterId: me.id, assigneeId: '', priority: d.priority, status: 'new', dueDate: d.dueDate, createdAt: today(), description: d.description || '', items: [] };
        if (type === 'loan') {
          if (!d.deviceId) return 'اختر الجهاز المطلوب إعارته.';
          const qty = parseInt(d.qty, 10);
          if (!(qty >= 1)) return 'الكمية يجب أن تكون 1 على الأقل.';
          if (!d.loanFrom || !d.loanTo) return 'حدد فترة الإعارة.';
          if (d.loanTo < d.loanFrom) return 'تاريخ الإرجاع يجب أن يكون بعد تاريخ الاستلام.';
          Object.assign(req, { deviceId: d.deviceId, qty, loanFrom: d.loanFrom, loanTo: d.loanTo });
        }
        if (type === 'lab') {
          const b = { labId: d.labId, title: d.title, date: d.date, start: d.start, end: d.end, attendees: parseInt(d.attendees, 10) };
          if (!b.labId) return 'اختر المعمل المطلوب.';
          const err = validateBooking(b);
          if (err) return err;
          Object.assign(req, { labId: b.labId, date: b.date, start: b.start, end: b.end, attendees: b.attendees });
        }
        if (type === 'transfer') {
          if (!d.deviceId) return 'اختر الجهاز المراد نقله.';
          if (!d.targetLabId) return 'اختر المعمل الذي سينقل إليه الجهاز.';
          Object.assign(req, { deviceId: d.deviceId, targetLabId: d.targetLabId });
        }
        if (type === 'support' && d.deviceId) req.deviceId = d.deviceId;
        if (type === 'supplies') {
          req.items = [...form.querySelectorAll('.item-row')].map((row) => ({ name: row.querySelector('[data-k=name]').value.trim(), qty: parseInt(row.querySelector('[data-k=qty]').value, 10), unit: row.querySelector('[data-k=unit]').value.trim() })).filter((it) => it.name);
          if (!req.items.length) return 'أضف بندًا واحدًا على الأقل.';
          if (req.items.some((it) => !(it.qty >= 1))) return 'كمية كل بند يجب أن تكون 1 على الأقل.';
        }
        req.ref = S.nextRequestRef();
        req.log = [{ at: new Date().toISOString(), userId: me.id, kind: 'status', status: 'new', text: '' }];
        const saved = S.upsert('requests', req, 'rq');
        S.log(me.id, 'أرسل الطلب ' + saved.ref + ' إلى قسم ' + saved.toDept);
        U.toast('تم إرسال الطلب ' + saved.ref + ' إلى قسم ' + saved.toDept);
        st.req.box = 'out'; st.req.group = 'all';
        setTimeout(() => go('req-' + saved.id));
      }
    });
  }

  /* ===== البحث السريع ===== */
  function paletteResults(q) {
    q = q.trim().toLowerCase();
    const groups = [];
    const has = (...xs) => xs.join(' ').toLowerCase().includes(q);
    const pages = NAV.flatMap((g) => g.items).filter(allowed).filter((i) => !q || has(i.label)).map((i) => ({ icon: i.icon, title: i.label, sub: 'صفحة', go: i.id }));
    if (pages.length) groups.push(['الصفحات', pages.slice(0, q ? 4 : 10)]);
    if (!q) return groups;
    const labsR = S.coll('labs').filter((l) => has(l.name, l.code, l.building, l.room)).map((l) => ({ icon: 'flask', title: l.name, sub: l.code + ' · ' + l.building + ' · ' + LAB_STATUS[l.status][0], go: 'lab-' + l.id }));
    const devR = S.coll('devices').filter((d) => has(d.tag, d.name, d.model, d.serial)).map((d) => ({ icon: 'cpu', title: d.name + ' · ' + d.tag, sub: labName(d.labId) + ' · ' + DEV_STATUS[d.status][0], go: 'dev-' + d.id }));
    const reqR = me.role === 'student' ? [] : S.coll('requests').filter(rqVisible).filter((r) => has(r.ref, r.title, r.fromDept, r.toDept)).map((r) => ({ icon: RQ_TYPE[r.type][1], title: r.title, sub: r.ref + ' · ' + r.fromDept + ' ← ' + r.toDept + ' · ' + RQ_STATUS[r.status][0], go: 'req-' + r.id }));
    const bkR = S.coll('bookings').filter((b) => (isAdmin() || b.userId === me.id || managesLab(b.labId) || b.status === 'approved') && b.date >= today() && has(b.title)).sort(byStart).map((b) => ({ icon: 'calendar', title: b.title, sub: labName(b.labId) + ' · ' + U.fmtDay(b.date) + ' · ' + U.fmtTime(b.start), act: 'viewBooking', id: b.id }));
    const tkR = S.coll('tickets').filter((t) => (isStaff() || t.reporterId === me.id) && has(t.ref, t.title)).map((t) => ({ icon: 'wrench', title: t.title, sub: t.ref + ' · ' + labName(t.labId) + ' · ' + TK_STATUS[t.status][0], go: 'tk-' + t.id }));
    const usR = isAdmin() ? S.coll('users').filter((u) => has(u.name, u.username, u.dept)).map((u) => ({ icon: 'users', title: u.name, sub: u.username + ' · ' + ROLE[u.role][0] + ' · ' + (u.dept || ''), act: 'editUser', id: u.id })) : [];
    [['المعامل', labsR], ['الطلبات بين الأقسام', reqR], ['الأجهزة', devR], ['الحجوزات القادمة', bkR], ['بلاغات الصيانة', tkR], ['المستخدمون', usR]].forEach((g) => { if (g[1].length) groups.push([g[0], g[1].slice(0, 5)]); });
    return groups;
  }
  function openPalette() {
    U.closeModal();
    const root = document.getElementById('modal-root');
    root.innerHTML = '<div class="modal-backdrop palette-back" data-pclose><div class="palette" role="dialog" aria-modal="true" aria-label="بحث سريع">' +
      '<div class="palette-in">' + icon('search') + '<input id="pal-q" type="search" placeholder="ابحث عن معمل، جهاز برقم الأصل، طلب برقمه، حجز…" autocomplete="off" aria-controls="pal-list"><kbd>Esc</kbd></div>' +
      '<div class="palette-list" id="pal-list" role="listbox"></div><div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> للتنقل</span><span><kbd>Enter</kbd> للفتح</span></div></div></div>';
    const back = root.firstElementChild, input = root.querySelector('#pal-q'), list = root.querySelector('#pal-list');
    let flat = [], active = 0;
    const draw = () => {
      const groups = paletteResults(input.value);
      flat = groups.flatMap((g) => g[1]);
      active = Math.min(active, Math.max(flat.length - 1, 0));
      let i = 0;
      list.innerHTML = flat.length ? groups.map((g) => '<div class="pal-group">' + h(g[0]) + '</div>' + g[1].map((it) => { const idx = i++; return '<div class="pal-item' + (idx === active ? ' on' : '') + '" role="option" data-i="' + idx + '" aria-selected="' + (idx === active) + '"><div class="n-ico info">' + icon(it.icon) + '</div><div class="grow"><b>' + h(it.title) + '</b><span>' + h(it.sub) + '</span></div></div>'; }).join('')).join('')
        : emptyState('search', 'لا توجد نتائج لـ «' + input.value + '»');
    };
    const choose = (idx) => {
      const it = flat[idx]; if (!it) return;
      U.closeModal();
      if (it.go) go(it.go); else if (ACTIONS[it.act]) ACTIONS[it.act](it.id);
    };
    input.addEventListener('input', () => { active = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, flat.length - 1); draw(); list.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); list.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { U.closeModal(); }
    });
    list.addEventListener('click', (e) => { const el = e.target.closest('[data-i]'); if (el) choose(+el.dataset.i); });
    back.addEventListener('mousedown', (e) => { if (e.target === back) U.closeModal(); });
    draw();
    input.focus();
  }

  /* ===== طباعة نموذج الطلب (تعمل عند فتح المنصة على الجهاز) ===== */
  const canPrint = (() => { try { return window.self === window.top; } catch (e) { return false; } })();
  function printRequest(r) {
    const t = RQ_TYPE[r.type] || RQ_TYPE.other;
    const fromD = deptOf(r.fromDept) || {}, toD = deptOf(r.toDept) || {};
    const d = dev(r.deviceId);
    const row = (k, v) => '<tr><th>' + h(k) + '</th><td>' + v + '</td></tr>';
    let rows = row('رقم الطلب', '<b class="ltr">' + h(r.ref) + '</b>') + row('نوع الطلب', h(t[0])) + row('الحالة', h(RQ_STATUS[r.status][0])) + row('الأولوية', h(TK_PRI[r.priority][0])) +
      row('من قسم', h(r.fromDept) + (fromD.ext ? ' · تحويلة ' + h(fromD.ext) : '')) + row('إلى قسم', h(r.toDept) + (toD.ext ? ' · تحويلة ' + h(toD.ext) : '')) +
      row('مقدم الطلب', h(userName(r.requesterId))) + row('تاريخ الطلب', U.fmtDate(r.createdAt)) + row('مطلوب قبل', U.fmtDate(r.dueDate));
    if (r.type === 'loan') rows += row('الجهاز', d ? h(d.tag + ' · ' + d.name) : '—') + row('الكمية', h(r.qty || 1)) + row('فترة الإعارة', U.fmtDate(r.loanFrom) + ' إلى ' + U.fmtDate(r.loanTo));
    if (r.type === 'lab') rows += row('المعمل', h(labName(r.labId))) + row('الموعد', U.fmtDay(r.date) + ' · ' + U.fmtTime(r.start) + ' – ' + U.fmtTime(r.end)) + row('عدد الحضور', h(r.attendees));
    if (r.type === 'transfer') rows += row('الجهاز', d ? h(d.tag + ' · ' + d.name) : '—') + row('إلى معمل', h(labName(r.targetLabId)));
    if (r.type === 'support' && d) rows += row('الجهاز المعني', h(d.tag + ' · ' + d.name));
    const items = r.items && r.items.length ? '<h3>البنود المطلوبة</h3><table class="pf-tbl"><thead><tr><th>#</th><th>البند</th><th>الكمية</th><th>الوحدة</th></tr></thead><tbody>' + r.items.map((it, i) => '<tr><td>' + (i + 1) + '</td><td>' + h(it.name) + '</td><td>' + h(it.qty) + '</td><td>' + h(it.unit || '') + '</td></tr>').join('') + '</tbody></table>' : '';
    const hist = '<h3>سجل الإجراءات</h3><table class="pf-tbl"><thead><tr><th>التاريخ</th><th>بواسطة</th><th>الإجراء</th><th>ملاحظة</th></tr></thead><tbody>' +
      r.log.map((e) => '<tr><td>' + fmtStamp(e.at) + '</td><td>' + h(userName(e.userId)) + '</td><td>' + h(e.kind === 'comment' ? 'رد' : RQ_STATUS[e.status][0]) + '</td><td>' + h(e.text || '') + '</td></tr>').join('') + '</tbody></table>';
    const sig = (title, name) => '<div class="pf-sig"><b>' + h(title) + '</b><span>الاسم: ' + h(name || '') + '</span><span>التوقيع:</span><span>التاريخ:</span></div>';
    let pr = document.getElementById('print-root');
    if (!pr) { pr = document.createElement('div'); pr.id = 'print-root'; document.body.appendChild(pr); }
    pr.innerHTML = '<div class="pf"><header><div><b>مِختبَر · نظام إدارة المعامل</b><span>نموذج طلب بين الأقسام</span></div><div class="pf-ref ltr">' + h(r.ref) + '</div></header>' +
      '<h2>' + h(r.title) + '</h2><table class="pf-kv">' + rows + '</table>' + items +
      (r.description ? '<h3>الوصف والمبررات</h3><p>' + h(r.description) + '</p>' : '') + hist +
      '<div class="pf-sigs">' + sig('مقدم الطلب', userName(r.requesterId)) + sig('رئيس القسم المرسل', userName(fromD.managerId)) + sig('رئيس القسم المستلم', userName(toD.managerId)) + '</div>' +
      '<footer>طُبع من منصة مِختبَر بتاريخ ' + U.fmtDate(today()) + '</footer></div>';
    window.print();
  }

  /* ===== أدوات الفلترة ===== */
  function bindFilters(root, map, draw) {
    Object.keys(map).forEach((sel) => {
      const el = root.querySelector(sel);
      if (!el) return;
      const [key, obj] = map[sel];
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { obj[key] = el.value; draw(); });
    });
  }

  /* ===== التصدير ===== */
  function exportBookings() {
    const rows = [['العنوان', 'المعمل', 'التاريخ', 'من', 'إلى', 'مقدم الطلب', 'الحضور', 'الحالة', 'ملاحظات']];
    S.coll('bookings').filter((b) => isAdmin() || managesLab(b.labId)).sort(byStart).forEach((b) => rows.push([b.title, labName(b.labId), b.date, b.start, b.end, userName(b.userId), b.attendees, BK_STATUS[b.status][0], b.notes]));
    U.download('bookings-' + today() + '.csv', U.toCSV(rows), 'text/csv;charset=utf-8');
    U.toast('تم تصدير ' + (rows.length - 1) + ' حجزًا');
  }
  function exportDevices() {
    const rows = [['رقم الأصل', 'الجهاز', 'الطراز', 'الرقم التسلسلي', 'المعمل', 'الحالة', 'تاريخ الشراء', 'نهاية الضمان', 'المعايرة القادمة']];
    filteredDevices(st.devices, st.devices.q.toLowerCase()).forEach((d) => rows.push([d.tag, d.name, d.model, d.serial, labName(d.labId), DEV_STATUS[d.status][0], d.purchaseDate, d.warrantyEnd, d.calibrationDue]));
    U.download('devices-' + today() + '.csv', U.toCSV(rows), 'text/csv;charset=utf-8');
    U.toast('تم تصدير ' + (rows.length - 1) + ' جهازًا');
  }
  function exportTickets() {
    const rows = [['الرقم', 'العنوان', 'المعمل', 'الأجهزة', 'الأولوية', 'الحالة', 'المبلّغ', 'تاريخ البلاغ', 'تاريخ الحل', 'نوع العطل', 'المحطة', 'الفصل', 'محوّل للدعم الفني', 'قرار اللجنة']];
    S.coll('tickets').filter((t) => isAdmin() || managesLab(t.labId)).forEach((t) => rows.push([t.ref, t.title, labName(t.labId), tkDevices(t).map((d) => d.tag).join(' '), TK_PRI[t.priority][0], TK_STATUS[t.status][0], reporterName(t), t.createdAt, t.resolvedAt, (ISSUE_TYPE[t.issueType] || ['—'])[0], stationLabel(t.stationId), semName(t.semesterId), t.forwardedIT ? 'نعم' : 'لا', t.approval ? AP_STATUS[t.approval.status][0] : '—']));
    U.download('maintenance-' + today() + '.csv', U.toCSV(rows), 'text/csv;charset=utf-8');
    U.toast('تم تصدير ' + (rows.length - 1) + ' بلاغًا');
  }

  /* ===== الإجراءات ===== */
  const VIEWS = { campuses: viewCampuses, approvals: viewApprovals, reference: viewReference, requests: () => viewRequests(''), dashboard: viewDashboard, labs: viewLabs, devices: viewDevices, schedule: viewSchedule, bookings: viewBookings, maintenance: viewMaintenance, reports: viewReports, users: viewUsers, settings: viewSettings };
  const withB = (fn) => (id) => { const b = S.byId('bookings', id); if (b) fn(b); };
  const ACTIONS = {
    logout() { S.session.clear(); me = null; location.hash = ''; render(); },
    openNav() { document.getElementById('shell').classList.add('nav-open'); },
    closeNav() { document.getElementById('shell').classList.remove('nav-open'); },
    toggleTheme() { S.prefs.set('theme', isDark() ? 'light' : 'dark'); render(); },
    toggleNotif(id, el) {
      const p = document.getElementById('notif-pop'); p.hidden = !p.hidden; el.setAttribute('aria-expanded', String(!p.hidden));
      if (!p.hidden) { markSeen(notifications()); const dot = el.querySelector('.dot'); if (dot) dot.remove(); }
    },
    go(id) { go(id); },
    newBooking() { bookingModal(); },
    bookLab(id) { bookingModal({ labId: id }); },
    slot(id) { const [date, start] = id.split('|'); const l = lab(st.schedule.lab); let end = pad(Math.min(+start.slice(0, 2) + 1, 23)) + ':40'; if (l && end > l.close) end = l.close; bookingModal({ labId: st.schedule.lab, date, start, end }); },
    viewBooking: withB(bookingView),
    editBooking: withB((b) => bookingModal(null, b)),
    approve: withB((b) => setBookingStatus(b, 'approved')),
    reject: withB((b) => reasonModal(b, 'rejected')),
    cancelBooking: withB((b) => reasonModal(b, 'cancelled')),
    weekPrev() { st.schedule.week--; render(); },
    weekNext() { st.schedule.week++; render(); },
    weekNow() { st.schedule.week = 0; render(); },
    newLab() { labModal(); },
    editLab(id) { const l = lab(id); if (l) labModal(l); },
    deleteLab(id) {
      const l = lab(id); if (!l) return;
      const nd = S.coll('devices').filter((d) => d.labId === id).length, nb = S.coll('bookings').filter((b) => b.labId === id).length;
      U.confirmDialog({
        title: 'حذف ' + l.name, danger: true, confirmText: 'حذف نهائي',
        message: 'سيتم حذف المعمل مع ' + nd + ' جهازًا و' + nb + ' حجزًا مرتبطة به. لا يمكن التراجع عن هذا الإجراء.',
        onConfirm() {
          S.data.devices = S.coll('devices').filter((d) => d.labId !== id);
          S.data.bookings = S.coll('bookings').filter((b) => b.labId !== id);
          S.data.tickets = S.coll('tickets').filter((t) => t.labId !== id);
          S.remove('labs', id);
          S.log(me.id, 'حذف ' + l.name);
          U.toast('تم حذف المعمل');
          setTimeout(() => go('labs'));
        }
      });
    },
    newDevice(id) { deviceModal(null, id); },
    editDevice(id) { const d = dev(id); if (d) deviceModal(d); },
    viewDevice(id) { go('dev-' + id); },
    recordCal(id) { const d = dev(id); if (d) calModal(d); },
    reportDevice(id) { const d = dev(id); if (d) ticketModal({ labId: d.labId, stationId: d.stationId || '', deviceIds: [d.id] }); },
    deleteDevice(id) {
      const d = dev(id); if (!d) return;
      U.confirmDialog({ title: 'حذف الجهاز', danger: true, confirmText: 'حذف', message: 'حذف ' + d.name + ' (' + d.tag + ') من سجل الأجهزة؟ يبقى سجل الصيانة السابق محفوظًا.', onConfirm() { S.remove('devices', id); S.log(me.id, 'حذف الجهاز ' + d.tag); U.toast('تم حذف الجهاز'); setTimeout(() => route().startsWith('dev-') ? go('devices') : render()); } });
    },
    devicesCal() { Object.assign(st.devices, { status: 'cal', lab: '', type: '', q: '' }); go('devices'); },
    newTicket(id) { ticketModal({ labId: id }); },
    viewTicket(id) { go('tk-' + id); },
    tkTab(id) { st.tickets.tab = id; go('maintenance'); },
    tkAct(id) { const [tid, action] = id.split('|'); const t = S.byId('tickets', tid); if (t) tkAct(t, action); },
    deleteTicket(id) {
      const t = S.byId('tickets', id); if (!t) return;
      U.confirmDialog({ title: 'حذف البلاغ ' + t.ref, danger: true, confirmText: 'حذف', message: 'سيتم حذف البلاغ «' + t.title + '» نهائيًا.', onConfirm() { S.remove('tickets', id); U.toast('تم حذف البلاغ'); setTimeout(() => route().startsWith('tk-') ? go('maintenance') : render()); } });
    },
    newUser() { userModal(); },
    editUser(id) { const u = user(id); if (u) userModal(u); },
    deleteUser(id) {
      const u = user(id); if (!u || u.id === me.id) return;
      const sup = S.coll('labs').filter((l) => l.supervisorId === id).map((l) => l.name);
      const mgr = S.coll('departments').filter((d) => d.managerId === id).map((d) => 'قسم ' + d.name);
      if (sup.length || mgr.length) { U.toast('لا يمكن حذف ' + u.name + ': مسؤول عن ' + sup.concat(mgr).join('، ') + '. عيّن بديلًا أولًا أو أوقف الحساب.', 'bad'); return; }
      U.confirmDialog({ title: 'حذف المستخدم', danger: true, confirmText: 'حذف', message: 'حذف حساب ' + u.name + '؟ تبقى حجوزاته وبلاغاته السابقة في السجل. يمكنك بدلًا من ذلك إيقاف الحساب.', onConfirm() { S.remove('users', id); S.log(me.id, 'حذف حساب ' + u.name); U.toast('تم حذف المستخدم'); setTimeout(render); } });
    },
    newDept() { deptModal(); },
    editDept(id) { const d = S.byId('departments', id); if (d) deptModal(d); },
    deleteDept(id) {
      const d = S.byId('departments', id); if (!d) return;
      U.confirmDialog({ title: 'حذف القسم', danger: true, confirmText: 'حذف', message: 'حذف قسم ' + d.name + '؟ تبقى الطلبات السابقة المرتبطة به في السجل.', onConfirm() { S.remove('departments', id); U.toast('تم حذف القسم'); setTimeout(render); } });
    },
    newRequest() { requestModal(); },
    newCampus() { campusModal(); },
    editCampus(id) { const c = campus(id); if (c) campusModal(c); },
    deleteCampus(id) { const c = campus(id); if (c) U.confirmDialog({ title: 'حذف ' + c.name, danger: true, confirmText: 'حذف', message: 'حذف هذا الحرم؟ لا توجد معامل مرتبطة به.', onConfirm() { S.remove('campuses', id); U.toast('تم الحذف'); setTimeout(render); } }); },
    newStation(id) { stationModal(null, id); },
    editStation(id) { const x = station(id); if (x) stationModal(x); },
    deleteStation(id) { S.remove('stations', id); U.toast('تم حذف المحطة'); setTimeout(render); },
    reportStation(id) { const x = station(id); if (x) ticketModal({ labId: x.labId, stationId: x.id }); },
    newType() { typeModal(); },
    editType(id) { const t = S.byId('deviceTypes', id); if (t) typeModal(t); },
    deleteType(id) { S.remove('deviceTypes', id); U.toast('تم الحذف'); setTimeout(render); },
    newSem() { semModal(); },
    editSem(id) { const x = S.byId('semesters', id); if (x) semModal(x); },
    deleteSem(id) { S.remove('semesters', id); U.toast('تم الحذف'); setTimeout(render); },

    palette() { openPalette(); },
    printReq(id) { const r = S.byId('requests', id); if (r) printRequest(r); },
    reqAct(id) { const [rid, action] = id.split('|'); const r = S.byId('requests', rid); if (r) rqAct(r, action); },
    schedLab(id) { st.schedule.lab = id; st.schedule.week = 0; go('schedule'); },
    exportBookings, exportDevices, exportTickets,
    exportJSON() { U.download('labms-backup-' + today() + '.json', JSON.stringify(S.data, null, 2), 'application/json'); U.toast('تم تنزيل النسخة الاحتياطية'); },
    resetData() {
      U.confirmDialog({ title: 'إعادة البيانات التجريبية', danger: true, confirmText: 'إعادة التهيئة', message: 'ستُحذف كل التعديلات وتعود البيانات التجريبية الأصلية. يفضل أخذ نسخة احتياطية أولًا.', onConfirm() { S.reset(); S.session.set('u1'); U.toast('تمت إعادة البيانات التجريبية'); setTimeout(render); } });
    }
  };

  document.addEventListener('click', (e) => {
    const pop = document.getElementById('notif-pop');
    if (pop && !pop.hidden && !e.target.closest('.rel')) pop.hidden = true;
    const t = e.target.closest('[data-act]');
    if (t) {
      const fn = ACTIONS[t.dataset.act];
      if (fn) {
        e.preventDefault();
        if (t.closest('.modal')) U.closeModal();
        fn(t.dataset.id, t);
      }
      return;
    }
    const a = e.target.closest('.nav a');
    if (a) { const sh = document.getElementById('shell'); if (sh) sh.classList.remove('nav-open'); }
  });
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', (e) => {
    if (!me) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '');
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) { e.preventDefault(); openPalette(); }
    else if (e.key === '/' && !typing && !document.querySelector('.modal-backdrop')) { e.preventDefault(); openPalette(); }
  });
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (S.prefs.get('theme', 'system') === 'system' && me) render(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }

  /* على الجوال تتحول الجداول إلى بطاقات: كل خلية تأخذ عنوان عمودها */
  function labelTables(root) {
    root.querySelectorAll('table.stack').forEach((t) => {
      const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
      t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (!td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i] || ''); }));
    });
  }
  new MutationObserver(() => labelTables(document)).observe(document.getElementById('app'), { childList: true, subtree: true });

  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';
  S.load();
  render();
})();
