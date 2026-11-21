// Герои: маг Ganfaul (скиллы в combat.js) и лучница Эйра (скиллы здесь). Выбор героя перед боем.
// Вся графика лучницы — из ChatGPT: иконки ui/sk_icons_archer.webp, портрет ui/h_portrait_archer.webp, эффекты fx/fx3_*.webp.
// Использует из combat.js: P, enemies, shots, fx, HERO, MAGE, loadHero, RANGE, CDMAX, MANA, SK_ICONS, cast, shoot, hurtPlayer...
'use strict';

// ---------- лучница Эйра (v85): спрайты ChatGPT, как Ganfaul — клетка 384, 8 рядов-направлений, смерть 1 ряд ----------
// k подобран по росту фигуры (Эйра в кадре 235 px, Ganfaul 248 px при k 0.8173). Каждому умению — своя анимация.
const EIRA_ROW = (at, n, ms, rows) => ({ at: 'eira_' + at, n, ms, rows: rows || 8, foot: 344 });
const ARCHER = { k: 0.8625, mul: { idle: EIRA_ROW('idle', 4, 230), run: EIRA_ROW('run', 6, 90), atk: EIRA_ROW('attack', 6, 85),
  wave: EIRA_ROW('wave', 6, 90), volley: EIRA_ROW('volley', 6, 95), shield: EIRA_ROW('shield', 6, 110), die: EIRA_ROW('death', 6, 170, 1),
  runshoot: EIRA_ROW('runshoot', 6, 90), runrel: EIRA_ROW('runrel', 6, 100) } };   // runrel (v102): полный выстрел на бегу — выпуск, рука к колчану, стрела, натяг   // v101: бег со стрельбой — ноги бегут, лук натянут (лист Клауди); играет вместо стоячей атаки, пока Эйра бежит

// hp — запас здоровья, range — дальность выстрела, cd — перезарядка скиллов, mana — их цена
const HEROES = {
  mage: { def: MAGE, name: 'Ganfaul', role: 'маг льда', icons: 'ui/sk_icons.webp', portrait: 'ui/h_portrait.webp',
    hp: 600, range: 600, cd: { q: 6, e: 9, f: 12, r: 28 }, mana: { q: 60, e: 50, f: 80, r: 150 },
    skills: ['Ледяная стрела', 'Кольцо стужи — взрыв льда', 'Оковы — заморозка цели', 'Град — дождь сосулек', 'Буря — ульт'] },
  archer: { def: ARCHER, name: 'Эйра', role: 'лучница', icons: 'ui/sk_icons_archer.webp', portrait: 'ui/h_portrait_archer.webp',
    hp: 520, range: 720, cd: { q: 9, e: 6, f: 15, r: 0 }, mana: { q: 70, e: 60, f: 90, r: 0 },
    skills: ['Меткий выстрел', 'Шквал — волна вперёд: отброс и немота', 'Залп — 3 волны по 5 стрел', 'Щит листьев — снимает путы, в конце взрыв', 'Верный глаз — пассивка: урон, дальность, пронзающие стрелы'] },
};
let HERO_ID = 'mage';
const HERO_KEY = 'hw_hero';

function setHero(id) {
  if (!HEROES[id]) id = 'mage';
  const h = HEROES[id];
  HERO_ID = id; HERO = h.def; loadHero(HERO);
  Object.assign(CDMAX, h.cd); Object.assign(MANA, h.mana);
  RANGE = h.range; P.baseHp = h.hp;
  SK_ICONS.src = h.icons + V;
  const pt = document.querySelector('#hHero .pt');
  if (pt) pt.style.backgroundImage = 'url(' + h.portrait + V + ')';
  P.focus = 0; P.mark = false; P.gust = null; P.volley = null; P.shield = 0; P.shieldT = 0; P.shieldMax = 0;
  if (typeof SHOP !== 'undefined') { SHOP.recompute(); P.hp = P.maxHp; P.mp = P.maxMp; }
  try { localStorage.setItem(HERO_KEY, id); } catch (e) {}
}

// ---------- звуки лучницы (Higgsfield, Клауди; файлы sfx/archer_*.mp3, описание — sfx_higgs_archer/game/MAP.txt) ----------
Object.assign(SFX_SETS, {
  archer_bow_shot: 4, archer_arrow_hit: 6, archer_gust: 2, archer_volley: 1, archer_shield_on: 2, archer_shield_break: 2,
  archer_ult_proc: 2, archer_step: 14, archer_death: 2,
  // реплики Эйры — Suno, набор 21.11 (v98): тексты в sfx_suno_eira/MAP.txt
  archer_vo_attack: 8, archer_vo_boss: 2, archer_vo_cooldown: 2, archer_vo_dash: 2, archer_vo_death: 3, archer_vo_gust: 1, archer_vo_hurt: 3, archer_vo_kill: 4, archer_vo_laugh: 1, archer_vo_levelup: 2, archer_vo_lowhp: 2, archer_vo_move: 4, archer_vo_move_rare: 2, archer_vo_nomana: 2, archer_vo_respawn: 2, archer_vo_shield: 1, archer_vo_shop: 1, archer_vo_stunned: 2, archer_vo_ult: 1, archer_vo_victory: 2, archer_vo_volley: 1, archer_vo_wave: 1,
});
Object.assign(SND_GAP, { archer_arrow_hit: 0.05, archer_step: 0.1 });
// общие события боя у лучницы звучат её звуками: шаги, выстрел, смерть
const ARCHER_SND = { hero_shot: 'archer_bow_shot', step: 'archer_step', hero_death: 'archer_death', archer_shot: 'archer_bow_shot',
  archer_hit: 'archer_arrow_hit', archer_wave: 'archer_gust', archer_shield: 'archer_shield_on' };
const _sndBase = snd;
snd = function (name, vol, rate) {
  if (HERO_ID === 'archer' && ARCHER_SND[name]) name = ARCHER_SND[name];
  return _sndBase(name, vol, rate);
};
// Реплики Ganfaul — Suno, набор 21.11 (v98): Создатель записал фразы одним треком, Клауди нарезала; тексты — sfx_suno_ganfaul/MAP.txt.
// Заменяют все прежние (Higgsfield и game_2111).
Object.assign(SFX_SETS, {
  vo_attack: 8, vo_boss: 2, vo_chains: 1, vo_cooldown: 2, vo_dash: 2, vo_death: 3, vo_hail: 1, vo_hurt: 3, vo_kill: 5, vo_levelup: 2, vo_lowhp: 2, vo_move: 5, vo_move_rare: 2, vo_nomana: 2, vo_nova: 1, vo_respawn: 2, vo_shop: 1, vo_storm: 1, vo_stunned: 2, vo_victory: 2, vo_wave: 1,
});
// Реплики героя (ночь 19.11, DESIGN.md п.6 — реже): chance — шанс, gap — не чаще раза в gap секунд для этой группы
// (группа grp: все скиллы — одна группа), и любая реплика — не чаще раза в VO_ANY секунд. Смерть, возрождение и уровень
// (force) звучат всегда. Неудачный бросок шанса тоже запускает паузу группы — так реплики действительно редкие.
// У Ganfaul файлы vo_*, у лучницы archer_vo_* (одинаковые имена событий).
const voLast = {}, VO_ANY = 12;
let voBusy = 0, voAny = -1e9;
function vo(name, chance, gap, force, grp) {
  if (!AC || AC.state !== 'running') return;
  const now = AC.currentTime, n = (HERO_ID === 'archer' ? 'archer_vo_' : 'vo_') + name, key = HERO_ID + (grp || name);
  if (!SFX_SETS[n]) return;
  if (!force && now - voAny < VO_ANY) return;
  if (gap && now - (voLast[key] == null ? -1e9 : voLast[key]) < gap) return;
  voLast[key] = now;
  if (Math.random() > chance) return;
  voAny = now;
  // пока звучит другая реплика, новая ждёт (одна, самая свежая; если ждать больше 1,5 с — пропадает)
  if (now < voBusy) { voWait = { n, until: voBusy, drop: now + 1.5 }; return; }
  voPlay(n);
}
let voWait = null;
function voPlay(n) {
  _sndBase(n, 0.95);
  const b = SND[n + '_' + sndLast[n]];
  voBusy = AC.currentTime + (b ? b.duration : 1.5) + 0.15;
}
setInterval(() => {
  if (!voWait || !AC) return;
  const now = AC.currentTime;
  if (now > voWait.drop) voWait = null;
  else if (now >= voBusy) { const w = voWait; voWait = null; voPlay(w.n); }
}, 100);
// реплика атаки — в начале серии выстрелов, раз в 30 с с шансом 30 %
function voAttack() { if (performance.now() - (P.lastShot || 0) > 1500) vo('attack', 0.3, 30); P.lastShot = performance.now(); }
// реплика скилла по его кнопке: все скиллы — одна группа, не чаще раза в 20 с, шанс 35 % (ульта — 70 %)
const VO_SKILL = { mage: { q: ['nova', 0.35], e: ['chains', 0.35], f: ['hail', 0.35], r: ['storm', 0.7] },
  archer: { q: ['gust', 0.35], e: ['volley', 0.35], f: ['shield', 0.35] } };
function voSkill(id) { const v = VO_SKILL[HERO_ID][id]; if (v) vo(v[0], v[1], 20, false, 'skill'); }
// события, на которые герой отвечает репликой: шаг с места, убийство, смерть, возрождение, новый уровень;
// v98 (набор Suno): рывок, мало здоровья, оглушён / заморожен / безмолвие, начало раунда, босс вышел, босс побеждён, покупка, смех Эйры
const heroEv = { moving: false, kills: 0, dead: 0, lvl: 0, dash: 0, low: false, ctl: false, phase: 'rest', boss: null, minis: null };
const voLive = e => e.hp > 0 && e.dieT == null;
function heroVoiceTick() {
  const st = heroEv, alive = !(P.dead > 0);
  if (P.moving && !st.moving) { if (Math.random() < 0.01) vo('move_rare', 1, 45, false, 'move'); else vo('move', 0.2, 45); }
  // босс побеждён — всегда (раньше фразы убийства: иначе она займёт голос, и победная пропадёт)
  const won = !!st.boss && st.boss.dieT != null;   // убит в бою (сброс боя здоровье обнуляет, но dieT не ставит)
  if (won) { st.boss = null; if (alive) vo('victory', 1, 0, true); }
  // убийство; у Эйры в 8 % случаев вместо фразы — смех
  if (kills > st.kills && !won) { if (HERO_ID === 'archer' && Math.random() < 0.08) vo('laugh', 1, 25, false, 'kill'); else vo('kill', 0.1, 25); }
  if (P.dead > 0 && !(st.dead > 0)) vo('death', 1, 0, true);
  if (alive && st.dead > 0) vo('respawn', 1, 0, true);
  if (P.lvl > st.lvl && st.lvl) vo('levelup', 1, 0, true);
  // рывок: перезарядка рывка только что пошла
  const dc = (P.cd && P.cd.dash) || 0; if (dc > st.dash + 1) vo('dash', 0.5, 8); st.dash = dc;
  // здоровье упало ниже четверти
  const low = alive && P.hp < P.maxHp * 0.25; if (low && !st.low) vo('lowhp', 1, 30); st.low = low;
  // оглушён, заморожен или без умений — когда появляется значок
  const ss = P.ss || {}, sk = P.sk || {}, ctl = alive && (ss.stun > 0 || ss.freeze > 0 || ss.silence > 0 || sk.hex > 0);
  if (ctl && !st.ctl) vo('stunned', 0.6, 10); st.ctl = ctl;
  // начало первой волны раунда (не на волне босса — там своя реплика)
  const ph = typeof SHOP !== 'undefined' ? SHOP.phase : 'rest';
  if (ph === 'fight' && st.phase !== 'fight' && BAL.at(wave).W !== 10 && !(typeof LIMBO !== 'undefined' && LIMBO.on)) vo('wave', 0.5, 0);
  st.phase = ph;
  // босс вышел — всегда; мини-босс — в половине случаев (решил сам: он выходит трижды за мир, каждый раз — слишком часто)
  if (!st.minis) st.minis = new WeakSet();
  if (st.boss && !enemies.includes(st.boss)) st.boss = null;   // бой сброшен (новая игра, другой мир)
  for (const e of enemies) {
    if (!voLive(e)) continue;
    if (e.boss && !e.clone && st.boss !== e && !st.minis.has(e)) { st.minis.add(e); st.boss = e; vo('boss', 1, 0, true); }
    else if (e.mini && !st.minis.has(e)) { st.minis.add(e); vo('boss', 0.5, 0); }
  }
  st.moving = P.moving; st.kills = kills; st.dead = P.dead; st.lvl = P.lvl;
}
// покупка в лавке (предмет, часть, склянка): золото ушло — реплика с шансом 40 %, не чаще раза в 20 с
addEventListener('load', () => {
  const paid = fn => function () { const g = SHOP.gold, r = fn.apply(this, arguments); if (SHOP.gold < g) vo('shop', 0.4, 20); return r; };
  if (typeof SHOP !== 'undefined' && SHOP.buy) SHOP.buy = paid(SHOP.buy);
  if (typeof buyItem === 'function') buyItem = paid(buyItem);
});

// ---------- эффекты лучницы ----------
const FX3 = {};
for (const k of ['arrow', 'hit', 'wave', 'shield', 'silence', 'aura', 'markglow', 'trail']) {
  const im = new Image(); FX3[k] = { img: im }; im.onload = () => { FX3[k].ok = true; }; im.src = 'fx/fx3_' + k + '.webp' + V;
}
function fx3(k, x, y, w, h, ax, ay, alpha, rot, ground) {
  if (!FX3[k].ok) return;
  ctx.save(); ctx.translate(x, y);
  if (ground) ctx.scale(1, YK);
  if (rot) ctx.rotate(rot);
  if (alpha != null) ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.drawImage(FX3[k].img, -w * ax, -h * ay, w, h);
  ctx.restore();
}

// ---------- Верный глаз (пассивка, кнопка R; Marksmanship) ----------
// Пока ни один враг не ближе 350 к Эйре: +12 % урона и +10 % дальности (+2 % и +1 % за уровень R), а 25 % стрел
// (+2 % за уровень R) — пронзающие: +60 % урона, не смотрят на щиты и броню врага, пролетают насквозь и бьют ещё одного.
const MARK_R = 350;
const markOn = () => (window.NETC && NETC.on) ? P.focus > 0 : !!P.mark;   // в онлайне решает сервер (флаг приходит в P.focus)
const markK = () => markOn() ? 1.12 + 0.02 * (skLv('r') - 1) : 1;
const markRange = () => markOn() ? 1.10 + 0.01 * (skLv('r') - 1) : 1;
const markPierce = () => 0.25 + 0.02 * (skLv('r') - 1) + (typeof ITEMFX !== 'undefined' && ITEMFX.pas('agh') ? ITEMFX.pas('agh').pierce : 0);   // Скипетр древних: +15 %
// урон умения: щиты боссов видят его как умение, а не как обычную атаку
function eiraSpell(fn) { const g = typeof heroSpell !== 'undefined'; if (g) heroSpell++; try { fn(); } finally { if (g) heroSpell--; } }

// ---------- атака: стрела ----------
const _shootMage = shoot;
shoot = function () {
  if (HERO_ID !== 'archer') { _shootMage(); voAttack(); return; }
  if (P.volley) return;   // идёт Залп
  const t = nearestEnemy(RANGE);
  let dx = P.face.x, dy = P.face.y;
  if (t) { dx = t.x - P.x; dy = (t.y - P.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; }
  const pr = markOn() && Math.random() < markPierce();
  arrow(dx, dy, t, rnd(40, 52) * markK() * (pr ? 1.6 : 1), pr ? { pierce: true, trueShot: true } : null);
  if (pr) snd('archer_ult_proc', 0.3, 1.6);   // короткий звон пронзающей стрелы
  P.atkCd = 0.6; P.cast = 0.12;
  P.act = { anim: 'atk', t: 0, dur: Math.min(mulDur(HERO, 'atk'), P.atkCd * 0.9), row: t ? runRow(t.x - P.x, t.y - P.y) : null };
  snd('archer_shot', 0.8);
  voAttack();
};
function arrow(dx, dy, tgt, dmg, extra) {
  const s = { own: 'p', arrow: true, x: P.x + dx * 26 * HS(), y: P.y + dy * 26 * YK * HS(), dx, dy, sp: 1300, tgt, left: RANGE + 120,
    dmg, h: CH * 0.6 * HS(), sc: HS(), sk: typeof heroSpell !== 'undefined' && heroSpell > 0 };
  if (extra) Object.assign(s, extra);
  shots.push(s);
}
const _drawShot = drawShot;
drawShot = function (s) {
  if (!s.arrow || !FX3.arrow.ok) return _drawShot(s);
  ctx.save(); ctx.translate(s.x, s.y - s.h); ctx.rotate(Math.atan2(s.dy * YK, s.dx));
  const w = 170 * (s.sc || 1);
  if (s.pierce && FX3.trail.ok) {   // пронзающая: светло-зелёный шлейф (картинка смотрит вправо, остриё — у наконечника стрелы)
    const tl = 300 * (s.sc || 1), th = tl * FX3.trail.img.naturalHeight / FX3.trail.img.naturalWidth;
    ctx.drawImage(FX3.trail.img, w * 0.1 - tl, -th / 2, tl, th);
  }
  ctx.drawImage(FX3.arrow.img, -w * 0.92, -w / 2, w, w);
  ctx.restore();
};

// ---------- скиллы лучницы ----------
const _castMage = cast;
cast = function (id) {
  if (HERO_ID !== 'archer') {
    if (P.dead > 0 || (typeof SHOP !== 'undefined' && SHOP.paused)) return;
    if (P.cd[id] > 0) { vo('cooldown', 1, 15); return; }
    if (P.mp < MANA[id]) { vo('nomana', 1, 15); return _castMage(id); }
    const was = P.cd[id];
    _castMage(id);
    if (P.cd[id] > was) voSkill(id);
    return;
  }
  if (P.dead > 0 || (typeof SHOP !== 'undefined' && SHOP.paused)) return;
  if (id === 'r') { say(P.x, P.y - CH * 1.2 * HS(), markOn() ? 'Верный глаз работает — пассивка' : 'Верный глаз: враг ближе ' + MARK_R + ' — отойди', '#d9ffb0'); return; }
  if (P.volley) return;   // канал Залпа не прерывается другим умением
  if (P.cd[id] > 0) { vo('cooldown', 1, 15); return; }
  if (P.mp < MANA[id]) { vo('nomana', 1, 15); if (!P.noMana || P.noMana < performance.now()) { say(P.x, P.y - CH * HS(), 'мало маны', '#8ab8ff'); P.noMana = performance.now() + 700; } return; }
  let row = runRow(P.face.x, P.face.y * YK), an = 'wave', dur = 0.55;
  // прицел: к ближайшему врагу в радиусе R, иначе туда, куда смотрит Эйра
  const aim = R => {
    const t = nearestEnemy(R); let dx = P.face.x, dy = P.face.y;
    if (t) { dx = t.x - P.x; dy = (t.y - P.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; row = runRow(t.x - P.x, t.y - P.y); }
    return [dx, dy];
  };
  if (id === 'q') {
    // Шквал: волна вперёд — полоса 900, ширина 140 → 320, скорость 1400; урон, немота, отброс от Эйры.
    // Стрела слетает на 3-м кадре анимации — тогда и идёт волна.
    const [dx, dy] = aim(1100);
    an = 'wave'; dur = mulDur(HERO, 'wave');
    P.gust = { t: 0, at: 3 * 0.09, dx, dy, lv: skLv('q'), k: markK() * skDmg('q') };
    snd('archer_wave', 0.9); voSkill('q');
  } else if (id === 'e') {
    // Залп: канал 0,9 с — 3 волны по 5 стрел веером 60°; Эйра идёт на половине скорости
    aim(RANGE * 1.1);
    an = 'volley'; dur = 0.9;
    P.volley = { t: 0, n: 0, k: markK() * skDmg('e') };
    snd('archer_volley', 0.9); voSkill('e');
  } else if (id === 'f') {
    // Щит листьев: снимает замедления, оглушение, немоту и яд; держит 260 (+12 за уровень героя) 8 с; в конце — взрыв
    eiraCleanse();
    P.shieldMax = P.shield = Math.round((260 + 12 * (P.lvl - 1)) * skDmg('f')); P.shieldT = 8;
    an = 'shield'; dur = mulDur(HERO, 'shield');
    say(P.x, P.y - CH * 1.2 * HS(), 'Щит ' + P.shield, '#b9ffcf');
    snd('archer_shield', 0.85); voSkill('f');
  }
  P.cd[id] = CDMAX[id] * (P.cdMul || 1) * skCd(id); P.cast = 0.25; P.mp -= MANA[id];
  P.act = { anim: an, t: 0, dur, row };
};
function eiraCleanse() {
  P.slowT = 0; P.slowK = 1;
  if (P.ss) { const s = P.ss; s.freeze = s.stun = s.silence = 0; for (const k of ['poison', 'burn', 'cold']) if (s[k]) s[k].n = 0; }
  if (typeof SK !== 'undefined' && SK.S) { const s = SK.S; for (const k of ['bind', 'pin', 'hex', 'atkSlow', 'weak', 'called', 'hunger', 'wounds']) s[k] = 0; if (s.poison) s.poison.n = 0; s.pull = null; }
}
// щит лопнул или кончился: взрыв R 320 — урон, равный поглощённому, но не меньше 80
function eiraShieldBurst() {
  const took = Math.max(0, (P.shieldMax || 0) - Math.max(0, P.shield || 0)), dmg = Math.max(80, took), R = 320;
  P.shield = 0; P.shieldT = 0; P.shieldMax = 0;
  fx.push({ type: 'wave3', x: P.x, y: P.y, t: 0, dur: 0.55, R });
  eiraSpell(() => { for (const e of enemies.slice()) if (e.hp > 0 && gdist(P, e) < R + e.rad) hurtEnemy(e, dmg, '#b9ffcf'); });
  say(P.x, P.y - CH * 1.2 * HS(), 'взрыв щита ' + Math.round(dmg), '#b9ffcf'); snd('archer_shield_break', 0.8);
}
// щит забирает урон на себя, пока не кончится
const _hurtPlayer = hurtPlayer;
hurtPlayer = function (d, kind) {
  if (P.dead <= 0 && P.shieldT > 0 && P.shield > 0) {
    const a = Math.min(P.shield, d);
    P.shield -= a; d -= a;
    if (P.shield <= 0) eiraShieldBurst();
    if (d <= 0) return;
  }
  _hurtPlayer(d, kind);
  if (P.dead <= 0) vo('hurt', 0.15, 20);
};
// каждый кадр: Верный глаз, дальность, волна ветра, канал Залпа, время щита
const _combatUpdate = combatUpdate;
combatUpdate = function (dt) {
  _combatUpdate(dt);
  heroVoiceTick();
  if (HERO_ID !== 'archer') return;
  P.mark = P.dead <= 0 && !enemies.some(e => e.hp > 0 && gdist(P, e) < MARK_R);
  RANGE = HEROES.archer.range * markRange();
  if (P.dead > 0) { P.shield = 0; P.shieldT = 0; P.shieldMax = 0; P.gust = null; P.volley = null; return; }
  const g = P.gust;
  if (g) {
    g.t += dt;
    if (!g.go && g.t >= g.at) { g.go = true; g.w = 0; g.x = P.x; g.y = P.y; g.hit = new Set(); fx.push({ type: 'gust3', x: P.x, y: P.y, ang: Math.atan2(g.dy, g.dx), t: 0, dur: 900 / 1400 + 0.3 }); }
    if (g.go) {
      g.w += dt;
      const front = Math.min(900, 1400 * g.w);
      eiraSpell(() => {
        for (const e of enemies.slice()) {
          if (e.hp <= 0 || g.hit.has(e)) continue;
          const ex = e.x - g.x, ey = (e.y - g.y) / YK, along = ex * g.dx + ey * g.dy, perp = Math.abs(ex * g.dy - ey * g.dx);
          if (along < -e.rad || along > front + e.rad) continue;
          const u = Math.max(0, Math.min(1, along / 900));
          if (perp > (140 + 180 * u) / 2 + e.rad) continue;
          g.hit.add(e);
          hurtEnemy(e, 70 * g.k, '#d9ffb0');
          const m = Math.hypot(ex, ey) || 1, push = e.boss ? 120 : 350 - 230 * u, t = 0.28;   // чем ближе к Эйре, тем дальше летит
          e.kb = { vx: ex / m * push / t, vy: ey / m * push / t * YK, t };
          e.silT = 3.5 + 0.15 * (g.lv - 1);
        }
      });
      if (g.w > 900 / 1400 + 0.05) P.gust = null;
    }
  }
  const v = P.volley;
  if (v) {
    v.t += dt; slowHero(0.5, 0.12); P.atkCd = Math.max(P.atkCd, 0.2);
    while (v.n < 3 && v.t >= 0.15 + 0.3 * v.n) {
      v.n++;
      const t = nearestEnemy(RANGE * 1.1);
      let dx = P.face.x, dy = P.face.y;
      if (t) { dx = t.x - P.x; dy = (t.y - P.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; if (P.act && P.act.anim === 'volley') P.act.row = runRow(t.x - P.x, t.y - P.y); }
      const a0 = Math.atan2(dy, dx);
      for (let i = -2; i <= 2; i++) { const a = a0 + i * Math.PI / 12; arrow(Math.cos(a), Math.sin(a), null, rnd(34, 42) * v.k, { sk: 1, onHit: e => slow(e, 0.85, 1.5) }); }
      snd('archer_shot', 0.6, 1.1);
    }
    if (v.t >= 0.9 || (typeof STATUS !== 'undefined' && STATUS.locked())) { P.volley = null; if (P.act && P.act.anim === 'volley' && v.t < 0.9) P.act = null; }
  }
  if (P.shieldT > 0) { P.shieldT -= dt; if (P.shieldT <= 0) eiraShieldBurst(); }
};

// ---------- рисование эффектов лучницы ----------
function heroGround(t) {
  for (const f of fx) {
    if (f.type === 'wave3') {   // взрыв щита: кольцо ветра с листьями
      const k = f.t / f.dur, s = f.R * 2.3 * (0.3 + 0.75 * easeOut(Math.min(1, k * 1.4)));
      fx3('wave', f.x, f.y, s, s, 0.5, 0.5, k < 0.5 ? 1 : (1 - k) / 0.5, k * 0.8, true);
    } else if (f.type === 'gust3' && FX3.wave.ok) {   // Шквал: тот же ветер, растянутый вдоль полосы, бежит от Эйры
      const front = Math.min(900, 1400 * f.t), tail = Math.max(0, front - 560), k = f.t / f.dur, im = FX3.wave.img, N = 12;
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(1, YK); ctx.rotate(f.ang);
      ctx.globalAlpha = k < 0.65 ? 0.95 : Math.max(0, (1 - k) / 0.35) * 0.95;
      for (let i = 0; i < N; i++) {
        const x0 = tail + (front - tail) * i / N, x1 = tail + (front - tail) * (i + 1) / N, w = 140 + 180 * (x1 / 900);
        ctx.drawImage(im, im.naturalWidth * i / N, 0, im.naturalWidth / N, im.naturalHeight, x0, -w / 2, x1 - x0 + 1, w);
      }
      ctx.restore();
    }
  }
}
// «Верный глаз» работает — под ногами Эйры лежит зелёно-золотое кольцо (fx3_aura): на земле, под спрайтом, медленно вращается и дышит.
// Гаснет, когда враг ближе 350, и загорается снова плавно, за 0,3 с.
{
  const _dp = drawPlayer; let a = 0, last = 0;
  drawPlayer = function () {
    if (HERO_ID === 'archer' && ctx.globalAlpha > 0.99) {   // копии-след рывка рисуются полупрозрачными — им кольцо не нужно
      const now = performance.now() / 1000, dt = Math.min(0.1, Math.max(0, now - last)); last = now;
      const on = markOn() && P.dead <= 0;
      a = Math.max(0, Math.min(1, a + (on ? dt : -dt) / 0.3));
      if (a > 0.01 && FX3.aura.ok) { const d = 160 * HS(); fx3('aura', P.x, P.y, d, d, 0.5, 0.5, a * (0.675 + 0.125 * Math.sin(now * 2.2)), now * 0.3, true); }
    }
    _dp();
  };
}
function heroOver(t) {
  // печать тишины над врагами
  for (const e of enemies) {
    if (!(e.silT > 0)) continue;
    const top = e.ch.ok ? e.ch.top * e.ch.U * e.sc : e.rad * 2.2;
    fx3('silence', e.x, e.y - top - 34 + Math.sin(t * 4 + e.x) * 3, 44, 44, 0.5, 0.5, Math.min(1, e.silT * 2));
  }
  if (HERO_ID !== 'archer' || P.dead > 0) return;
  // свечение «Меткости» — кольцо под ногами (drawPlayer ниже); овал на поясе убран в v98: читался как кольцо на животе
  // купол щита
  if (P.shieldT > 0) {
    const s = 230 * HS() * (1 + 0.03 * Math.sin(t * 5));
    fx3('shield', P.x, P.y - CH * 0.42 * HS(), s, s, 0.5, 0.5, 0.65 * Math.min(1, P.shieldT * 2));
  }
}
// кнопка пассивки: значок горит, пока Верный глаз работает, и гаснет, когда враг подошёл
function heroButton(b) {
  if (HERO_ID !== 'archer' || b.id !== 'r') return false;
  if (!markOn()) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, 0, 7); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill(); }
  return true;
}

// ---------- выбор героя перед боем ----------
(function heroSelect() {
  let saved = 'mage';
  try { saved = localStorage.getItem(HERO_KEY) || 'mage'; } catch (e) {}
  setHero(saved);
  const U = n => 'url(ui/' + n + '.webp' + V + ')';
  const css = document.createElement('style');
  css.textContent = `
  #hSel { position: fixed; inset: 0; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2vh;
    background: radial-gradient(ellipse at center, rgba(6,14,24,.55), rgba(2,6,12,.88)); color: #fff; font-family: system-ui, sans-serif;
    text-shadow: 0 1px 3px #000; user-select: none; -webkit-user-select: none; }
  #hSel .pl { width: 46vh; height: 12vh; background: ${U('h_plaque')} center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center; font: bold 3.6vh system-ui; letter-spacing: .08em; }
  #hSel .row { display: flex; gap: 4vh; }
  #hSel .card { width: min(40vh, 44vw); padding: 2vh 2vh 2.4vh; border-radius: 2vh; background: rgba(10,22,40,.75); border: .4vh solid rgba(160,190,230,.35);
    display: flex; flex-direction: column; align-items: center; gap: .8vh; cursor: pointer; touch-action: manipulation; transition: transform .15s; }
  #hSel .card.on { border-color: #ffe27a; box-shadow: 0 0 3vh rgba(255,226,122,.45); transform: scale(1.04); }
  #hSel .card i { display: block; width: 18vh; height: 18vh; background-size: 100% 100%; }
  #hSel .card b { font-size: 3.2vh; } #hSel .card em { font-style: normal; color: #ffe27a; font-size: 2.3vh; }
  #hSel .card ul { margin: .6vh 0 0; padding-left: 2.6vh; font-size: 1.95vh; line-height: 1.45; opacity: .92; }
  #hSel .go { width: 40vh; height: 10.5vh; background: ${U('h_button')} center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center;
    font: bold 3.3vh system-ui; color: #ffe9a8; cursor: pointer; touch-action: manipulation; letter-spacing: .06em; }`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'hSel';
  box.innerHTML = '<div class="pl">ВЫБЕРИ ГЕРОЯ</div><div class="row"></div><div class="go">В БОЙ</div>';
  for (const ev of ['touchstart', 'mousedown', 'pointerdown']) box.addEventListener(ev, x => x.stopPropagation(), { passive: true });
  const row = box.querySelector('.row'), cards = {};
  for (const id in HEROES) {
    const h = HEROES[id], c = document.createElement('div'); c.className = 'card';
    c.innerHTML = '<i style="background-image:url(' + h.portrait + V + ')"></i><b>' + h.name + '</b><em>' + h.role + '</em><ul>' +
      h.skills.map(x => '<li>' + x + '</li>').join('') + '</ul>';
    c.addEventListener('pointerdown', () => { setHero(id); for (const k in cards) cards[k].classList.toggle('on', k === id); });
    row.appendChild(c); cards[id] = c;
  }
  cards[HERO_ID].classList.add('on');
  box.querySelector('.go').addEventListener('pointerdown', () => { box.style.display = 'none'; });
  document.body.appendChild(box);
  addEventListener('keydown', e => { if (box.style.display !== 'none' && (e.code === 'Enter' || e.code === 'Space')) { box.style.display = 'none'; e.stopImmediatePropagation(); } }, true);
  // в меню паузы: сменить героя (бой начнётся заново)
  if (typeof SHOP !== 'undefined' && SHOP.el && SHOP.el.pause) {
    const b = document.createElement('div'); b.className = 'mb bg'; b.textContent = 'Сменить героя';
    b.addEventListener('pointerdown', x => { x.stopPropagation(); try { sessionStorage.setItem('hw_tomenu', '1'); } catch (e) {} location.reload(); });
    SHOP.el.pause.insertBefore(b, SHOP.el.pause.querySelector('.tip'));
  }
})();
