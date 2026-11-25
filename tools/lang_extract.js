// Вытащить из файлов игры все строки с кириллицей (без комментариев) — для английской версии (v121).
//   node tools/lang_extract.js              печатает, сколько строк в каком файле, и пишет tools/lang_strings.json
// Строки-шаблоны с ${…} режутся на куски между подстановками: переводится каждый кусок.
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname);
const FILES = ['index.html', 'data.js', 'roster.js', 'combat.js', 'shop.js', 'heroes.js', 'progress.js', 'worlds.js', 'pathmap.js', 'mapfx.js', 'arenafx.js', 'locfx.js', 'limbo.js',
  'enemies.js', 'items.js', 'relics.js', 'bossmech.js', 'sk.js', 'sk_defs.js', 'mini.js', 'v34.js', 'status.js', 'dash.js', 'itemfx.js', 'tune.js', 'hard.js', 'levels.js', 'hook.js',
  'flasks.js', 'dmgshow.js', 'bossvo.js', 'bossvo_map.js', 'net/shared.js', 'net/client.js', 'net/team.js', 'menu.js', 'store.js', 'cine.js', 'save.js', 'chars/villains.js', 'chars/skills.js'];
const out = {}; let total = 0;
for (const f of FILES) {
  let s; try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  let i = 0; const n = s.length, list = [];
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/' && s[i - 1] !== ':') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i = s.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (c === '<' && s.startsWith('<!--', i)) { i = s.indexOf('-->', i); if (i < 0) break; i += 3; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1, buf = '';
      while (j < n && s[j] !== c) { if (s[j] === '\\') { buf += s[j] + s[j + 1]; j += 2; } else { buf += s[j]; j++; } }
      if (/[А-Яа-яЁё]/.test(buf)) for (const part of (c === '`' ? buf.split(/\$\{[^}]*\}/) : [buf])) if (/[А-Яа-яЁё]/.test(part)) list.push(part);
      i = j + 1; continue;
    }
    i++;
  }
  // текст прямо в разметке index.html
  if (f === 'index.html') for (const m of s.matchAll(/>([^<>]*[А-Яа-яЁё][^<>]*)</g)) list.push(m[1].trim());
  out[f] = list; total += list.length;
}
const uniq = new Set(); for (const f in out) for (const x of out[f]) uniq.add(x);
console.log('литералов', total, '· уникальных', uniq.size, '· символов', [...uniq].reduce((a, x) => a + x.length, 0));
for (const f in out) if (out[f].length) console.log(String(out[f].length).padStart(5), f);
fs.writeFileSync(path.join(__dirname, 'lang_strings.json'), JSON.stringify(out));
