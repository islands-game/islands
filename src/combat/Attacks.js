// Автоатака героя: у каждого «оружия» своя механика (бумеранг, пробивание, веер, цепная молния, удар по области, двойной удар).
// Работает и на островах, и на арене через ctx (тот же, что у умений, см. combat/Skills.js), плюс:
// ctx.boomerang(from, toPos, color, onOut, onBack) — летит к точке и возвращается к герою;
// ctx.later(сек, fn) — отложенное действие.
import { HEROES, CLASSES, ELEMENTS } from '../config/heroes.js';

const alive = foe => foe.hpRatio > 0;
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const same = (a, b) => a.pos === b.pos;      // адаптеры создаются заново, поэтому врагов сравниваем по их позиции

// Эффект стихии при попадании: горение, замедление, лечение героя
function onHit(ctx, foe, dmg, el) {
  if (el.burn) foe.burn(dmg * el.burn.ratio, el.burn.time);
  if (el.slow) foe.slow(el.slow.mul, el.slow.time);
  if (el.drain) ctx.lifesteal(dmg * el.drain);
}

// target — цель (адаптер врага), dmg — урон всей атаки
export function performHeroAttack(ctx, heroId, target, dmg) {
  const hero = HEROES[heroId];
  const spec = hero.attack ?? {};
  const el = ELEMENTS[hero.element];
  const range = hero.range ?? CLASSES[hero.cls].range;
  const ranged = range >= 4;
  const color = el.color;
  const from = ctx.caster.pos;

  const hit = (foe, d) => {
    if (!alive(foe)) return;
    foe.hit(Math.round(d));
    onHit(ctx, foe, d, el);
  };
  // Доставка: снаряд для дальних героев, мгновенно для ближних
  const deliver = (foe, d, extra) => {
    const go = () => { hit(foe, d); extra?.(); };
    if (ranged) ctx.shot(from.clone(), foe.pos, color, go, 0.25);
    else go();
  };

  if (spec.boomerang) {
    // Бумеранг: летит к цели (удар), возвращается (второй удар). Пока не вернулся, новый бросок невозможен (перезарядка дольше полёта).
    const half = dmg / 2;
    ctx.boomerang(from.clone(), target.pos, color,
      () => hit(target, half),
      () => {
        const second = alive(target) && d2(target.pos, from) < 20 ? target : ctx.foes(spec.backRange ?? 5)[0];
        if (second) hit(second, half);
      }, from);
    return;
  }

  if (spec.fan) {
    // Веер: несколько снарядов по разным целям, урон делится поровну
    const foes = [target, ...ctx.foes(range).filter(f => !same(f, target))];
    const each = dmg / spec.fan;
    for (let i = 0; i < spec.fan; i++) {
      const f = foes[i % foes.length];
      ctx.later(i * 0.06, () => deliver(f, each));
    }
    return;
  }

  if (spec.multi) {
    // Двойной удар: части урона с короткой паузой
    const each = dmg / spec.multi;
    for (let i = 0; i < spec.multi; i++) ctx.later(i * 0.14, () => deliver(target, each));
    return;
  }

  if (spec.pierce) {
    // Пробивание: цель и враги позади неё на той же линии
    const dx = target.pos.x - from.x, dz = target.pos.z - from.z, len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    const line = ctx.foes(range + 2).filter(f => {
      if (same(f, target)) return false;
      const px = f.pos.x - from.x, pz = f.pos.z - from.z;
      const along = px * ux + pz * uz;
      const side = Math.abs(px * uz - pz * ux);
      return along > 0 && along <= range + 2 && side <= 1.3;
    }).sort((a, b) => d2(a.pos, from) - d2(b.pos, from)).slice(0, spec.pierce - 1);
    deliver(target, dmg, () => { for (const f of line) hit(f, dmg * 0.8); });
    return;
  }

  if (spec.chain) {
    // Цепная молния: перескакивает на соседних врагов, каждый раз слабее
    deliver(target, dmg, () => {
      const used = new Set([target.pos]);
      let prev = target, k = 0.6;
      for (let i = 0; i < spec.chain; i++) {
        const next = ctx.foes(range + 4).filter(f => !used.has(f.pos) && d2(f.pos, prev.pos) <= 4.5).sort((a, b) => d2(a.pos, prev.pos) - d2(b.pos, prev.pos))[0];
        if (!next) break;
        used.add(next.pos);
        ctx.ring(next.pos, color, 1.6, 0.25);
        hit(next, dmg * k);
        prev = next;
        k *= 0.8;
      }
    });
    return;
  }

  if (spec.splash) {
    // Удар/взрыв по области вокруг цели
    deliver(target, dmg, () => {
      ctx.ring(target.pos, color, spec.splash * 1.6, 0.3);
      for (const f of ctx.foes(range + spec.splash)) {
        if (same(f, target) || d2(f.pos, target.pos) - f.radius > spec.splash) continue;
        hit(f, dmg * (spec.splashFrac ?? 0.5));
      }
    });
    return;
  }

  deliver(target, dmg);
}
