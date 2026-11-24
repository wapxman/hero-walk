#!/bin/bash
# Сборка APK: bash tools/build_apk.sh        (версия берётся из index.html: const V = '?v=NN')
# 1) автопрогон tools/autotest.py, проверки волны 100 (wave100_check.py), роликов (cine_check.py), уровней и крюка (level_check.py) — если красные, APK не собирается;
# 2) в APK идёт то, что закоммичено (git archive HEAD), поэтому сначала коммит;
# 3) три файла в apk/: обычный, test-all-worlds (все 10 миров открыты) и test-levels (мир 1 с выбором уровня сложности, v117);
# 4) с ключом --play — ещё и AAB для Google Play: apk/play/game-vNN.aab (не выкладывается, только собирается).
# Проект сборки лежит рядом с игрой: ../hero-walk-apk (build.sh, AndroidManifest.xml, gamedata/src/main/assets/www).
set -e
cd "$(dirname "$0")/.."
V=$(grep -o "const V = '?v=[0-9]*'" index.html | grep -o '[0-9]*')
[ -n "$V" ] || { echo "не нашёл версию в index.html"; exit 1; }
if [ -n "$(git status --porcelain)" ]; then echo "есть незакоммиченные правки — в APK они не попадут; сначала коммит"; git status --short; exit 1; fi
if [ "$1" != "--no-test" ]; then
  PYTHONIOENCODING=utf-8 python tools/autotest.py > tests_last.log 2>&1 || { tail -30 tests_last.log; rm -f tests_last.log; echo "АВТОПРОГОН КРАСНЫЙ — APK не собран (отчёт: tests/report_v$V/report.md)"; exit 1; }
  rm -f tests_last.log; echo "автопрогон зелёный"
  # v115: волна 100 и финальный босс стартуют (сайт, приложение с рекламой и с молчащей рекламой, вход через «Продолжить»)
  PYTHONIOENCODING=utf-8 python tools/wave100_check.py > tests_w100.log 2>&1 || { cat tests_w100.log; rm -f tests_w100.log; echo "ПРОВЕРКА ВОЛНЫ 100 КРАСНАЯ — APK не собран"; exit 1; }
  rm -f tests_w100.log; echo "волна 100 стартует"
  # v116: ролики книги — вступление, 10 миров, финал: идут, со звуком, пропускаются касанием, после ролика бой стартует (нужен обычный Chrome)
  PYTHONIOENCODING=utf-8 python tools/cine_check.py > tests_cine.log 2>&1 || { grep -a "НЕТ\|ИТОГ\|Error" tests_cine.log | cut -c1-300; rm -f tests_cine.log; echo "ПРОВЕРКА РОЛИКОВ КРАСНАЯ — APK не собран"; exit 1; }
  rm -f tests_cine.log; echo "ролики идут"
  # v117: уровни сложности, тестовая сборка мира 1 с выбором уровня, крюк мясника
  PYTHONIOENCODING=utf-8 python tools/level_check.py > tests_lv.log 2>&1 || { grep -a "НЕТ\|ИТОГ\|Error" tests_lv.log | cut -c1-300; rm -f tests_lv.log; echo "ПРОВЕРКА УРОВНЕЙ КРАСНАЯ — APK не собран"; exit 1; }
  rm -f tests_lv.log; echo "уровни и крюк в порядке"
  # v119: мана, 20 уровней умений и рывка, 12 слотов, босс мира 5, цифры урона; умения героев видны; ролики идут с начала и до конца
  for t in v119_check v120_check fx_check cine_full; do
    PYTHONIOENCODING=utf-8 python tools/$t.py > tests_x.log 2>&1 || { grep -a "НЕТ\|ИТОГ\|Error" tests_x.log | cut -c1-300; rm -f tests_x.log; echo "ПРОВЕРКА $t КРАСНАЯ — APK не собран"; exit 1; }
    rm -f tests_x.log; echo "$t: в порядке"
  done
fi
cd ../hero-walk-apk
W=gamedata/src/main/assets/www   # файлы игры для APK и для набора Google Play
# с v107 сборка идёт через Gradle (реклама AdMob и покупки Google Play — библиотеки Google); ID — в hero-walk-apk/store.properties
gbuild() { JAVA_HOME=/c/Java/jdk-17 /c/Gradle/gradle-8.13/bin/gradle -q :app:assembleRelease -PgameVersion=$V && cp app/build/outputs/apk/release/app-release.apk "$1"; }
sed -i -E "s/android:versionCode=\"[0-9]+\"/android:versionCode=\"$V\"/; s/android:versionName=\"1\.0\.[0-9]+\"/android:versionName=\"1.0.$V\"/" AndroidManifest.xml
rm -rf $W && mkdir -p $W
(cd ../hero-walk && git archive HEAD) | tar -x -C $W
rm -rf $W/apk $W/tests $W/tools $W/server $W/*.md $W/dbg.png   # служебное в APK не идёт
gbuild ../hero-walk/apk/DuelArena-v$V.apk > /tmp/apk_a.log 2>&1 || { tail -20 /tmp/apk_a.log; exit 1; }
sed -i 's#<head>#<head><script>window.ALL_WORLDS=1</script>#' $W/index.html
gbuild ../hero-walk/apk/DuelArena-v$V-test-all-worlds.apk > /tmp/apk_b.log 2>&1 || { tail -20 /tmp/apk_b.log; exit 1; }
# v117: тестовая сборка «уровни сложности» — только мир 1, на старте выбор уровня 1…10 (levels.js)
sed -i 's#<head><script>window.ALL_WORLDS=1</script>#<head><script>window.LEVEL_TEST=1</script>#' $W/index.html
gbuild ../hero-walk/apk/DuelArena-v$V-test-levels.apk > /tmp/apk_d.log 2>&1 || { tail -20 /tmp/apk_d.log; exit 1; }
sed -i 's#<head><script>window.LEVEL_TEST=1</script>#<head><script>window.ALL_WORLDS=1</script>#' $W/index.html
# сборка для Google Play (AAB): файлы игры — обычные, без «все миры открыты»; подпись — ключом загрузки (~/.keys/play-upload)
if [ "$1" = "--play" ] || [ "$2" = "--play" ]; then
  sed -i 's#<head><script>window.ALL_WORLDS=1</script>#<head>#' $W/index.html
  JAVA_HOME=/c/Java/jdk-17 /c/Gradle/gradle-8.13/bin/gradle -q :app:bundleRelease -Pbundle -PgameVersion=$V > /tmp/apk_c.log 2>&1 || { tail -20 /tmp/apk_c.log; exit 1; }
  mkdir -p ../hero-walk/apk/play && cp app/build/outputs/bundle/release/app-release.aab ../hero-walk/apk/play/game-v$V.aab && ls -la ../hero-walk/apk/play/ | grep "v$V"
fi
ls -la ../hero-walk/apk/ | grep "v$V"
