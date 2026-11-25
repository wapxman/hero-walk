// Голоса боссов и звуки умений (Клауди, 20.11; таблица — bossvo_map.js, файлы — sfx/bv/).
// Босс мира: три фразы голосом — выход на арену, каст (иногда, вместе с умением), добивание (герой погиб от босса) —
// и звук каждого умения. Мини-босс: крик при выходе («Мини-босс: …») и звук каждого умения на касте.
// Файлы грузятся не все сразу, а когда персонаж выходит на арену. Умение узнаём по его надписи над злодеем («Имя!»).
'use strict';
const BV = (() => {
  const BUF = {}, asked = {};
  const voOf = t => BOSSVO[t] ? t : null;
  function load(n) {
    if (asked[n] || !AC) return; asked[n] = 1;
    // v123: фразы боссов (_l1..3) при английском языке — из sfx_en/bv/, если есть в списке VOICE_EN; не загрузилась — русская
    const get = u => fetch(u + V).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(b => new Promise((ok, no) => AC.decodeAudioData(b, ok, no)));
    const lang = typeof LANG !== 'undefined' ? LANG.cur : 'ru', ru = () => get('sfx/bv/' + n + '.mp3');
    (typeof voiceEn === 'function' && voiceEn('bv', n) ? get('sfx_en/bv/' + n + '.mp3').catch(ru) : ru())
      .then(buf => { if ((typeof LANG !== 'undefined' ? LANG.cur : 'ru') === lang || !/_l\d$/.test(n)) BUF[n] = buf; else asked[n] = 0; }).catch(() => { asked[n] = 0; });
  }
  // язык сменили — фразы боссов забываем; у тех, кто сейчас на арене, грузим заново
  function reload() {
    for (const n in asked) if (/_l\d$/.test(n)) { delete asked[n]; delete BUF[n]; }
    if (typeof enemies !== 'undefined') for (const e of enemies) if (BOSSVO[e.type]) preload(e.type);
  }
  function preload(t) {
    const v = BOSSVO[t]; if (!v) return;
    if (v.g) load(t + '_g');
    if (v.l) for (let i = 1; i <= v.l.length; i++) load(t + '_l' + i);
    for (const k in v.s) load(t + '_s' + v.s[k]);
  }
  let busyTo = 0;   // пока звучит фраза босса, вторая не начинается
  function play(n, vol, voice) {
    if (!AC || AC.state !== 'running') return false;
    if (!BUF[n]) { load(n); return false; }
    if (voice) { if (AC.currentTime < busyTo) return false; busyTo = AC.currentTime + BUF[n].duration + 0.3; }
    const s = AC.createBufferSource(); s.buffer = BUF[n];
    const g = AC.createGain(); g.gain.value = vol == null ? 1 : vol;
    s.connect(g); g.connect(AC.destination); s.start();
    return true;
  }
  // фраза босса i (1 — выход, 2 — каст, 3 — добивание) с подписью над ним
  function line(e, i) {
    const t = voOf(e.type), v = t && BOSSVO[t]; if (!v || !v.l || !v.l[i - 1]) return;
    if (play(t + '_l' + i, 1, true) && e.ch && e.hp > 0) say(e.x, e.y - (e.ch.ok ? e.ch.top * e.ch.U * e.sc : 120) - 54, '«' + v.l[i - 1] + '»', '#ffe9c0');
  }
  let castAt = -1e9;
  // звук умения по имени; у босса иногда ещё и фраза каста (не чаще раза в 14 с)
  function skill(e, name) {
    const t = voOf(e.type), v = t && BOSSVO[t]; if (!v || !v.s[name]) return false;
    play(t + '_s' + v.s[name], 0.9);
    if (v.l && AC && AC.currentTime - castAt > 14 && Math.random() < 0.4) { castAt = AC.currentTime; line(e, 2); }
    return true;
  }
  // выход на арену: грузим звуки; босс говорит первую фразу, мини-босс кричит
  {
    const _sb = spawnEnemyBase;
    spawnEnemyBase = function (type) {
      _sb(type);
      const e = enemies[enemies.length - 1], t = voOf(type); if (!t || !e) return;
      preload(t);
      if (BOSSVO[t].l) { let n = 0; const iv = setInterval(() => { if (++n > 30 || e.hp <= 0) return clearInterval(iv); if (BUF[t + '_l1'] && !(typeof SHOP !== 'undefined' && SHOP.paused)) { clearInterval(iv); line(e, 1); } }, 200); }
    };
    const _se = spawnEnemy;
    spawnEnemy = function (type) {
      const wasMini = ROUND.mini === type && ROUND.queue.length === 0;
      _se(type);
      if (!wasMini || !BOSSVO[type] || !BOSSVO[type].g) return;
      let n = 0; const iv = setInterval(() => { if (++n > 25) return clearInterval(iv); if (BUF[type + '_g']) { clearInterval(iv); play(type + '_g', 1); } }, 200);
    };
  }
  // умения объявляются надписью «Имя!» над злодеем — по ней и играем звук (ближайший к надписи злодей с таким умением)
  {
    const _say = say;
    say = function (x, y, t, c) {
      if (typeof t === 'string' && t.length > 2 && t.charCodeAt(t.length - 1) === 33 && !(window.NETC && NETC.on)) {
        const name = t.slice(0, -1); let best = null, bd = 1e9;
        for (const e of enemies) { const v = BOSSVO[e.type]; if (!v || !v.s[name] || e.hp <= 0) continue; const d = Math.abs(e.x - x) + Math.abs(e.y - y); if (d < bd) { bd = d; best = e; } }
        if (best) skill(best, name);
      }
      return _say(x, y, t, c);
    };
  }
  // пассивные умения без надписи: каждый 3-й удар Короля-Жаба и Владыки Пепла, крит Зеркального Лорда
  if (typeof SK !== 'undefined') {
    for (const [t, name, every] of [['b_toadking', 'Тяжёлый скипетр', 3], ['b_ashlord', 'Удар магмой', 3]]) {
      const f = SK.ON_HIT[t]; if (f) SK.ON_HIT[t] = (e, n) => { if (!(n % every)) skill(e, name); return f(e, n); };
    }
    const fm = SK.ON_HIT.b_mirrorlord;
    if (fm) SK.ON_HIT.b_mirrorlord = (e, n) => { const h0 = P.hp; const r = fm(e, n); if (P.hp < h0) skill(e, 'Танец рапиры'); return r; };
  }
  // пассивки без надписи и без момента каста (Создатель, 20.11) — только звук, без фразы босса
  const pas = (e, name) => { const v = BOSSVO[e.type]; if (v && v.s[name] && !(window.NETC && NETC.on)) play(e.type + '_s' + v.s[name], 0.9); };
  // Королева Змей: «Ядовитый выстрел» и «Ядовитый укус» — при попадании её снаряда по герою, каждый не чаще раза в 6 с (по очереди)
  if (typeof SK !== 'undefined' && SK.SHOT_HIT && SK.SHOT_HIT.b_serpentqueen) {
    const f = SK.SHOT_HIT.b_serpentqueen; let at = -1e9, n = 0;
    SK.SHOT_HIT.b_serpentqueen = e => { const h = f(e); return function () { const now = performance.now(); if (now - at >= 3000) { at = now; pas(e, n++ % 2 ? 'Ядовитый укус' : 'Ядовитый выстрел'); } return h.apply(this, arguments); }; };
  }
  // добивание: герой погиб, пока босс жив
  {
    let was = 0, inRust = false, inJudge = false;
    const near = (type, R) => P.dead > 0 ? null : enemies.find(e => e.type === type && e.hp > 0 && e.dieT == null && Math.hypot(e.x - P.x, (e.y - P.y) / YK) < R);
    const _cu = combatUpdate;
    combatUpdate = function (dt) {
      _cu(dt);
      // Горн-Голем: «Аура ржавчины» — когда герой входит в круг ауры (350); Небесный Судья: «Неприкосновенный» — когда защита срабатывает (герой подошёл на 500 и стал бить медленнее)
      const g = near('b_forgegolem', 350); if (g && !inRust) pas(g, 'Аура ржавчины'); inRust = !!g;
      const j = near('b_skyjudge', 500); if (j && !inJudge) pas(j, 'Неприкосновенный'); inJudge = !!j;
      if (P.dead > 0 && !(was > 0)) { const b = enemies.find(e => e.hp > 0 && BOSSVO[e.type] && BOSSVO[e.type].l); if (b) { busyTo = 0; line(b, 3); } }
      was = P.dead;
    };
  }
  return { play, line, skill, preload, reload, BUF };
})();
