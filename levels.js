// Уровни сложности 1…10 (v117, по просьбе Создателя). Уровень 1 — как было; 10 — «нереальный».
// С каждым уровнем враги: быстрее бегают и бьют, чаще и раньше применяют умения (все откаты короче), сильнее бьют и живучее
// (боссы и мини-боссы — заметнее рядовых). С определённого уровня открываются добавочные приёмы:
//   2  — рядовые мира 1 применяют свои умения (на уровне 1 в мире 1 они только берут в кольцо; крюк мясника есть всегда);
//   3  — мир 1 перестаёт быть мягким: у мини-боссов и босса все умения, у босса — приёмы «добраться до героя» в полную силу;
//   4  — ближние рядовые и элита делают «Рывок» — прыжок к герою с меткой на земле;
//   5  — мини-боссы получают приёмы боссов «Прыжок» и «Оковы» (hard.js);
//   6  — стрелки бьют веером (ещё два снаряда);
//   7  — у босса все три приёма: прыжок, притяжение, оковы;
//   8  — «Рывок» чаще.
// Числа — в таблице K(L) ниже. В сети уровень всегда 1 (там врагов ведёт сервер).
// Обычная игра (v118): уровень врагов меняется сам — пройденная арена (раунд: волны 1–3, 4–6, 7–9, босс) +1, не выше 10; гибель героя
// на арене −2, не ниже 1; «Новая игра» начинает с уровня 1. Уровень лежит в сохранении забега (поле lv). Это скрытая настройка: в обычной
// игре уровень врагов игроку нигде не показывается (ни надписи, ни всплывашки, ни в меню). Награда из боя растёт с уровнем (rk).
// Уровень героя, его опыт и прокачку это правило не трогает. Тестовая сборка (window.LEVEL_TEST или ?levels в адресе): только мир 1, на старте экран «Уровень 1…10»,
// герой «голый» (своё отдельное сохранение lt_* — настоящее не трогается), ролики выключены, уровень виден сверху.
'use strict';
const LEVEL = (() => {
  const TEST = !!window.LEVEL_TEST || /[?&]levels(&|$)/.test(location.search);
  const AUTO = !TEST;      // v118: обычная игра — каждая пройденная арена (раунд) +1 уровень, до 10; уровень хранится в сохранении забега (save.js)
  let n = 1;
  if (TEST) { try { n = Math.max(1, Math.min(10, +sessionStorage.getItem('hw_lv') || 1)); } catch (e) {} }
  const net = () => !!(window.NETC && NETC.on);
  const TAB = [];
  for (let L = 1; L <= 10; L++) {
    const s = L - 1;
    TAB[L] = { L, run: 1 + 0.06 * s,          // бег: ур. 10 — ×1,54
      atk: 1 + 0.1 * s,                        // частота ударов и выстрелов: ×1,9
      wind: 1 + 0.05 * s,                      // замах удара короче: ×1,45
      cd: 1 / (1 + 0.13 * s),                  // откаты умений: ×0,46 (умения в 2,2 раза чаще, первое — раньше)
      dmg: 1 + 0.07 * s, hp: 1 + 0.05 * s,     // рядовые и элита: урон ×1,63, здоровье ×1,45
      bdmg: 1 + 0.1 * s, bhp: 1 + 0.09 * s };  // боссы и мини-боссы: урон ×1,9, здоровье ×1,81
  }
  const K = () => TAB[net() ? 1 : n];
  // награда растёт с уровнем врагов: золото и опыт из боя ×(1 + 0,1 × (уровень − 1)) — монеты с врагов и боссов (shop.js onKill),
  // награда за арену (shop.js tick), «Рука Мидаса» (itemfx.js), опыт за убийства (gainXp).
  // Продажа предметов и сундук «+80» — без надбавки. Никаких пометок о надбавке игрок не видит — просто числа больше.
  const rk = () => 1 + 0.1 * ((net() ? 1 : n) - 1);
  { const _gx = gainXp; gainXp = function (x) { return _gx(x * rk()); }; }
  let lastLunge = -99;

  {
    const _se = spawnEnemy;
    spawnEnemy = function () {
      const i0 = enemies.length, r = _se.apply(this, arguments), k = K();
      if (k.L > 1) for (let i = i0; i < enemies.length; i++) {
        const e = enemies[i]; if (e.clone || e.lv) continue;
        const big = e.boss || e.mini;
        e.lv = k.L; e.speed *= k.run; e.dm *= big ? k.bdmg : k.dmg; e.hp = e.max = Math.round(e.hp * (big ? k.bhp : k.hp));
        if (k.L >= 6 && e.rng && !e.boss) { e.k = Object.create(e.k); e.k.fan = (e.k.fan || 1) + 2; }
      }
      return r;
    };
    const _ue = updateEnemy;
    updateEnemy = function (e, dt) {
      const k = e.lv ? TAB[e.lv] : null;
      if (k && !e.kb && !(e.root > 0)) {
        e.atkCd -= dt * (k.atk - 1);
        if (e.act && e.act.anim === 'atk' && !e.leap) e.act.t += dt * (k.wind - 1);
        const c = dt * (1 / k.cd - 1);
        if (e.sk) for (const s of e.sk) s.cd -= c;
        e.slamCd -= c; e.quakeCd -= c; e.leapCd -= c; e.summonCd -= c;
        if (e.hCd != null) { e.hCd -= c; e.hAll -= c; }
        // «Рывок» ближних (с уровня 4): прыжок к герою, на земле — метка, куда приземлится
        if (k.L >= 4 && e.mel && !e.boss && !e.mini && e.k.speed >= 125) {
          e.lgCd = (e.lgCd == null ? rnd(2.5, 6) : e.lgCd) - dt;
          if (e.lgCd <= 0) {
            const d = gdist(P, e), now = P.heroT || 0;
            if (!e.act && !e.leap && !e.skMove && !(e.silT > 0) && P.dead <= 0 && SHOP.phase === 'fight' && d > 230 && d < 540 && now - lastLunge > 1.5 * k.cd) {
              e.lgCd = (k.L >= 8 ? 5 : 7.5) * rnd(0.9, 1.25); lastLunge = now;
              tag(e, 'Рывок!', '#ffd28a'); leapTo(e, P.x, P.y, 0.62, 80, 14 * e.dm, 'atk');
            } else e.lgCd = 0.35;
          }
        }
      }
      return _ue(e, dt);
    };
  }

  // «прошёл арену — следующая на уровень выше» (пока выключено — AUTO)
  // уровень ВРАГОВ: +1 за пройденную арену, −2 за гибель героя; границы 1 и 10; уровень и опыт героя это не трогает
  function shift(d) {
    n = Math.max(1, Math.min(10, n + d));      // игроку уровень врагов не показывается: ни надписи, ни всплывашки (решение Создателя 24.11)
  }
  if (AUTO) {
    const _t = SHOP.tick;
    SHOP.tick = function (dt) {
      const was = SHOP.phase; _t.call(this, dt);
      if (was === 'fight' && SHOP.phase === 'rest' && !net() && P.dead <= 0 && !(typeof LIMBO !== 'undefined' && LIMBO.on)) shift(1);      // арена пройдена
    };
    // герой погиб на арене (ушёл в Междумирье) — уровень врагов −2. Воскрешение за рекламу на боссе гибелью не считается.
    if (typeof LIMBO !== 'undefined' && LIMBO.enter) { const _en = LIMBO.enter; LIMBO.enter = function () { if (!net() && !LIMBO.on) { shift(-2); if (typeof SAVE !== 'undefined') SAVE.save(); } return _en.apply(this, arguments); }; }
  }

  // ---------- тестовая сборка: выбор уровня, только мир 1 ----------
  if (TEST) {
    const css = document.createElement('style');
    css.textContent = `
    #lvPick { position: fixed; inset: 0; z-index: 300; background: #0b0f18; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; font-family: system-ui, sans-serif; text-align: center; }
    #lvPick h1 { font: bold 6vh Georgia, serif; margin: 0 0 1vh; color: #ffe9a8; }
    #lvPick p { font-size: 2.7vh; margin: .4vh 6vw; opacity: .85; }
    #lvPick .g { display: grid; grid-template-columns: repeat(5, 15vw); gap: 2.2vh 1.6vw; margin: 4vh 0 2vh; }
    #lvPick .b { padding: 2.6vh 0; border-radius: 1.6vh; background: #1c2740; border: .3vh solid #6f8fd0; font: bold 3.6vh system-ui, sans-serif; cursor: pointer; user-select: none; }
    #lvPick .b:active { transform: scale(.96); }
    #lvPick .b small { display: block; font: 2vh system-ui, sans-serif; opacity: .75; margin-top: .4vh; }
    #lvPick .b.hot { border-color: #ff8a5a; background: #40201c; }
    #lvPick .b.cur { border-color: #ffe27a; }
    #lvChip { position: fixed; left: 50%; top: 11.5vh; transform: translateX(-50%); z-index: 60; padding: .7vh 2vh; border-radius: 1.2vh; background: rgba(10,14,22,.7); border: .2vh solid rgba(255,226,122,.7);
      color: #ffe9a8; font: bold 2.4vh system-ui, sans-serif; cursor: pointer; user-select: none; }`;
    document.head.appendChild(css);
    let had = false; try { had = !!sessionStorage.getItem('hw_lv'); } catch (e) {}
    const NOTE = ['как сейчас', 'умения рядовых', 'мир без поблажек', 'рывки врагов', 'мини-боссы злее', 'стрелки веером', 'босс: все приёмы', 'рывки чаще', '', 'нереальный'];
    const choose = L => {
      try { if (window.LT_WIPE) LT_WIPE(); sessionStorage.setItem('hw_lt_wipe', '1'); sessionStorage.setItem('hw_lv', String(L)); sessionStorage.setItem('hw_newgame', '1'); } catch (e) {}
      location.reload();
    };
    const picker = (title, text) => {
      let d = document.getElementById('lvPick'); if (d) d.remove();
      d = document.createElement('div'); d.id = 'lvPick';
      d.innerHTML = '<h1>' + title + '</h1><p>' + text + '</p><div class="g"></div><p>Герой начинает без прокачки и предметов. Только мир 1. Настоящее сохранение не трогается.</p>';
      const g = d.querySelector('.g');
      for (let L = 1; L <= 10; L++) {
        const b = document.createElement('div'); b.className = 'b' + (L >= 8 ? ' hot' : '') + (had && L === n ? ' cur' : '');
        b.innerHTML = 'Уровень ' + L + '<small>' + (NOTE[L - 1] || '&nbsp;') + '</small>';
        b.addEventListener('pointerdown', e => { e.stopPropagation(); choose(L); }); g.appendChild(b);
      }
      for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'click', 'keydown']) d.addEventListener(ev, e => e.stopPropagation());
      document.body.appendChild(d);
    };
    const boot = () => {
      if (!had) { picker('Проверка сложности', 'Выберите уровень врагов и боссов'); return; }
      const chip = document.createElement('div'); chip.id = 'lvChip'; chip.textContent = 'Уровень ' + n + ' · сменить'; document.body.appendChild(chip);
      chip.addEventListener('pointerdown', e => { e.stopPropagation(); picker('Уровень ' + n, 'Выберите уровень — мир 1 начнётся заново'); });
    };
    if (document.body) boot(); else addEventListener('DOMContentLoaded', boot);
    // босс мира 1 пройден — итог и снова выбор уровня (в мир 2 тестовая сборка не идёт)
    const _t = SHOP.tick;
    SHOP.tick = function (dt) {
      const was = SHOP.phase; _t.call(this, dt);
      if (was === 'fight' && SHOP.phase === 'rest' && wave > 0 && wave % BAL.WAVES === 0 && P.dead <= 0) setTimeout(() => picker('Мир 1 пройден!', 'Уровень ' + n + ' пройден. Выберите следующий'), 1600);
    };
  }
  // load — уровень из сохранения забега (save.js); в тестовой сборке уровень — только выбранный на экране выбора
  return { get n() { return net() ? 1 : n; }, load(v) { if (!TEST) n = Math.max(1, Math.min(10, (v | 0) || 1)); }, rk, K, TAB, TEST, AUTO };
})();
