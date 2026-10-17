// Проверка баланса сюжетной цепочки «Путь выжившего». Запуск: node tools/story-check.js
// Считает золото и опыт за задания по главам и грубо оценивает, на каком уровне герой проходит каждое задание
// (опыт за задания + бои + сбор, как в обычной игре). Цель: цепочка заканчивается около 10 уровня, золота хватает на все покупки.
import { STORY, STORY_XP_SCALE } from '../src/config/story.js';
import { xpNeeded, xpFactor, MAX_LEVEL } from '../src/progression/Progression.js';
import { ENEMIES } from '../src/config/enemies.js';
import { ENEMY_LEVELS, LEVELS } from '../src/config/levels.js';
import { ARENA } from '../src/config/arena.js';

// Грубая оценка опыта «от игры» вокруг каждого задания (убийства, сбор, рейд). Ключ: id задания.
const kill = (id, n, lvl) => n * ENEMIES[id].xp * xpFactor(lvl, ENEMY_LEVELS[id] ?? 1);
const EXTRA = {
  s_wood: () => 10 * 3, s_stone: () => 5 * 3,
  s_rock3: lvl => kill('rock_slime', 3, lvl), s_king: lvl => kill('stone_king', 1, lvl),
  s_harvest: () => 4 * 4 + 12, s_wood30: () => 30, s_stone15: () => 20,
  s_raid: lvl => (40 + 15 * 3) * LEVELS.enemyXp ** (lvl - 1) * 0.5 + 3 * ENEMIES.slime.xp * LEVELS.enemyXp ** (lvl - 1),       // награда за рейд в обучении вдвое меньше
  s_fish3: () => 12, s_tide: lvl => kill('tide_king', 1, lvl),
  s_arena_play: () => ARENA.loseXp * 0.5, s_arena_win: () => ARENA.winXp * 0.5,       // награда арены в обучении вдвое меньше
};

let level = 1, xp = 0, gold = 0, xpTotal = 0;
const gain = n => { xp += n; xpTotal += n; while (level < MAX_LEVEL && xp >= xpNeeded(level)) { xp -= xpNeeded(level); level++; } };
const rows = [], chapters = {};
for (const q of STORY) {
  const extra = EXTRA[q.id]?.(level) ?? 0;
  gain(extra);
  const qXp = Math.round((q.reward.xp ?? 0) * STORY_XP_SCALE);
  gain(qXp);
  gold += q.reward.gold ?? 0;
  const c = (chapters[q.chapter] ??= { gold: 0, xp: 0 });
  c.gold += q.reward.gold ?? 0; c.xp += qXp;
  rows.push({ задание: q.id, глава: q.chapter, золото: q.reward.gold ?? 0, 'опыт за задание': qXp, 'опыт от боёв и сбора': Math.round(extra), 'уровень после': level });
}
console.table(rows);
console.table(Object.entries(chapters).map(([ch, v]) => ({ глава: ch, золото: v.gold, 'опыт за задания': v.xp })));
console.log(`Золото за всю цепочку: ${gold}. Опыт за задания (с коэффициентом ${STORY_XP_SCALE}): ${Object.values(chapters).reduce((s, v) => s + v.xp, 0)}.`);
console.log(`Оценка: к концу цепочки около ${level} уровня (цель: до 10).`);
console.log('Это грубая оценка без случайных убийств и ночных монстров; настоящую скорость проверяй игрой.');
