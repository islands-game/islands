// Постройки. Чтобы добавить новую: допиши запись, названия "building.<id>" в i18n.js
// и (если нужна новая форма) модель в src/building/BuildingModels.js.
//
//  model    — какая модель рисуется (platform | wall | bridge | house | pen | barn | farm)
//  size     — размер основания (w — ширина, d — глубина) в метрах
//  cost     — сколько ресурсов нужно
//  solid    — через постройку нельзя пройти (стена, дом)
//  walkable — по постройке можно ходить и выходить за край острова (платформа, мост)
//  structure — постройка со стенами и дверью: house (дом: внутри безопасно, есть кровать), pen (загон с забором)
//  hp       — прочность: враги могут ломать постройку (у дома, платформ и мостов прочности нет: дом неприкосновенный)
//  defense  — защита амбара: пока она не сбита, амбар нельзя ограбить
//  farm     — ферма (грядки), barn — амбар (хранилище). Золото в цене — только то, что добыто в боях.
export const BUILDINGS = {
  wood_platform: { id: 'wood_platform', model: 'platform', size: { w: 4, d: 4 }, color: 0xc69b6d,
    cost: { wood: 4 }, solid: false, walkable: true },
  wall: { id: 'wall', model: 'wall', size: { w: 3, d: 0.6 }, color: 0x9aa0a6,
    cost: { wood: 1, stone: 2 }, solid: true, walkable: false, hp: 120 },
  bridge: { id: 'bridge', model: 'bridge', size: { w: 2, d: 6 }, color: 0xb98a5a,
    cost: { wood: 5 }, solid: false, walkable: true },
  house: { id: 'house', model: 'house', size: { w: 4, d: 4 }, color: 0xf2d9a6,
    cost: { wood: 8, stone: 4 }, solid: false, walkable: false, structure: 'house' },
  pen: { id: 'pen', model: 'pen', size: { w: 6, d: 6 }, color: 0x8b5a2b,
    cost: { wood: 6, stone: 2 }, solid: false, walkable: false, structure: 'pen', economy: 'pen', hp: 150 },
  // Ферма: четыре грядки. Растения растут сами, урожай собирает игрок и несёт в амбар.
  farm: { id: 'farm', model: 'farm', size: { w: 6, d: 6 }, color: 0x7a5230,
    cost: { wood: 8, stone: 2 }, solid: false, walkable: false, economy: 'farm', hp: 150 },
  // Амбар: хранит дерево, камень и еду. Стены твёрдые.
  barn: { id: 'barn', model: 'barn', size: { w: 5, d: 4 }, color: 0xb5493a,
    cost: { wood: 12, stone: 6, gold: 15 }, solid: true, walkable: false, economy: 'barn', defense: 200 },
  // Пещера гномов: здесь прячутся гномы при рейде, она открывает места для новых гномов (только одна на остров)
  cave: { id: 'cave', model: 'cave', size: { w: 4, d: 4 }, color: 0x7a7f88,
    cost: { wood: 14, stone: 12, gold: 30 }, solid: true, walkable: false, economy: 'cave', unique: true },
  // Сторожевая башня: сама стреляет по врагам рядом. Строится и улучшается отдельно от амбара.
  tower: { id: 'tower', model: 'tower', size: { w: 3, d: 3 }, color: 0x8a8f98,
    cost: { wood: 10, stone: 8, gold: 25 }, solid: true, walkable: false, economy: 'tower', hp: 200 },
  // Ловушка: срабатывает один раз, когда на неё наступает враг (урон и замедление)
  trap: { id: 'trap', model: 'trap', size: { w: 1.2, d: 1.2 }, color: 0x6a5a4a,
    cost: { wood: 2, stone: 1, gold: 5 }, solid: false, walkable: false, economy: 'trap' },
};

// Оборона острова. Слабее всего бьют слизни по постройкам (structureDamage в config/raids.js).
export const DEFENSE = {
  tower: { range: 11, damage: 9, cooldown: 1.5 },
  trap: { radius: 1.3, damage: 45, slow: 0.5, slowTime: 3 },
  barn: { regenDelay: 15, regenPerSec: 3, repairCost: { wood: 4 }, repairDefense: 50, insuranceGold: 20, insuranceDays: 3, lootPerHit: 3, lootCap: 10 },      // слизень крадёт по 3 за удар и уносит не больше 10
  repair: { cost: { wood: 3 }, heal: 40 },       // починка прочности: за каждое «Действие»
};

export const MAX_BUILDINGS = 60;
export const REFUND_RATIO = 0.5; // сколько ресурсов возвращается при сносе
