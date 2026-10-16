/* أدوات الواجهة: الأيقونات، التنسيق، النوافذ، التنبيهات، والرسوم البيانية */
(function () {
  'use strict';

  const P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    flask: '<path d="M9 3h6"/><path d="M10 3v6.5L4.6 18.2A1.8 1.8 0 0 0 6.1 21h11.8a1.8 1.8 0 0 0 1.5-2.8L14 9.5V3"/><path d="M7.5 15h9"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    grid: '<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M3 9.5h18M9 9.5v12M15 9.5v12M3 15.5h18"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    logout: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    chevronL: '<path d="M15 18l-6-6 6-6"/>',
    chevronR: '<path d="M9 18l6-6-6-6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    gauge: '<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/><circle cx="12" cy="14" r="1.5"/>',
    map: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M14 9l2 2"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  }

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s) => { if (!s) return '—'; const d = parseDate(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
  const fmtDay = (s) => { const d = parseDate(s); return DAYS[d.getDay()] + '، ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; };
  const fmtTime = (t) => {
    if (!t) return '';
    let [hh, mm] = t.split(':').map(Number);
    const suffix = hh < 12 ? 'ص' : 'م';
    hh = hh % 12 || 12;
    return hh + ':' + String(mm).padStart(2, '0') + '\u00a0' + suffix;
  };
  const toMin = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
  const fmtNum = (n) => Number(n).toLocaleString('en-US');
  function timeAgo(isoStr) {
    const diff = (Date.now() - new Date(isoStr).getTime()) / 60000;
    if (diff < 1) return 'الآن';
    if (diff < 60) return 'قبل ' + Math.round(diff) + ' دقيقة';
    if (diff < 1440) { const hrs = Math.round(diff / 60); return hrs === 1 ? 'قبل ساعة' : hrs === 2 ? 'قبل ساعتين' : 'قبل ' + hrs + ' ساعات'; }
    const days = Math.round(diff / 1440);
    return days === 1 ? 'أمس' : days === 2 ? 'قبل يومين' : 'قبل ' + days + ' أيام';
  }
  const initials = (name) => {
    const parts = String(name).replace(/^(د\.|م\.|أ\.)\s*/, '').split(/\s+/);
    return (parts[0] || '').charAt(0) + (parts[1] ? parts[1].charAt(0) : '');
  };

  /* ===== التنبيهات المنبثقة ===== */
  function toast(msg, type) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'ok');
    el.setAttribute('role', 'status');
    el.innerHTML = icon(type === 'bad' ? 'alert' : 'check') + '<span>' + h(msg) + '</span>';
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => el.remove(), 3000);
  }

  /* ===== النوافذ ===== */
  let lastFocus = null;
  function closeModal() {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    document.removeEventListener('keydown', escHandler);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function escHandler(e) { if (e.key === 'Escape') closeModal(); }

  /* opts: { title, body (html), size, submitText, submitClass, onSubmit(form) -> string|void (نص الخطأ), extraFoot (html), onOpen(el) } */
  function modal(opts) {
    lastFocus = document.activeElement;
    const root = document.getElementById('modal-root');
    const hasForm = typeof opts.onSubmit === 'function';
    root.innerHTML =
      '<div class="modal-backdrop" data-close>' +
      '<' + (hasForm ? 'form novalidate' : 'div') + ' class="modal ' + (opts.size || '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<div class="modal-head"><h3 id="modal-title">' + h(opts.title) + '</h3><button type="button" class="icon-btn" data-close aria-label="إغلاق">' + icon('x') + '</button></div>' +
      '<div class="modal-body"><div class="form-error" hidden></div>' + opts.body + '</div>' +
      '<div class="modal-foot">' +
      (hasForm ? '<button type="submit" class="btn ' + (opts.submitClass || 'btn-primary') + '">' + h(opts.submitText || 'حفظ') + '</button>' : '') +
      '<button type="button" class="btn" data-close>' + (hasForm ? 'إلغاء' : 'إغلاق') + '</button>' +
      (opts.extraFoot ? '<span class="push"></span>' + opts.extraFoot : '') +
      '</div></' + (hasForm ? 'form' : 'div') + '></div>';
    const back = root.firstElementChild;
    const box = back.firstElementChild;
    back.addEventListener('mousedown', (e) => { if (e.target === back) closeModal(); });
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    document.addEventListener('keydown', escHandler);
    if (hasForm) {
      box.addEventListener('submit', (e) => {
        e.preventDefault();
        const err = opts.onSubmit(box);
        const errEl = box.querySelector('.form-error');
        if (err) {
          errEl.innerHTML = icon('alert') + '<span>' + h(err) + '</span>';
          errEl.hidden = false;
          errEl.scrollIntoView({ block: 'nearest' });
        } else closeModal();
      });
    }
    if (opts.onOpen) opts.onOpen(box);
    const first = box.querySelector('input:not([type=hidden]), select, textarea');
    if (first) first.focus(); else box.querySelector('[data-close]').focus();
    return box;
  }

  function confirmDialog(opts) {
    modal({
      title: opts.title || 'تأكيد',
      size: 'sm',
      body: '<p>' + h(opts.message) + '</p>',
      submitText: opts.confirmText || 'تأكيد',
      submitClass: opts.danger ? 'btn-danger' : 'btn-primary',
      onSubmit: () => { opts.onConfirm(); }
    });
  }

  /* ===== بناء الحقول ===== */
  function field(f, value) {
    const id = 'f-' + f.name;
    const v = value ?? f.value ?? '';
    const req = f.required ? ' required' : '';
    let control;
    if (f.type === 'select') {
      control = '<select class="select" id="' + id + '" name="' + f.name + '"' + req + '>' +
        (f.placeholder ? '<option value="">' + h(f.placeholder) + '</option>' : '') +
        f.options.map((o) => '<option value="' + h(o.value) + '"' + (String(o.value) === String(v) ? ' selected' : '') + '>' + h(o.label) + '</option>').join('') +
        '</select>';
    } else if (f.type === 'textarea') {
      control = '<textarea class="textarea" id="' + id + '" name="' + f.name + '"' + req + ' placeholder="' + h(f.placeholder || '') + '">' + h(v) + '</textarea>';
    } else {
      control = '<input class="input' + (f.ltr ? ' ltr' : '') + '" id="' + id + '" name="' + f.name + '" type="' + (f.type || 'text') + '" value="' + h(v) + '"' + req +
        (f.min !== undefined ? ' min="' + f.min + '"' : '') + (f.max !== undefined ? ' max="' + f.max + '"' : '') + (f.step ? ' step="' + f.step + '"' : '') +
        ' placeholder="' + h(f.placeholder || '') + '" autocomplete="' + (f.autocomplete || 'off') + '">';
    }
    return '<div class="field' + (f.span ? ' span-2' : '') + '"><label for="' + id + '">' + h(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>' + control + (f.hint ? '<span class="hint">' + h(f.hint) + '</span>' : '') + '</div>';
  }
  function formGrid(fields, values) { return '<div class="form-grid">' + fields.map((f) => field(f, values ? values[f.name] : undefined)).join('') + '</div>'; }
  function formData(form) {
    const out = {};
    new FormData(form).forEach((v, k) => { out[k] = typeof v === 'string' ? v.trim() : v; });
    return out;
  }

  /* ===== الرسوم البيانية ===== */
  function donut(segments, centerLabel, centerSub) {
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    const r = 60, c = 2 * Math.PI * r;
    let off = 0;
    const arcs = segments.filter((s) => s.value > 0).map((s) => {
      const len = (s.value / total) * c;
      const gap = segments.filter((x) => x.value > 0).length > 1 ? 2 : 0;
      const el = '<circle cx="80" cy="80" r="' + r + '" fill="none" style="stroke:' + s.color + '" stroke-width="20" stroke-dasharray="' + Math.max(len - gap, 0) + ' ' + (c - Math.max(len - gap, 0)) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 80 80)"/>';
      off += len;
      return el;
    }).join('');
    const legend = segments.map((s) => '<div><i style="background:' + s.color + '"></i><span>' + h(s.label) + '</span><b>' + s.value + '</b></div>').join('');
    return '<div class="donut-wrap"><svg class="donut" viewBox="0 0 160 160" role="img" aria-label="' + h(centerSub) + '">' +
      '<circle cx="80" cy="80" r="' + r + '" fill="none" style="stroke:var(--surface-2)" stroke-width="20"/>' + arcs +
      '<text x="80" y="80" text-anchor="middle" font-size="30" font-weight="600" dominant-baseline="central">' + h(centerLabel) + '</text>' +
      '<text x="80" y="106" text-anchor="middle" font-size="11" style="fill:var(--muted)">' + h(centerSub) + '</text>' +
      '</svg><div class="legend">' + legend + '</div></div>';
  }

  /* items: [{label, value, hi}] */
  function columns(items, opts) {
    opts = opts || {};
    const W = 640, H = 220, padT = 22, padB = 30, padX = 34;
    const max = Math.max(1, ...items.map((i) => i.value));
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const innerH = H - padT - padB, innerW = W - padX - 8;
    const bw = innerW / items.length;
    let grid = '';
    for (let v = 0; v <= top; v += step) {
      const y = padT + innerH - (v / top) * innerH;
      grid += '<line class="grid-l" x1="' + padX + '" x2="' + (W - 8) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (padX - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + v + '</text>';
    }
    const bars = items.map((it, i) => {
      // المحور يبدأ من اليمين ليناسب القراءة العربية
      const x = W - 8 - (i + 1) * bw + bw * 0.2;
      const bh = (it.value / top) * innerH;
      const y = padT + innerH - bh;
      return '<rect class="bar' + (it.hi ? ' today' : '') + '" x="' + x + '" y="' + y + '" width="' + bw * 0.6 + '" height="' + Math.max(bh, 0) + '" rx="3"/>' +
        (it.value ? '<text class="val" x="' + (x + bw * 0.3) + '" y="' + (y - 6) + '" text-anchor="middle">' + it.value + '</text>' : '') +
        '<text x="' + (x + bw * 0.3) + '" y="' + (H - 10) + '" text-anchor="middle">' + h(it.label) + '</text>';
    }).join('');
    return '<svg class="colchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + h(opts.label || '') + '">' + grid + bars + '</svg>';
  }
  function niceStep(max) {
    const raw = max / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag);
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function toCSV(rows) {
    return '﻿' + rows.map((r) => r.map((c) => {
      const s = String(c ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\r\n');
  }

  window.UI = { icon, h, toast, modal, closeModal, confirmDialog, field, formGrid, formData, donut, columns, download, toCSV, fmtDate, fmtDay, fmtTime, fmtNum, toMin, timeAgo, initials, parseDate, DAYS, MONTHS };
})();
