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

// ---------- Этап 4: черты стихий, наборы, суперпреимущества, тайные сочетания ----------

// Особые черты отдельных предметов (ячейка_стихия): сила по ступеням I, II, III
//   burnHit — доля удара, которая горит 3 секунды; healHit — лечение от ударов (доля урона);
//   aura — замедление врагов вокруг героя (доля); dr — меньше получаемого урона; atkSpeed — быстрее атака
export const TRAITS = {
  weapon_fire: { burnHit: [0.15, 0.25, 0.35] },
  amulet_water: { healHit: [0.03, 0.05, 0.08] },
  boots_ice: { aura: [0.10, 0.15, 0.20] },
  armor_earth: { dr: [0.03, 0.05, 0.08] },
  ring_air: { atkSpeed: [0.04, 0.07, 0.10] },
};
export const AURA_RADIUS = 4;

// Набор: сколько предметов одной стихии надето -> прибавка ко всем характеристикам. Пять — суперпреимущество.
export const SET_BONUS = { 2: 0.05, 3: 0.12, 4: 0.20, 5: 0.20 };
export const SET_FULL = 5;
// Слабая черта стихии от трёх предметов одной стихии
export const SET_WEAK = {
  fire: { burnHit: 0.10 }, water: { healHit: 0.02 }, ice: { aura: 0.08 }, earth: { dr: 0.03 }, air: { atkSpeed: 0.04 },
};
// Суперпреимущества полного набора (пять предметов одной стихии)
export const SUPERS = {
  fire: { dmg: 1.2, burnSpread: true },                       // «Огненная душа»
  water: { waveHeal: 0.12 },                                  // «Прилив»: раз в 8 секунд волна лечит
  ice: { freezeEvery: 5 },                                    // «Вечная мерзлота»: каждый пятый удар замораживает
  earth: { dr: 0.25, shieldRegen: 0.15 },                     // «Горный король»
  air: { speed: 1.3, atkSpeed: 0.30 },                        // «Буревестник»
};
export const WAVE_EVERY = 8;
export const SHIELD_EVERY = 6;

// Тайные сочетания. need — какие предметы надеты (ячейка, стихия), любая ступень. Игрок о них не знает:
// сочетание открывается само, когда он случайно собрал его, и попадает в «Книгу открытий».
// fx — что даёт (см. inventory/ItemEffects.js); all — прибавка ко всем характеристикам.
export const COMBOS = {
  steam:     { need: [['weapon', 'fire'], ['amulet', 'water']], fx: { skillPower: 0.15 } },
  contrast:  { need: [['weapon', 'fire'], ['boots', 'ice']], fx: { crit: 0.15 } },
  volcano:   { need: [['weapon', 'fire'], ['armor', 'earth']], fx: { explode: 2 } },
  firestorm: { need: [['weapon', 'fire'], ['ring', 'air']], fx: { burnSpread: true, atkSpeed: 0.05 } },
  frost:     { need: [['weapon', 'ice'], ['amulet', 'water']], fx: { healHit: 0.04 } },
  bog:       { need: [['armor', 'water'], ['boots', 'earth']], fx: { aura: 0.25, auraR: 5 } },
  storm:     { need: [['ring', 'water'], ['amulet', 'air']], fx: { lightning: 4 } },
  glacier:   { need: [['armor', 'ice'], ['amulet', 'earth']], fx: { dr: 0.10 } },
  blizzard:  { need: [['boots', 'ice'], ['ring', 'air']], fx: { aura: 0.15, auraR: 7 } },
  sandstorm: { need: [['armor', 'earth'], ['boots', 'air']], fx: { miss: 0.15 } },
  prism:     { need: [['weapon', 'fire'], ['amulet', 'water'], ['ring', 'ice']], fx: { all: 0.08 } },
  windforge: { need: [['weapon', 'air'], ['armor', 'fire'], ['boots', 'earth']], fx: { dmg: 1.12 } },
  harmony:   { harmony: true, fx: { all: 0.12 } },            // пять предметов пяти разных стихий
};
export const COMBO_ORDER = Object.keys(COMBOS);
export const isCombo = id => typeof id === 'string' && Object.hasOwn(COMBOS, id);
