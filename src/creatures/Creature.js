import * as THREE from 'three';
import { CREATURES } from '../config/creatures.js';
import { buildCreatureModel } from './CreatureModels.js';
import { MAX_LEVEL } from '../progression/Progression.js';

const ringGeo = new THREE.RingGeometry(0.9, 1.1, 24).rotateX(-Math.PI / 2);

// Одно существо: дикое (wild) или приручённое спутник героя.
export class Creature {
  constructor(id, scene, { level = 1, xp = 0, wild = false } = {}) {
    this.id = id;
    this.def = CREATURES[id];
    this.level = level;
    this.xp = xp;
    this.wild = wild;
    this.pos = new THREE.Vector3();
    this.facing = 0;
    this.t = Math.random() * 10;
    this.command = 'follow';
    this.state = 'idle'; // idle | follow | attack | return
    this.cd = 0;         // перезарядка способности
    this.atkCd = 0;
    this.manualTarget = null;

    this.scene = scene;
    this.mesh = new THREE.Group();
    this.model = buildCreatureModel(this.def.model, this.def.color);
    this.mesh.add(this.model);
    if (wild) {
      // Кольцо на земле — чтобы дикое существо было заметно
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.7 });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.y = 0.05;
      this.mesh.add(ring);
    }
    scene.add(this.mesh);
  }

  get stats() {
    const s = this.def.stats, g = this.def.growth, l = this.level - 1;
    return { hp: s.hp + g.hp * l, atk: s.atk + g.atk * l, def: s.def + g.def * l, speed: s.speed };
  }

  get xpNeeded() {
    return 30 + this.level * 20;
  }

  // Доля восстановления способности: 1 — готова
  get abilityReady() {
    return 1 - this.cd / this.def.ability.cooldown;
  }

  // Возвращает true, если получен новый уровень
  addXp(n) {
    if (this.level >= MAX_LEVEL) return false;
    this.xp += n;
    let up = false;
    while (this.level < MAX_LEVEL && this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      up = true;
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
    return up;
  }

  // Рисует положение, лёгкое покачивание и поворот
  syncMesh(dt, moving) {
    this.t += dt;
    const floaty = this.def.model === 'spirit';
    const bob = floaty ? 0.2 + Math.sin(this.t * 2.5) * 0.12
      : (moving ? Math.abs(Math.sin(this.t * 10)) * 0.12 : 0);
    this.mesh.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.mesh.rotation.y = this.facing;
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}
