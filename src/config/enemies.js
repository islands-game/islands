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
};

export const ENEMY_SPAWNS = [
  { type: 'slime', x: -2, z: -8 },
  { type: 'slime', x: 9, z: 1 },
  { type: 'slime', x: -10, z: -1 },
];
