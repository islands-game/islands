// Герои: класс × стихия. Только данные — новые герои добавляются записями здесь.
// Подробный дизайн и баланс: docs/heroes.md.

// Стихии. Эффект у всех стихий примерно одинаковой «стоимости».
export const ELEMENTS = {
  fire:  { color: 0xff6a2a, burn: { ratio: 0.2, time: 3 } },            // горение: +20% от удара за 3 с
  water: { color: 0x2f8cff, drain: 0.06 },                               // лечит героя на 6% от нанесённого урона
  ice:   { color: 0x8fe3ff, slow: { mul: 0.25, time: 1.5 } },            // удар замедляет цель на 25% на 1.5 с
  earth: { color: 0x9a7040, hpMul: 1.06, dmgTaken: 0.96 },               // +6% здоровья и −4% получаемого урона
  air:   { color: 0xbff0e0, speedMul: 1.08, cdMul: 0.92 },               // +8% скорости движения и атаки
};
export const ELEMENT_ORDER = ['fire', 'water', 'ice', 'earth', 'air'];
// Какие стихии доступны в игре
export const ENABLED_ELEMENTS = ELEMENT_ORDER;

import { SKILLS } from './skills.js';
export { SKILLS };

// Классы. Числа для арены (hp, atk за удар, cooldown, range, speed). На островах герой слабее арены:
// main.hpMul — во сколько раз больше здоровья, чем у обычного героя; main.dpsMul — урон в секунду относительно обычного.
// Автоатака — «стандартная» для класса (дальность, скорость), плюс 3 умения героя (SKILLS ниже).
export const CLASSES = {
  warrior: {
    hp: 800, atk: 30, cooldown: 0.8, range: 2.8, speed: 5.4, beasts: 1,
    main: { hpMul: 1.33, dpsMul: 0.94 },
  },
  archer: {
    hp: 420, atk: 36, cooldown: 0.9, range: 8.5, speed: 5.6, beasts: 1,
    main: { hpMul: 0.7, dpsMul: 1.0 },
  },
  mage: {
    hp: 520, atk: 40, cooldown: 1.0, range: 7, speed: 5.4, beasts: 1,
    main: { hpMul: 0.87, dpsMul: 1.0 },
  },
  assassin: {
    hp: 330, atk: 70, cooldown: 1.0, range: 2.4, speed: 7.0, beasts: 1,
    main: { hpMul: 0.55, dpsMul: 1.75 },
  },
  support: {
    hp: 450, atk: 14, cooldown: 0.9, range: 6, speed: 5.6, beasts: 1,             // до 3 зверей — на этапе 4
    main: { hpMul: 0.75, dpsMul: 0.39 },
  },
};
export const CLASS_ORDER = ['warrior', 'archer', 'mage', 'assassin', 'support'];

// Особенности конкретного героя поверх класса. Ключ — `${класс}_${стихия}`.
// cdMul — перезарядка (урон за удар растёт в ту же сторону, поэтому урон в секунду не меняется).
// cdMul — перезарядка автоатаки (удар сильнее ровно во столько же раз — урон в секунду не меняется),
// range — своя дальность. Это «оружие» героя: топор, молот, арбалет, бумеранг и т. д.
const VARIANTS = {
  warrior_water: { range: 3.4 },                 // трезубец: бьёт дальше
  warrior_earth: { cdMul: 1.25 },                // молот: медленнее и тяжелее
  warrior_air: { cdMul: 0.7 },                   // двойные клинки: быстрее и легче
  archer_fire: { cdMul: 1.5 },                   // арбалет: тяжёлый болт
  archer_water: { cdMul: 1.2, range: 10 },       // копьё: дальше и тяжелее
  archer_ice: { cdMul: 0.8 },                    // лук: быстрые стрелы
  archer_earth: { cdMul: 2 },                    // бумеранг: возвращается, двойной урон, стрельба вдвое реже
  archer_air: { cdMul: 0.7 },                    // метательные ножи: быстро и легко
  mage_earth: { cdMul: 1.5 },                    // камень: медленно и тяжело
};

export const HEROES = {};
for (const cls of CLASS_ORDER) {
  for (const el of ENABLED_ELEMENTS) {
    const id = `${cls}_${el}`;
    const skills = Object.keys(SKILLS).filter(k => k.startsWith(id + '_'));
    HEROES[id] = { id, cls, element: el, cdMul: 1, skills, ...VARIANTS[id] };
  }
}
export const HERO_IDS = Object.keys(HEROES);
export const DEFAULT_HERO = 'warrior_fire';

export const isHero = id => typeof id === 'string' && Object.hasOwn(HEROES, id);

// Характеристики героя на арене
export function arenaStats(heroId) {
  const h = HEROES[heroId], c = CLASSES[h.cls], e = ELEMENTS[h.element];
  return {
    hp: Math.round(c.hp * (e.hpMul ?? 1)),
    atk: c.atk * h.cdMul,                                   // урон за удар растёт вместе с перезарядкой оружия
    cooldown: c.cooldown * h.cdMul * (e.cdMul ?? 1),
    range: h.range ?? c.range,
    speed: c.speed * (e.speedMul ?? 1),
    dmgTaken: e.dmgTaken ?? 1,
  };
}

// Множители героя на островах (здоровье, урон в секунду, перезарядка, скорость)
export function mainStats(heroId) {
  const h = HEROES[heroId], c = CLASSES[h.cls], e = ELEMENTS[h.element];
  return {
    hpMul: c.main.hpMul * (e.hpMul ?? 1), dpsMul: c.main.dpsMul,
    cooldown: c.cooldown * h.cdMul * (e.cdMul ?? 1), range: h.range ?? c.range,
    hitCooldown: c.cooldown * h.cdMul,                       // от неё зависит сила удара (стихия воздуха бьёт чаще, но не сильнее)
    speedMul: (c.speed / 5.6) * (e.speedMul ?? 1),
    dmgTaken: e.dmgTaken ?? 1,
  };
}
