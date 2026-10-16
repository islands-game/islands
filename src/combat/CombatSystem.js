import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { ENEMIES, ENEMY_SPAWNS, NIGHT_MONSTER_COUNT } from '../config/enemies.js';
import { t } from '../config/i18n.js';
import { events } from '../core/Events.js';
import { mainStats } from '../config/heroes.js';
import { RAIDS } from '../config/raids.js';
import { DEFENSE } from '../config/buildings.js';
import { ELEMENT_FX } from '../config/creatures.js';

const RESPAWN_DELAY = 2;

const ringGeo = new THREE.RingGeometry(0.5, 0.65, 28).rotateX(-Math.PI / 2);
const ballGeo = new THREE.SphereGeometry(0.22, 8, 6);
const discGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
const boomGeo = new THREE.BoxGeometry(0.9, 0.08, 0.2);

// Единая боевая система: герой, существа и враги наносят урон через неё.
export class CombatSystem {
  constructor({ scene, world, player, ui, onKill }) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.ui = ui;
    this.onKill = onKill;
    this.enemies = [];
    this.effects = [];
    this.timers = [];
    this.structureList = () => [];     // постройки, которые можно атаковать (подключает Game)
    this.structureHit = () => {};
    this.heroCd = 0;
    this.deadTimer = 0;
    this.nightActive = false;
    this.spawnEnemies();
  }

  spawnEnemies() {
    for (const s of ENEMY_SPAWNS) {
      const home = this.world.findFree(s.x, s.z, 1.2);
      this.enemies.push(new Enemy(ENEMIES[s.type], home, this.scene));
    }
  }

  // Ночью несколько деревьев оживают и становятся монстрами. Возвращает, сколько ожило.
  awakenTrees() {
    if (this.nightActive) return 0;
    this.nightActive = true;
    const candidates = this.world.nodes.filter(n =>
      n.type === 'wood' && n.active && !n.locked &&
      Math.hypot(n.x - this.player.pos.x, n.z - this.player.pos.z) > 8);
    let count = 0;
    while (candidates.length && count < NIGHT_MONSTER_COUNT) {
      const node = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
      node.locked = true;
      node.obj.visible = false;
      node.collider.active = false;
      const enemy = new Enemy(ENEMIES.tree_monster, { x: node.x, z: node.z }, this.scene);
      enemy.node = node;
      this.enemies.push(enemy);
      count++;
    }
    return count;
  }

  // Утром монстры исчезают, деревья возвращаются на место
  calmTrees() {
    if (!this.nightActive) return;
    this.nightActive = false;
    for (const e of this.enemies.filter(x => x.node)) {
      const n = e.node;
      n.locked = false;
      n.obj.visible = n.active;
      n.collider.active = n.active;
      e.dispose(this.scene);
    }
    this.enemies = this.enemies.filter(e => !e.node);
  }

  // Участники рейда: временные слизни, которые сами ищут героя
  spawnRaider(defId, x, z) {
    const e = new Enemy(ENEMIES[defId], { x, z }, this.scene);
    e.temp = 'raid';
    e.hunter = true;
    this.enemies.push(e);
    return e;
  }

  // Ближайшая постройка, которую стоит атаковать рейдеру (в пределах structureRange)
  nearestStructure(pos, enemy) {
    let best = null, bestD = RAIDS.structureRange;
    const loaded = enemy?.loot ? Object.values(enemy.loot).reduce((s, n) => s + n, 0) >= DEFENSE.barn.lootCap : false;
    for (const rec of this.structureList()) {
      if (loaded && rec.maxDef !== undefined) continue;        // нагружен добычей: амбар больше не интересует
      const r = rec.rect;
      const nx = Math.max(r.x - r.hw, Math.min(r.x + r.hw, pos.x)), nz = Math.max(r.z - r.hd, Math.min(r.z + r.hd, pos.z));
      const d = Math.hypot(pos.x - nx, pos.z - nz);
      if (d < bestD) { bestD = d; best = rec; }
    }
    return best;
  }

  hitStructure(enemy, rec) {
    this.structureHit(enemy, rec);
  }

  raiders() {
    return this.enemies.filter(e => e.temp === 'raid');
  }

  clearRaiders() {
    for (const e of this.raiders()) e.dispose(this.scene);
    this.enemies = this.enemies.filter(e => e.temp !== 'raid');
  }

  reset() {
    this.clearRaiders();
    this.calmTrees();
    this.enemies.forEach(e => e.respawn());
    this.heroCd = 0;
    this.timers = [];
    this.deadTimer = 0;
  }

  nearestEnemy(pos, range) {
    let best = null, bestD = range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  enemyNear(pos, range) {
    return !!this.nearestEnemy(pos, range);
  }

  // --- Атаки ---

  // Урон одного удара героя: базовый урон уровня × класс. Перезарядка дольше — удар сильнее, урон в секунду тот же.
  heroHit(p) {
    const st = mainStats(p.heroId);
    return p.atk * st.dpsMul * (st.hitCooldown / 0.5);
  }

  // Горение: урон раз в секунду, всего total за time секунд
  applyBurn(enemy, total, time) {
    enemy.burnT = time;
    enemy.burnDps = total / time;
    enemy.burnAcc = 0;
  }

  // Отложенное действие (двойной удар, веер снарядов)
  later(sec, fn) {
    if (sec <= 0) return fn();
    this.timers.push({ t: sec, fn });
  }

  // Бумеранг: летит к точке и возвращается к герою (по живой позиции). from и back — Vector3.
  boomerang(from, toPos, color, onOut, onBack, backPos) {
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Group();
    const a = new THREE.Mesh(boomGeo, mat), b = new THREE.Mesh(boomGeo, mat);
    a.rotation.y = 0.6; b.rotation.y = -0.6;
    mesh.add(a, b);
    const start = new THREE.Vector3(from.x, 1.0, from.z);
    const mid = new THREE.Vector3(toPos.x, 1.0, toPos.z);
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.effects.push({
      mesh, mat, t: 0, dur: 0.45,
      tick: k => { mesh.position.lerpVectors(start, mid, k); mesh.rotation.y += 0.7; },
      onEnd: () => {
        onOut?.();
        const mat2 = new THREE.MeshBasicMaterial({ color });
        const m2 = new THREE.Group();
        const c = new THREE.Mesh(boomGeo, mat2), d = new THREE.Mesh(boomGeo, mat2);
        c.rotation.y = 0.6; d.rotation.y = -0.6;
        m2.add(c, d);
        m2.position.copy(mid);
        this.scene.add(m2);
        this.effects.push({
          mesh: m2, mat: mat2, t: 0, dur: 0.45,
          tick: k => { const to = backPos ?? from; m2.position.lerpVectors(mid, new THREE.Vector3(to.x, 1.0, to.z), k); m2.rotation.y += 0.7; },
          onEnd: onBack,
        });
      },
    });
  }

  // Замедление врага
  applySlow(enemy, mul, time) {
    enemy.slowT = time;
    enemy.slowMul = 1 - mul;
  }

  // Удар существа. Если у существа дальняя атака — летит снаряд.
  creatureHit(creature, enemy, damage) {
    const dmg = Math.round(damage);
    const hit = () => { this.damageEnemy(enemy, dmg, '#ffd27a'); this.creatureElement(creature, enemy, dmg); };
    if (creature.def.basicRange > 3) this.projectile(creature.pos, enemy, creature.def.color, hit);
    else hit();
  }

  // Стихия зверя: огонь поджигает, лёд замедляет, вода лечит героя
  creatureElement(creature, enemy, dmg) {
    const fx = ELEMENT_FX[creature.def.element];
    if (!fx || enemy.dead) return;
    if (fx.burn) this.applyBurn(enemy, dmg * fx.burn, 3);
    if (fx.slow) this.applySlow(enemy, fx.slow, 1.5);
    if (fx.drain) {
      const got = this.player.heal(dmg * fx.drain);
      if (got > 0) this.ui.floatText(this.player.pos.clone().setY(2.2), `+${got}`, '#6bff9a');
    }
  }

  // Дыхание дракона: шар огня и взрыв по области вокруг цели
  breath(creature, enemy, damage, aoe, color = 0xff5a1a) {
    const dmg = Math.round(damage);
    this.projectile(creature.pos, enemy, color, () => {
      this.ring(enemy.pos, color, aoe * 1.6, 0.4);
      for (const e of this.enemies) {
        if (e.dead || Math.hypot(e.pos.x - enemy.pos.x, e.pos.z - enemy.pos.z) > aoe) continue;
        this.damageEnemy(e, dmg, '#ff8a3d');
        this.creatureElement(creature, e, dmg);
      }
    }, 0.35, 0.5);
  }

  fireball(creature, enemy, damage, color = 0xff5a1a) {
    const dmg = Math.round(damage);
    this.projectile(creature.pos, enemy, color, () => {
      this.ring(enemy.pos, color, 2.5, 0.35);
      this.damageEnemy(enemy, dmg, '#ff8a3d');
    }, 0.35, 0.45);
  }

  damageEnemy(enemy, amount, color) {
    if (enemy.dead) return;
    const pos = enemy.pos.clone();
    pos.y += 1.6;
    this.ui.floatText(pos, `-${amount}`, color);
    const killed = enemy.takeDamage(amount);
    events.emit(killed ? 'kill' : 'hit', enemy);
    if (killed) {
      this.ring(enemy.pos, 0x8bd450, 2.5, 0.4);
      this.onKill(enemy);
    }
  }

  damagePlayer(raw) {
    const p = this.player;
    if (p.dead || p.inside) return; // в доме безопасно
    const { dealt } = p.takeDamage(raw);
    const pos = p.pos.clone();
    pos.y += 2;
    this.ui.floatText(pos, dealt > 0 ? `-${dealt}` : '🛡', dealt > 0 ? '#ff6b6b' : '#7ab8ff');
    if (dealt > 0) { this.ui.flashHurt(); events.emit('hurt'); }
    if (p.hp <= 0) {
      p.die();
      this.deadTimer = RESPAWN_DELAY;
      this.ui.toast(t('died'));
    }
  }

  // --- Удар босса по области ---

  // Красное кольцо на земле растёт за dur секунд, потом вызывается onLand
  telegraph(pos, radius, dur, onLand) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(discGeo, mat);
    disc.position.set(pos.x, 0.12, pos.z);
    disc.scale.setScalar(radius * 0.15);
    this.scene.add(disc);
    this.effects.push({
      mesh: disc, mat, t: 0, dur, onEnd: onLand,
      tick: k => { disc.scale.setScalar(radius * (0.15 + 0.85 * k)); mat.opacity = 0.3 + 0.35 * k; },
    });
    events.emit('slamWarn');
  }

  // Удар: урон герою, если он внутри круга
  slamImpact(center, radius, damage) {
    this.ring(center, 0xff6a2a, radius * 1.6, 0.5);
    events.emit('slam');
    const p = this.player;
    if (!p.dead && Math.hypot(p.pos.x - center.x, p.pos.z - center.z) < radius) this.damagePlayer(damage);
  }

  // Ближайший живой босс рядом (для полоски здоровья на экране)
  nearestBoss(pos, range) {
    let best = null, bestD = range;
    for (const e of this.enemies) {
      if (e.dead || !e.def.boss) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // --- Визуальные эффекты ---

  ring(pos, color, size = 2, dur = 0.4) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.position.set(pos.x, 0.15 + (pos.y > 0.5 ? pos.y : 0), pos.z);
    this.scene.add(mesh);
    this.effects.push({ mesh, mat, t: 0, dur, tick: k => { mesh.scale.setScalar(1 + k * size); mat.opacity = 0.9 * (1 - k); } });
  }

  projectile(from, enemy, color, onHit, dur = 0.3, scale = 1) {
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(ballGeo, mat);
    mesh.scale.setScalar(scale * 1.6);
    const start = new THREE.Vector3(from.x, 0.9, from.z);
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.effects.push({
      mesh, mat, t: 0, dur, onEnd: onHit,
      tick: k => { mesh.position.lerpVectors(start, new THREE.Vector3(enemy.pos.x, 0.9, enemy.pos.z), k); },
    });
  }

  update(dt, camera) {
    this.heroCd = Math.max(0, this.heroCd - dt);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }

    const ctx = { player: this.player, world: this.world, combat: this };
    for (const e of this.enemies) {
      e.update(dt, ctx);
      if (!e.dead) e.bar.face(camera);
      if (e.slowT > 0) e.slowT -= dt;
      if (e.burnT > 0 && !e.dead) {
        e.burnT -= dt;
        e.burnAcc += dt;
        if (e.burnAcc >= 1) {
          e.burnAcc -= 1;
          this.damageEnemy(e, Math.max(1, Math.round(e.burnDps)), '#ff8a3d');
        }
      }
    }

    if (this.player.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.player.reviveAtSpawn();
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.t += dt;
      const k = Math.min(1, fx.t / fx.dur);
      fx.tick(k);
      if (k >= 1) {
        this.scene.remove(fx.mesh);
        fx.mat.dispose();
        this.effects.splice(i, 1);
        fx.onEnd?.();
      }
    }
  }
}
