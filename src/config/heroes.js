// Герои: класс × стихия. Только данные — новые герои добавляются записями здесь.
// Подробный дизайн и баланс: docs/heroes.md.

// Стихии. Эффект у всех стихий примерно одинаковой «стоимости».
export const ELEMENTS = {
  fire: { color: 0xff6a2a, burn: { ratio: 0.2, time: 3 } },    // горение: +20% от удара за 3 с
};
// Какие стихии уже доступны в игре (остальные добавляются на следующих этапах)
export const ENABLED_ELEMENTS = ['fire'];

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

// Умения. type — что делает (обработчики в combat/Skills.js), cooldown — откат (с), power — урон в долях обычного удара.
// burn — поджигает цели (горение стихии огня), healPct / shieldPct — доли от максимального здоровья цели.
export const SKILLS = {
  // Воин (берсерк огня)
  warrior_dash: { type: 'dash', icon: '⚡', cooldown: 7, dist: 9, power: 1.3, radius: 2.4, burn: true },
  warrior_ring: { type: 'nova', icon: '🔥', cooldown: 9, radius: 4, power: 1.1, burn: true },
  warrior_guard: { type: 'buff', icon: '🛡', cooldown: 14, shieldPct: 0.22, time: 4, haste: 1.2 },
  // Стрелок (арбалетчик огня)
  archer_roll: { type: 'blink', icon: '💨', cooldown: 6, dist: 4.5 },
  archer_bolt: { type: 'shot', icon: '🔥', cooldown: 7, range: 10, power: 2.2, burn: true },
  archer_volley: { type: 'volley', icon: '🏹', cooldown: 10, range: 9, count: 3, power: 0.9 },
  // Маг огня
  mage_blink: { type: 'blink', icon: '✨', cooldown: 9, dist: 6.5 },
  mage_fireball: { type: 'shot', icon: '☄', cooldown: 6, range: 9, power: 2.0, aoe: 2.5, burn: true },
  mage_nova: { type: 'nova', icon: '🔥', cooldown: 12, radius: 5, power: 1.4, burn: true },
  // Убийца огня
  assassin_pounce: { type: 'dash', icon: '🗡', cooldown: 8, dist: 9, power: 1.6, radius: 1.8, execute: true },
  assassin_haste: { type: 'buff', icon: '💨', cooldown: 10, time: 3, haste: 1.45 },
  assassin_daggers: { type: 'volley', icon: '🗡', cooldown: 9, range: 7, count: 3, power: 1.0, burn: true },
  // Поддержка огня
  support_heal: { type: 'heal', icon: '💚', cooldown: 8, radius: 6.5, healPct: 0.25 },
  support_slow: { type: 'nova', icon: '🧊', cooldown: 10, radius: 5.5, power: 0.5, slow: 0.4, slowTime: 3 },
  support_aura: { type: 'heal', icon: '✨', cooldown: 14, radius: 7, healPct: 0.1, shieldPct: 0.15, time: 4 },
};

// Особенности конкретного героя поверх класса. Ключ — `${класс}_${стихия}`.
// cdMul — перезарядка (урон за удар растёт в ту же сторону, поэтому урон в секунду не меняется).
const VARIANTS = {
  warrior_fire: { skills: ['warrior_dash', 'warrior_ring', 'warrior_guard'] },
  archer_fire: { cdMul: 1.5, skills: ['archer_roll', 'archer_bolt', 'archer_volley'] },   // арбалетчик: тяжёлый болт, перезарядка дольше
  mage_fire: { skills: ['mage_blink', 'mage_fireball', 'mage_nova'] },
  assassin_fire: { skills: ['assassin_pounce', 'assassin_haste', 'assassin_daggers'] },
  support_fire: { skills: ['support_heal', 'support_slow', 'support_aura'] },
};

export const HEROES = {};
for (const cls of CLASS_ORDER) {
  for (const el of ENABLED_ELEMENTS) {
    const id = `${cls}_${el}`;
    HEROES[id] = { id, cls, element: el, cdMul: 1, skills: [], ...VARIANTS[id] };
  }
}
export const HERO_IDS = Object.keys(HEROES);
export const DEFAULT_HERO = 'warrior_fire';

export const isHero = id => typeof id === 'string' && Object.hasOwn(HEROES, id);

// Характеристики героя на арене
export function arenaStats(heroId) {
  const h = HEROES[heroId], c = CLASSES[h.cls];
  return { hp: c.hp, atk: c.atk * h.cdMul, cooldown: c.cooldown * h.cdMul, range: c.range, speed: c.speed };
}

// Множители героя на островах (здоровье, урон в секунду, перезарядка, скорость)
export function mainStats(heroId) {
  const h = HEROES[heroId], c = CLASSES[h.cls];
  return {
    hpMul: c.main.hpMul, dpsMul: c.main.dpsMul,
    cooldown: c.cooldown * h.cdMul, range: c.range,
    speedMul: c.speed / 5.6,
  };
}
