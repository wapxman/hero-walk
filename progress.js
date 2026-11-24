// Прокачка героя (v119): уровни до 100, за уровень — 1 очко умений и 3 очка характеристик, распределяются вручную в окне героя.
// Умения (Q E F R) и рывок качаются с 1 до 20: у умений сила +7% и перезарядка −2% за уровень (skDmg / skCd в combat.js), у рывка —
// перезарядка −0,1 с и дальность +4 за уровень (dash.js). К 100-му уровню героя очков хватает довести все пять до 20 (нужно 95, даётся 99).
// Характеристики: Сила — здоровье и урон, Ловкость — скорость атаки и бега, Интеллект — мана, её восстановление и сила умений
// (сами формулы — в SHOP.recompute). Прокачка сохраняется в браузере отдельно для каждого героя; золото и предметы — на один забег.
'use strict';

const LVL_MAX = Math.min(100, BAL.LVL_MAX), SK_MAX = 20, STAT_PER_LVL = 3;   // v119: герой до 100-го уровня, у умений и рывка по 20 уровней
const STATS = [
  { id: 'str', name: 'Сила', desc: '+8 здоровья, +0,6% урона', img: 'i_str' },
  { id: 'agi', name: 'Ловкость', desc: '+1,5% скорости атаки, +0,6% бега', img: 'i_agi' },
  { id: 'int', name: 'Интеллект', desc: '+12 маны, +0,12 маны/с, +1,5% силы умений', img: 'i_int' },
];
const SK_IDS = ['q', 'e', 'f', 'r', 'dash'];   // v119: рывок качается так же, как умения
// опыт до следующего уровня — кривая в data.js (BAL.need), расчёт — tools/balance_sim.py
const xpNeedP = l => BAL.need(l);
const progKey = () => 'hw_prog_' + HERO_ID;

function progLoad() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(progKey())); } catch (e) {}
  d = d && typeof d === 'object' ? d : {};
  const num = (v, lo, hi, def) => (typeof v === 'number' && v >= lo && v <= hi ? Math.floor(v) : def);
  P.lvl = typeof d.lvl === 'number' && d.lvl > LVL_MAX ? LVL_MAX : num(d.lvl, 1, LVL_MAX, 1);      // старое сохранение выше 100-го — становится 100-м
  P.xp = num(d.xp, 0, 1e9, 0);
  P.sp = num(d.sp, 0, 200, 0);
  P.stp = num(d.stp, 0, 200 * STAT_PER_LVL, 0);
  P.skLv = {}; P.st = {};
  for (const k of SK_IDS) P.skLv[k] = num(d.sk && d.sk[k], 1, SK_MAX, 1);
  for (const s of STATS) P.st[s.id] = num(d.st && d.st[s.id], 0, 200 * STAT_PER_LVL, 0);
  P.forge = {}; for (const k of ['q', 'e', 'f', 'r']) P.forge[k] = num(d.fg && d.fg[k], 0, 5, 0);   // закалка кузницы Междумирья
  SHOP.recompute(); P.hp = P.maxHp; P.mp = P.maxMp;
  progUI();
}
function progSave() {
  try { localStorage.setItem(progKey(), JSON.stringify({ lvl: P.lvl, xp: P.xp, sp: P.sp, stp: P.stp, sk: P.skLv, st: P.st, fg: P.forge })); } catch (e) {}
}

// опыт за победу растёт с волной и миром (BAL в data.js)
gainXp = function (n) {
  if (P.lvl >= LVL_MAX) return;
  P.xp += Math.round(n * BAL.xp(wave));
  let up = false;
  while (P.lvl < LVL_MAX && P.xp >= xpNeedP(P.lvl)) {
    P.xp -= xpNeedP(P.lvl); P.lvl++; P.sp++; P.stp += STAT_PER_LVL; up = true;
  }
  if (P.lvl >= LVL_MAX) P.xp = 0;
  if (up) {
    SHOP.recompute(); P.mp = P.maxMp;   // здоровье — только прибавка к максимуму (SHOP.recompute), без полного лечения
    say(P.x, P.y - CH * 1.45 * HS(), 'Уровень ' + P.lvl + '!  очки прокачки', '#ffe27a');
  }
  progSave(); progUI();
};

// ---------- окно героя ----------
const PE = {};
(function progBuild() {
  const U = n => 'url(ui/' + n + '.webp' + V + ')';
  const css = document.createElement('style');
  css.textContent = `
  #hHero .pt { pointer-events: auto; cursor: pointer; touch-action: manipulation; }
  #hHero .plus { position: absolute; left: 0; top: 0; width: 5vh; height: 5vh; background: ${U('i_plus')} center / 100% 100% no-repeat; display: none; animation: shPulse 1.2s ease-in-out infinite; pointer-events: none; }
  #hHero .xp { position: absolute; left: 15.5vh; top: 11.3vh; width: 32.5vh; height: 1.3vh; background: rgba(8,12,24,.75); border-radius: .7vh; box-shadow: 0 0 0 .2vh rgba(190,200,220,.45); overflow: hidden; }
  #hHero .xp i { position: absolute; inset: 0; background: ${U('h_xp')} center / 100% 100% no-repeat; }
  #hProg { position: fixed; inset: 0; z-index: 9; display: none; align-items: center; justify-content: center; background: rgba(2,6,12,.5); color: #fff;
    text-shadow: 0 1px 3px #000; font-family: system-ui, sans-serif; user-select: none; -webkit-user-select: none; }
  #hProg .pn { position: relative; width: min(96vw, 138vh); aspect-ratio: 3 / 2; background: ${U('panel')} center / 100% 100% no-repeat; font-size: calc(min(96vw, 138vh) / 62); }
  #hProg .tt { position: absolute; left: 24%; top: 5.5%; width: 52%; height: 10.5%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.45em; }
  #hProg .cl { position: absolute; right: 2.5%; top: 6%; width: 6%; aspect-ratio: 230 / 244; background: ${U('close')} center / 100% 100% no-repeat; cursor: pointer; }
  #hProg .col { position: absolute; top: 19%; height: 70%; display: flex; flex-direction: column; gap: 2.2%; }
  #hProg .c1 { left: 7%; width: 40%; } #hProg .c2 { left: 51%; width: 42%; }
  #hProg h4 { margin: 0; font-size: 1.05em; color: #ffe27a; display: flex; justify-content: space-between; }
  #hProg .xpb { height: 1.1em; border-radius: .6em; background: rgba(8,12,24,.8); box-shadow: 0 0 0 .12em rgba(190,200,220,.4); position: relative; overflow: hidden; }
  #hProg .xpb i { position: absolute; inset: 0; background: ${U('h_xp')} center / 100% 100% no-repeat; }
  #hProg .xpb span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: .75em; font-weight: bold; }
  #hProg .rw { display: flex; align-items: center; gap: .7em; background: rgba(8,16,32,.55); border-radius: .6em; padding: .45em .6em; }
  #hProg .c2 .rw { padding: .28em .6em; } #hProg .c2 .ic { width: 2.7em; height: 2.7em; } #hProg .c2 { gap: 1.6%; }
  #hProg .ic { width: 3.1em; height: 3.1em; flex: none; background-size: 100% 100%; background-repeat: no-repeat; border-radius: 50%; }
  #hProg .tx { flex: 1; min-width: 0; } #hProg .tx b { font-size: .98em; } #hProg .tx em { font-style: normal; color: #ffe27a; margin-left: .4em; }
  #hProg .tx div { font-size: .74em; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #hProg .pl { width: 2.7em; height: 2.7em; flex: none; background: ${U('i_plus')} center / 100% 100% no-repeat; cursor: pointer; touch-action: manipulation; }
  #hProg .pl.off { filter: grayscale(1) brightness(.55); cursor: default; }`;
  document.head.appendChild(css);
  const tap = (e, fn) => {
    for (const ev of ['touchstart', 'mousedown']) e.addEventListener(ev, x => x.stopPropagation(), { passive: true });
    e.addEventListener('pointerdown', x => { x.stopPropagation(); fn(); });
  };
  const hero = document.getElementById('hHero');
  const pt = hero.querySelector('.pt');
  PE.badge = document.createElement('div'); PE.badge.className = 'plus'; hero.appendChild(PE.badge);
  PE.xp = document.createElement('div'); PE.xp.className = 'xp'; PE.xp.innerHTML = '<i></i>'; hero.appendChild(PE.xp);
  tap(pt, () => progOpen(true));
  const box = PE.box = document.createElement('div'); box.id = 'hProg';
  for (const ev of ['touchstart', 'mousedown', 'pointerdown']) box.addEventListener(ev, x => x.stopPropagation(), { passive: true });
  box.innerHTML = '<div class="pn"><div class="tt"></div><div class="cl"></div><div class="col c1"></div><div class="col c2"></div></div>';
  document.body.appendChild(box);
  tap(box.querySelector('.cl'), () => progOpen(false));
  PE.tt = box.querySelector('.tt');
  const c1 = box.querySelector('.c1'), c2 = box.querySelector('.c2');
  c1.innerHTML = '<h4><span>Опыт</span><span class="xn"></span></h4><div class="xpb"><i></i><span></span></div><h4><span>Характеристики</span><span class="sn"></span></h4>';
  PE.xn = c1.querySelector('.xn'); PE.xpb = c1.querySelector('.xpb'); PE.sn = c1.querySelector('.sn');
  PE.stat = {};
  for (const s of STATS) {
    const r = document.createElement('div'); r.className = 'rw';
    r.innerHTML = '<div class="ic" style="background-image:' + U(s.img) + '"></div><div class="tx"><b>' + s.name + '</b><em></em><div>' + s.desc + '</div></div><div class="pl"></div>';
    tap(r.querySelector('.pl'), () => { if (P.stp > 0) { P.stp--; P.st[s.id]++; SHOP.recompute(); progSave(); progUI(); } });
    c1.appendChild(r); PE.stat[s.id] = r;
  }
  PE.sum = document.createElement('div'); PE.sum.className = 'rw'; PE.sum.style.cssText = 'font-size:.82em;display:block;line-height:1.5';
  c1.appendChild(PE.sum);
  c2.innerHTML = '<h4><span>Умения и рывок · до ' + SK_MAX + '</span><span class="kn"></span></h4>';
  PE.kn = c2.querySelector('.kn');
  PE.sk = {};
  for (const k of SK_IDS) {
    const r = document.createElement('div'); r.className = 'rw';
    r.innerHTML = '<div class="ic"></div><div class="tx"><b></b><em></em><div></div></div><div class="pl"></div>';
    tap(r.querySelector('.pl'), () => { if (P.sp > 0 && P.skLv[k] < SK_MAX) { P.sp--; P.skLv[k]++; progSave(); progUI(); } });
    c2.appendChild(r); PE.sk[k] = r;
  }
  addEventListener('keydown', e => { if (e.code === 'KeyC' && !e.repeat) progOpen(box.style.display !== 'flex'); });
})();

let progWasPaused = false;
function progOpen(on) {
  if (on === (PE.box.style.display === 'flex')) return;
  if (on) { progWasPaused = SHOP.paused; SHOP.paused = true; held.touch = held.mouse = held.key = false; }
  else SHOP.paused = progWasPaused || !!(SHOP.el && SHOP.el.pause && SHOP.el.pause.style.display === 'flex');   // меню паузы ещё открыто — игра стоит
  PE.box.style.display = on ? 'flex' : 'none';
  progUI();
}
// что даёт следующий уровень умения: урон и перезарядка
function skHint(k) {
  const l = P.skLv[k];
  if (k === 'dash') return 'перезарядка ' + DASH.cdOf().toFixed(1) + ' с, дальность ' + Math.round(DASH.distOf());
  if (HERO_ID === 'archer' && k === 'r') return 'Верный глаз: +' + (12 + (l - 1)) + '% урона, +' + (10 + 0.5 * (l - 1)) + '% дальности, ' + (25 + (l - 1)) + '% стрел пронзающие';
  return 'сила ×' + (1 + 0.07 * (l - 1)).toFixed(2) + ', перезарядка −' + Math.round(2 * (l - 1)) + '%';
}
function progUI() {
  if (!PE.box) return;
  const need = xpNeedP(P.lvl), pct = P.lvl >= LVL_MAX ? 100 : Math.min(100, 100 * P.xp / need);
  PE.badge.style.display = P.sp > 0 || P.stp > 0 ? 'block' : 'none';
  PE.xp.firstChild.style.clipPath = 'inset(0 ' + (100 - pct).toFixed(1) + '% 0 0)';
  if (PE.box.style.display !== 'flex') return;
  const h = HEROES[HERO_ID];
  PE.tt.textContent = h.name + ' · уровень ' + P.lvl + ' из ' + LVL_MAX;
  PE.xn.textContent = P.lvl >= LVL_MAX ? 'максимум' : P.xp + ' / ' + need;
  PE.xpb.firstChild.style.clipPath = 'inset(0 ' + (100 - pct).toFixed(1) + '% 0 0)';
  PE.xpb.lastChild.textContent = Math.floor(pct) + '%';
  PE.sn.textContent = 'очков: ' + P.stp;
  for (const s of STATS) {
    const r = PE.stat[s.id];
    r.querySelector('em').textContent = P.st[s.id];
    r.querySelector('.pl').classList.toggle('off', !P.stp);
  }
  PE.sum.innerHTML = 'Здоровье: <b>' + P.maxHp + '</b>' + (P.hpRegX ? ' (+' + P.hpRegX + '/с)' : '') + ' · Мана: <b>' + P.maxMp + '</b> (+' + P.mpRegen.toFixed(1) + '/с)<br>Урон: <b>×' + P.dmgMul.toFixed(2) +
    '</b> · Атака: <b>×' + P.atkSpd.toFixed(2) + '</b> · Умения: <b>×' + P.skMul.toFixed(2) + '</b><br>За уровень героя: 1 очко умений и ' + STAT_PER_LVL + ' очка характеристик';
  PE.kn.textContent = 'очков: ' + P.sp;
  SK_IDS.forEach((k, i) => {
    const r = PE.sk[k], cell = SK_CELL[k], ic = r.querySelector('.ic');
    if (k === 'dash') { ic.style.backgroundImage = 'url(ui/status/dash.webp' + V + ')'; ic.style.backgroundSize = '100% 100%'; ic.style.backgroundPosition = 'center'; }
    else { ic.style.backgroundImage = 'url(' + h.icons + V + ')'; ic.style.backgroundSize = '300% 200%'; ic.style.backgroundPosition = (cell % 3) * 50 + '% ' + Math.floor(cell / 3) * 100 + '%'; }
    r.querySelector('b').textContent = k === 'dash' ? 'Рывок' : h.skills[i + 1].split(' — ')[0];
    r.querySelector('em').textContent = P.skLv[k] + '/' + SK_MAX;
    r.querySelector('.tx div').textContent = skHint(k);
    r.querySelector('.pl').classList.toggle('off', !P.sp || P.skLv[k] >= SK_MAX);
  });
}

// ловкость ускоряет атаку: после выстрела перезарядка делится на P.atkSpd
const _shootP = shoot;
shoot = function () { _shootP(); P.atkCd /= P.atkSpd || 1; };
// при смене героя — его собственная прокачка
const _setHeroP = setHero;
setHero = function (id) { _setHeroP(id); progLoad(); };
progLoad();
