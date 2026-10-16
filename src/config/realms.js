// Пять порталов стихий. В каждом есть остров, король стихии и клетка со зверем.
// Зверя охраняет король: победи его — и клетка откроется. Какой зверь сегодня в клетке, решает дата (раз в день, случайно).
//   island — остров (config в world/World.js), king — id короля (config/enemies.js), cage — где стоит клетка
export const REALMS = {
  earth: { island: 'earth', king: 'stone_king', cage: { x: -78, z: -6 } },
  water: { island: 'water', king: 'tide_king', cage: { x: 202, z: -6 } },
  ice: { island: 'ice', king: 'frost_giant', cage: { x: 62, z: -6 } },
  air: { island: 'air', king: 'storm_king', cage: { x: -148, z: -6 } },
  fire: { island: 'fire', king: 'lava_king', cage: { x: 132, z: -6 } },
};
// Золотая жила дня: на каждом острове стихии раз в сутки появляется одна большая жила (в новом месте).
// vein — сколько золота она даёт [от, до]; чем опаснее остров, тем больше. Добыть можно один раз за сутки.
export const VEINS = {
  earth: [10, 14], water: [14, 18], ice: [16, 20], air: [18, 24], fire: [24, 32],
};
// Куда может выпасть жила: 6 мест по кругу на острове (угол и расстояние от центра)
export const VEIN_SPOTS = [-0.9, -0.2, 0.5, 1.2, 2.0, 2.8].map(a => ({ a, r: 8 }));

export const REALM_ORDER = ['earth', 'water', 'ice', 'air', 'fire'];
