#!/bin/bash
# Сборка APK: bash tools/build_apk.sh        (версия берётся из index.html: const V = '?v=NN')
# 1) автопрогон tools/autotest.py — если красный, APK не собирается;
# 2) в APK идёт то, что закоммичено (git archive HEAD), поэтому сначала коммит;
# 3) два файла в apk/: обычный и test-all-worlds (все 10 миров открыты).
# Проект сборки лежит рядом с игрой: ../hero-walk-apk (build.sh, AndroidManifest.xml, assets/www).
set -e
cd "$(dirname "$0")/.."
V=$(grep -o "const V = '?v=[0-9]*'" index.html | grep -o '[0-9]*')
[ -n "$V" ] || { echo "не нашёл версию в index.html"; exit 1; }
if [ -n "$(git status --porcelain)" ]; then echo "есть незакоммиченные правки — в APK они не попадут; сначала коммит"; git status --short; exit 1; fi
if [ "$1" != "--no-test" ]; then
  PYTHONIOENCODING=utf-8 python tools/autotest.py > tests_last.log 2>&1 || { tail -30 tests_last.log; rm -f tests_last.log; echo "АВТОПРОГОН КРАСНЫЙ — APK не собран (отчёт: tests/report_v$V/report.md)"; exit 1; }
  rm -f tests_last.log; echo "автопрогон зелёный"
fi
cd ../hero-walk-apk
sed -i -E "s/android:versionCode=\"[0-9]+\"/android:versionCode=\"$V\"/; s/android:versionName=\"1\.0\.[0-9]+\"/android:versionName=\"1.0.$V\"/" AndroidManifest.xml
rm -rf assets/www && mkdir -p assets/www
(cd ../hero-walk && git archive HEAD) | tar -x -C assets/www
rm -rf assets/www/apk assets/www/tests
bash build.sh ../hero-walk/apk/DuelArena-v$V.apk > /tmp/apk_a.log 2>&1 || { tail -20 /tmp/apk_a.log; exit 1; }
sed -i 's#<head>#<head><script>window.ALL_WORLDS=1</script>#' assets/www/index.html
bash build.sh ../hero-walk/apk/DuelArena-v$V-test-all-worlds.apk > /tmp/apk_b.log 2>&1 || { tail -20 /tmp/apk_b.log; exit 1; }
ls -la ../hero-walk/apk/ | grep "v$V"
