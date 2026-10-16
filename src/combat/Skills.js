// Умения героев. Одна и та же логика работает на островах и на арене: окружение подключается через ctx.
//
// ctx.caster: { pos, facing, hit (урон обычного удара), color }
// ctx.foes(r)   — живые враги в радиусе r от героя, ближайшие первыми:
//                 { pos, radius, hpRatio, hit(dmg), slow(доля, сек), burn(всего, сек) }
// ctx.allies(r) — союзники рядом, включая героя: { pos, maxHp, heal(n), shield(n, сек) }
// ctx.slide(dx, dz, dist) — сдвиг героя (не проходит сквозь стены), возвращает пройденное
// ctx.dir()     — куда герой хочет двигаться (для рывка и телепорта)
// ctx.lifesteal(n) — лечит героя; ctx.haste(mul, сек), ctx.face(угол), ctx.ring(pos, color, size, dur), ctx.shot(from, toPos, color, onHit)
import { SKILLS } from '../config/heroes.js';

const BURN_RATIO = 0.3;     // горение от умения: 30% урона за 3 секунды
const BURN_TIME = 3;
const DRAIN_RATIO = 0.4;    // умения воды: 40% урона возвращается героем здоровьем

const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function strike(ctx, def, foe, dmg) {
  foe.hit(Math.round(dmg));
  if (def.burn) foe.burn(dmg * BURN_RATIO, BURN_TIME);
  if (def.slow) foe.slow(def.slow, def.slowTime ?? 2);
  if (def.drain) ctx.lifesteal(dmg * DRAIN_RATIO);
}

const HANDLERS = {
  // Рывок к ближайшему врагу и удар по области на месте остановки
  dash(ctx, def) {
    const c = ctx.caster;
    const foes = ctx.foes(def.dist);
    if (!foes.length) return false;
    const target = foes[0];
    const dx = target.pos.x - c.pos.x, dz = target.pos.z - c.pos.z;
    const d = Math.hypot(dx, dz);
    ctx.face(Math.atan2(dx, dz));
    ctx.slide(dx, dz, Math.max(0, d - 1.4));
    ctx.ring(c.pos, c.color, def.radius * 1.6, 0.35);
    for (const f of ctx.foes(def.radius + 1)) {
      if (dist2d(f.pos, c.pos) - f.radius > def.radius) continue;
      strike(ctx, def, f, c.hit * def.power * (def.execute && f.hpRatio < 0.35 ? 2 : 1));
    }
    return true;
  },

  // Удар по области вокруг героя
  nova(ctx, def) {
    const c = ctx.caster;
    ctx.ring(c.pos, c.color, def.radius * 1.4, 0.45);
    for (const f of ctx.foes(def.radius + 1)) {
      if (dist2d(f.pos, c.pos) - f.radius > def.radius) continue;
      strike(ctx, def, f, c.hit * def.power);
    }
    return true;
  },

  // Снаряд в ближайшего врага (по желанию — взрыв вокруг цели)
  shot(ctx, def) {
    const c = ctx.caster;
    const foes = ctx.foes(def.range);
    if (!foes.length) return false;
    const target = foes[0];
    ctx.face(Math.atan2(target.pos.x - c.pos.x, target.pos.z - c.pos.z));
    const from = c.pos.clone();
    ctx.shot(from, target.pos, c.color, () => {
      strike(ctx, def, target, c.hit * def.power);
      if (def.aoe) {
        ctx.ring(target.pos, c.color, def.aoe * 1.6, 0.4);
        for (const f of ctx.foes(def.range + def.aoe)) {
          if (f === target || dist2d(f.pos, target.pos) - f.radius > def.aoe) continue;
          strike(ctx, def, f, c.hit * def.power * 0.6);
        }
      }
    });
    return true;
  },

  // Несколько снарядов по ближайшим врагам
  volley(ctx, def) {
    const c = ctx.caster;
    const foes = ctx.foes(def.range);
    if (!foes.length) return false;
    ctx.face(Math.atan2(foes[0].pos.x - c.pos.x, foes[0].pos.z - c.pos.z));
    for (let i = 0; i < def.count; i++) {
      const f = foes[i % foes.length];
      const from = c.pos.clone();
      ctx.shot(from, f.pos, c.color, () => strike(ctx, def, f, c.hit * def.power), 0.22 + i * 0.06);
    }
    return true;
  },

  // Перекат / телепорт в сторону движения (без урона)
  blink(ctx, def) {
    const c = ctx.caster;
    const d = ctx.dir();
    ctx.ring(c.pos, c.color, 2, 0.3);
    ctx.slide(d.x, d.z, def.dist);
    ctx.ring(c.pos, c.color, 2, 0.3);
    return true;
  },

  // Щит и/или ускорение для себя
  buff(ctx, def) {
    const c = ctx.caster;
    ctx.ring(c.pos, c.color, 3, 0.5);
    if (def.haste) ctx.haste(def.haste, def.time);
    if (def.shieldPct) for (const a of ctx.allies(0.1)) a.shield(a.maxHp * def.shieldPct, def.time);
    return true;
  },

  // Лечение и щит союзникам рядом (и себе)
  heal(ctx, def) {
    const c = ctx.caster;
    ctx.ring(c.pos, 0x5de08a, def.radius * 1.3, 0.5);
    for (const a of ctx.allies(def.radius)) {
      if (def.healPct) a.heal(a.maxHp * def.healPct);
      if (def.shieldPct) a.shield(a.maxHp * def.shieldPct, def.time ?? 4);
    }
    return true;
  },
};

// Применяет умение. Возвращает false, если применить не к чему (откат не тратится).
// mul — усиление умения вехами уровня героя (config/levels.js): растёт урон, лечение и щит
export function castSkill(ctx, skillId, mul = 1) {
  const base = SKILLS[skillId];
  if (!base) return false;
  let def = base;
  if (mul !== 1) {
    def = { ...base };
    for (const k of ['power', 'healPct', 'shieldPct']) if (def[k]) def[k] *= mul;
  }
  return HANDLERS[def.type](ctx, def);
}

// Нужно ли умению видеть врага рядом (для подсказки «нет цели»)
export function skillNeedsTarget(skillId) {
  const t = SKILLS[skillId]?.type;
  return t === 'dash' || t === 'shot' || t === 'volley';
}
