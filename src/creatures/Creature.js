import * as THREE from 'three';
import { CREATURES, ELEMENT_FX, stageForLevel, creatureNameKey, beastTitle } from '../config/creatures.js';
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
    this.model = null;
    this.justEvolved = false;
    this.applyStage();
    if (wild) {
      // Кольцо на земле — чтобы дикое существо было заметно
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.7 });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.y = 0.05;
      this.mesh.add(ring);
    }
    scene.add(this.mesh);
  }

  // Стадия развития: 1 — начальная, дальше по списку evolutions
  get stage() {
    return stageForLevel(this.def, this.level);
  }

  get nameKey() {
    return creatureNameKey(this.def, this.level);
  }

  // Полное имя: «Огненный Медведь» (стихия + вид с учётом стадии развития)
  get displayName() {
    return beastTitle(this.def, this.level);
  }

  get fx() {
    return ELEMENT_FX[this.def.element] ?? {};
  }

  // Через сколько секунд способность готова снова (воздух восстанавливает быстрее)
  get abilityCd() {
    return this.def.ability.cooldown * (this.fx.cdMul ?? 1);
  }

  get stats() {
    // На арене у всех спутников одинаковые характеристики (как у существа 5 уровня без эволюции)
    const s = this.def.stats, g = this.def.growth, l = (this.normalized ? 5 : this.level) - 1;
    const evo = this.normalized ? null : this.def.evolutions[this.stage - 2]; // текущая эволюция (если есть)
    const m = evo ? evo.statMult : 1;
    const k = this.normalized ? (this.arenaMul ?? 1) : 1;     // на арене сила зверей зависит от класса героя
    const fx = this.fx;
    return { hp: (s.hp + g.hp * l) * m * k, atk: (s.atk + g.atk * l) * m * k, def: (s.def + g.def * l) * m * (fx.defMul ?? 1), speed: s.speed * (fx.speedMul ?? 1) };
  }

  // Рисует модель под текущую стадию: после эволюции существо крупнее и меняет цвет
  applyStage() {
    if (this.model) {
      this.mesh.remove(this.model);
      this.model.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    const evo = this.def.evolutions[this.stage - 2];
    this.model = buildCreatureModel(this.def.model, evo ? evo.color : this.def.color);
    this.model.scale.setScalar(evo ? evo.scale : 1);
    this.mesh.add(this.model);
  }

  get xpNeeded() {
    return 30 + this.level * 20;
  }

  // Доля восстановления способности: 1 — готова
  get abilityReady() {
    return 1 - this.cd / this.abilityCd;
  }

  // Возвращает true, если получен новый уровень
  addXp(n) {
    if (this.level >= MAX_LEVEL) return false;
    const stageBefore = this.stage;
    this.xp += n;
    let up = false;
    while (this.level < MAX_LEVEL && this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      up = true;
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
    if (this.stage > stageBefore) {
      this.justEvolved = true;
      this.applyStage();
    }
    return up;
  }

  // Рисует положение, лёгкое покачивание и поворот
  syncMesh(dt, moving) {
    this.t += dt;
    const floaty = this.def.model === 'owl' || this.def.model === 'dragon';
    const bob = floaty ? 0.2 + Math.sin(this.t * 2.5) * 0.12
      : (moving ? Math.abs(Math.sin(this.t * 10)) * 0.12 : 0);
    this.mesh.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.mesh.rotation.y = this.facing;
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}
