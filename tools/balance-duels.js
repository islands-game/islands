// Проверка баланса героев: дуэли «один на один» на арене (без башен и крипов).
// Не входит в игру. Запуск: npm run dev, открыть игру и в консоли браузера:
//   const m = await import('/tools/balance-duels.js'); const r = await m.runDuels(window.islands, { repeats: 2 }); console.table(r.table);
// Результат: доля побед каждого героя против остальных (цель 40–60%) и матрица «кто кого».
import { HEROES, HERO_IDS, arenaStats } from '/src/config/heroes.js';

const DT = 0.1;

function spawn(a, id, team, z) {
  const s = { ...arenaStats(id), radius: 0.5, scale: 1.3, heroId: id };
  s.dmgTaken = s.dmgTaken ?? 1;
  const u = a.add('hero', team, s, 300, z);
  u.heroType = id;
  u.heroId = id;
  u.element = HEROES[id].element;
  u.skillIds = HEROES[id].skills;
  u.skillCd = [1 + Math.random() * 2, 1 + Math.random() * 2, 1 + Math.random() * 2];
  u.isPlayer = false;
  u.deaths = 0;
  u.lastHurt = -99;
  u.retreat = false;
  u.respawnAt = 0;
  return u;
}

// Один бой. Возвращает { winner: 0|1|-1, hp: [доля, доля], time }
export function duel(a, idA, idB, maxSeconds = 60) {
  a.clearMatch();
  a.units = [];
  a.time = 0;
  a.phase = 'playing';
  const u1 = spawn(a, idA, 'blue', 5), u2 = spawn(a, idB, 'red', -5);
  let t = 0;
  while (t < maxSeconds && !u1.dead && !u2.dead) {
    a.time += DT;
    t += DT;
    for (const u of [u1, u2]) {
      const foe = u === u1 ? u2 : u1;
      if (u.dead) continue;
      u.atkCd = Math.max(0, u.atkCd - DT);
      a.tickStatus(u, DT);
      if (u.dead) continue;
      a.botSkills(u, DT);
      a.engage(u, foe, DT);
    }
    a.game.combat.update(DT, a.game.camera);           // снаряды, бумеранг и отложенные удары летят и попадают
  }
  for (let i = 0; i < 30; i++) a.game.combat.update(DT, a.game.camera);   // дать долететь последним снарядам
  const hp = [u1.hp / u1.maxHp, u2.hp / u2.maxHp];
  let winner = -1;
  if (u1.dead && !u2.dead) winner = 1;
  else if (u2.dead && !u1.dead) winner = 0;
  else if (!u1.dead && !u2.dead) winner = hp[0] > hp[1] + 0.05 ? 0 : hp[1] > hp[0] + 0.05 ? 1 : -1;   // не добили: по остатку здоровья
  for (const u of a.units) u.dispose();
  a.units = [];
  return { winner, hp, time: t };
}

// Каждый с каждым (в обе стороны), repeats раз. ids — каких героев сравнивать (по умолчанию всех).
export async function runDuels(game, { repeats = 2, ids = HERO_IDS, maxSeconds = 60 } = {}) {
  const a = game.arena;
  if (!a.active) a.enter();
  const wins = Object.fromEntries(ids.map(i => [i, 0]));
  const margin = Object.fromEntries(ids.map(i => [i, 0]));     // средний «запас»: насколько уверенно побеждает (−1..1)
  const games = Object.fromEntries(ids.map(i => [i, 0]));
  const matrix = {};
  for (const x of ids) {
    matrix[x] = {};
    for (const y of ids) {
      if (x === y) continue;
      let w = 0, n = 0;
      for (let r = 0; r < repeats; r++) {
        const res = duel(a, x, y, maxSeconds);
        n++;
        margin[x] += res.hp[0] - res.hp[1];
        if (res.winner === 0) w += 1;
        else if (res.winner === -1) w += 0.5;
      }
      matrix[x][y] = w / n;
      wins[x] += w;
      games[x] += n;
    }
    await new Promise(r => setTimeout(r, 0));        // дать странице вздохнуть
  }
  const table = ids.map(i => ({ hero: i, win: +(wins[i] / games[i]).toFixed(2), margin: +(margin[i] / games[i]).toFixed(2) })).sort((p, q) => q.margin - p.margin);
  return { table, matrix };
}

// Автоподбор: несколько кругов дуэлей, после каждого сила героя (HEROES[id].tune) подправляется так, чтобы средний «запас»
// в победах стал нулевым (дуэли очень чувствительны к силе, поэтому берём плавную меру, а не число побед). Шаг с каждым кругом уменьшается.
// Возвращает таблицу tune для вставки в TUNING (src/config/heroes.js). ids — без поддержки: она сильна в команде, а не в дуэли.
export async function fitTuning(game, { rounds = 10, repeats = 4, ids = HERO_IDS.filter(i => !i.startsWith('support')), step = 0.5 } = {}) {
  const log = [];
  let k = step;
  for (let r = 0; r < rounds; r++) {
    const { table } = await runDuels(game, { repeats, ids });
    const worst = table.reduce((m, x) => Math.max(m, Math.abs(x.margin)), 0);
    log.push({ round: r, strongest: table[0].hero + ' ' + table[0].margin, weakest: table[table.length - 1].hero + ' ' + table[table.length - 1].margin, maxAbsMargin: worst });
    for (const row of table) {
      const h = HEROES[row.hero];
      h.tune = Math.min(1.8, Math.max(0.5, h.tune * Math.exp(-k * row.margin)));
    }
    k *= 0.88;
  }
  const tuning = Object.fromEntries(ids.map(i => [i, +HEROES[i].tune.toFixed(2)]));
  const final = await runDuels(game, { repeats: repeats * 2, ids });
  return { log, tuning, final: final.table };
}

// ---- Командный бой 2 на 2 (для поддержки: в дуэли она слабая, её сила — лечение и замедление союзникам) ----

// Звери поддержки на арене (3 штуки, 90% силы зверя 5 уровня): простые бойцы без умений
const BEAST = { hp: 58, atk: 15, cooldown: 1, range: 3.5, speed: 5 };

function addBeasts(a, team, z, n) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const u = a.add('hero', team, { ...BEAST, radius: 0.45, scale: 1, heroId: 'warrior_fire', dmgTaken: 1 }, 297 + i * 3, z + (team === 'blue' ? 1 : -1));
    Object.assign(u, { heroType: 'beast', element: null, skillIds: ['', '', ''], skillCd: [999, 999, 999], isPlayer: false, deaths: 0, lastHurt: -99, retreat: false });
    list.push(u);
  }
  return list;
}

export function teamFight(a, idsA, idsB, maxSeconds = 90, beastsA = 0, beastsB = 0) {
  a.clearMatch();
  a.units = [];
  a.time = 0;
  a.phase = 'playing';
  const mk = (ids, team, z) => ids.map((id, i) => {
    const u = spawn(a, id, team, z);
    u.pos.x = 300 + (i - (ids.length - 1) / 2) * 3;
    return u;
  });
  const A = mk(idsA, 'blue', 5), B = mk(idsB, 'red', -5);
  A.push(...addBeasts(a, 'blue', 5, beastsA));
  B.push(...addBeasts(a, 'red', -5, beastsB));
  let t = 0;
  const nearest = (u, list) => list.filter(x => !x.dead).sort((p, q) => Math.hypot(p.pos.x - u.pos.x, p.pos.z - u.pos.z) - Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z))[0];
  while (t < maxSeconds && A.some(u => !u.dead) && B.some(u => !u.dead)) {
    a.time += DT;
    t += DT;
    for (const u of [...A, ...B]) {
      if (u.dead) continue;
      const foe = nearest(u, A.includes(u) ? B : A);
      if (!foe) continue;
      u.atkCd = Math.max(0, u.atkCd - DT);
      a.tickStatus(u, DT);
      if (u.dead) continue;
      a.botSkills(u, DT);
      a.engage(u, foe, DT);
    }
    a.game.combat.update(DT, a.game.camera);
  }
  for (let i = 0; i < 30; i++) a.game.combat.update(DT, a.game.camera);
  const hpA = A.reduce((s, u) => s + Math.max(0, u.hp), 0) / A.reduce((s, u) => s + u.maxHp, 0);
  const hpB = B.reduce((s, u) => s + Math.max(0, u.hp), 0) / B.reduce((s, u) => s + u.maxHp, 0);
  for (const u of a.units) u.dispose();
  a.units = [];
  return hpA - hpB;      // > 0 — победила команда A
}

// Поддержка в команде: [партнёр + поддержка] против [партнёр + стрелок]. Около 50% — поддержка стоит стрелка.
export async function supportCheck(game, { repeats = 6, partners = ['warrior_fire', 'warrior_earth', 'mage_ice', 'assassin_air', 'archer_water'], baseline = 'archer_fire', withBeasts = true } = {}) {
  const a = game.arena;
  if (!a.active) a.enter();
  const out = {};
  for (const s of HERO_IDS.filter(i => i.startsWith('support'))) {
    let w = 0, n = 0, margin = 0;
    for (const p of partners) {
      for (let r = 0; r < repeats; r++) {
        const m = teamFight(a, [p, s], [p, baseline], 90, withBeasts ? 3 : 0, 0);
        margin += m;
        w += m > 0.02 ? 1 : m < -0.02 ? 0 : 0.5;
        n++;
      }
    }
    out[s] = { win: +(w / n).toFixed(2), margin: +(margin / n).toFixed(2) };
  }
  return out;
}
