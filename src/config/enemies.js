// Враги. Чтобы добавить нового — допиши сюда и добавь точку появления в ENEMY_SPAWNS.
// aggro — с какого расстояния враг замечает героя, xp — опыт за победу, respawn — секунд до возвращения.
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
];
