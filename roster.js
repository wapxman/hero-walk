// Злодеи игры — только данные (v91: вынесено из combat.js, чтобы сервер онлайна, модель баланса и импорт звуков читали
// таблицу целиком, а не вырезали кусок кода по меткам): виды врагов KIND, перекрашенные варианты VARIANT, мини-боссы,
// у кого из них есть листы MINI_ART, и кто выходит в каком мире ROSTER. Умения — enemies.js, sk_defs.js, mini.js, bossmech.js.
// Подключается перед combat.js; на сервере — server/server.js (vm), в инструментах — tools/balance_sim.py, tools/bossvo_import.py.
'use strict';
// виды врагов: mel — ближний бой, rng — стрелок
const KIND = {
  // ---- злодеи Лесной поляны из ChatGPT (v50, roster.py). pcol — цвет снаряда стрелка ----
  shadowwolf: { nm: 'Теневой волк', ch: 'shadowwolf', mel: 1, hp: 95, rad: 24, speed: 205, dmg: [9, 12], cd: 0.8, reach: 68, xp: 8, gold: 6, col: '#3a2a4a' },
  sporeshaman: { nm: 'Грибной шаман', ch: 'sporeshaman', rng: 1, hp: 110, rad: 20, speed: 100, dmg: [13, 18], cd: 1.8, want: 450, shot: 500, pcol: '120,230,90', slowShot: 1, xp: 12, gold: 9, col: '#8a3a2a' },
  thornimp: { nm: 'Колючий бес', ch: 'thornimp', rng: 1, hp: 85, rad: 18, speed: 150, dmg: [8, 11], cd: 1.5, want: 520, shot: 720, pcol: '150,170,70', fan: 3, xp: 11, gold: 8, col: '#4a6a2a' },
  rotdryad: { nm: 'Гнилая дриада', ch: 'rotdryad', mel: 1, hp: 150, rad: 22, speed: 112, dmg: [13, 17], cd: 1.15, reach: 100, xp: 12, gold: 9, col: '#6a6a5a' },
  boarbrute: { nm: 'Кабан-громила', ch: 'boarbrute', mel: 1, hp: 240, rad: 30, speed: 96, dmg: [22, 28], cd: 1.6, reach: 84, xp: 18, gold: 13, col: '#6a4a2a' },
  // ---- Проклятое болото (мир 2) ----
  bogghoul: { nm: 'Болотный упырь', ch: 'bogghoul', mel: 1, hp: 125, rad: 22, speed: 172, dmg: [10, 14], cd: 0.75, reach: 66, xp: 10, gold: 7, col: '#4a5a3a' },
  toadwitch: { nm: 'Жабья ведьма', ch: 'toadwitch', rng: 1, hp: 125, rad: 22, speed: 104, dmg: [15, 20], cd: 1.7, want: 470, shot: 540, pcol: '190,220,60', xp: 14, gold: 11, col: '#5a7a2a' },
  leechworm: { nm: 'Пиявец', ch: 'leechworm', mel: 1, hp: 140, rad: 24, speed: 135, dmg: [9, 12], cd: 0.7, reach: 64, leech: 0.39, xp: 11, gold: 8, col: '#5a2a3a' },
  drownedknight: { nm: 'Утопленник', ch: 'drownedknight', mel: 1, hp: 330, rad: 30, speed: 88, dmg: [24, 30], cd: 1.6, reach: 96, xp: 20, gold: 15, col: '#2a4a5a' },
  wisplantern: { nm: 'Фонарщик', ch: 'wisplantern', rng: 1, hp: 115, rad: 22, speed: 92, dmg: [18, 24], cd: 2.0, want: 520, shot: 430, pcol: '110,240,210', xp: 14, gold: 11, col: '#2a5a5a' },
  // ---- Осенняя долина (мир 3) ----
  scarecrow: { nm: 'Пугало-жнец', ch: 'scarecrow', mel: 1, hp: 175, rad: 24, speed: 128, dmg: [13, 18], cd: 0.9, reach: 80, xp: 13, gold: 10, col: '#7a5a2a' },
  werefox: { nm: 'Лис-оборотень', ch: 'werefox', mel: 1, hp: 140, rad: 22, speed: 165, dmg: [9, 12], cd: 0.55, reach: 64, xp: 12, gold: 9, col: '#8a4a1a' },
  autumnbear: { nm: 'Осенний медведь', ch: 'autumnbear', mel: 1, hp: 360, rad: 32, speed: 92, dmg: [24, 31], cd: 1.5, reach: 92, xp: 20, gold: 15, col: '#6a3a1a' },
  crowharpy: { nm: 'Ворона-гарпия', ch: 'crowharpy', rng: 1, hp: 120, rad: 22, speed: 140, dmg: [11, 15], cd: 1.5, want: 480, shot: 700, pcol: '60,50,80', fan: 2, xp: 13, gold: 10, col: '#2a2a3a' },
  hollowarcher: { nm: 'Пустой лучник', ch: 'hollowarcher', rng: 1, hp: 130, rad: 21, speed: 118, dmg: [16, 21], cd: 1.45, want: 540, shot: 820, pcol: '255,150,60', xp: 14, gold: 11, col: '#6a4a2a' },
  // ---- Пепельные земли (мир 4) ----
  magmahound: { nm: 'Магмовый пёс', ch: 'magmahound', mel: 1, hp: 150, rad: 24, speed: 200, dmg: [12, 16], cd: 0.8, reach: 68, xp: 12, gold: 9, col: '#8a2a0a' },
  fireimp: { nm: 'Огненный бес', ch: 'fireimp', mel: 1, hp: 120, rad: 19, speed: 185, dmg: [10, 14], cd: 0.7, reach: 70, xp: 11, gold: 8, col: '#9a3a0a' },
  salamander: { nm: 'Саламандра-воин', ch: 'salamander', mel: 1, hp: 380, rad: 30, speed: 95, dmg: [22, 28], cd: 1.3, reach: 100, xp: 20, gold: 15, col: '#8a4a1a' },
  ashcultist: { nm: 'Пепельный культист', ch: 'ashcultist', rng: 1, hp: 135, rad: 22, speed: 100, dmg: [17, 22], cd: 1.7, want: 500, shot: 560, pcol: '255,110,40', xp: 14, gold: 11, col: '#5a2a1a' },
  cinderwraith: { nm: 'Пепельный призрак', ch: 'cinderwraith', rng: 1, hp: 125, rad: 22, speed: 135, dmg: [12, 16], cd: 1.5, want: 480, shot: 640, pcol: '255,80,40', fan: 3, xp: 14, gold: 11, col: '#4a3a3a' },
  // ---- элита из злодеев ChatGPT: тот же лист, своё имя, сильнее (BAL.ELITE: ×3,5 здоровья, ×1,7 урона, крупнее) ----
  el_drowned: { nm: 'Утопленник-капитан', ch: 'drownedknight', base: 'drownedknight', elite: 1, mel: 1, hp: 200, rad: 30, speed: 92, dmg: [16, 21], cd: 1.4, reach: 100, xp: 24, gold: 18, col: '#2a4a5a' },
  el_witch: { nm: 'Жабья матрона', ch: 'toadwitch', base: 'toadwitch', elite: 1, rng: 1, hp: 140, rad: 24, speed: 100, dmg: [13, 17], cd: 1.5, want: 480, shot: 560, pcol: '190,220,60', fan: 3, xp: 22, gold: 16, col: '#5a7a2a' },
  el_bear: { nm: 'Матёрый медведь', ch: 'autumnbear', base: 'autumnbear', elite: 1, mel: 1, hp: 220, rad: 32, speed: 98, dmg: [16, 21], cd: 1.4, reach: 96, xp: 24, gold: 18, col: '#6a3a1a' },
  el_salamander: { nm: 'Саламандра-вожак', ch: 'salamander', base: 'salamander', elite: 1, mel: 1, hp: 230, rad: 30, speed: 100, dmg: [16, 21], cd: 1.25, reach: 104, xp: 24, gold: 18, col: '#8a4a1a' },
  el_cultist: { nm: 'Верховный культист', ch: 'ashcultist', base: 'ashcultist', elite: 1, rng: 1, hp: 150, rad: 24, speed: 100, dmg: [14, 18], cd: 1.6, want: 500, shot: 580, pcol: '255,110,40', fan: 3, xp: 22, gold: 16, col: '#5a2a1a' },
  // Шипокорень: медленный и толстый, бьёт сильно и с длинной руки, из-под земли выпускает корни
  thornroot: { nm: 'Шипокорень', ch: 'thornroot', elite: 1, mel: 1, hp: 280, rad: 34, speed: 92, dmg: [18, 24], cd: 1.45, reach: 92, xp: 24, gold: 18, col: '#5a4a2a' },
  // ---- боссы миров: на 10-й волне своего мира ----
  // боссы ChatGPT: обе магии из roster.py — метка на земле, урон, эффект картинкой vfx (how: target / self / multi / moving).
  // ph — номер реплики в NET.PHRASES, eff: root — держит героя на месте, poison — зона жжёт, пока стоишь в ней
  b_thornqueen: { nm: ['Королева Колючек', 'хозяйка проклятого леса'], ch: 'b_thornqueen', boss: 1, mel: 1, hp: 2000, rad: 52, speed: 92, dmg: [44, 56], cd: 1.3, reach: 120,
    xp: 150, gold: 100, col: '#6a2a3a', sz: 1.15, spells: [
      { nm: 'Корни', ph: 14, how: 'target', R: 130, warn: 1.0, dmg: 60, eff: 'root', t: 1.8, cd: 9, an: 'cast1' },
      { nm: 'Ядовитый сад', ph: 15, how: 'self', R: 300, warn: 0.8, dmg: 20, tick: 0.5, t: 3.5, eff: 'poison', cd: 13, an: 'cast2' }] },
  // Король-Жаб: кислотный плевок оставляет под героем едкую лужу; трясина вокруг него жжёт и замедляет (eff: slow)
  b_toadking: { nm: ['Король-Жаб', 'владыка Проклятого болота'], ch: 'b_toadking', boss: 1, mel: 1, hp: 2200, rad: 58, speed: 84, dmg: [48, 60], cd: 1.45, reach: 125,
    xp: 150, gold: 100, col: '#4a5a2a', sz: 1.15, spells: [
      { nm: 'Кислотный плевок', ph: 17, how: 'target', R: 125, warn: 1.0, dmg: 50, eff: 'poison', tick: 0.5, pdmg: 14, t: 3.5, cd: 8, an: 'cast1' },
      { nm: 'Трясина', ph: 18, how: 'self', R: 320, warn: 0.8, dmg: 10, tick: 0.5, eff: 'slow', slow: 0.45, t: 4.5, cd: 14, an: 'cast2' }] },
  // Жнец Урожая: огненный вихрь из листьев летит в героя; горящие тыквы падают вокруг героя
  b_reaper: { nm: ['Жнец Урожая', 'хозяин Осенней долины'], ch: 'b_reaper', boss: 1, mel: 1, hp: 1900, rad: 56, speed: 96, dmg: [50, 62], cd: 1.3, reach: 135,
    xp: 150, gold: 100, col: '#6a3a0a', sz: 1.15, spells: [
      { nm: 'Вихрь листьев', ph: 19, how: 'moving', R: 140, warn: 0, dmg: 80, cd: 7, an: 'cast1' },
      { nm: 'Тыквенные бомбы', ph: 20, how: 'multi', R: 115, warn: 1.1, dmg: 58, cd: 11, an: 'cast2' }] },
  // Владыка Пепла: метеоры по трём отмеченным кругам; огненное кольцо — удар вокруг и огонь ещё горит (hit — удар сразу, dmg — ожог)
  b_ashlord: { nm: ['Владыка Пепла', 'повелитель Пепельных земель'], ch: 'b_ashlord', boss: 1, mel: 1, hp: 1750, rad: 58, speed: 92, dmg: [54, 66], cd: 1.35, reach: 135,
    xp: 150, gold: 100, col: '#7a1a0a', sz: 1.15, spells: [
      { nm: 'Метеоритный дождь', ph: 21, how: 'multi', R: 125, warn: 1.1, dmg: 50, cd: 9, an: 'cast1' },
      { nm: 'Огненное кольцо', ph: 22, how: 'self', R: 300, warn: 0.9, hit: 55, dmg: 14, tick: 0.5, eff: 'poison', t: 2.5, cd: 13, an: 'cast2' }] },
  // Архимаг Бездны — финальный босс: выходит после Владыки Пепла на 10-й волне 4-го мира (ROSTER[4].final).
  // Сфера Бездны летит медленно (sp) и взрывается у героя; Разлом — три метки трещин вокруг героя
  b_voidmage: { nm: ['Архимаг Бездны', 'финальный босс'], ch: 'b_voidmage', boss: 1, mel: 1, hp: 2600, rad: 54, speed: 96, dmg: [56, 70], cd: 1.4, reach: 140,
    xp: 300, gold: 250, col: '#3a1a5a', sz: 1.15, spells: [
      { nm: 'Сфера Бездны', ph: 23, how: 'moving', R: 170, warn: 0, dmg: 110, sp: 200, cd: 8, an: 'cast1' },
      { nm: 'Разлом', ph: 24, how: 'multi', R: 120, warn: 1.0, dmg: 60, cd: 10, an: 'cast2' }] },
};
// кто выходит в каком мире: рядовые ближнего и дальнего боя, элита и босс мира
// ---- перекрашенные злодеи (tint — CSS-фильтр, лист перекрашивается один раз при загрузке, см. loadMul).
// v96: перекраски рядовых и элиты убраны — у каждого мира свои злодеи (34 новых, ниже); остались только временные боссы tb_*.
// Боссы миров без готового арта — временно перекрашенные существующие боссы (с их магией), до прихода настоящих.
const VARIANT = {
  // 1 Королевский замок
  tb_blackknight: ['b_reaper', ['Чёрный Рыцарь', 'страж Королевского замка'], 'grayscale(0.9) brightness(0.6) contrast(1.4)'],
  // 2 Горящая деревня
  tb_plaguelord: ['b_ashlord', ['Чумной Мародёр', 'поджигатель деревни'], 'hue-rotate(60deg) saturate(0.7) brightness(0.9)'],
  // 3 Осенний лес
  tb_serpentqueen: ['b_thornqueen', ['Королева Змей', 'хозяйка Осеннего леса'], 'hue-rotate(40deg) saturate(1.4)'],
  // 5 Гномьи шахты
  tb_forgegolem: ['b_ashlord', ['Горн-Голем', 'сердце Гномьих шахт'], 'sepia(0.8) hue-rotate(-15deg) brightness(1.05)'],
  // 6 Ледяные вершины
  tb_frostqueen: ['b_thornqueen', ['Королева Вьюги', 'владычица Ледяных вершин'], 'hue-rotate(160deg) saturate(0.8) brightness(1.3)'],
  // 7 Руины Зеркального города
  tb_mirrorlord: ['b_voidmage', ['Зеркальный Лорд', 'хозяин Руин'], 'grayscale(0.85) brightness(1.4)'],
  // 9 Небесный храм
  tb_skyjudge: ['b_voidmage', ['Небесный Судья', 'страж Небесного храма'], 'sepia(0.9) hue-rotate(-10deg) brightness(1.35) saturate(1.4)'],
};
for (const id in VARIANT) {
  const [base, nm, tint] = VARIANT[id], b = KIND[base];
  KIND[id] = Object.assign({}, b, { nm, ch: id, chBase: b.ch, base: b.base || base, tint });
}
// ---- новые боссы Клауди (ночь 19.11): механика — bossmech.js; spells — запасной вариант для сервера ----
KIND.b_blackknight = { nm: ['Чёрный Рыцарь', 'страж Королевского замка'], ch: 'b_blackknight', boss: 1, mel: 1, hp: 1900, rad: 54, speed: 96, dmg: [44, 56], cd: 1.3, reach: 130,
  xp: 150, gold: 100, col: '#2a2a3a', sz: 1.15, spells: [
    { nm: 'Зеркальный щит', ph: 21, how: 'self', R: 140, warn: 0.7, dmg: 0, cd: 10, an: 'cast1' },
    { nm: 'Таран', ph: 21, how: 'target', R: 120, warn: 0.8, dmg: 40, cd: 7, an: 'cast2' }] };
KIND.b_serpentqueen = { nm: ['Королева Змей', 'хозяйка Осеннего леса'], ch: 'b_serpentqueen', boss: 1, mel: 1, hp: 2050, rad: 52, speed: 100, dmg: [46, 58], cd: 1.25, reach: 125,
  xp: 150, gold: 100, col: '#3a5a1a', sz: 1.15, spells: [
    { nm: 'Змеиный рой', ph: 20, how: 'multi', R: 110, warn: 1.0, dmg: 35, cd: 9, an: 'cast1' },
    { nm: 'Ядовитый взгляд', ph: 20, how: 'moving', R: 120, warn: 0, dmg: 50, cd: 8, an: 'cast2' }] };
KIND.b_frostqueen = { nm: ['Королева Вьюги', 'владычица Ледяных вершин'], ch: 'b_frostqueen', boss: 1, mel: 1, hp: 2150, rad: 52, speed: 96, dmg: [48, 60], cd: 1.3, reach: 125,
  xp: 150, gold: 100, col: '#5a7a9a', sz: 1.15, spells: [
    { nm: 'Вьюга', ph: 22, how: 'self', R: 330, warn: 0.8, dmg: 12, tick: 0.8, eff: 'slow', slow: 0.6, t: 5, cd: 10, an: 'cast1' },
    { nm: 'Ледяной плен', ph: 22, how: 'target', R: 110, warn: 1.0, dmg: 30, eff: 'root', t: 1.5, cd: 9, an: 'cast2' }] };
KIND.b_plaguelord = { nm: ['Чумной Мародёр', 'поджигатель деревни'], ch: 'b_plaguelord', boss: 1, mel: 1, hp: 1950, rad: 52, speed: 98, dmg: [44, 56], cd: 1.3, reach: 125,
  xp: 150, gold: 100, col: '#4a3a2a', sz: 1.15, spells: [
    { nm: 'Дымовая завеса', ph: 21, how: 'self', R: 300, warn: 0.8, dmg: 0, cd: 11, an: 'cast1' },
    { nm: 'Поджог', ph: 21, how: 'target', R: 120, warn: 0.9, dmg: 20, eff: 'poison', tick: 0.5, pdmg: 12, t: 4, cd: 7, an: 'cast2' }] };
KIND.b_forgegolem = { nm: ['Горн-Голем', 'сердце Гномьих шахт'], ch: 'b_forgegolem', boss: 1, mel: 1, hp: 2300, rad: 58, speed: 86, dmg: [52, 64], cd: 1.45, reach: 130,
  xp: 150, gold: 100, col: '#6a4a2a', sz: 1.15, spells: [
    { nm: 'Плавильный удар', ph: 21, how: 'target', R: 115, warn: 0.8, dmg: 40, cd: 5, an: 'cast1' },
    { nm: 'Кузнечный жар', ph: 21, how: 'self', R: 300, warn: 0.8, hit: 22, dmg: 0, cd: 11, an: 'cast2' }] };
KIND.b_mirrorlord = { nm: ['Зеркальный Лорд', 'хозяин Руин'], ch: 'b_mirrorlord', boss: 1, mel: 1, hp: 2250, rad: 52, speed: 98, dmg: [50, 62], cd: 1.3, reach: 125,
  xp: 150, gold: 100, col: '#8a8aa0', sz: 1.15, spells: [
    { nm: 'Отражение', ph: 21, how: 'self', R: 140, warn: 0.6, dmg: 0, cd: 18, an: 'cast1' },
    { nm: 'Осколки', ph: 21, how: 'multi', R: 110, warn: 0.9, dmg: 40, cd: 6, an: 'cast2' }] };
KIND.b_skyjudge = { nm: ['Небесный Судья', 'страж Небесного храма'], ch: 'b_skyjudge', boss: 1, mel: 1, hp: 2400, rad: 54, speed: 96, dmg: [54, 66], cd: 1.35, reach: 130,
  xp: 150, gold: 100, col: '#a08a4a', sz: 1.15, spells: [
    { nm: 'Печать Безмолвия', ph: 21, how: 'target', R: 120, warn: 0.9, dmg: 20, cd: 10, an: 'cast1' },
    { nm: 'Небесная кара', ph: 21, how: 'multi', R: 105, warn: 1.0, dmg: 40, cd: 7, an: 'cast2' }] };
// новые злодеи Клауди под 10 миров (roster_night.py)
KIND.porcelainmaid = { nm: 'Фарфоровая фрейлина', ch: 'porcelainmaid', mel: 1, hp: 120, rad: 21, speed: 160, dmg: [10, 13], cd: 0.7, reach: 70, xp: 10, gold: 7, col: '#c0b0b0' };
KIND.jester = { nm: 'Безумный шут', ch: 'jester', rng: 1, hp: 105, rad: 20, speed: 135, dmg: [9, 12], cd: 1.6, want: 470, shot: 600, pcol: '255,200,80', fan: 3, xp: 11, gold: 8, col: '#a03030' };
KIND.gembeetle = { nm: 'Самоцветный жук', ch: 'gembeetle', mel: 1, hp: 260, rad: 28, speed: 110, dmg: [18, 24], cd: 1.2, reach: 80, xp: 16, gold: 12, col: '#4a6a8a' };
KIND.dwarfbomber = { nm: 'Гном-подрывник', ch: 'dwarfbomber', rng: 1, hp: 120, rad: 20, speed: 115, dmg: [16, 21], cd: 2.0, want: 520, shot: 480, pcol: '255,140,40', xp: 13, gold: 10, col: '#7a5a3a' };
KIND.yeti = { nm: 'Йети-камнемёт', ch: 'yeti', rng: 1, hp: 300, rad: 30, speed: 90, dmg: [24, 30], cd: 2.2, want: 540, shot: 460, pcol: '170,220,255', slowShot: 1, xp: 18, gold: 14, col: '#a0b0c0' };
KIND.glassdancer = { nm: 'Витражная плясунья', ch: 'glassdancer', mel: 1, hp: 150, rad: 22, speed: 150, dmg: [13, 17], cd: 0.8, reach: 84, xp: 13, gold: 10, col: '#8090c0' };
KIND.frostlynx = { nm: 'Хрустальный барс', ch: 'frostlynx', mel: 1, hp: 140, rad: 24, speed: 205, dmg: [13, 17], cd: 0.75, reach: 70, xp: 12, gold: 9, col: '#a0c0e0' };
KIND.prismkeeper = { nm: 'Хранитель призмы', ch: 'prismkeeper', rng: 1, hp: 140, rad: 22, speed: 100, dmg: [20, 26], cd: 2.0, want: 560, shot: 900, pcol: '200,235,255', bolt: 1, xp: 15, gold: 11, col: '#c0d0e0' };
KIND.marblegriffin = { nm: 'Мраморный грифон', ch: 'marblegriffin', mel: 1, hp: 300, rad: 30, speed: 140, dmg: [22, 28], cd: 1.1, reach: 84, xp: 18, gold: 14, col: '#d0d0c0' };
KIND.skyharpist = { nm: 'Небесная арфистка', ch: 'skyharpist', rng: 1, hp: 135, rad: 22, speed: 110, dmg: [14, 18], cd: 1.6, want: 500, shot: 620, pcol: '255,225,120', fan: 3, xp: 14, gold: 11, col: '#e0d0a0' };
// ---- 34 новых рядовых злодея (v96, пакет Клауди 20–21.11, VILLAINS34_FOR_KLOD.md): у каждого мира свои, по одному умению (v34.js).
// Роли от среднего рядового (ближний 180 HP, скорость 145, 16 урона/с; дальний 125 HP, скорость 115, 10 урона/с):
// танк — HP ×1,6, скорость ×0,8, урон ×1,1; дамагер — HP ×0,8, скорость ×1,2, урон ×1,3, бьёт чаще; маг — дальний, HP ×0,8, урон обычный.
// wide — зверь шире обычного: круг столкновения шире (rad ×√wide), ближнему — рука длиннее.
// 1 Королевский замок
KIND.v_butcher = { nm: 'Тюремный мясник', ch: 'v_butcher', mel: 1, hp: 290, rad: 30, speed: 116, dmg: [22, 27], cd: 1.4, reach: 92, xp: 19, gold: 14 };
KIND.v_maskedassassin = { nm: 'Убийца в маске', ch: 'v_maskedassassin', mel: 1, hp: 128, rad: 22, speed: 166, dmg: [11, 14], cd: 0.7, reach: 70, xp: 10, gold: 7 };   // v117: теперь основной рядовой мира 1 (вместо фрейлины) — числа чуть ниже прежних (было 145 / 175 / 13–16)
KIND.v_chaplain = { nm: 'Чумной капеллан', ch: 'v_chaplain', rng: 1, hp: 100, rad: 21, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '140,235,90', xp: 14, gold: 11 };
KIND.v_warlock = { nm: 'Королевский чернокнижник', ch: 'v_warlock', rng: 1, hp: 100, rad: 21, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '255,60,50', xp: 14, gold: 11 };
// 2 Горящая деревня
KIND.v_batrider = { nm: 'Поджигатель на нетопыре', ch: 'v_batrider', rng: 1, hp: 100, rad: 27, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '255,140,40', xp: 14, gold: 11, wide: 1.7 };
KIND.v_ghoulfarmer = { nm: 'Восставший селянин', ch: 'v_ghoulfarmer', mel: 1, hp: 290, rad: 30, speed: 116, dmg: [22, 27], cd: 1.4, reach: 92, xp: 19, gold: 14 };
// 4 Проклятое болото
KIND.v_slithereen = { nm: 'Трясинный рыбоглав', ch: 'v_slithereen', mel: 1, hp: 145, rad: 22, speed: 175, dmg: [13, 16], cd: 0.7, reach: 70, xp: 12, gold: 9 };
// 5 Гномьи шахты
KIND.v_tunnelmammoth = { nm: 'Мамонт-проходчик', ch: 'v_tunnelmammoth', mel: 1, hp: 290, rad: 38, speed: 116, dmg: [22, 27], cd: 1.4, reach: 98, xp: 19, gold: 14, wide: 1.6 };
KIND.v_orespark = { nm: 'Рудный искровик', ch: 'v_orespark', rng: 1, hp: 100, rad: 21, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '110,200,255', xp: 14, gold: 11 };
KIND.v_koboldtrapper = { nm: 'Кобольд-ловчий', ch: 'v_koboldtrapper', mel: 1, hp: 145, rad: 22, speed: 175, dmg: [13, 16], cd: 0.7, reach: 70, xp: 12, gold: 9 };
KIND.v_teslaguard = { nm: 'Гномий тесла-страж', ch: 'v_teslaguard', rng: 1, hp: 100, rad: 21, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '185,225,255', xp: 14, gold: 11 };
// 6 Ледяные вершины
KIND.v_glacierlich = { nm: 'Лич ледника', ch: 'v_glacierlich', rng: 1, hp: 100, rad: 21, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '170,225,255', xp: 14, gold: 11 };
KIND.v_icejelly = { nm: 'Ледяная медуза', ch: 'v_icejelly', rng: 1, hp: 100, rad: 21, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '150,210,255', xp: 14, gold: 11 };
KIND.v_snowpackalpha = { nm: 'Снежный вожак', ch: 'v_snowpackalpha', mel: 1, hp: 145, rad: 29, speed: 175, dmg: [13, 16], cd: 0.7, reach: 76, xp: 12, gold: 9, wide: 1.75 };
KIND.v_permafrostknight = { nm: 'Рыцарь вечной мерзлоты', ch: 'v_permafrostknight', mel: 1, hp: 290, rad: 37, speed: 116, dmg: [22, 27], cd: 1.4, reach: 98, xp: 19, gold: 14, wide: 1.5 };
// 7 Руины Зеркального города
KIND.v_spectralblade = { nm: 'Призрачный клинок', ch: 'v_spectralblade', mel: 1, hp: 145, rad: 22, speed: 175, dmg: [13, 16], cd: 0.7, reach: 70, xp: 12, gold: 9 };
KIND.v_mirrorweaver = { nm: 'Зеркальный скиталец', ch: 'v_mirrorweaver', mel: 1, hp: 145, rad: 28, speed: 175, dmg: [13, 16], cd: 0.7, reach: 75, xp: 12, gold: 9, wide: 1.6 };
KIND.v_darkseer = { nm: 'Тёмный провидец руин', ch: 'v_darkseer', rng: 1, hp: 100, rad: 21, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '120,100,235', xp: 14, gold: 11 };
KIND.v_gargoyle = { nm: 'Горгулья руин', ch: 'v_gargoyle', mel: 1, hp: 290, rad: 38, speed: 116, dmg: [22, 27], cd: 1.4, reach: 98, xp: 19, gold: 14, wide: 1.6 };
// 8 Огненный вулкан
KIND.v_souldemon = { nm: 'Демон душ', ch: 'v_souldemon', rng: 1, hp: 100, rad: 25, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '255,90,50', xp: 14, gold: 11, wide: 1.4 };
KIND.v_lavatick = { nm: 'Огненный клещ', ch: 'v_lavatick', mel: 1, hp: 145, rad: 28, speed: 175, dmg: [13, 16], cd: 0.7, reach: 75, xp: 12, gold: 9, wide: 1.6 };
KIND.v_firehorn = { nm: 'Огнерогий', ch: 'v_firehorn', rng: 1, hp: 100, rad: 26, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '255,120,30', xp: 14, gold: 11, wide: 1.5 };
KIND.v_lavaskeletonking = { nm: 'Лавовый король-скелет', ch: 'v_lavaskeletonking', mel: 1, hp: 290, rad: 30, speed: 116, dmg: [22, 27], cd: 1.4, reach: 92, xp: 19, gold: 14 };
KIND.v_ashskeleton = { nm: 'Пепельный лучник', ch: 'v_ashskeleton', rng: 1, hp: 100, rad: 21, speed: 138, dmg: [15, 20], cd: 1.3, want: 520, shot: 780, pcol: '255,150,50', xp: 13, gold: 10, bolt: 1 };
// 9 Небесный храм
KIND.v_fallensunpriest = { nm: 'Падший жрец солнца', ch: 'v_fallensunpriest', rng: 1, hp: 100, rad: 21, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '255,215,90', xp: 14, gold: 11 };
KIND.v_featherserpent = { nm: 'Пернатый змей', ch: 'v_featherserpent', rng: 1, hp: 100, rad: 27, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '160,90,220', xp: 14, gold: 11, wide: 1.6 };
KIND.v_bloodpriest = { nm: 'Жрец крови', ch: 'v_bloodpriest', mel: 1, hp: 145, rad: 22, speed: 175, dmg: [13, 16], cd: 0.7, reach: 70, xp: 12, gold: 9 };
KIND.v_eclipser = { nm: 'Затмевающий', ch: 'v_eclipser', mel: 1, hp: 290, rad: 37, speed: 116, dmg: [22, 27], cd: 1.4, reach: 98, xp: 19, gold: 14, wide: 1.5 };
// 10 Бездна
KIND.v_abyssguard = { nm: 'Глубинный страж', ch: 'v_abyssguard', mel: 1, hp: 290, rad: 34, speed: 116, dmg: [22, 27], cd: 1.4, reach: 95, xp: 19, gold: 14, wide: 1.3 };
KIND.v_abyssberserker = { nm: 'Бездный берсерк', ch: 'v_abyssberserker', mel: 1, hp: 290, rad: 30, speed: 116, dmg: [22, 27], cd: 1.4, reach: 92, xp: 19, gold: 14 };
KIND.v_abyssscarab = { nm: 'Скарабей бездны', ch: 'v_abyssscarab', mel: 1, hp: 145, rad: 28, speed: 175, dmg: [13, 16], cd: 0.7, reach: 75, xp: 12, gold: 9, wide: 1.6 };
KIND.v_voidwyvern = { nm: 'Виверна бездны', ch: 'v_voidwyvern', rng: 1, hp: 100, rad: 27, speed: 138, dmg: [15, 20], cd: 1.3, want: 520, shot: 780, pcol: '150,235,80', xp: 13, gold: 10, wide: 1.7 };
KIND.v_netherkeeper = { nm: 'Скверный хранитель', ch: 'v_netherkeeper', rng: 1, hp: 100, rad: 21, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '110,240,120', xp: 14, gold: 11 };
KIND.v_shadowlord = { nm: 'Повелитель теней', ch: 'v_shadowlord', rng: 1, hp: 100, rad: 21, speed: 110, dmg: [15, 19], cd: 1.7, want: 500, shot: 580, pcol: '120,70,190', xp: 14, gold: 11 };
// элита из своих злодеев мира (14): тот же лист, своё имя; здоровье и урон ниже базовых — их поднимает BAL.ELITE (×3 и ×1,5)
KIND.el_butcher = Object.assign({}, KIND.v_butcher, { nm: 'Главный мясник', base: 'v_butcher', elite: 1, hp: 220, speed: 104, dmg: [16, 21], cd: 1.4, xp: 24, gold: 18 });
KIND.el_ghoulfarmer = Object.assign({}, KIND.v_ghoulfarmer, { nm: 'Восставший староста', base: 'v_ghoulfarmer', elite: 1, hp: 220, speed: 104, dmg: [16, 21], cd: 1.4, xp: 24, gold: 18 });
KIND.el_slithereen = Object.assign({}, KIND.v_slithereen, { nm: 'Рыбоглав-вожак', base: 'v_slithereen', elite: 1, hp: 150, speed: 160, dmg: [11, 14], cd: 0.75, xp: 22, gold: 16 });
KIND.el_tunnelmammoth = Object.assign({}, KIND.v_tunnelmammoth, { nm: 'Матёрый мамонт', base: 'v_tunnelmammoth', elite: 1, hp: 220, speed: 104, dmg: [16, 21], cd: 1.4, xp: 24, gold: 18 });
KIND.el_permafrostknight = Object.assign({}, KIND.v_permafrostknight, { nm: 'Командор вечной мерзлоты', base: 'v_permafrostknight', elite: 1, hp: 220, speed: 104, dmg: [16, 21], cd: 1.4, xp: 24, gold: 18 });
KIND.el_snowpackalpha = Object.assign({}, KIND.v_snowpackalpha, { nm: 'Седой вожак', base: 'v_snowpackalpha', elite: 1, hp: 150, speed: 160, dmg: [11, 14], cd: 0.75, xp: 22, gold: 16 });
KIND.el_gargoyle = Object.assign({}, KIND.v_gargoyle, { nm: 'Древняя горгулья', base: 'v_gargoyle', elite: 1, hp: 220, speed: 104, dmg: [16, 21], cd: 1.4, xp: 24, gold: 18 });
KIND.el_spectralblade = Object.assign({}, KIND.v_spectralblade, { nm: 'Призрачный палач', base: 'v_spectralblade', elite: 1, hp: 150, speed: 160, dmg: [11, 14], cd: 0.75, xp: 22, gold: 16 });
KIND.el_lavaskeletonking = Object.assign({}, KIND.v_lavaskeletonking, { nm: 'Лавовый король-тиран', base: 'v_lavaskeletonking', elite: 1, hp: 220, speed: 104, dmg: [16, 21], cd: 1.4, xp: 24, gold: 18 });
KIND.el_lavatick = Object.assign({}, KIND.v_lavatick, { nm: 'Клещ-матка', base: 'v_lavatick', elite: 1, hp: 150, speed: 160, dmg: [11, 14], cd: 0.75, xp: 22, gold: 16 });
KIND.el_eclipser = Object.assign({}, KIND.v_eclipser, { nm: 'Матёрый затмевающий', base: 'v_eclipser', elite: 1, hp: 220, speed: 104, dmg: [16, 21], cd: 1.4, xp: 24, gold: 18 });
KIND.el_bloodpriest = Object.assign({}, KIND.v_bloodpriest, { nm: 'Верховный жрец крови', base: 'v_bloodpriest', elite: 1, hp: 150, speed: 160, dmg: [11, 14], cd: 0.75, xp: 22, gold: 16 });
KIND.el_abyssguard = Object.assign({}, KIND.v_abyssguard, { nm: 'Старший глубинный страж', base: 'v_abyssguard', elite: 1, hp: 220, speed: 104, dmg: [16, 21], cd: 1.4, xp: 24, gold: 18 });
KIND.el_abyssberserker = Object.assign({}, KIND.v_abyssberserker, { nm: 'Берсерк-вожак', base: 'v_abyssberserker', elite: 1, hp: 220, speed: 104, dmg: [16, 21], cd: 1.4, xp: 24, gold: 18 });
// существа умений: снежный волк «Стаи» (лист вожака, мельче; живёт 15 с)
KIND.sk_snowwolf = { nm: 'Снежный волк', ch: 'v_snowpackalpha', mel: 1, hp: 50, rad: 16, speed: 200, dmg: [6, 6], cd: 0.9, reach: 60, xp: 2, gold: 1, sz: 0.6 };
// мини-боссы середины мира (5-я волна): Жнец Урожая в Горящей деревне, Королева Колючек в Осеннем лесу — как элита
KIND.mb_thornqueen = Object.assign({}, KIND.b_thornqueen, { nm: 'Королева Колючек', boss: 0, elite: 1, hp: 520, sz: 1, xp: 40, gold: 30, base: 'b_thornqueen' });
KIND.mb_reaper = Object.assign({}, KIND.b_reaper, { nm: 'Жнец Урожая', boss: 0, elite: 1, hp: 540, sz: 1, xp: 40, gold: 30, base: 'b_reaper' });
// кто выходит в каком мире: рядовые ближнего и дальнего боя, элита, мини-босс 5-й волны и босс мира (10-я волна)
// ---- 28 новых мини-боссов (пакет Клауди 20.11, MINIBOSS_FOR_KLOD.md): у каждого места (волны 3, 6, 9 мира) свой.
// Статы — отправная точка из пакета; умения — mini.js. Листы придут отдельным пакетом (tools/villains_prep.py).
KIND.mb_arbalest = { nm: 'Королевская арбалетчица', ch: 'mb_arbalest', rng: 1, hp: 420, rad: 26, speed: 120, dmg: [18, 24], cd: 1.8, want: 540, shot: 760, xp: 40, gold: 30, elite: 1 };
KIND.mb_executioner = { nm: 'Королевский палач', ch: 'mb_executioner', mel: 1, hp: 520, rad: 32, speed: 105, dmg: [22, 28], cd: 1.3, reach: 96, xp: 50, gold: 38, elite: 1 };
KIND.mb_bannerlord = { nm: 'Знаменосец короля', ch: 'mb_bannerlord', mel: 1, hp: 620, rad: 32, speed: 110, dmg: [26, 34], cd: 1.3, reach: 96, xp: 60, gold: 45, elite: 1 };
KIND.mb_plaguedoc = { nm: 'Чумной лекарь', ch: 'mb_plaguedoc', rng: 1, hp: 420, rad: 26, speed: 115, dmg: [18, 24], cd: 1.8, want: 540, shot: 760, xp: 40, gold: 30, elite: 1 };
KIND.mb_firebull = { nm: 'Огненный бык', ch: 'mb_firebull', mel: 1, hp: 620, rad: 40, speed: 125, dmg: [26, 34], cd: 1.3, reach: 96, xp: 60, gold: 45, elite: 1 };
KIND.mb_weaver = { nm: 'Осенняя ткачиха', ch: 'mb_weaver', mel: 1, hp: 420, rad: 32, speed: 135, dmg: [18, 24], cd: 1.3, reach: 96, xp: 40, gold: 30, elite: 1 };
KIND.mb_moonhuntress = { nm: 'Лунная охотница', ch: 'mb_moonhuntress', rng: 1, hp: 620, rad: 32, speed: 150, dmg: [26, 34], cd: 1.8, want: 540, shot: 760, xp: 60, gold: 45, elite: 1 };
KIND.mb_drownedbride = { nm: 'Невеста-утопленница', ch: 'mb_drownedbride', rng: 1, hp: 420, rad: 26, speed: 120, dmg: [18, 24], cd: 1.8, want: 540, shot: 760, xp: 40, gold: 30, elite: 1 };
KIND.mb_crocodile = { nm: 'Крокодил-костолом', ch: 'mb_crocodile', mel: 1, hp: 520, rad: 40, speed: 115, dmg: [22, 28], cd: 1.3, reach: 96, xp: 50, gold: 38, elite: 1 };
KIND.mb_hydra = { nm: 'Болотная гидра', ch: 'mb_hydra', rng: 1, hp: 620, rad: 40, speed: 95, dmg: [26, 34], cd: 1.8, want: 540, shot: 760, xp: 60, gold: 45, elite: 1 };
KIND.mb_steamdwarf = { nm: 'Гном в паровом доспехе', ch: 'mb_steamdwarf', mel: 1, hp: 420, rad: 32, speed: 110, dmg: [18, 24], cd: 1.3, reach: 96, xp: 40, gold: 30, elite: 1 };
KIND.mb_trollminer = { nm: 'Тролль-рудокоп', ch: 'mb_trollminer', mel: 1, hp: 520, rad: 32, speed: 130, dmg: [22, 28], cd: 1.3, reach: 96, xp: 50, gold: 38, elite: 1 };
KIND.mb_gemscorpion = { nm: 'Самоцветный скорпион', ch: 'mb_gemscorpion', mel: 1, hp: 620, rad: 40, speed: 120, dmg: [26, 34], cd: 1.3, reach: 96, xp: 60, gold: 45, elite: 1 };
KIND.mb_snowfairy = { nm: 'Снежная фея', ch: 'mb_snowfairy', rng: 1, hp: 420, rad: 26, speed: 170, dmg: [18, 24], cd: 1.8, want: 540, shot: 760, xp: 40, gold: 30, elite: 1 };
KIND.mb_walrus = { nm: 'Морж-берсерк', ch: 'mb_walrus', mel: 1, hp: 520, rad: 40, speed: 115, dmg: [22, 28], cd: 1.3, reach: 96, xp: 50, gold: 38, elite: 1 };
KIND.mb_wyvern = { nm: 'Зимняя виверна', ch: 'mb_wyvern', rng: 1, hp: 620, rad: 40, speed: 135, dmg: [26, 34], cd: 1.8, want: 540, shot: 760, xp: 60, gold: 45, elite: 1 };
KIND.mb_templar = { nm: 'Храмовая убийца', ch: 'mb_templar', mel: 1, hp: 420, rad: 26, speed: 160, dmg: [18, 24], cd: 1.3, reach: 96, xp: 40, gold: 30, elite: 1 };
KIND.mb_mercury = { nm: 'Ртутный двойник', ch: 'mb_mercury', mel: 1, hp: 520, rad: 32, speed: 145, dmg: [22, 28], cd: 1.3, reach: 96, xp: 50, gold: 38, elite: 1 };
KIND.mb_timekeeper = { nm: 'Хранитель времени', ch: 'mb_timekeeper', mel: 1, hp: 620, rad: 40, speed: 110, dmg: [26, 34], cd: 1.3, reach: 96, xp: 60, gold: 45, elite: 1 };
KIND.mb_lavaturtle = { nm: 'Лавовый панцирник', ch: 'mb_lavaturtle', rng: 1, hp: 420, rad: 40, speed: 85, dmg: [18, 24], cd: 1.8, want: 540, shot: 760, xp: 40, gold: 30, elite: 1 };
KIND.mb_embermonk = { nm: 'Монах огненных цепей', ch: 'mb_embermonk', mel: 1, hp: 520, rad: 26, speed: 165, dmg: [22, 28], cd: 1.3, reach: 96, xp: 50, gold: 38, elite: 1 };
KIND.mb_phoenix = { nm: 'Пепельный феникс', ch: 'mb_phoenix', rng: 1, hp: 620, rad: 40, speed: 140, dmg: [26, 34], cd: 1.8, want: 540, shot: 760, xp: 60, gold: 45, elite: 1 };
KIND.mb_windarcher = { nm: 'Ветряная лучница', ch: 'mb_windarcher', rng: 1, hp: 420, rad: 26, speed: 160, dmg: [18, 24], cd: 1.8, want: 540, shot: 760, xp: 40, gold: 30, elite: 1 };
KIND.mb_dawnsmith = { nm: 'Небесная молотобойца', ch: 'mb_dawnsmith', mel: 1, hp: 520, rad: 32, speed: 135, dmg: [22, 28], cd: 1.3, reach: 96, xp: 50, gold: 38, elite: 1 };
KIND.mb_sphinx = { nm: 'Сфинкс-страж', ch: 'mb_sphinx', mel: 1, hp: 620, rad: 40, speed: 125, dmg: [26, 34], cd: 1.3, reach: 96, xp: 60, gold: 45, elite: 1 };
KIND.mb_dreameater = { nm: 'Пожиратель снов', ch: 'mb_dreameater', rng: 1, hp: 420, rad: 32, speed: 130, dmg: [18, 24], cd: 1.8, want: 540, shot: 760, xp: 40, gold: 30, elite: 1 };
KIND.mb_obsidian = { nm: 'Обсидиановый страж', ch: 'mb_obsidian', rng: 1, hp: 520, rad: 32, speed: 120, dmg: [22, 28], cd: 1.8, want: 540, shot: 760, xp: 50, gold: 38, elite: 1 };
KIND.mb_gatekeeper = { nm: 'Привратник Бездны', ch: 'mb_gatekeeper', mel: 1, hp: 620, rad: 40, speed: 105, dmg: [26, 34], cd: 1.3, reach: 96, xp: 60, gold: 45, elite: 1 };
// паучок Осенней ткачихи («Выводок»): её же лист ходьбы в масштабе 0,3
KIND.sk_spiderling = { nm: 'Паучок', ch: 'mb_weaver', mel: 1, hp: 60, rad: 12, speed: 215, dmg: [6, 6], cd: 0.8, reach: 52, xp: 2, gold: 1, sz: 0.3, col: '#c9781a' };
// у каких мини-боссов уже есть листы (сервер листов не видит — список общий). Пока листов нет, на месте мини-босса выходит элита мира.
const MINI_ART = { mb_reaper: 1, mb_thornqueen: 1,   // листы 28 новых пришли 20.11 (v87)
  mb_arbalest: 1, mb_executioner: 1, mb_bannerlord: 1, mb_plaguedoc: 1, mb_firebull: 1, mb_weaver: 1, mb_moonhuntress: 1, mb_drownedbride: 1, mb_crocodile: 1, mb_hydra: 1, mb_steamdwarf: 1, mb_trollminer: 1, mb_gemscorpion: 1, mb_snowfairy: 1, mb_walrus: 1, mb_wyvern: 1, mb_templar: 1, mb_mercury: 1, mb_timekeeper: 1, mb_lavaturtle: 1, mb_embermonk: 1, mb_phoenix: 1, mb_windarcher: 1, mb_dawnsmith: 1, mb_sphinx: 1, mb_dreameater: 1, mb_obsidian: 1, mb_gatekeeper: 1 };
const ROSTER = {
  1: { mel: ['v_maskedassassin', 'v_maskedassassin', 'v_maskedassassin', 'v_maskedassassin', 'v_butcher', 'v_maskedassassin'],   // v117: вместо «Фарфоровой фрейлины» — «Убийца в маске»
     rng: ['jester', 'v_chaplain', 'v_warlock'], elite: ['el_butcher'], mini: ['mb_arbalest', 'mb_executioner', 'mb_bannerlord'], boss: 'b_blackknight' },
  2: { mel: ['fireimp', 'magmahound', 'v_ghoulfarmer', 'fireimp'], rng: ['ashcultist', 'cinderwraith', 'v_batrider'], elite: ['el_cultist', 'el_ghoulfarmer'], mini: ['mb_plaguedoc', 'mb_reaper', 'mb_firebull'], boss: 'b_plaguelord' },
  3: { mel: ['shadowwolf', 'werefox', 'rotdryad', 'autumnbear', 'boarbrute', 'scarecrow'], rng: ['sporeshaman', 'thornimp', 'crowharpy', 'hollowarcher'],
    elite: ['thornroot', 'el_bear'], mini: ['mb_weaver', 'mb_thornqueen', 'mb_moonhuntress'], boss: 'b_serpentqueen' },
  4: { mel: ['bogghoul', 'leechworm', 'v_slithereen', 'bogghoul', 'drownedknight'], rng: ['toadwitch', 'wisplantern'], elite: ['el_drowned', 'el_witch', 'el_slithereen'], mini: ['mb_drownedbride', 'mb_crocodile', 'mb_hydra'], boss: 'b_toadking' },
  5: { mel: ['gembeetle', 'v_koboldtrapper', 'v_koboldtrapper', 'v_tunnelmammoth', 'v_koboldtrapper'], rng: ['dwarfbomber', 'v_orespark', 'v_teslaguard'], elite: ['el_tunnelmammoth'], mini: ['mb_steamdwarf', 'mb_trollminer', 'mb_gemscorpion'], boss: 'b_forgegolem' },
  6: { mel: ['frostlynx', 'v_snowpackalpha', 'v_permafrostknight', 'frostlynx', 'v_snowpackalpha'], rng: ['yeti', 'v_glacierlich', 'v_icejelly'], elite: ['el_permafrostknight', 'el_snowpackalpha'], mini: ['mb_snowfairy', 'mb_walrus', 'mb_wyvern'], boss: 'b_frostqueen' },
  7: { mel: ['glassdancer', 'v_spectralblade', 'v_gargoyle', 'v_mirrorweaver', 'v_spectralblade'], rng: ['prismkeeper', 'v_darkseer'], elite: ['el_gargoyle', 'el_spectralblade'], mini: ['mb_templar', 'mb_mercury', 'mb_timekeeper'], boss: 'b_mirrorlord' },
  8: { mel: ['v_lavatick', 'salamander', 'v_lavatick', 'v_lavaskeletonking', 'v_lavatick'], rng: ['v_ashskeleton', 'v_souldemon', 'v_firehorn'], elite: ['el_salamander', 'el_lavaskeletonking', 'el_lavatick'], mini: ['mb_lavaturtle', 'mb_embermonk', 'mb_phoenix'], boss: 'b_ashlord' },
  9: { mel: ['marblegriffin', 'v_bloodpriest', 'v_eclipser', 'v_bloodpriest'], rng: ['skyharpist', 'v_fallensunpriest', 'v_featherserpent'], elite: ['el_eclipser', 'el_bloodpriest'], mini: ['mb_windarcher', 'mb_dawnsmith', 'mb_sphinx'], boss: 'b_skyjudge' },
  10: { mel: ['v_abyssscarab', 'v_abyssguard', 'v_abyssscarab', 'v_abyssberserker', 'v_abyssscarab'], rng: ['v_voidwyvern', 'v_netherkeeper', 'v_shadowlord'], elite: ['el_abyssguard', 'el_abyssberserker'], mini: ['mb_dreameater', 'mb_obsidian', 'mb_gatekeeper'], boss: 'b_voidmage' },
};
// мини-босс части мира (волны 3, 6, 9): у каждого места свой (ROSTER.mini); пока у него нет листов — элита мира, как раньше
const miniReady = id => !!(id && KIND[id] && (MINI_ART[id] || (typeof VILLAINS !== 'undefined' && VILLAINS[KIND[id].ch])));
const miniOf = (R, W) => { const m = R.mini && R.mini[W / 3 - 1]; return miniReady(m) ? m : R.elite[(W === 9 ? 1 : 0) % R.elite.length]; };
