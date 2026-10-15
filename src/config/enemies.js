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
];
