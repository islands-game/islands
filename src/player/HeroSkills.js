import * as THREE from 'three';
import { HEROES, SKILLS } from '../config/heroes.js';
import { castSkill } from '../combat/Skills.js';
import { performHeroAttack } from '../combat/Attacks.js';
import { mainStats } from '../config/heroes.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

// Три умения героя на островах (клавиши 2, 3, 4 и кнопки). Откаты хранятся здесь, логика — в combat/Skills.js.
export class HeroSkills {
  constructor(game) {
    this.game = game;
    this.cd = [0, 0, 0];
  }

  get ids() {
    return HEROES[this.game.player.heroId].skills;
  }

  reset() {
    this.cd = [0, 0, 0];
  }

  update(dt) {
    for (let i = 0; i < 3; i++) this.cd[i] = Math.max(0, this.cd[i] - dt);
  }

  cast(i) {
    const g = this.game, p = g.player;
    const id = this.ids[i];
    if (!id || p.dead || p.inside) return;
    if (this.cd[i] > 0) return g.ui.toast(t('notReady'));
    if (!castSkill(this.context(), id)) return g.ui.toast(t('noTarget'));
    this.cd[i] = SKILLS[id].cooldown;
    events.emit('slam');
  }

  // Автоатака героя: у каждого оружия своя механика (combat/Attacks.js)
  attack() {
    const g = this.game, p = g.player, combat = g.combat;
    if (p.dead || combat.heroCd > 0) return;
    const st = mainStats(p.heroId);
    combat.heroCd = st.cooldown;
    events.emit('swing');
    const ctx = this.context();
    const target = ctx.foes(st.range)[0];
    if (st.range < 4) {
      const front = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing)).multiplyScalar(1.2).add(p.pos);
      combat.ring(front, 0xffffff, 1.2, 0.2);
    }
    if (!target) return;
    p.facing = Math.atan2(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
    const dmg = Math.round(combat.heroHit(p) * (0.9 + Math.random() * 0.2));
    performHeroAttack(ctx, p.heroId, target, dmg);
  }

  // Подключение к миру островов
  context() {
    const g = this.game, p = g.player, combat = g.combat;
    const input = g.input;
    const color = p.elementColor;
    const foeAdapter = e => ({
      pos: e.pos, radius: 0.6 * (e.scale ?? 1),
      get hpRatio() { return e.hp / e.maxHp; },
      hit: d => combat.damageEnemy(e, d, '#ffffff'),
      slow: (m, s) => combat.applySlow(e, m, s),
      burn: (total, s) => combat.applyBurn(e, total, s),
    });
    const playerAlly = {
      pos: p.pos, get maxHp() { return p.maxHp; },
      heal: n => {
        const got = p.heal(n);
        if (got > 0) g.ui.floatText(p.pos.clone().setY(2.2), `+${got}`, '#6bff9a');
      },
      shield: (n, s) => p.addShield(n, s),
    };
    return {
      caster: { pos: p.pos, facing: p.facing, hit: combat.heroHit(p), color },
      foes: r => combat.enemies
        .filter(e => !e.dead && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) <= r)
        .sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z))
        .map(foeAdapter),
      allies: () => [playerAlly],
      slide: (dx, dz, dist) => p.slide(dx, dz, dist),
      // Направление: куда ведёт джойстик/клавиши (относительно камеры), иначе — куда смотрит герой
      dir: () => {
        const mx = input.move.x, my = input.move.y;
        if (Math.hypot(mx, my) > 0.1) {
          const yaw = g.cameraCtl.yaw, sin = Math.sin(yaw), cos = Math.cos(yaw);
          return { x: mx * cos + my * sin, z: -mx * sin + my * cos };
        }
        return { x: Math.sin(p.facing), z: Math.cos(p.facing) };
      },
      lifesteal: n => playerAlly.heal(n),
      later: (s, fn) => combat.later(s, fn),
      boomerang: (from, toPos, c, onOut, onBack, back) => combat.boomerang(from, toPos, c, onOut, onBack, back),
      haste: (mul, s) => { p.hasteMul = mul; p.hasteT = s; },
      face: a => { p.facing = a; },
      ring: (pos, c, size, dur) => combat.ring(pos, c, size, dur),
      shot: (from, toPos, c, onHit, dur = 0.25) => combat.projectile(from, { pos: toPos }, c, onHit, dur),
    };
  }
}
