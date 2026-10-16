/* مخزن البيانات: يحفظ كل شيء في متصفح الجهاز (localStorage) مع بيانات تجريبية جاهزة للعرض */
(function () {
  'use strict';

  const KEY = 'labms.data.v1';
  const SESSION_KEY = 'labms.session.v1';
  const memory = {};

  function readRaw(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return memory[k] ?? null; }
  }
  function writeRaw(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) { memory[k] = v; }
  }
  function removeRaw(k) {
    try { window.localStorage.removeItem(k); } catch (e) { delete memory[k]; }
  }

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-4);

  /* بداية أسبوع الدراسة (الأحد) */
  /* يوما الجمعة والسبت يعرضان الأسبوع الدراسي القادم */
  function weekStart(d) {
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    if (x.getDay() >= 5) x.setDate(x.getDate() + (7 - x.getDay()));
    else x.setDate(x.getDate() - x.getDay());
    return x;
  }
  const isWorkday = (d) => d.getDay() <= 4;
  /* يوم العمل رقم n بدءًا من اليوم (0 = اليوم إن كان يوم عمل) */
  function workday(from, n) {
    let d = new Date(from); d.setHours(0, 0, 0, 0);
    while (!isWorkday(d)) d = addDays(d, 1);
    for (let i = 0; i < n; i++) { d = addDays(d, 1); while (!isWorkday(d)) d = addDays(d, 1); }
    return d;
  }

  function seed() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ws = weekStart(today);

    const users = [
      { id: 'u1', name: 'م. فهد العتيبي', username: 'admin', password: 'admin123', role: 'admin', email: 'f.alotaibi@lab.local', phone: '0501234567', dept: 'تقنية المعلومات', active: true },
      { id: 'u2', name: 'أ. نورة الشمري', username: 'supervisor', password: 'super123', role: 'supervisor', email: 'n.alshammari@lab.local', phone: '0552345678', dept: 'علوم الحاسب', active: true },
      { id: 'u3', name: 'د. خالد الحربي', username: 'faculty', password: 'faculty123', role: 'faculty', email: 'k.alharbi@lab.local', phone: '0533456789', dept: 'الفيزياء', active: true },
      { id: 'u4', name: 'سارة القحطاني', username: 'student', password: 'student123', role: 'student', email: 's.alqahtani@lab.local', phone: '0544567890', dept: 'هندسة البرمجيات', active: true },
      { id: 'u5', name: 'أ. ماجد الدوسري', username: 'majed', password: 'majed123', role: 'supervisor', email: 'm.aldosari@lab.local', phone: '0565678901', dept: 'الكيمياء', active: true },
      { id: 'u6', name: 'د. ريم الزهراني', username: 'reem', password: 'reem123', role: 'faculty', email: 'r.alzahrani@lab.local', phone: '0596789012', dept: 'علوم الحاسب', active: true },
      { id: 'u7', name: 'عبدالله المطيري', username: 'abdullah', password: 'abd123', role: 'student', email: 'a.almutairi@lab.local', phone: '0507890123', dept: 'الهندسة الكهربائية', active: true },
      { id: 'u8', name: 'د. هند السبيعي', username: 'hind', password: 'hind123', role: 'faculty', email: 'h.alsubaie@lab.local', phone: '0558901234', dept: 'الكيمياء', active: false }
    ];

    const labs = [
      { id: 'L1', code: 'CS-101', name: 'معمل الحاسب الآلي 1', type: 'computer', building: 'مبنى 7', room: '1.14', capacity: 30, supervisorId: 'u2', status: 'active', open: '08:00', close: '20:00', description: 'معمل تدريس البرمجة وقواعد البيانات، مجهز بثلاثين جهازًا وشاشة عرض تفاعلية.' },
      { id: 'L2', code: 'NET-204', name: 'معمل الشبكات', type: 'network', building: 'مبنى 7', room: '2.04', capacity: 24, supervisorId: 'u2', status: 'active', open: '08:00', close: '18:00', description: 'تجهيزات سيسكو للتوجيه والتبديل وتمارين أمن الشبكات.' },
      { id: 'L3', code: 'PHY-110', name: 'معمل الفيزياء العامة', type: 'physics', building: 'مبنى 3', room: '1.10', capacity: 20, supervisorId: 'u5', status: 'active', open: '08:00', close: '16:00', description: 'تجارب الميكانيكا والبصريات والكهرباء لطلاب السنة التحضيرية.' },
      { id: 'L4', code: 'CHE-305', name: 'معمل الكيمياء التحليلية', type: 'chemistry', building: 'مبنى 3', room: '3.05', capacity: 16, supervisorId: 'u5', status: 'active', open: '08:00', close: '15:00', description: 'أجهزة تحليل طيفي وموازين دقيقة وخزانات أبخرة.' },
      { id: 'L5', code: 'EE-220', name: 'معمل الإلكترونيات الرقمية', type: 'electronics', building: 'مبنى 9', room: '2.20', capacity: 18, supervisorId: 'u2', status: 'active', open: '08:00', close: '18:00', description: 'محطات لحام وراسمات إشارة ولوحات FPGA للتصميم الرقمي.' },
      { id: 'L6', code: 'AI-301', name: 'معمل الذكاء الاصطناعي', type: 'computer', building: 'مبنى 7', room: '3.01', capacity: 25, supervisorId: 'u2', status: 'maintenance', open: '08:00', close: '20:00', description: 'خوادم GPU لتدريب النماذج. مغلق مؤقتًا لتحديث وحدات التكييف.' }
    ];

    const devices = [];
    let n = 0;
    const push = (labId, prefix, count, base) => {
      for (let i = 1; i <= count; i++) {
        n++;
        devices.push(Object.assign({
          id: 'd' + n,
          tag: prefix + '-' + pad(i),
          labId: labId,
          status: 'working',
          purchaseDate: iso(addDays(today, -400 - n * 9)),
          warrantyEnd: iso(addDays(today, 300 - n * 13)),
          calibrationDue: '',
          notes: ''
        }, base, typeof base.serial === 'function' ? { serial: base.serial(i) } : {}));
      }
    };
    push('L1', 'CS101-PC', 6, { name: 'حاسب مكتبي', type: 'computer', model: 'Dell OptiPlex 7010', serial: (i) => 'DL7010' + (4810 + i) });
    push('L1', 'CS101-PJ', 1, { name: 'شاشة عرض تفاعلية', type: 'display', model: 'Epson EB-735Fi', serial: () => 'EPS735F09' });
    push('L2', 'NET204-RT', 4, { name: 'موجّه شبكي', type: 'network', model: 'Cisco ISR 4331', serial: (i) => 'FDO2213A' + (10 + i) });
    push('L2', 'NET204-SW', 3, { name: 'مبدّل شبكي', type: 'network', model: 'Cisco Catalyst 2960-X', serial: (i) => 'FOC1932B' + (20 + i) });
    push('L3', 'PHY110-OS', 3, { name: 'راسم إشارة', type: 'instrument', model: 'Tektronix TBS1102C', serial: (i) => 'C0' + (21400 + i), calibrationDue: iso(addDays(today, 5)) });
    push('L3', 'PHY110-LS', 2, { name: 'جهاز ليزر هيليوم-نيون', type: 'instrument', model: 'Thorlabs HNL050L', serial: (i) => 'M00' + (6620 + i) });
    push('L4', 'CHE305-SP', 2, { name: 'مطياف الأشعة فوق البنفسجية', type: 'instrument', model: 'Shimadzu UV-1900i', serial: (i) => 'A1165' + (3300 + i), calibrationDue: iso(addDays(today, -3)) });
    push('L4', 'CHE305-BL', 3, { name: 'ميزان تحليلي', type: 'instrument', model: 'Mettler Toledo ME204', serial: (i) => 'B9' + (44120 + i), calibrationDue: iso(addDays(today, 24)) });
    push('L5', 'EE220-OS', 4, { name: 'راسم إشارة رقمي', type: 'instrument', model: 'Rigol DS1054Z', serial: (i) => 'DS1ZA2' + (31200 + i), calibrationDue: iso(addDays(today, 60)) });
    push('L5', 'EE220-FG', 2, { name: 'لوحة FPGA', type: 'electronics', model: 'Digilent Basys 3', serial: (i) => 'BS3-' + (7700 + i) });
    push('L6', 'AI301-GPU', 2, { name: 'خادم معالجات رسومية', type: 'server', model: 'NVIDIA DGX Station A100', serial: (i) => 'DGXA' + (100 + i) });
    push('L6', 'AI301-PR', 1, { name: 'طابعة ثلاثية الأبعاد', type: 'other', model: 'Prusa MK4', serial: () => 'PRMK4-2231' });

    // بعض الحالات المتنوعة للعرض
    const setStatus = (tag, status, notes) => { const d = devices.find((x) => x.tag === tag); if (d) { d.status = status; d.notes = notes || ''; } };
    setStatus('CS101-PC-04', 'maintenance', 'تبديل وحدة التخزين');
    setStatus('NET204-RT-03', 'broken', 'منفذ GigabitEthernet0/0/1 لا يعمل');
    setStatus('CHE305-SP-02', 'maintenance', 'بانتظار المعايرة الدورية');
    setStatus('AI301-GPU-02', 'retired', 'مستبدل بخادم أحدث');

    const courses = {
      L1: [['برمجة 1 (CS 111)', 'u6', 28], ['قواعد البيانات (CS 340)', 'u6', 26], ['تطوير الويب (SWE 312)', 'u6', 22], ['هياكل البيانات (CS 212)', 'u6', 27], ['ساعات مكتبية مفتوحة', 'u2', 15]],
      L2: [['شبكات الحاسب (NET 241)', 'u6', 20], ['أمن الشبكات (NET 450)', 'u6', 18], ['تحضير شهادة CCNA', 'u2', 12]],
      L3: [['فيزياء عامة 1 (PHYS 101)', 'u3', 20], ['البصريات (PHYS 230)', 'u3', 14], ['فيزياء عامة 2 (PHYS 102)', 'u3', 19]],
      L4: [['كيمياء تحليلية (CHEM 305)', 'u5', 15], ['كيمياء عامة (CHEM 101)', 'u5', 16]],
      L5: [['التصميم الرقمي (EE 220)', 'u3', 16], ['مشروع تخرج - فريق الروبوت', 'u7', 6], ['الدوائر الكهربائية (EE 201)', 'u3', 18]]
    };
    const density = { L1: 8, L2: 6, L3: 6, L4: 5, L5: 6 };
    const slots = [['08:00', '09:40'], ['10:00', '11:40'], ['12:30', '14:10'], ['14:30', '16:10'], ['16:20', '18:00'], ['18:15', '19:55']];
    const bookings = [];
    let b = 0;
    const tISO = iso(today);
    for (let w = -3; w <= 1; w++) {
      for (let day = 0; day < 5; day++) {
        const date = iso(addDays(ws, w * 7 + day));
        Object.keys(courses).forEach((labId, li) => {
          const lab = labs.find((l) => l.id === labId);
          slots.forEach((s, si) => {
            if (s[1] > lab.close) return;
            if (((li * 7 + day * 3 + si * 5 + (w + 3) * 2) % 10) >= density[labId]) return;
            const c = courses[labId][(day + si) % courses[labId].length];
            b++;
            const future = date >= tISO;
            bookings.push({
              id: 'b' + b, labId, title: c[0], userId: c[1], date, start: s[0], end: s[1], attendees: Math.min(c[2], lab.capacity),
              status: future && b % 11 === 0 ? 'pending' : 'approved', notes: '', createdAt: iso(addDays(new Date(date + 'T00:00'), -7))
            });
          });
        });
      }
    }
    // طلبات إضافية لعرض سير الموافقة، توضع في أول فترة فارغة من اليوم
    const toM = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
    const toT = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
    function freeSlot(labId, date, len) {
      const lab = labs.find((l) => l.id === labId);
      const taken = bookings.filter((x) => x.labId === labId && x.date === date && x.status !== 'rejected').map((x) => [toM(x.start), toM(x.end)]);
      for (let m = toM(lab.open); m + len <= toM(lab.close); m += 10) {
        if (!taken.some((r) => r[0] < m + len && m < r[1])) return [toT(m), toT(m + len)];
      }
      return null;
    }
    [
      ['L1', 'ورشة بايثون لنادي البرمجة', 'u4', 2, 120, 25, 'pending', 'نحتاج تثبيت Anaconda على الأجهزة'],
      ['L5', 'اختبار عملي - التصميم الرقمي', 'u3', 3, 90, 16, 'pending', ''],
      ['L2', 'تجهيز مسابقة الأمن السيبراني', 'u7', 1, 120, 12, 'pending', 'نحتاج شبكة معزولة عن الإنترنت'],
      ['L3', 'تجربة قياس الطول الموجي', 'u7', 1, 60, 4, 'rejected', '']
    ].forEach((x) => {
      const date = iso(workday(today, x[3]));
      const fs = freeSlot(x[0], date, x[4]);
      if (!fs) return;
      bookings.push({ id: 'b' + (++b), labId: x[0], title: x[1], userId: x[2], date, start: fs[0], end: fs[1], attendees: x[5], status: x[6], notes: x[7], reason: x[6] === 'rejected' ? 'يتعارض مع جدول المعايرة الدورية للأجهزة' : '', createdAt: iso(today) });
    });

    const tickets = [
      { id: 't1', ref: 'MT-1042', deviceId: devices.find((d) => d.tag === 'NET204-RT-03').id, labId: 'L2', title: 'منفذ الموجّه لا يستجيب', description: 'المنفذ Gi0/0/1 لا يعطي إشارة رغم تغيير الكابل.', priority: 'high', status: 'open', reporterId: 'u6', assigneeId: 'u2', createdAt: iso(addDays(today, -2)), resolvedAt: '' },
      { id: 't2', ref: 'MT-1041', deviceId: devices.find((d) => d.tag === 'CS101-PC-04').id, labId: 'L1', title: 'الجهاز بطيء جدًا عند الإقلاع', description: 'فحص SMART يظهر قطاعات تالفة في القرص.', priority: 'medium', status: 'in_progress', reporterId: 'u4', assigneeId: 'u2', createdAt: iso(addDays(today, -4)), resolvedAt: '' },
      { id: 't3', ref: 'MT-1040', deviceId: devices.find((d) => d.tag === 'CHE305-SP-02').id, labId: 'L4', title: 'قراءات المطياف غير مستقرة', description: 'انحراف في خط الأساس يتجاوز 0.005 Abs.', priority: 'urgent', status: 'in_progress', reporterId: 'u5', assigneeId: 'u5', createdAt: iso(addDays(today, -1)), resolvedAt: '' },
      { id: 't4', ref: 'MT-1039', deviceId: '', labId: 'L6', title: 'تحديث وحدات التكييف', description: 'درجة حرارة الغرفة تتجاوز 27°م أثناء التدريب على الخوادم.', priority: 'high', status: 'in_progress', reporterId: 'u2', assigneeId: 'u1', createdAt: iso(addDays(today, -6)), resolvedAt: '' },
      { id: 't5', ref: 'MT-1038', deviceId: devices.find((d) => d.tag === 'CS101-PJ-01').id, labId: 'L1', title: 'شاشة العرض لا تتصل لاسلكيًا', description: '', priority: 'low', status: 'resolved', reporterId: 'u6', assigneeId: 'u2', createdAt: iso(addDays(today, -9)), resolvedAt: iso(addDays(today, -8)) },
      { id: 't6', ref: 'MT-1037', deviceId: devices.find((d) => d.tag === 'EE220-OS-02').id, labId: 'L5', title: 'مجس القناة الثانية مكسور', description: 'تم استبدال المجس بمجس احتياطي.', priority: 'medium', status: 'resolved', reporterId: 'u7', assigneeId: 'u2', createdAt: iso(addDays(today, -14)), resolvedAt: iso(addDays(today, -12)) }
    ];

    const activity = [
      { id: uid('a'), at: new Date(today.getTime() + 9.5 * 3600e3).toISOString(), userId: 'u4', text: 'أرسلت طلب حجز «ورشة بايثون لنادي البرمجة» في معمل الحاسب الآلي 1' },
      { id: uid('a'), at: new Date(today.getTime() + 8.2 * 3600e3).toISOString(), userId: 'u5', text: 'فتح بلاغ صيانة MT-1040 لمطياف الأشعة فوق البنفسجية' },
      { id: uid('a'), at: addDays(today, -1).toISOString(), userId: 'u2', text: 'رفضت طلب حجز «تجربة قياس الطول الموجي»' },
      { id: uid('a'), at: addDays(today, -2).toISOString(), userId: 'u6', text: 'أبلغت عن عطل في الموجّه NET204-RT-03' },
      { id: uid('a'), at: addDays(today, -6).toISOString(), userId: 'u1', text: 'غيّر حالة معمل الذكاء الاصطناعي إلى «تحت الصيانة»' }
    ];

    return { version: 1, seededAt: new Date().toISOString(), users, labs, devices, bookings, tickets, activity, counters: { ticket: 1042 } };
  }

  let data = null;
  function load() {
    const raw = readRaw(KEY);
    if (raw) {
      try { data = JSON.parse(raw); } catch (e) { data = null; }
    }
    if (!data || !Array.isArray(data.labs)) { data = seed(); save(); }
    return data;
  }
  function save() { writeRaw(KEY, JSON.stringify(data)); }
  function reset() { data = seed(); save(); return data; }

  function importJSON(text) {
    const obj = JSON.parse(text);
    const need = ['users', 'labs', 'devices', 'bookings', 'tickets'];
    for (const k of need) if (!Array.isArray(obj[k])) throw new Error('الملف لا يحتوي على «' + k + '»');
    obj.activity = obj.activity || [];
    obj.counters = obj.counters || { ticket: 1000 + obj.tickets.length };
    data = obj; save();
  }

  const coll = (name) => data[name];
  const byId = (name, id) => data[name].find((x) => x.id === id);

  function upsert(name, item, prefix) {
    if (!item.id) { item.id = uid(prefix || name[0]); data[name].push(item); }
    else {
      const i = data[name].findIndex((x) => x.id === item.id);
      if (i >= 0) data[name][i] = Object.assign({}, data[name][i], item); else data[name].push(item);
    }
    save();
    return byId(name, item.id);
  }
  function remove(name, id) { data[name] = data[name].filter((x) => x.id !== id); save(); }

  function log(userId, text) {
    data.activity.unshift({ id: uid('a'), at: new Date().toISOString(), userId, text });
    data.activity = data.activity.slice(0, 200);
    save();
  }
  function nextTicketRef() { data.counters.ticket = (data.counters.ticket || 1000) + 1; save(); return 'MT-' + data.counters.ticket; }

  const session = {
    get() { return readRaw(SESSION_KEY); },
    set(id) { writeRaw(SESSION_KEY, id); },
    clear() { removeRaw(SESSION_KEY); }
  };
  const prefs = {
    get(k, d) { const v = readRaw('labms.pref.' + k); return v === null ? d : v; },
    set(k, v) { writeRaw('labms.pref.' + k, v); }
  };

  window.Store = { load, save, reset, importJSON, coll, byId, upsert, remove, log, nextTicketRef, session, prefs, util: { iso, addDays, pad, uid, weekStart, workday, isWorkday }, get data() { return data; } };
})();
