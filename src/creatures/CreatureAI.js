import { events } from '../core/Events.js';

// Поведение спутника. Состояния: idle (стоит), follow (идёт за героем),
// attack (бьёт врага), return (бежит к герою). Команды игрока: follow, stay, defend, attack.
const OWNER_FAR = 22;   // дальше этого расстояния существо возвращается
const FOLLOW_DIST = 2.8;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function moveToward(c, target, speed, dt, stop, world) {
  const dx = target.x - c.pos.x, dz = target.z - c.pos.z;
  const d = Math.hypot(dx, dz);
  c.facing = Math.atan2(dx, dz);
  if (d <= stop) return false;
  const step = Math.min(speed * dt, d - stop);
  const ox = c.pos.x, oz = c.pos.z;
  c.pos.x += (dx / d) * step;
  c.pos.z += (dz / d) * step;
  world.resolveCollisions(c.pos, 0.45, c.team);     // на арене свои ворота звери проходят, как и герой
  // Не выходим за землю (остров, платформы, мосты)
  const ground = world.groundAt(c.pos.x, c.pos.z);
  if (ground === null) { c.pos.x = ox; c.pos.z = oz; return false; }
  c.pos.y = ground;
  return Math.hypot(c.pos.x - ox, c.pos.z - oz) > step * 0.3;     // упёрся в стену — считаем, что не двигался
}

function pickTarget(c, ctx) {
  const { player, combat } = ctx;
  if (c.command === 'attack') {
    if (c.manualTarget && !c.manualTarget.dead) return c.manualTarget;
    c.manualTarget = null;
    const n = combat.nearestEnemy(player.pos, 14);
    if (n) return n;
    c.command = 'follow';
    return null;
  }
  if (c.command === 'stay') return combat.nearestEnemy(c.pos, 3);
  if (c.command === 'defend') return combat.nearestEnemy(player.pos, 4);
  return combat.nearestEnemy(player.pos, 8);
}

// Способность. force = true — игрок нажал кнопку (условия автоприменения не проверяются).
// Возвращает true, если способность сработала.
export function tryAbility(c, ctx, target, force = false) {
  const a = c.def.ability;
  if (c.cd > 0) return false;
  const { player, combat, ui } = ctx;
  const st = c.stats;

  if (a.id === 'fireball') {
    const t = target ?? (force ? combat.nearestEnemy(c.pos, a.range) : null);
    if (!t || dist(c.pos, t.pos) > a.range) return false;
    combat.fireball(c, t, a.power + st.atk * 0.5, a.color);
  } else if (a.id === 'shield') {
    if (!force && !combat.enemyNear(player.pos, 6)) return false;
    player.addShield(a.power + st.def * 3, a.duration);
    combat.ring(player.pos, 0x7ab8ff, 3, 0.5);
  } else if (a.id === 'heal') {
    if (!force && player.hp > player.maxHp * 0.7) return false;
    const healed = player.heal(a.power + st.atk * 2);
    combat.ring(player.pos, 0x5de08a, 3, 0.5);
    const p = player.pos.clone();
    p.y += 2;
    ui.floatText(p, `+${healed}`, '#6bff9a');
  } else {
    return false;
  }
  c.cd = a.cooldown;
  events.emit('ability');
  return true;
}

export function updateCreature(c, dt, ctx) {
  const { player, combat, world } = ctx;
  c.cd = Math.max(0, c.cd - dt);
  c.atkCd = Math.max(0, c.atkCd - dt);
  const st = c.stats;
  const dOwner = dist(c.pos, player.pos);
  let moving = false;

  // Герой далеко (например, возродился) — переносим существо к нему
  if (dOwner > 40) {
    c.pos.set(player.pos.x + 1.5, 0, player.pos.z + 1.5);
    c.state = 'follow';
  }
  if (dOwner > OWNER_FAR) c.state = 'return';

  if (c.state === 'return') {
    moving = moveToward(c, player.pos, st.speed * 2, dt, 3, world);
    if (dOwner < 4) c.state = 'follow';
    c.syncMesh(dt, moving);
    return;
  }

  const target = pickTarget(c, ctx);
  tryAbility(c, ctx, target, false);

  if (target) {
    c.state = 'attack';
    const range = c.def.basicRange;
    const d = dist(c.pos, target.pos);
    if (d > range * 0.8) moving = moveToward(c, target.pos, st.speed, dt, range * 0.8, world);
    else c.facing = Math.atan2(target.pos.x - c.pos.x, target.pos.z - c.pos.z);
    if (c.atkCd <= 0 && d <= range + 0.3) {
      c.atkCd = 1;
      combat.creatureHit(c, target, st.atk);
    }
  } else if (c.command === 'stay') {
    c.state = 'idle';
  } else {
    // Если зверей несколько, у каждого своё место рядом с героем (c.anchor)
    // Если место недостижимо (за стеной, в проходе у башни), через полсекунды идёт прямо к герою
    const spot = c.anchor && !(c.blockT > 0.5) ? c.anchor : player.pos;
    const stop = spot === player.pos ? (c.command === 'defend' ? 2 : FOLLOW_DIST) : 0.6;
    const speed = st.speed * (dOwner > 8 ? 1.6 : 1);
    const want = dist(c.pos, spot) > stop + 0.4;
    moving = want && moveToward(c, spot, speed, dt, stop, world);
    if (want && !moving) c.blockT = (c.blockT ?? 0) + dt;
    else if (c.blockT > 0 && (moving || !want)) c.blockT = Math.max(0, c.blockT - dt * 2);
    c.state = moving ? 'follow' : 'idle';
  }
  c.syncMesh(dt, moving);
}
