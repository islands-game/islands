import { ITEMS, SLOTS, TRAITS, AURA_RADIUS, SET_BONUS, SET_FULL, SET_WEAK, SUPERS, COMBOS, COMBO_ORDER, NEUTRAL } from '../config/items.js';
import { ELEMENT_ORDER } from '../config/heroes.js';

export const noFx = () => ({
  burnHit: 0, healHit: 0, aura: 0, auraR: 0, dr: 0, atkSpeed: 0, crit: 0, skillPower: 0, explode: 0,
  burnSpread: false, freezeEvery: 0, waveHeal: 0, shieldRegen: 0, lightning: 0, miss: 0,
});

// Считает, что дают надетые предметы: множители характеристик (mul), особые эффекты (fx), наборы и сочетания.
// equipped — { ячейка: id }, isOpen(ячейка) — открыта ли ячейка уровнем героя. Чистая функция: её легко проверять.
export function computeEffects(equipped, isOpen) {
  const worn = {};
  for (const slot of SLOTS) {
    const it = ITEMS[equipped[slot]];
    if (it && isOpen(slot)) worn[slot] = it;
  }
  const mul = { dmg: 1, hp: 1, effect: 1, speed: 1, cd: 1 };
  const fx = noFx();
  const allMul = (k) => { mul.dmg *= 1 + k; mul.hp *= 1 + k; mul.effect *= 1 + k; mul.speed *= 1 + k; mul.cd *= 1 - k; };

  // Основная характеристика предметов
  for (const it of Object.values(worn)) {
    if (it.stat === 'cd') mul.cd -= it.bonus; else mul[it.stat] += it.bonus;
    const trait = TRAITS[`${it.slot}_${it.element}`];
    if (trait) for (const [k, tiers] of Object.entries(trait)) {
      if (k === 'aura') { fx.aura = Math.max(fx.aura, tiers[it.tier - 1]); fx.auraR = Math.max(fx.auraR, AURA_RADIUS); }
      else fx[k] += tiers[it.tier - 1];
    }
  }

  // Наборы: по каждой стихии отдельно
  const counts = Object.fromEntries(ELEMENT_ORDER.map(e => [e, 0]));
  for (const it of Object.values(worn)) if (it.element !== NEUTRAL) counts[it.element]++;
  let superEl = null;
  for (const el of ELEMENT_ORDER) {
    const c = counts[el];
    if (c < 2) continue;
    allMul(SET_BONUS[c]);
    if (c >= 3) {
      const w = SET_WEAK[el];
      for (const [k, v] of Object.entries(w)) {
        if (k === 'aura') { fx.aura = Math.max(fx.aura, v); fx.auraR = Math.max(fx.auraR, AURA_RADIUS - 0.5); }
        else fx[k] += v;
      }
    }
    if (c >= SET_FULL) {
      superEl = el;
      const s = SUPERS[el];
      if (s.dmg) mul.dmg *= s.dmg;
      if (s.speed) mul.speed *= s.speed;
      if (s.dr) fx.dr += s.dr;
      if (s.atkSpeed) fx.atkSpeed += s.atkSpeed;
      if (s.burnSpread) fx.burnSpread = true;
      if (s.waveHeal) fx.waveHeal = s.waveHeal;
      if (s.freezeEvery) fx.freezeEvery = s.freezeEvery;
      if (s.shieldRegen) fx.shieldRegen = s.shieldRegen;
    }
  }

  // Тайные сочетания
  const combos = [];
  for (const id of COMBO_ORDER) {
    const c = COMBOS[id];
    let ok;
    if (c.harmony) ok = SLOTS.every(s => worn[s]) && new Set(SLOTS.map(s => worn[s].element)).size === SLOTS.length && !SLOTS.some(s => worn[s].element === NEUTRAL);
    else ok = c.need.every(([slot, el]) => worn[slot]?.element === el);
    if (!ok) continue;
    combos.push(id);
    const e = c.fx;
    if (e.all) allMul(e.all);
    if (e.dmg) mul.dmg *= e.dmg;
    for (const k of ['healHit', 'dr', 'atkSpeed', 'crit', 'skillPower', 'explode', 'miss']) if (e[k]) fx[k] += e[k];
    if (e.burnSpread) fx.burnSpread = true;
    if (e.lightning) fx.lightning = fx.lightning ? Math.min(fx.lightning, e.lightning) : e.lightning;
    if (e.aura) { fx.aura = Math.max(fx.aura, e.aura); fx.auraR = Math.max(fx.auraR, e.auraR ?? AURA_RADIUS); }
  }

  mul.cd = Math.max(0.4, mul.cd);                 // перезарядка не короче 40%
  mul.speed = Math.min(1.5, mul.speed);           // бег не быстрее чем на 50%
  fx.dr = Math.min(0.6, fx.dr);                   // защита не больше 60%
  fx.aura = Math.min(0.6, fx.aura);
  return { mul, fx, counts, superEl, combos };
}
