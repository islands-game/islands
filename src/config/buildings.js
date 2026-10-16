// Постройки. Чтобы добавить новую: допиши запись, названия "building.<id>" в i18n.js
// и (если нужна новая форма) модель в src/building/BuildingModels.js.
//
//  model    — какая модель рисуется (platform | wall | bridge | house | pen | barn | farm)
//  size     — размер основания (w — ширина, d — глубина) в метрах
//  cost     — сколько ресурсов нужно
//  solid    — через постройку нельзя пройти (стена, дом)
//  walkable — по постройке можно ходить и выходить за край острова (платформа, мост)
//  structure — постройка со стенами и дверью: house (дом: внутри безопасно, есть кровать), pen (загон с забором)
//  farm     — ферма (грядки), barn — амбар (хранилище). Золото в цене — только то, что добыто в боях.
export const BUILDINGS = {
  wood_platform: { id: 'wood_platform', model: 'platform', size: { w: 4, d: 4 }, color: 0xc69b6d,
    cost: { wood: 4 }, solid: false, walkable: true },
  wall: { id: 'wall', model: 'wall', size: { w: 3, d: 0.6 }, color: 0x9aa0a6,
    cost: { wood: 1, stone: 2 }, solid: true, walkable: false },
  bridge: { id: 'bridge', model: 'bridge', size: { w: 2, d: 6 }, color: 0xb98a5a,
    cost: { wood: 5 }, solid: false, walkable: true },
  house: { id: 'house', model: 'house', size: { w: 4, d: 4 }, color: 0xf2d9a6,
    cost: { wood: 8, stone: 4 }, solid: false, walkable: false, structure: 'house' },
  pen: { id: 'pen', model: 'pen', size: { w: 6, d: 6 }, color: 0x8b5a2b,
    cost: { wood: 6, stone: 2 }, solid: false, walkable: false, structure: 'pen', economy: 'pen' },
  // Ферма: четыре грядки. Растения растут сами, урожай собирает игрок и несёт в амбар.
  farm: { id: 'farm', model: 'farm', size: { w: 6, d: 6 }, color: 0x7a5230,
    cost: { wood: 8, stone: 2 }, solid: false, walkable: false, economy: 'farm' },
  // Амбар: хранит дерево, камень и еду. Стены твёрдые.
  barn: { id: 'barn', model: 'barn', size: { w: 5, d: 4 }, color: 0xb5493a,
    cost: { wood: 12, stone: 6, gold: 15 }, solid: true, walkable: false, economy: 'barn' },
};

export const MAX_BUILDINGS = 60;
export const REFUND_RATIO = 0.5; // сколько ресурсов возвращается при сносе
