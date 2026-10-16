// Уровни героя и зверей: сколько опыта нужно и что даёт каждый уровень. Только числа, их можно менять.
// Проект и объяснения: docs/items-progression.md.
export const LEVELS = {
  // Герой: опыт на переход с уровня L = xpBase × xpGrowth^(L−1). Чем выше уровень, тем он дороже.
  heroMax: 30,
  heroXpBase: 60,
  heroXpGrowth: 1.18,
  // Сила героя: до 10 уровня растёт ровно (как раньше), дальше складывается в процентах за каждый уровень
  heroEarlyLevels: 10,
  heroHpEarly: 10,          // здоровья за уровень до 10-го
  heroAtkEarly: 2,          // урона за уровень до 10-го
  heroHpGrowth: 1.04,       // после 10-го: здоровье ×1.04 за уровень
  heroAtkGrowth: 1.05,      // после 10-го: урон ×1.05 за уровень
  // Каждые milestoneEvery уровней (5, 10, 15...) одно из трёх умений становится сильнее (по очереди)
  milestoneEvery: 5,
  masteryPower: 0.15,       // +15% силы умения за каждую веху
  masteryCooldown: 0.1,     // и перезарядка короче на 10% (множится)

  // Звери
  beastMax: 15,
  beastXpBase: 40,
  beastXpGrowth: 1.22,
  beastAbilityPower: 0.03,  // +3% силы способности за каждый уровень
  beastShare: 0.6,          // зверям рядом достаётся 60% опыта героя (делится между ними)
  guardShare: 0.5,          // охранникам дома — половина

  // Враги: у каждого есть уровень (ENEMY_LEVELS). Слизни рейдов подстраиваются под уровень героя.
  enemyHp: 1.06,            // здоровье врага ×1.06 за каждый уровень выше базового
  enemyAtk: 1.05,           // урон ×1.05
  enemyXp: 1.12,            // и опыт за него ×1.12
  // Опыт за слишком слабого врага меньше: 15% за каждый уровень разницы, но не меньше 20%; за более сильного до +20%
  xpDiffStep: 0.15,
  xpDiffMin: 0.2,
  xpDiffMax: 1.2,
};

// Базовый уровень врагов (у кого не указан — 1). Статы в config/enemies.js записаны для этого уровня.
export const ENEMY_LEVELS = {
  slime: 1, tree_monster: 3,
  frost_slime: 3, rock_slime: 4, tide_slime: 5, gust_slime: 5, lava_slime: 7,
  stone_king: 6, tide_king: 7, storm_king: 8, frost_giant: 9, lava_king: 11,
  reef_slime: 12, reef_king: 15, abyss_slime: 20, abyss_king: 22, void_slime: 28, void_king: 30,       // острова в открытом море
};

// Опыт героя за арену: каждому из убитых героем (или его зверем) и разрушенное командой
export const ARENA_XP = { hero: 40, minion: 4, monster: 12, king: 60, tower: 120 };
