#!/usr/bin/env sh
# تشغيل الخادم على http://localhost:3000
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo "Node.js غير مثبت. ثبّت Node.js 24 من https://nodejs.org أو افتح index.html للعرض بدون خادم"; exit 1
fi
( sleep 1; (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) || (command -v open >/dev/null && open http://localhost:3000) ) >/dev/null 2>&1 &
exec node server.js
