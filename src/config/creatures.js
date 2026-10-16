// Звери. Всего 5 видов (аналоги классов героев), у каждого 5 вариантов по стихиям (мы называем зверя «Огненный Медведь» и т. п.).
// Зверя нельзя найти на земле: его охраняет король стихии в одном из пяти порталов (см. config/realms.js).
// Какой именно зверь сегодня в плену, решает дата (меняется раз в день, одинаково у всех игроков).
//
//  SPECIES    — вид: model (какая модель), role, stats / growth (характеристики 1 уровня и прирост за уровень),
//               ability — способность (fireball | breath | pounce | shield | heal), basicRange — дальность обычной атаки
//  ELEMENT_FX — что даёт стихия зверю: fire — поджигает цель, water — лечит героя от ударов зверя, ice — замедляет цель,
//               earth — крепче (защита ×1.5), air — быстрее (скорость ×1.1, способность восстанавливается на 10% быстрее)
//  evolutions — стадии развития (на 4 и 8 уровне зверь становится больше и сильнее)
//  Названия: "creature.<вид>", "creature.<вид>.2", "creature.<вид>.3" в i18n.js (+ стихия: "el.<стихия>")
import { ELEMENTS } from './heroes.js';
import { t } from './i18n.js';

export const SPECIES = {
  bear: {      // аналог воина: крепкий, держит удар, ставит щит герою
    model: 'bear', role: 'warrior', base: 0x8a5a3a,
    stats: { hp: 75, atk: 7, def: 4, speed: 4.2 }, growth: { hp: 11, atk: 1.6, def: 1 },
    ability: { id: 'shield', cooldown: 10, power: 25, duration: 6 },
    basicRange: 1.9,
  },
  fox: {       // аналог стрелка: стреляет издалека
    model: 'fox', role: 'archer', base: 0xff9a3a,
    stats: { hp: 40, atk: 9, def: 1, speed: 5.5 }, growth: { hp: 6, atk: 2, def: 0.5 },
    ability: { id: 'fireball', cooldown: 4, power: 14, range: 9 },
    basicRange: 5,
  },
  wolf: {      // аналог убийцы: быстрый, больно кусает, прыгает на врага
    model: 'wolf', role: 'assassin', base: 0x8a8f98,
    stats: { hp: 45, atk: 12, def: 1, speed: 6.6 }, growth: { hp: 6, atk: 2.4, def: 0.5 },
    ability: { id: 'pounce', cooldown: 6, power: 20, range: 9 },
    basicRange: 1.8,
  },
  dragon: {    // аналог мага: дышит на расстоянии, огонь бьёт по области
    model: 'dragon', role: 'mage', base: 0xb04a8a,
    stats: { hp: 50, atk: 8, def: 2, speed: 4.6 }, growth: { hp: 7, atk: 1.9, def: 0.7 },
    ability: { id: 'breath', cooldown: 6, power: 14, range: 8, aoe: 2.6 },
    basicRange: 6,
  },
  owl: {       // аналог поддержки: лечит героя
    model: 'owl', role: 'support', base: 0xc9b080,
    stats: { hp: 35, atk: 4, def: 1, speed: 5 }, growth: { hp: 5, atk: 1, def: 0.5 },
    ability: { id: 'heal', cooldown: 8, power: 22 },
    basicRange: 4,
  },
};
export const SPECIES_ORDER = ['bear', 'fox', 'wolf', 'dragon', 'owl'];

export const ELEMENT_FX = {
  fire: { burn: 0.3 },                         // горение: +30% от удара за 3 с
  water: { drain: 0.4 },                       // лечит героя на 40% от урона зверя
  ice: { slow: 0.2 },                          // замедляет цель на 20%
  earth: { defMul: 1.5 },                      // крепче
  air: { speedMul: 1.1, cdMul: 0.9 },          // быстрее
};

const EVOLUTIONS = [
  { level: 4, scale: 1.25, statMult: 1.25, tint: 0.25 },
  { level: 8, scale: 1.5, statMult: 1.6, tint: -0.25 },
];

// Смешивает два цвета (k от 0 до 1) и осветляет/затемняет (tint)
function mix(a, b, k) {
  const ch = s => [(a >> s) & 255, (b >> s) & 255];
  let out = 0;
  for (const s of [16, 8, 0]) { const [x, y] = ch(s); out = (out << 8) | Math.round(x + (y - x) * k); }
  return out;
}
function shade(c, tint) {
  return tint >= 0 ? mix(c, 0xffffff, tint) : mix(c, 0x000000, -tint);
}

// Все звери: 5 видов × 5 стихий, id вида "bear_fire"
export const CREATURES = {};
for (const [sp, s] of Object.entries(SPECIES)) {
  for (const el of Object.keys(ELEMENTS)) {
    const id = `${sp}_${el}`;
    const elColor = ELEMENTS[el].color;
    const color = mix(s.base, elColor, 0.65);
    CREATURES[id] = {
      id, species: sp, element: el,
      model: s.model, role: s.role, color,
      stats: { ...s.stats }, growth: { ...s.growth },
      ability: { ...s.ability, color: elColor },
      basicRange: s.basicRange,
      evolutions: EVOLUTIONS.map(e => ({ level: e.level, scale: e.scale, statMult: e.statMult, color: shade(color, e.tint) })),
    };
  }
}

// Старые существа из прошлых сохранений превращаются в новых зверей
export const LEGACY_CREATURES = {
  fire_fox: 'fox_fire', stone_guard: 'bear_earth', forest_spirit: 'owl_air', frost_fox: 'fox_ice', magma_guard: 'bear_fire',
};

export const isCreature = id => typeof id === 'string' && Object.hasOwn(CREATURES, id);

// Стадия развития (1, 2, 3...) для зверя данного вида и уровня
export function stageForLevel(def, level) {
  return 1 + def.evolutions.filter(e => level >= e.level).length;
}

// Полное имя зверя: «Огненный Медведь» (стихия-прилагательное + название вида с учётом стадии).
// Сова — женского рода: в русском «Огненная Сова» (ключи elj.<стихия>.f)
export function beastTitle(def, level = 1) {
  const fem = def.species === 'owl' ? '.f' : '';
  return `${t('elj.' + def.element + fem)} ${t(creatureNameKey(def, level))}`;
}

// Ключ названия вида в i18n.js с учётом стадии
export function creatureNameKey(def, level) {
  const stage = stageForLevel(def, level);
  return stage > 1 ? `creature.${def.species}.${stage}` : `creature.${def.species}`;
}
