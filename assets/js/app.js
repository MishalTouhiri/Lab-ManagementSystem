/* منصة مِختبَر لإدارة المعامل — التطبيق الرئيسي */
(function () {
  'use strict';

  const S = window.Store, U = window.UI;
  const { h, icon } = U;
  const { iso, addDays, weekStart, pad } = S.util;

  /* ===== القواميس ===== */
  const ROLE = { admin: ['مدير النظام', 'accent'], supervisor: ['مشرف معمل', 'info'], faculty: ['عضو هيئة تدريس', 'warn'], student: ['طالب', ''] };
  const LAB_TYPE = { computer: 'حاسب آلي', network: 'شبكات', physics: 'فيزياء', chemistry: 'كيمياء', electronics: 'إلكترونيات' };
  const LAB_STATUS = { active: ['متاح', 'ok'], maintenance: ['تحت الصيانة', 'warn'], closed: ['مغلق', 'bad'] };
  const DEV_TYPE = { computer: 'حاسب آلي', display: 'أجهزة عرض', network: 'معدات شبكات', instrument: 'جهاز قياس', electronics: 'إلكترونيات', server: 'خادم', other: 'أخرى' };
  const DEV_STATUS = { working: ['يعمل', 'ok'], maintenance: ['في الصيانة', 'warn'], broken: ['معطّل', 'bad'], retired: ['خارج الخدمة', ''] };
  const BK_STATUS = { approved: ['مؤكد', 'ok'], pending: ['بانتظار الموافقة', 'warn'], rejected: ['مرفوض', 'bad'], cancelled: ['ملغى', ''] };
  const TK_PRI = { low: ['منخفضة', ''], medium: ['متوسطة', 'info'], high: ['عالية', 'warn'], urgent: ['عاجلة', 'bad'] };
  const TK_STATUS = { open: ['مفتوح', 'bad'], in_progress: ['قيد المعالجة', 'warn'], resolved: ['تم الحل', 'ok'] };
  const PRI_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

  let me = null;
  const st = {
    labs: { q: '', type: '', status: '' },
    devices: { q: '', lab: '', status: '', type: '' },
    bookings: { tab: '', q: '' },
    tickets: { tab: 'active', q: '' },
    schedule: { lab: '', week: 0 },
    reports: { period: 'month' },
    users: { q: '', role: '' },
    req: { box: '', group: 'all', type: '', dept: '', q: '', scroll: 0 },
    labTab: 'devices'
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
  const openTicketsForMe = () => S.coll('tickets').filter((t) => t.status !== 'resolved' && (isStaff() ? managesLab(t.labId) : t.reporterId === me.id));
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
      group: 'التشغيل', items: [
        { id: 'labs', label: 'المعامل', icon: 'flask' },
        { id: 'devices', label: 'الأجهزة والمعدات', icon: 'cpu' },
        { id: 'schedule', label: 'الجدول الأسبوعي', icon: 'grid' },
        { id: 'bookings', label: 'الحجوزات', icon: 'calendar', count: () => pendingForMe().length },
        { id: 'maintenance', label: 'الصيانة والأعطال', icon: 'wrench', count: () => openTicketsForMe().length },
        { id: 'requests', label: 'طلبات الأقسام', icon: 'swap', roles: ['admin', 'supervisor', 'faculty'], count: () => rqInboxCount() }
      ]
    },
    {
      group: 'الإدارة', items: [
        { id: 'reports', label: 'التقارير', icon: 'chart', roles: ['admin', 'supervisor'] },
        { id: 'users', label: 'المستخدمون', icon: 'users', roles: ['admin'] },
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
    if (!me) return renderLogin();

    const r = route();
    let view;
    if (r.startsWith('lab-')) view = viewLab(r.slice(4));
    else if (r.startsWith('req-')) {
      if (me.role === 'student') { location.replace('#dashboard'); return; }
      view = viewRequests(r.slice(4));
    } else {
      const item = NAV.flatMap((g) => g.items).find((i) => i.id === r);
      if (!item || !allowed(item)) { location.replace('#dashboard'); return; }
      view = VIEWS[r]();
    }
    renderShell(view, r.startsWith('lab-') ? 'labs' : r.startsWith('req-') ? 'requests' : r);
  }

  function renderShell(view, active) {
    const notes = notifications();
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
      '<button class="icon-btn" data-act="toggleTheme" title="تبديل المظهر" aria-label="تبديل المظهر">' + icon(isDark() ? 'sun' : 'moon') + '</button>' +
      '<div class="rel"><button class="icon-btn" data-act="toggleNotif" aria-label="الإشعارات" aria-expanded="false">' + icon('bell') + (notes.length ? '<span class="dot">' + notes.length + '</span>' : '') + '</button>' +
      '<div class="popover" id="notif-pop" hidden><div class="ph">الإشعارات</div><div class="list">' +
      (notes.length ? notes.map((n) => '<div class="list-item" data-act="go" data-id="' + n.go + '"><div class="n-ico ' + n.cls + '">' + icon(n.icon) + '</div><div class="grow"><b>' + h(n.title) + '</b><span>' + h(n.sub) + '</span></div></div>').join('') : emptyState('bell', 'لا توجد إشعارات جديدة')) +
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
    pendingForMe().slice(0, 5).forEach((b) => out.push({ cls: 'warn', icon: 'calendar', title: 'طلب حجز: ' + b.title, sub: labName(b.labId) + ' · ' + U.fmtDay(b.date) + ' · ' + userName(b.userId), go: 'bookings' }));
    if (me.role !== 'student') {
      S.coll('requests').filter((r) => (r.status === 'new' && isReceiver(r) && (r.toDept === me.dept || isAdmin())) || (r.status === 'info' && isSender(r))).slice(0, 4)
        .forEach((r) => out.push({ cls: r.status === 'info' ? 'warn' : 'info', icon: 'swap', title: (r.status === 'info' ? 'مطلوب استكمال: ' : 'طلب وارد من ' + r.fromDept + ': ') + r.title, sub: r.ref + ' · ' + RQ_TYPE[r.type][0], go: 'req-' + r.id }));
    }
    if (isStaff()) {
      S.coll('devices').filter((d) => managesLab(d.labId)).forEach((d) => {
        const c = calState(d);
        if (c && c.days <= 7) out.push({ cls: c.days < 0 ? 'bad' : 'warn', icon: 'gauge', title: 'معايرة ' + (c.days < 0 ? 'متأخرة' : 'مستحقة') + ': ' + d.name, sub: d.tag + ' · ' + (c.days < 0 ? 'متأخرة ' + daysTxt(-c.days) : c.days === 0 ? 'اليوم' : 'خلال ' + daysTxt(c.days)), go: 'devices' });
      });
      S.coll('tickets').filter((t) => t.status === 'open' && (t.priority === 'urgent' || t.priority === 'high') && managesLab(t.labId))
        .forEach((t) => out.push({ cls: 'bad', icon: 'wrench', title: 'بلاغ ' + TK_PRI[t.priority][0] + ': ' + t.title, sub: t.ref + ' · ' + labName(t.labId), go: 'maintenance' }));
    } else {
      S.coll('bookings').filter((b) => b.userId === me.id && b.date >= today() && (b.status === 'approved' || b.status === 'rejected')).sort(byStart).slice(0, 5)
        .forEach((b) => out.push({ cls: b.status === 'approved' ? 'info' : 'bad', icon: b.status === 'approved' ? 'check' : 'x', title: (b.status === 'approved' ? 'تم تأكيد حجزك: ' : 'تم رفض طلبك: ') + b.title, sub: labName(b.labId) + ' · ' + U.fmtDay(b.date), go: 'bookings' }));
    }
    return out;
  }

  /* ===== شاشة الدخول ===== */
  function renderLogin(err, username) {
    const demo = [['admin', 'admin123', 'مدير النظام'], ['supervisor', 'super123', 'مشرف معمل'], ['faculty', 'faculty123', 'عضو هيئة تدريس'], ['student', 'student123', 'طالب']];
    const cells = S.coll('labs').slice(0, 6).map((l, i) => '<div class="cell' + (i % 2 === 0 ? ' on' : '') + '"><i>' + h(l.room) + '</i><b>' + h(l.code.split('-')[0]) + '</b><small>' + h(l.code.split('-')[1] || '') + '</small></div>').join('');
    const ghosts = ['Cu', 'Si', 'Ge', 'Na', 'Fe', 'Ag'].map((s, i) => '<div class="cell ghost"><i>' + [29, 14, 32, 11, 26, 47][i] + '</i><b>' + s + '</b></div>').join('');
    document.getElementById('app').innerHTML =
      '<div class="login">' +
      '<section class="login-art">' +
      '<div class="brand"><div class="brand-mark"><small>LM</small>Lb</div><div><div class="brand-name">مِختبَر</div><div class="brand-sub">نظام إدارة المعامل</div></div></div>' +
      '<div><h2>كل معامل الكلية في لوحة واحدة.</h2><p class="lead">حجز المعامل بلا تعارض، متابعة الأجهزة ومواعيد معايرتها، وبلاغات صيانة تصل للمشرف المسؤول مباشرة.</p></div>' +
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
      '</form></section></div>';
    const form = document.getElementById('login-form');
    const tryLogin = (u, p) => {
      const found = S.coll('users').find((x) => x.username.toLowerCase() === u.toLowerCase() && x.password === p);
      if (!u || !p) return renderLogin('أدخل اسم المستخدم وكلمة المرور.', u);
      if (!found) return renderLogin('اسم المستخدم أو كلمة المرور غير صحيحة.', u);
      if (!found.active) return renderLogin('هذا الحساب موقوف. تواصل مع مدير النظام.', u);
      S.session.set(found.id);
      S.log(found.id, 'سجّل الدخول إلى النظام');
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

    const acts = S.coll('activity').slice(0, 6);
    const actCard = card('آخر النشاطات', '', acts.length ? '<div class="timeline">' + acts.map((a) => '<div class="ev"><div class="avatar">' + h(U.initials(userName(a.userId))) + '</div><div><p><b>' + h(userName(a.userId)) + '</b> ' + h(a.text) + '</p><time>' + U.timeAgo(a.at) + '</time></div></div>').join('') + '</div>' : emptyState('clock', 'لا توجد نشاطات بعد'), '', true);

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
              '<div style="min-width:0"><h3>' + h(l.name) + '</h3><div class="loc">' + h(l.building) + ' · قاعة ' + h(l.room) + ' · ' + h(LAB_TYPE[l.type]) + '</div></div>' + pill(LAB_STATUS, l.status) + '</div>' +
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
      '<dt>الموقع</dt><dd>' + h(l.building) + ' · قاعة ' + h(l.room) + '</dd>' +
      '<dt>النوع</dt><dd>' + h(LAB_TYPE[l.type]) + '</dd>' +
      '<dt>القسم</dt><dd>' + h(l.dept || '—') + '</dd>' +
      '<dt>السعة</dt><dd>' + l.capacity + ' مقعدًا</dd>' +
      '<dt>ساعات العمل</dt><dd>' + U.fmtTime(l.open) + ' – ' + U.fmtTime(l.close) + ' (الأحد إلى الخميس)</dd>' +
      '<dt>المشرف</dt><dd>' + (sup ? h(sup.name) + ' · <span class="ltr">' + h(sup.email) + '</span>' : '—') + '</dd>' +
      '<dt>إشغال الأسبوع</dt><dd><div style="display:flex;gap:10px;align-items:center;max-width:320px"><div class="meter ' + meterCls(p) + '" style="flex:1"><span style="width:' + p + '%"></span></div><b class="num">' + p + '%</b></div></dd>' +
      '</dl></div></section>';

    const tabs = [['devices', 'الأجهزة', devs.length], ['bookings', 'حجوزات هذا الأسبوع', wk.length], ['tickets', 'سجل الصيانة', tix.length]];
    const html = info + '<section class="card"><div class="tabs" role="tablist">' + tabs.map((t) => '<button role="tab" data-tab="' + t[0] + '" class="' + (st.labTab === t[0] ? 'on' : '') + '">' + t[1] + '<span class="count">' + t[2] + '</span></button>').join('') + '</div><div id="lab-tab"></div></section>';

    return {
      title: l.name, crumb: 'المعامل / ' + l.code, html,
      mount(root) {
        const box = root.querySelector('#lab-tab');
        const draw = () => {
          root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === st.labTab));
          if (st.labTab === 'devices') box.innerHTML = devicesTable(devs, true) + (managesLab(l.id) ? '<div style="padding:14px 20px;border-top:1px solid var(--line)"><button class="btn btn-sm" data-act="newDevice" data-id="' + l.id + '">' + icon('plus') + 'إضافة جهاز لهذا المعمل</button></div>' : '');
          else if (st.labTab === 'bookings') box.innerHTML = bookingsTable(wk, true);
          else box.innerHTML = ticketsTable(tix, true);
        };
        root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.labTab = b.dataset.tab; draw(); }));
        draw();
      }
    };
  }

  function labModal(existing) {
    const sups = S.coll('users').filter((u) => (u.role === 'supervisor' || u.role === 'admin') && u.active).map((u) => ({ value: u.id, label: u.name }));
    const v = existing || { type: 'computer', status: 'active', capacity: 24, open: '08:00', close: '18:00', supervisorId: me.role === 'supervisor' ? me.id : '' };
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
      { name: 'dept', label: 'القسم المالك', type: 'select', required: true, span: true, placeholder: 'اختر القسم', options: S.coll('departments').map((d) => ({ value: d.name, label: d.name })) },
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
        return '<tr><td><span class="tag">' + h(d.tag) + '</span></td><td><div class="cell-main">' + h(d.name) + '</div><div class="cell-sub">' + h(d.model) + '</div></td>' +
          (compact ? '' : '<td><a href="#lab-' + d.labId + '" style="color:inherit">' + h(labName(d.labId)) + '</a></td>') +
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
      '<div class="search">' + icon('search') + '<input class="input" id="dev-q" type="search" placeholder="ابحث برقم الأصل أو الاسم أو الطراز أو الرقم التسلسلي" value="' + h(f.q) + '"></div>' +
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
        bindFilters(root, { '#dev-q': ['q', f], '#dev-lab': ['lab', f], '#dev-status': ['status', f], '#dev-type': ['type', f] }, draw);
        draw();
      }
    };
  }
  function filteredDevices(f, q) {
    return S.coll('devices').filter((d) => (!f.lab || d.labId === f.lab) && (!f.type || d.type === f.type) &&
      (!f.status || (f.status === 'cal' ? (calState(d) && calState(d).days <= 14) : d.status === f.status)) &&
      (!q || (d.tag + ' ' + d.name + ' ' + d.model + ' ' + d.serial).toLowerCase().includes(q)))
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
      { name: 'status', label: 'الحالة', type: 'select', options: optsOf(DEV_STATUS), required: true },
      { name: 'purchaseDate', label: 'تاريخ الشراء', type: 'date' },
      { name: 'warrantyEnd', label: 'نهاية الضمان', type: 'date' },
      { name: 'calibrationDue', label: 'موعد المعايرة القادم', type: 'date', hint: 'اتركه فارغًا إذا لم يتطلب الجهاز معايرة' },
      { name: 'notes', label: 'ملاحظات', type: 'textarea', span: true }
    ];
    U.modal({
      title: existing ? 'تعديل بيانات الجهاز' : 'إضافة جهاز', body: U.formGrid(fields, v), submitText: existing ? 'حفظ التعديلات' : 'إضافة الجهاز',
      onSubmit(form) {
        const d = U.formData(form);
        for (const f of fields) if (f.required && !d[f.name]) return 'الحقل «' + f.label + '» مطلوب.';
        d.tag = d.tag.toUpperCase();
        if (S.coll('devices').some((x) => x.tag === d.tag && (!existing || x.id !== existing.id))) return 'رقم الأصل ' + d.tag + ' مسجل لجهاز آخر.';
        if (d.warrantyEnd && d.purchaseDate && d.warrantyEnd < d.purchaseDate) return 'نهاية الضمان لا يمكن أن تسبق تاريخ الشراء.';
        if (existing) d.id = existing.id;
        S.upsert('devices', d, 'dev');
        S.log(me.id, (existing ? 'عدّل بيانات الجهاز ' : 'أضاف الجهاز ') + d.tag);
        U.toast(existing ? 'تم حفظ التعديلات' : 'تمت إضافة الجهاز');
        setTimeout(render);
      }
    });
  }

  function deviceView(d) {
    const tix = S.coll('tickets').filter((t) => t.deviceId === d.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    U.modal({
      title: d.name,
      body: '<dl class="dl"><dt>رقم الأصل</dt><dd><span class="tag">' + h(d.tag) + '</span></dd><dt>الحالة</dt><dd>' + pill(DEV_STATUS, d.status) + '</dd><dt>المعمل</dt><dd>' + h(labName(d.labId)) + '</dd><dt>التصنيف</dt><dd>' + h(DEV_TYPE[d.type] || d.type) + '</dd>' +
        '<dt>الطراز</dt><dd class="ltr" style="text-align:right">' + h(d.model || '—') + '</dd><dt>الرقم التسلسلي</dt><dd><span class="mono">' + h(d.serial || '—') + '</span></dd>' +
        '<dt>تاريخ الشراء</dt><dd>' + U.fmtDate(d.purchaseDate) + '</dd><dt>نهاية الضمان</dt><dd>' + U.fmtDate(d.warrantyEnd) + '</dd><dt>المعايرة القادمة</dt><dd>' + calPill(d) + (d.calibrationDue ? ' <span class="muted small">' + U.fmtDate(d.calibrationDue) + '</span>' : '') + '</dd>' +
        '<dt>ملاحظات</dt><dd>' + h(d.notes || '—') + '</dd></dl>' +
        '<div><h4 style="font-size:var(--fs-sm);margin-bottom:8px">سجل الصيانة (' + tix.length + ')</h4>' + (tix.length ? '<div class="list" style="border:1px solid var(--line);border-radius:8px">' + tix.map((t) => '<div class="list-item" style="padding:10px 14px"><span class="tag">' + t.ref + '</span><div class="grow"><b>' + h(t.title) + '</b><span>' + U.fmtDate(t.createdAt) + '</span></div>' + pill(TK_STATUS, t.status) + '</div>').join('') + '</div>' : '<p class="muted small">لا توجد بلاغات سابقة لهذا الجهاز.</p>') + '</div>',
      extraFoot: (d.status !== 'retired' ? '<button class="btn" data-act="reportDevice" data-id="' + d.id + '">' + icon('wrench') + 'إبلاغ عن عطل</button>' : '') +
        (managesLab(d.labId) ? '<button class="btn btn-primary" data-act="editDevice" data-id="' + d.id + '">' + icon('edit') + 'تعديل</button>' : '')
    });
  }

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
    return '<div class="table-wrap"><table class="table stack"><thead><tr><th>الرقم</th><th>البلاغ</th>' + (compact ? '' : '<th>المعمل</th>') + '<th>الأولوية</th><th>الحالة</th><th class="hide-sm">المبلّغ</th><th class="hide-sm">التاريخ</th><th></th></tr></thead><tbody>' +
      items.map((t) => {
        const d = dev(t.deviceId);
        return '<tr><td><span class="tag">' + h(t.ref) + '</span></td><td><div class="cell-main">' + h(t.title) + '</div><div class="cell-sub">' + (d ? h(d.tag) + ' · ' + h(d.name) : 'عطل عام في المعمل') + '</div></td>' +
          (compact ? '' : '<td>' + h(labName(t.labId)) + '</td>') +
          '<td>' + pill(TK_PRI, t.priority) + '</td><td>' + pill(TK_STATUS, t.status) + '</td>' +
          '<td class="hide-sm">' + h(userName(t.reporterId)) + '</td><td class="hide-sm small" style="white-space:nowrap">' + U.fmtDate(t.createdAt) + '</td>' +
          '<td><div class="row-actions"><button class="icon-btn" data-act="viewTicket" data-id="' + t.id + '" title="التفاصيل" aria-label="التفاصيل">' + icon('eye') + '</button>' +
          (isAdmin() ? '<button class="icon-btn" data-act="deleteTicket" data-id="' + t.id + '" title="حذف" aria-label="حذف">' + icon('trash') + '</button>' : '') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function viewMaintenance() {
    const f = st.tickets;
    const scope = () => S.coll('tickets').filter((t) => isStaff() ? (isAdmin() || managesLab(t.labId) || t.reporterId === me.id) : t.reporterId === me.id);
    const tabs = [['active', 'المفتوحة', (t) => t.status !== 'resolved'], ['open', 'جديدة', (t) => t.status === 'open'], ['in_progress', 'قيد المعالجة', (t) => t.status === 'in_progress'], ['resolved', 'تم حلها', (t) => t.status === 'resolved'], ['all', 'الكل', () => true]];
    const all = scope();
    const open = all.filter((t) => t.status !== 'resolved');
    const res = all.filter((t) => t.status === 'resolved' && t.resolvedAt);
    const avg = res.length ? (res.reduce((s, t) => s + (U.parseDate(t.resolvedAt) - U.parseDate(t.createdAt)) / 864e5, 0) / res.length) : 0;
    const html =
      '<div class="page-head"><div class="t"><h2>الصيانة والأعطال</h2><p>' + (isStaff() ? 'بلاغات المعامل وسير معالجتها' : 'البلاغات التي أرسلتها') + '</p></div><div class="actions">' +
      (isStaff() ? '<button class="btn" data-act="exportTickets">' + icon('download') + 'تصدير CSV</button>' : '') +
      '<button class="btn btn-primary" data-act="newTicket">' + icon('plus') + 'بلاغ جديد</button></div></div>' +
      '<div class="grid grid-kpi">' +
      kpi('بلاغات مفتوحة', open.length, 'inbox', 'bad', open.filter((t) => t.status === 'open').length + ' لم تبدأ معالجتها') +
      kpi('عاجلة أو عالية', open.filter((t) => t.priority === 'urgent' || t.priority === 'high').length, 'alert', 'warn', 'تتطلب استجابة خلال 24 ساعة') +
      kpi('تم حلها', res.length, 'check', '', 'منذ بداية الفصل') +
      kpi('متوسط مدة الحل', (Math.round(avg * 10) / 10) + '<span class="muted" style="font-size:1rem"> يوم</span>', 'clock', 'info', 'من فتح البلاغ حتى إغلاقه') +
      '</div>' +
      '<section class="card"><div class="tabs" role="tablist" id="tk-tabs"></div>' +
      '<div class="toolbar"><div class="search">' + icon('search') + '<input class="input" id="tk-q" type="search" placeholder="ابحث برقم البلاغ أو العنوان أو رقم الأصل" value="' + h(f.q) + '"></div></div>' +
      '<div id="tk-list"></div></section>';
    return {
      title: 'الصيانة والأعطال', crumb: 'التشغيل', html,
      mount(root) {
        const tabsEl = root.querySelector('#tk-tabs'), list = root.querySelector('#tk-list');
        const draw = () => {
          const items0 = scope();
          const q = f.q.toLowerCase();
          tabsEl.innerHTML = tabs.map((x) => '<button role="tab" data-t="' + x[0] + '" class="' + (f.tab === x[0] ? 'on' : '') + '">' + x[1] + '<span class="count">' + items0.filter(x[2]).length + '</span></button>').join('');
          const fn = tabs.find((x) => x[0] === f.tab)[2];
          const items = items0.filter(fn).filter((t) => !q || (t.ref + ' ' + t.title + ' ' + ((dev(t.deviceId) || {}).tag || '')).toLowerCase().includes(q))
            .sort((a, b) => (a.status === 'resolved') - (b.status === 'resolved') || PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || b.createdAt.localeCompare(a.createdAt));
          list.innerHTML = ticketsTable(items);
        };
        tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { f.tab = b.dataset.t; draw(); } });
        bindFilters(root, { '#tk-q': ['q', f] }, draw);
        draw();
      }
    };
  }

  function ticketModal(pre) {
    pre = pre || {};
    const labsOpt = S.coll('labs').map((l) => ({ value: l.id, label: l.name }));
    const v = { labId: pre.labId || '', deviceId: pre.deviceId || '', priority: 'medium' };
    const devOpts = (labId) => '<option value="">بدون جهاز محدد (عطل عام في المعمل)</option>' + S.coll('devices').filter((d) => d.labId === labId && d.status !== 'retired').map((d) => '<option value="' + d.id + '"' + (d.id === v.deviceId ? ' selected' : '') + '>' + h(d.tag + ' · ' + d.name) + '</option>').join('');
    const fields = [
      { name: 'labId', label: 'المعمل', type: 'select', options: labsOpt, required: true, placeholder: 'اختر المعمل' },
      { name: 'priority', label: 'الأولوية', type: 'select', options: optsOf(TK_PRI), required: true },
      { name: 'deviceId', label: 'الجهاز', type: 'select', options: [], span: true },
      { name: 'title', label: 'وصف مختصر للعطل', required: true, span: true, placeholder: 'مثال: الشاشة لا تعرض صورة' },
      { name: 'description', label: 'التفاصيل', type: 'textarea', span: true, placeholder: 'متى بدأ العطل؟ ما الذي جربته؟' }
    ];
    U.modal({
      title: 'بلاغ عطل جديد', body: U.formGrid(fields, v) + '<p class="muted small">يصل البلاغ إلى مشرف المعمل مباشرة، ويتحول الجهاز إلى «في الصيانة» حتى يُحل.</p>', submitText: 'إرسال البلاغ',
      onOpen(form) {
        const labSel = form.querySelector('#f-labId'), devSel = form.querySelector('#f-deviceId');
        const fill = () => { devSel.innerHTML = devOpts(labSel.value); devSel.disabled = !labSel.value; };
        labSel.addEventListener('change', () => { v.deviceId = ''; fill(); });
        fill();
      },
      onSubmit(form) {
        const d = U.formData(form);
        if (!d.labId) return 'اختر المعمل.';
        if (!d.title) return 'اكتب وصفًا مختصرًا للعطل.';
        const l = lab(d.labId);
        const tk = { ref: S.nextTicketRef(), labId: d.labId, deviceId: d.deviceId || '', title: d.title, description: d.description || '', priority: d.priority, status: 'open', reporterId: me.id, assigneeId: l.supervisorId, createdAt: today(), resolvedAt: '' };
        S.upsert('tickets', tk, 'tk');
        const dv = dev(tk.deviceId);
        if (dv && dv.status === 'working') S.upsert('devices', Object.assign({}, dv, { status: tk.priority === 'urgent' ? 'broken' : 'maintenance' }));
        S.log(me.id, 'فتح بلاغ صيانة ' + tk.ref + ' «' + tk.title + '»');
        U.toast('تم إرسال البلاغ ' + tk.ref);
        setTimeout(render);
      }
    });
  }

  function ticketView(t) {
    const d = dev(t.deviceId);
    const can = managesLab(t.labId);
    let foot = '';
    if (can) {
      if (t.status === 'open') foot += '<button class="btn btn-primary" data-act="ticketStatus" data-id="' + t.id + '|in_progress">بدء المعالجة</button>';
      if (t.status !== 'resolved') foot += '<button class="btn btn-ok" data-act="ticketStatus" data-id="' + t.id + '|resolved">' + icon('check') + 'تم الحل</button>';
      if (t.status === 'resolved') foot += '<button class="btn" data-act="ticketStatus" data-id="' + t.id + '|open">' + icon('refresh') + 'إعادة فتح</button>';
    }
    const steps = [['open', 'استلام البلاغ'], ['in_progress', 'قيد المعالجة'], ['resolved', 'تم الحل']];
    const idx = steps.findIndex((s) => s[0] === t.status);
    U.modal({
      title: t.ref + ' · ' + t.title,
      body: '<div style="display:flex;gap:6px">' + steps.map((s, i) => '<div style="flex:1"><div class="meter" style="height:5px"><span style="width:' + (i <= idx ? 100 : 0) + '%"></span></div><div class="small ' + (i <= idx ? '' : 'muted') + '" style="margin-top:6px">' + s[1] + '</div></div>').join('') + '</div>' +
        '<dl class="dl"><dt>الأولوية</dt><dd>' + pill(TK_PRI, t.priority) + '</dd><dt>الحالة</dt><dd>' + pill(TK_STATUS, t.status) + '</dd><dt>المعمل</dt><dd>' + h(labName(t.labId)) + '</dd>' +
        '<dt>الجهاز</dt><dd>' + (d ? '<span class="tag">' + h(d.tag) + '</span> ' + h(d.name) + ' · ' + pill(DEV_STATUS, d.status) : 'عطل عام في المعمل') + '</dd>' +
        '<dt>المبلّغ</dt><dd>' + h(userName(t.reporterId)) + '</dd><dt>المسؤول</dt><dd>' + h(userName(t.assigneeId)) + '</dd>' +
        '<dt>تاريخ البلاغ</dt><dd>' + U.fmtDate(t.createdAt) + '</dd>' + (t.resolvedAt ? '<dt>تاريخ الحل</dt><dd>' + U.fmtDate(t.resolvedAt) + '</dd>' : '') +
        '<dt>التفاصيل</dt><dd>' + h(t.description || '—') + '</dd></dl>',
      extraFoot: foot
    });
  }
  function setTicketStatus(t, status) {
    const upd = Object.assign({}, t, { status, resolvedAt: status === 'resolved' ? today() : '' });
    S.upsert('tickets', upd);
    const d = dev(t.deviceId);
    if (d && status === 'resolved' && (d.status === 'maintenance' || d.status === 'broken')) {
      const stillOpen = S.coll('tickets').some((x) => x.id !== t.id && x.deviceId === d.id && x.status !== 'resolved');
      if (!stillOpen) S.upsert('devices', Object.assign({}, d, { status: 'working' }));
    }
    if (d && status === 'open' && d.status === 'working') S.upsert('devices', Object.assign({}, d, { status: 'maintenance' }));
    S.log(me.id, { in_progress: 'بدأ معالجة ', resolved: 'أغلق ', open: 'أعاد فتح ' }[status] + 'البلاغ ' + t.ref);
    U.toast({ in_progress: 'بدأت معالجة البلاغ', resolved: 'تم إغلاق البلاغ وإعادة الجهاز للخدمة', open: 'أعيد فتح البلاغ' }[status]);
    setTimeout(render);
  }

  /* ===== التقارير ===== */
  function viewReports() {
    const f = st.reports;
    const t = U.parseDate(today());
    let from, to;
    if (f.period === 'week') { from = iso(weekStart(t)); to = iso(addDays(weekStart(t), 6)); }
    else if (f.period === 'month') { from = iso(new Date(t.getFullYear(), t.getMonth(), 1)); to = iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)); }
    else if (f.period === '30') { from = iso(addDays(t, -29)); to = iso(t); }
    else { const ds = S.coll('bookings').map((b) => b.date).sort(); from = ds[0] || iso(t); to = ds[ds.length - 1] || iso(t); }
    const workdays = [];
    for (let d = U.parseDate(from); iso(d) <= to; d = addDays(d, 1)) if (d.getDay() <= 4) workdays.push(iso(d));
    const labs = S.coll('labs').filter((l) => isAdmin() || managesLab(l.id));
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
    const periods = [['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['30', 'آخر 30 يومًا'], ['all', 'كل الفترات']];

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
      card('أداء المعامل', 'الإشغال = الساعات المحجوزة ÷ ساعات الدوام · الامتلاء = متوسط الحضور ÷ السعة', '<div class="table-wrap"><table class="table"><thead><tr><th>المعمل</th><th>الحجوزات</th><th>الساعات</th><th>الإشغال</th><th>الامتلاء</th><th>البلاغات</th></tr></thead><tbody>' + rows + '</tbody></table></div>', '', true) + reqReport(from, to);
    return {
      title: 'التقارير', crumb: 'الإدارة', html,
      mount(root) { root.querySelector('#rp-period').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { f.period = b.dataset.p; render(); } }); }
    };
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
      card('مصفوفة الصلاحيات', '', '<div class="table-wrap"><table class="table"><thead><tr><th>الصلاحية</th><th>مدير النظام</th><th>مشرف معمل</th><th>عضو هيئة تدريس</th><th>طالب</th></tr></thead><tbody>' +
        [['عرض المعامل والجدول', 1, 1, 1, 1], ['طلب حجز معمل', 1, 1, 1, 1], ['تأكيد الحجز مباشرة', 1, 'معامله', 0, 0], ['الموافقة على الطلبات', 1, 'معامله', 0, 0], ['إدارة الأجهزة', 1, 'معامله', 0, 0], ['الإبلاغ عن عطل', 1, 1, 1, 1], ['معالجة البلاغات', 1, 'معامله', 0, 0], ['التقارير', 1, 'معامله', 0, 0], ['إضافة وحذف المعامل', 1, 0, 0, 0], ['الطلبات بين الأقسام: الإرسال', 1, 1, 1, 0], ['الطلبات بين الأقسام: البت في الوارد', 1, 'قسمه', 'رئيس القسم', 0], ['إدارة المستخدمين', 1, 0, 0, 0]]
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
      if (d) { S.upsert('devices', Object.assign({}, d, { labId: r.targetLabId })); extra = ' ونُقل الجهاز ' + d.tag + ' إلى ' + labName(r.targetLabId); }
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
    const rows = [['الرقم', 'العنوان', 'المعمل', 'الجهاز', 'الأولوية', 'الحالة', 'المبلّغ', 'تاريخ البلاغ', 'تاريخ الحل']];
    S.coll('tickets').filter((t) => isAdmin() || managesLab(t.labId)).forEach((t) => rows.push([t.ref, t.title, labName(t.labId), (dev(t.deviceId) || {}).tag || '', TK_PRI[t.priority][0], TK_STATUS[t.status][0], userName(t.reporterId), t.createdAt, t.resolvedAt]));
    U.download('maintenance-' + today() + '.csv', U.toCSV(rows), 'text/csv;charset=utf-8');
    U.toast('تم تصدير ' + (rows.length - 1) + ' بلاغًا');
  }

  /* ===== الإجراءات ===== */
  const VIEWS = { requests: () => viewRequests(''), dashboard: viewDashboard, labs: viewLabs, devices: viewDevices, schedule: viewSchedule, bookings: viewBookings, maintenance: viewMaintenance, reports: viewReports, users: viewUsers, settings: viewSettings };
  const withB = (fn) => (id) => { const b = S.byId('bookings', id); if (b) fn(b); };
  const ACTIONS = {
    logout() { S.log(me.id, 'سجّل الخروج'); S.session.clear(); me = null; location.hash = ''; render(); },
    openNav() { document.getElementById('shell').classList.add('nav-open'); },
    closeNav() { document.getElementById('shell').classList.remove('nav-open'); },
    toggleTheme() { S.prefs.set('theme', isDark() ? 'light' : 'dark'); render(); },
    toggleNotif(id, el) { const p = document.getElementById('notif-pop'); p.hidden = !p.hidden; el.setAttribute('aria-expanded', String(!p.hidden)); },
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
    viewDevice(id) { const d = dev(id); if (d) deviceView(d); },
    reportDevice(id) { const d = dev(id); if (d) ticketModal({ labId: d.labId, deviceId: d.id }); },
    deleteDevice(id) {
      const d = dev(id); if (!d) return;
      U.confirmDialog({ title: 'حذف الجهاز', danger: true, confirmText: 'حذف', message: 'حذف ' + d.name + ' (' + d.tag + ') من سجل الأجهزة؟ يبقى سجل الصيانة السابق محفوظًا.', onConfirm() { S.remove('devices', id); S.log(me.id, 'حذف الجهاز ' + d.tag); U.toast('تم حذف الجهاز'); setTimeout(render); } });
    },
    devicesCal() { Object.assign(st.devices, { status: 'cal', lab: '', type: '', q: '' }); go('devices'); },
    newTicket(id) { ticketModal({ labId: id }); },
    viewTicket(id) { const t = S.byId('tickets', id); if (t) ticketView(t); },
    ticketStatus(id) { const [tid, status] = id.split('|'); const t = S.byId('tickets', tid); if (t) setTicketStatus(t, status); },
    deleteTicket(id) {
      const t = S.byId('tickets', id); if (!t) return;
      U.confirmDialog({ title: 'حذف البلاغ ' + t.ref, danger: true, confirmText: 'حذف', message: 'سيتم حذف البلاغ «' + t.title + '» نهائيًا.', onConfirm() { S.remove('tickets', id); U.toast('تم حذف البلاغ'); setTimeout(render); } });
    },
    newUser() { userModal(); },
    editUser(id) { const u = user(id); if (u) userModal(u); },
    deleteUser(id) {
      const u = user(id); if (!u || u.id === me.id) return;
      U.confirmDialog({ title: 'حذف المستخدم', danger: true, confirmText: 'حذف', message: 'حذف حساب ' + u.name + '؟ تبقى حجوزاته وبلاغاته السابقة في السجل. يمكنك بدلًا من ذلك إيقاف الحساب.', onConfirm() { S.remove('users', id); S.log(me.id, 'حذف حساب ' + u.name); U.toast('تم حذف المستخدم'); setTimeout(render); } });
    },
    newDept() { deptModal(); },
    editDept(id) { const d = S.byId('departments', id); if (d) deptModal(d); },
    deleteDept(id) {
      const d = S.byId('departments', id); if (!d) return;
      U.confirmDialog({ title: 'حذف القسم', danger: true, confirmText: 'حذف', message: 'حذف قسم ' + d.name + '؟ تبقى الطلبات السابقة المرتبطة به في السجل.', onConfirm() { S.remove('departments', id); U.toast('تم حذف القسم'); setTimeout(render); } });
    },
    newRequest() { requestModal(); },
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
