// Враги. Чтобы добавить нового — допиши сюда и добавь точку появления в ENEMY_SPAWNS.
// aggro — с какого расстояния враг замечает героя, xp — опыт за победу, respawn — секунд до возвращения.
// Сколько золота падает с врага [от, до]. Только на островах стихий (на домашнем острове золота нет).
export const GOLD_DROPS = {
  reef_slime: [4, 8], abyss_slime: [8, 14], void_slime: [14, 24], reef_king: [45, 60], abyss_king: [70, 95], void_king: [110, 150],
  frost_slime: [1, 3], lava_slime: [2, 4], rock_slime: [1, 3], tide_slime: [1, 3], gust_slime: [1, 3],
  stone_king: [15, 22], tide_king: [20, 28], frost_giant: [22, 30], storm_king: [22, 32], lava_king: [30, 40],
};

export const ENEMIES = {
  slime: {
    id: 'slime',
    color: 0x8bd450,
    hp: 30,
    atk: 6,
    speed: 2.4,
    aggro: 7,
    attackRange: 1.5,
    attackCooldown: 1.2,
    xp: 20,
    respawn: 20,
  },
  // Живёт на Ледяном острове: крепче и сильнее обычного слизня
  frost_slime: {
    id: 'frost_slime',
    color: 0x9fe3ff,
    hp: 55,
    atk: 9,
    speed: 2.8,
    aggro: 7.5,
    attackRange: 1.5,
    attackCooldown: 1.1,
    xp: 35,
    respawn: 25,
  },
  // Живёт на Огненном острове: самый опасный из слизней
  lava_slime: {
    id: 'lava_slime',
    color: 0xff6a2a,
    hp: 85,
    atk: 13,
    speed: 3,
    aggro: 8,
    attackRange: 1.5,
    attackCooldown: 1,
    xp: 60,
    respawn: 30,
  },
  // БОСС Ледяного острова: медленный, но очень крепкий. Удар по области шире, чем у Лавового короля.
  frost_giant: {
    id: 'frost_giant',
    color: 0x8fe3ff,
    boss: true,
    crown: true,
    scale: 2.2,
    hp: 450,
    atk: 11,
    speed: 2,
    aggro: 9,
    attackRange: 3.2,
    attackCooldown: 1.6,
    slam: { cooldown: 8, windup: 1.4, radius: 5, damage: 24 },
    xp: 220,
    respawn: 300,
  },
  // БОСС Огненного острова. scale — размер, crown — корона,
  // slam — удар по области: за windup секунд появляется красное кольцо, потом урон всем в радиусе radius.
  lava_king: {
    id: 'lava_king',
    color: 0xff4a1a,
    boss: true,
    crown: true,
    scale: 2.4,
    hp: 600,
    atk: 14,
    speed: 2.4,
    aggro: 9,
    attackRange: 3.4,
    attackCooldown: 1.5,
    slam: { cooldown: 7, windup: 1.2, radius: 4.5, damage: 30 },
    xp: 300,
    respawn: 300,
  },
  // --- Острова стихий: земля, вода, воздух (огонь и лёд выше). Короли охраняют зверя дня. ---
  rock_slime: {
    id: 'rock_slime', color: 0x9a7040, hp: 70, atk: 8, speed: 2.2, aggro: 7, attackRange: 1.5, attackCooldown: 1.3, xp: 40, respawn: 25,
  },
  tide_slime: {
    id: 'tide_slime', color: 0x3aa0ff, hp: 65, atk: 10, speed: 2.8, aggro: 7.5, attackRange: 1.5, attackCooldown: 1.1, xp: 45, respawn: 25,
  },
  gust_slime: {
    id: 'gust_slime', color: 0xbff0e0, hp: 50, atk: 11, speed: 3.4, aggro: 8, attackRange: 1.5, attackCooldown: 1, xp: 45, respawn: 25,
  },
  // Король земли: самый лёгкий из королей — с него удобно начинать
  stone_king: {
    id: 'stone_king', color: 0x9a7040, boss: true, crown: true, scale: 2.3, hp: 300, atk: 10, speed: 2, aggro: 9,
    attackRange: 3.3, attackCooldown: 1.6, slam: { cooldown: 8, windup: 1.4, radius: 4, damage: 20 }, xp: 160, respawn: 300,
  },
  tide_king: {
    id: 'tide_king', color: 0x2f8cff, boss: true, crown: true, scale: 2.2, hp: 380, atk: 12, speed: 2.4, aggro: 9,
    attackRange: 3.3, attackCooldown: 1.5, slam: { cooldown: 7, windup: 1.3, radius: 4.5, damage: 24 }, xp: 200, respawn: 300,
  },
  storm_king: {
    id: 'storm_king', color: 0xbff0e0, boss: true, crown: true, scale: 2.1, hp: 420, atk: 12, speed: 2.8, aggro: 9.5,
    attackRange: 3.2, attackCooldown: 1.4, slam: { cooldown: 7, windup: 1.1, radius: 5, damage: 26 }, xp: 230, respawn: 300,
  },
  // Появляется только ночью: ожившее дерево. Утром исчезает, дерево возвращается на место.
  // shape: 'treant' — рисуется как дерево с глазами.
  tree_monster: {
    id: 'tree_monster',
    shape: 'treant',
    color: 0x2d6b3a,
    hp: 45,
    atk: 8,
    speed: 2.2,
    aggro: 6,
    attackRange: 1.8,
    attackCooldown: 1.3,
    xp: 30,
    respawn: 99999,
  },
  // Острова в открытом море (попасть можно на лодке). Показатели записаны для базового уровня врага (config/levels.js: ENEMY_LEVELS).
  reef_slime: { id: 'reef_slime', color: 0x38c9b0, hp: 114, atk: 17, speed: 3.1, aggro: 8, attackRange: 1.5, attackCooldown: 1, xp: 105, respawn: 30 },
  abyss_slime: { id: 'abyss_slime', color: 0x7a4ad0, hp: 242, atk: 25, speed: 3.3, aggro: 8.5, attackRange: 1.5, attackCooldown: 0.95, xp: 260, respawn: 30 },
  void_slime: { id: 'void_slime', color: 0x2a2a3a, hp: 490, atk: 36, speed: 3.5, aggro: 9, attackRange: 1.6, attackCooldown: 0.9, xp: 650, respawn: 30 },
  reef_king: {
    id: 'reef_king', color: 0x20a090, boss: true, crown: true, scale: 2.4, hp: 760, atk: 18, speed: 2.6, aggro: 10,
    attackRange: 3.4, attackCooldown: 1.4, slam: { cooldown: 7, windup: 1.2, radius: 5, damage: 36 }, xp: 470, respawn: 400,
  },
  abyss_king: {
    id: 'abyss_king', color: 0x5a2aa8, boss: true, crown: true, scale: 2.6, hp: 1140, atk: 28, speed: 2.8, aggro: 10.5,
    attackRange: 3.5, attackCooldown: 1.3, slam: { cooldown: 6.5, windup: 1.1, radius: 5.5, damage: 55 }, xp: 1040, respawn: 400,
  },
  void_king: {
    id: 'void_king', color: 0x14142a, boss: true, crown: true, scale: 2.9, hp: 1820, atk: 42, speed: 3, aggro: 11,
    attackRange: 3.7, attackCooldown: 1.2, slam: { cooldown: 6, windup: 1, radius: 6, damage: 85 }, xp: 2600, respawn: 400,
  },
};

// Сколько деревьев оживает за ночь
export const NIGHT_MONSTER_COUNT = 5;

export const ENEMY_SPAWNS = [
  // На домашнем острове постоянных монстров нет: там нападают рейды (config/raids.js)
  // Ледяной остров
  { type: 'frost_slime', x: 63, z: -6 },
  { type: 'frost_slime', x: 79, z: -1 },
  { type: 'frost_slime', x: 74, z: -3 },
  { type: 'frost_giant', x: 60, z: -2 },
  // Огненный остров
  { type: 'lava_slime', x: 132, z: -1 },
  { type: 'lava_slime', x: 149, z: -1 },
  { type: 'lava_slime', x: 144, z: -4 },
  { type: 'lava_king', x: 136, z: -4 },
  // Остров земли (король охраняет клетку со зверем)
  { type: 'rock_slime', x: -77, z: -1 },
  { type: 'rock_slime', x: -62, z: -2 },
  { type: 'rock_slime', x: -67, z: -4 },
  { type: 'stone_king', x: -79, z: -2 },
  // Остров воды
  { type: 'tide_slime', x: 203, z: -1 },
  { type: 'tide_slime', x: 218, z: -2 },
  { type: 'tide_slime', x: 213, z: -4 },
  { type: 'tide_king', x: 201, z: -2 },
  // Остров воздуха
  { type: 'gust_slime', x: -147, z: -1 },
  { type: 'gust_slime', x: -132, z: -2 },
  { type: 'gust_slime', x: -137, z: -4 },
  { type: 'storm_king', x: -149, z: -2 },
  // Острова в открытом море: чем дальше от дома, тем выше уровень врагов (12-15, 20-22, 28-30)
  { type: 'reef_slime', x: 55, z: -131 }, { type: 'reef_slime', x: 66, z: -135 }, { type: 'reef_slime', x: 62, z: -124 }, { type: 'reef_king', x: 60, z: -134 },
  { type: 'abyss_slime', x: -65, z: 148 }, { type: 'abyss_slime', x: -54, z: 153 }, { type: 'abyss_slime', x: -58, z: 142 }, { type: 'abyss_king', x: -60, z: 152 },
  { type: 'void_slime', x: 124, z: -212 }, { type: 'void_slime', x: 137, z: -216 }, { type: 'void_slime', x: 132, z: -204 }, { type: 'void_king', x: 130, z: -216 },
];
