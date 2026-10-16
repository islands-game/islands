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
export const REALM_ORDER = ['earth', 'water', 'ice', 'air', 'fire'];
