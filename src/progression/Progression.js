import { LEVELS } from '../config/levels.js';

export const MAX_LEVEL = LEVELS.heroMax;               // максимальный уровень героя
export const BEAST_MAX_LEVEL = LEVELS.beastMax;        // максимальный уровень зверя

// Сколько опыта нужно, чтобы перейти с уровня level на следующий: каждый уровень дороже предыдущего
export const xpNeeded = level => Math.round(LEVELS.heroXpBase * LEVELS.heroXpGrowth ** (level - 1));
export const beastXpNeeded = level => Math.round(LEVELS.beastXpBase * LEVELS.beastXpGrowth ** (level - 1));

// Здоровье и урон героя на уровне level (без множителей класса). До 10 уровня как раньше, дальше +4% и +5% за уровень.
export function heroBaseHp(level) {
  const e = LEVELS.heroEarlyLevels;
  const early = 100 + (Math.min(level, e) - 1) * LEVELS.heroHpEarly;
  return early * LEVELS.heroHpGrowth ** Math.max(0, level - e);
}
export function heroBaseAtk(level) {
  const e = LEVELS.heroEarlyLevels;
  const early = 10 + (Math.min(level, e) - 1) * LEVELS.heroAtkEarly;
  return early * LEVELS.heroAtkGrowth ** Math.max(0, level - e);
}

// Какое умение (0, 1, 2) усилила веха уровня level (5, 10, 15...). Вехи идут по кругу: 1-е, 2-е, 3-е умение.
export const milestoneSkill = level => (level / LEVELS.milestoneEvery - 1) % 3;
export const isMilestone = level => level > 1 && level % LEVELS.milestoneEvery === 0;

// Сколько вех получило умение i к уровню level
export function masteryRank(level, i) {
  let n = 0;
  for (let l = LEVELS.milestoneEvery; l <= level; l += LEVELS.milestoneEvery) if (milestoneSkill(l) === i) n++;
  return n;
}

// Множитель опыта за врага своего уровня enemyLevel при уровне героя heroLevel
export function xpFactor(heroLevel, enemyLevel) {
  const k = 1 - LEVELS.xpDiffStep * (heroLevel - enemyLevel);
  return Math.max(LEVELS.xpDiffMin, Math.min(LEVELS.xpDiffMax, k));
}

// Добавляет опыт герою. Возвращает список новых уровней (пустой, если уровень не вырос).
export function addXp(player, amount) {
  if (player.level >= MAX_LEVEL) return [];
  player.xp += amount;
  const gained = [];
  while (player.level < MAX_LEVEL && player.xp >= xpNeeded(player.level)) {
    player.xp -= xpNeeded(player.level);
    player.level++;
    gained.push(player.level);
  }
  if (gained.length) {
    player.recalcStats();
    player.hp = player.maxHp;
  }
  if (player.level >= MAX_LEVEL) player.xp = 0;
  return gained;
}
