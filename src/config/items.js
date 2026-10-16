// Предметы героя. Только данные: предмет = ячейка × стихия × ступень (I, II, III).
// Проект: docs/items-progression.md. Наборы стихий, суперпреимущества и тайные сочетания добавятся на этапе 4.
import { ELEMENTS, ELEMENT_ORDER } from './heroes.js';

// Ячейки: icon — значок, unlock — с какого уровня героя ячейка открыта, stat — что улучшает предмет
//   dmg — урон героя, hp — здоровье, effect — сила эффекта стихии (горение, замедление, лечение от ударов),
//   speed — скорость бега, cd — перезарядка умений (меньше — лучше)
export const SLOT_INFO = {
  weapon: { icon: '⚔', unlock: 1, stat: 'dmg' },
  armor:  { icon: '🛡', unlock: 5, stat: 'hp' },
  amulet: { icon: '✨', unlock: 10, stat: 'effect' },
  boots:  { icon: '👟', unlock: 15, stat: 'speed' },
  ring:   { icon: '💍', unlock: 20, stat: 'cd' },
};
export const SLOTS = Object.keys(SLOT_INFO);

export const BAG_SIZE = 12;                       // мест в сумке предметов
export const TIERS = 3;
export const ROMAN = ['', 'I', 'II', 'III'];
export const TIER_PRICE = [0, 40, 120, 360];      // цена в золоте у торговца по ступеням
export const NEUTRAL = 'none';                    // простые предметы без стихии: только I ступень, вдвое слабее и дешевле
export const NEUTRAL_PRICE = 20;
export const SELL_RATIO = 0.35;                   // торговец выкупает предмет за 35% цены

// Бонус основной характеристики по ступеням I, II, III (доли: 0.08 = +8%)
export const TIER_BONUS = {
  weapon: [0.08, 0.16, 0.28],
  armor:  [0.10, 0.20, 0.35],
  amulet: [0.05, 0.10, 0.16],
  boots:  [0.05, 0.09, 0.14],
  ring:   [0.05, 0.09, 0.14],
};

export const ITEMS = {};
for (const slot of SLOTS) {
  const info = SLOT_INFO[slot];
  for (const element of [NEUTRAL, ...ELEMENT_ORDER]) {
    const tiers = element === NEUTRAL ? 1 : TIERS;
    for (let tier = 1; tier <= tiers; tier++) {
      const id = `${slot}_${element}_${tier}`;
      const neutral = element === NEUTRAL;
      ITEMS[id] = {
        id, slot, element, tier,
        stat: info.stat,
        bonus: TIER_BONUS[slot][tier - 1] * (neutral ? 0.5 : 1),
        price: neutral ? NEUTRAL_PRICE : TIER_PRICE[tier],
        color: neutral ? 0xb0b6c0 : ELEMENTS[element].color,
      };
    }
  }
}
export const ITEM_ORDER = Object.keys(ITEMS);

// Выпадение предметов из убитых врагов: из каждого падает ровно один предмет (если не указан chance).
// element — стихия острова врага (null: любая или простой предмет), tiers — какие ступени могут выпасть.
// Внутри выбранных предметов шанс зависит от цены: priceBias -1 — чем дороже, тем реже (решение владельца для монстров).
// Для будущих боёв игроков здесь будет +1: дорогое забирают чаще.
export const DROP = { priceBias: -1, offElement: 0.15, neutralChance: 0.35 };
export const ENEMY_DROP = {
  slime: { element: null, tiers: [1, 1] },                       // слизни рейдов на домашнем острове
  tree_monster: { element: null, tiers: [1, 1] },
  frost_slime: { element: 'ice', tiers: [1, 2] }, rock_slime: { element: 'earth', tiers: [1, 2] },
  tide_slime: { element: 'water', tiers: [1, 2] }, gust_slime: { element: 'air', tiers: [1, 2] }, lava_slime: { element: 'fire', tiers: [1, 2] },
  stone_king: { element: 'earth', tiers: [2, 3] }, tide_king: { element: 'water', tiers: [2, 3] }, storm_king: { element: 'air', tiers: [2, 3] },
  frost_giant: { element: 'ice', tiers: [2, 3] }, lava_king: { element: 'fire', tiers: [2, 3] },
};
// Арена: предметы падают из убитых героем врагов (на арене сами предметы не действуют)
export const ARENA_DROP = {
  hero: { element: null, tiers: [1, 2] },
  monster: { element: null, tiers: [1, 1] },
  king: { element: null, tiers: [2, 3] },
  minion: { element: null, tiers: [1, 1], chance: 0.1 },         // крипов много: предмет падает не всегда
};

// Магазин торговца: 6 предметов на день (одинаковые у всех игроков), цена ±20% от обычной
export const SHOP = { size: 6, tiers: [1, 1, 1, 2, 2, 3], mulMin: 0.8, mulMax: 1.2 };

export const isItem = id => typeof id === 'string' && Object.hasOwn(ITEMS, id);
