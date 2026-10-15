import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { ENEMIES, ENEMY_SPAWNS } from '../config/enemies.js';
import { t } from '../config/i18n.js';

const HERO_RANGE = 2.8;
const HERO_COOLDOWN = 0.5;
const RESPAWN_DELAY = 2;

const ringGeo = new THREE.RingGeometry(0.5, 0.65, 28).rotateX(-Math.PI / 2);
const ballGeo = new THREE.SphereGeometry(0.22, 8, 6);

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
    this.heroCd = 0;
    this.deadTimer = 0;
    this.spawnEnemies();
  }

  spawnEnemies() {
    for (const s of ENEMY_SPAWNS) {
      const home = this.world.findFree(s.x, s.z, 1.2);
      this.enemies.push(new Enemy(ENEMIES[s.type], home, this.scene));
    }
  }

  reset() {
    this.enemies.forEach(e => e.respawn());
    this.heroCd = 0;
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

  heroAttack() {
    const p = this.player;
    if (p.dead || this.heroCd > 0) return;
    this.heroCd = HERO_COOLDOWN;
    const target = this.nearestEnemy(p.pos, HERO_RANGE);
    const front = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing)).multiplyScalar(1.2).add(p.pos);
    this.ring(front, 0xffffff, 1.2, 0.2);
    if (!target) return;
    p.facing = Math.atan2(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
    this.damageEnemy(target, Math.round(p.atk * (0.9 + Math.random() * 0.2)), '#ffffff');
  }

  // Удар существа. Если у существа дальняя атака — летит снаряд.
  creatureHit(creature, enemy, damage) {
    const dmg = Math.round(damage);
    if (creature.def.basicRange > 3) {
      this.projectile(creature.pos, enemy, creature.def.color, () => this.damageEnemy(enemy, dmg, '#ffd27a'));
    } else {
      this.damageEnemy(enemy, dmg, '#ffd27a');
    }
  }

  fireball(creature, enemy, damage) {
    const dmg = Math.round(damage);
    this.projectile(creature.pos, enemy, 0xff5a1a, () => {
      this.ring(enemy.pos, 0xff5a1a, 2.5, 0.35);
      this.damageEnemy(enemy, dmg, '#ff8a3d');
    }, 0.35, 0.45);
  }

  damageEnemy(enemy, amount, color) {
    if (enemy.dead) return;
    const pos = enemy.pos.clone();
    pos.y += 1.6;
    this.ui.floatText(pos, `-${amount}`, color);
    if (enemy.takeDamage(amount)) {
      this.ring(enemy.pos, 0x8bd450, 2.5, 0.4);
      this.onKill(enemy);
    }
  }

  damagePlayer(raw) {
    const p = this.player;
    if (p.dead) return;
    const { dealt } = p.takeDamage(raw);
    const pos = p.pos.clone();
    pos.y += 2;
    this.ui.floatText(pos, dealt > 0 ? `-${dealt}` : '🛡', dealt > 0 ? '#ff6b6b' : '#7ab8ff');
    if (dealt > 0) this.ui.flashHurt();
    if (p.hp <= 0) {
      p.die();
      this.deadTimer = RESPAWN_DELAY;
      this.ui.toast(t('died'));
    }
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

    const ctx = { player: this.player, world: this.world, combat: this };
    for (const e of this.enemies) {
      e.update(dt, ctx);
      if (!e.dead) e.bar.face(camera);
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
