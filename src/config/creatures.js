// Существа. Каждое — отдельная запись; игра подхватывает их автоматически.
// Чтобы добавить новое: допиши запись, тексты "creature.<id>" в i18n.js
// и (если нужна новая форма) модель в src/creatures/CreatureModels.js.
//
//  model      — какая модель рисуется (fox | golem | spirit)
//  stats      — характеристики на 1 уровне, growth — прирост за каждый следующий уровень
//  ability    — способность: fireball (урон), shield (щит герою), heal (лечение героя)
//  basicRange — дальность обычной атаки (больше 3 — стреляет)
//  tame.cost  — что нужно отдать для приручения
//  evolutions — стадии развития: на каком уровне существо становится больше и сильнее
//               (level — уровень, scale — размер, color — новый цвет, statMult — множитель hp/atk/def).
//               Названия стадий: "creature.<id>.2" и "creature.<id>.3" в i18n.js
export const CREATURES = {
  fire_fox: {
    id: 'fire_fox',
    model: 'fox',
    color: 0xff7a1a,
    element: 'fire',
    role: 'attacker',
    stats: { hp: 40, atk: 9, def: 1, speed: 5.5 },
    growth: { hp: 6, atk: 2, def: 0.5 },
    ability: { id: 'fireball', cooldown: 4, power: 14, range: 9 },
    basicRange: 5,
    tame: { cost: { crystal: 3 } },
    evolutions: [
      { level: 4, scale: 1.25, color: 0xff3d00, statMult: 1.25 },
      { level: 8, scale: 1.5, color: 0xffd23f, statMult: 1.6 },
    ],
    spawn: { x: 6, z: 2 },
  },
  stone_guard: {
    id: 'stone_guard',
    model: 'golem',
    color: 0x8a8f98,
    element: 'earth',
    role: 'defender',
    stats: { hp: 70, atk: 6, def: 4, speed: 3.8 },
    growth: { hp: 10, atk: 1.5, def: 1 },
    ability: { id: 'shield', cooldown: 10, power: 25, duration: 6 },
    basicRange: 1.7,
    tame: { cost: { stone: 6 } },
    evolutions: [
      { level: 4, scale: 1.25, color: 0x5f6a7a, statMult: 1.25 },
      { level: 8, scale: 1.5, color: 0x3d4452, statMult: 1.6 },
    ],
    spawn: { x: -9, z: 5 },
  },
  forest_spirit: {
    id: 'forest_spirit',
    model: 'spirit',
    color: 0x5de08a,
    element: 'nature',
    role: 'support',
    stats: { hp: 35, atk: 4, def: 1, speed: 5 },
    growth: { hp: 5, atk: 1, def: 0.5 },
    ability: { id: 'heal', cooldown: 8, power: 22 },
    basicRange: 1.7,
    tame: { cost: { wood: 6 } },
    evolutions: [
      { level: 4, scale: 1.25, color: 0x2fbf6b, statMult: 1.25 },
      { level: 8, scale: 1.5, color: 0x1f8f4a, statMult: 1.6 },
    ],
    spawn: { x: 3, z: -10 },
  },
};

// Стадия развития (1, 2, 3...) для существа данного вида и уровня
export function stageForLevel(def, level) {
  return 1 + def.evolutions.filter(e => level >= e.level).length;
}

// Ключ названия в i18n.js с учётом стадии
export function creatureNameKey(def, level) {
  const stage = stageForLevel(def, level);
  return stage > 1 ? `creature.${def.id}.${stage}` : `creature.${def.id}`;
}
