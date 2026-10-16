#!/usr/bin/env sh
# تشغيل المنصة على http://localhost:8080
cd "$(dirname "$0")"
URL="http://localhost:8080"
( sleep 1; (command -v xdg-open >/dev/null && xdg-open "$URL") || (command -v open >/dev/null && open "$URL") ) >/dev/null 2>&1 &
if command -v python3 >/dev/null; then python3 -m http.server 8080
elif command -v npx >/dev/null; then npx --yes serve -l 8080 .
else echo "افتح الملف index.html مباشرة في المتصفح"; fi
