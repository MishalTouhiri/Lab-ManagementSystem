/* نقطة التشغيل: node server.js */
'use strict';
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error('يحتاج النظام Node.js 22.5 أو أحدث (يفضل 24 LTS). الإصدار الحالي: ' + process.versions.node);
  process.exit(1);
}
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.warn(w); });
process.env.LABMS_AUTOSTART = '1';
require('./server/index.js');
