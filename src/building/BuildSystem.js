import * as THREE from 'three';
import { BUILDINGS, MAX_BUILDINGS, REFUND_RATIO } from '../config/buildings.js';
import { buildModel, disposeModel } from './BuildingModels.js';
import { rectOf, rectsOverlap, circleRectOverlap, samplePoints } from './geometry.js';
import { t } from '../config/i18n.js';

const DEMOLISH = 'demolish';
const MAX_COORD = 40;
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.5, depthWrite: false });

// Строительство: выбор постройки, "призрак" перед героем, проверка места, размещение, снос.
// Постройка хранится как { id, x, z, rot } — именно это попадает в сохранение.
export class BuildSystem {
  constructor({ scene, world, player, inventory, creatures, combat, ui, onPlaced }) {
    Object.assign(this, { scene, world, player, inventory, creatures, combat, ui, onPlaced });
    this.placed = [];   // { id, x, z, rot, mesh, rect }
    this.mode = null;   // id постройки, DEMOLISH или null
    this.rot = 0;
    this.ghost = null;
    this.valid = false;
    this.x = 0;
    this.z = 0;
    this.demolishTarget = null;
  }

  get active() {
    return this.mode !== null;
  }

  // --- Режим строительства ---

  select(mode) {
    this.cancel();
    this.mode = mode;
    this.rot = 0;
    if (mode !== DEMOLISH) {
      this.ghost = buildModel(BUILDINGS[mode]);
      this.ghost.traverse(o => { if (o.isMesh) { o.material.dispose(); o.material = ghostMat; } });
      this.scene.add(this.ghost);
    }
  }

  cancel() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse(o => o.geometry?.dispose());
      this.ghost = null;
    }
    this.mode = null;
    this.demolishTarget = null;
  }

  rotate() {
    if (this.mode && this.mode !== DEMOLISH) this.rot = (this.rot + 1) % 4;
  }

  // --- Проверка места ---

  rectFor(def, x, z, rot) {
    return rectOf(x, z, def.size.w, def.size.d, rot);
  }

  canPlace(def, x, z, rot) {
    if (this.placed.length >= MAX_BUILDINGS) return false;
    if (Math.abs(x) > MAX_COORD || Math.abs(z) > MAX_COORD) return false;
    const rect = this.rectFor(def, x, z, rot);
    const pts = samplePoints(rect);
    const onGround = pts.map(p => this.world.groundAt(p.x, p.z) !== null);
    if (def.walkable) {
      // Платформа или мост должны касаться земли, но могут выходить за край острова
      if (!onGround.some(Boolean)) return false;
    } else if (!onGround.every(Boolean)) {
      return false;
    }
    for (const c of this.world.colliders) {
      if (c.active && circleRectOverlap(c.x, c.z, c.r, rect)) return false;
    }
    for (const p of this.placed) {
      if (rectsOverlap(rect, p.rect)) return false;
    }
    // Не строим на герое, спутнике и врагах
    if (circleRectOverlap(this.player.pos.x, this.player.pos.z, 0.6, rect) && def.solid) return false;
    const pet = this.creatures.active;
    if (pet && circleRectOverlap(pet.pos.x, pet.pos.z, 0.6, rect) && def.solid) return false;
    for (const e of this.combat.enemies) {
      if (!e.dead && circleRectOverlap(e.pos.x, e.pos.z, 0.8, rect)) return false;
    }
    return true;
  }

  // --- Каждый кадр ---

  update() {
    if (!this.active) return;
    const p = this.player;
    const forward = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));

    if (this.mode === DEMOLISH) {
      const fx = p.pos.x + forward.x * 2.5, fz = p.pos.z + forward.z * 2.5;
      this.demolishTarget = this.nearestPlaced(fx, fz, 3.5);
      this.valid = !!this.demolishTarget;
      return;
    }

    const def = BUILDINGS[this.mode];
    const r = this.rectFor(def, 0, 0, this.rot);
    const dist = 2.5 + Math.max(r.hw, r.hd);
    this.x = Math.round(p.pos.x + forward.x * dist);
    this.z = Math.round(p.pos.z + forward.z * dist);
    this.valid = this.canPlace(def, this.x, this.z, this.rot);
    this.ghost.position.set(this.x, 0, this.z);
    this.ghost.rotation.y = (this.rot * Math.PI) / 2;
    ghostMat.color.set(this.valid ? 0x44ff88 : 0xff5555);
  }

  nearestPlaced(x, z, range) {
    let best = null, bestD = range;
    for (const b of this.placed) {
      // расстояние до прямоугольника, а не до центра
      const nx = Math.max(b.rect.x - b.rect.hw, Math.min(b.rect.x + b.rect.hw, x));
      const nz = Math.max(b.rect.z - b.rect.hd, Math.min(b.rect.z + b.rect.hd, z));
      const d = Math.hypot(x - nx, z - nz);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  // Текст для панели подсказки: что выбрано и сколько стоит
  infoText() {
    if (this.mode === DEMOLISH) return t('demolish');
    return t('building.' + this.mode);
  }

  // --- Действия ---

  confirm() {
    if (!this.active) return;
    if (this.mode === DEMOLISH) return this.demolish();
    const def = BUILDINGS[this.mode];
    if (this.placed.length >= MAX_BUILDINGS) return this.ui.toast(t('limitReached'));
    if (!this.valid) return this.ui.toast(t('cantBuildHere'));
    if (!this.inventory.spend(def.cost)) return this.ui.toast(t('needResources'));
    this.add({ id: def.id, x: this.x, z: this.z, rot: this.rot });
    this.combat.ring({ x: this.x, y: 0, z: this.z }, 0xffe066, 3, 0.5);
    this.ui.toast(t('built'));
    this.onPlaced?.(def);
  }

  demolish() {
    const b = this.demolishTarget;
    if (!b) return this.ui.toast(t('nothingToDemolish'));
    const def = BUILDINGS[b.id];
    for (const [k, v] of Object.entries(def.cost)) this.inventory.add(k, Math.floor(v * REFUND_RATIO));
    this.remove(b);
    this.ui.toast(t('demolished'));
  }

  // --- Список построек ---

  add({ id, x, z, rot }) {
    const def = BUILDINGS[id];
    const mesh = buildModel(def);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = (rot * Math.PI) / 2;
    this.scene.add(mesh);
    const rect = this.rectFor(def, x, z, rot);
    const rec = { id, x, z, rot, mesh, rect, walk: null, solid: null };
    if (def.solid) { rec.solid = { ...rect }; this.world.rects.push(rec.solid); }
    if (def.walkable) { rec.walk = { ...rect }; this.world.walkables.push(rec.walk); }
    this.placed.push(rec);
    return rec;
  }

  remove(rec) {
    this.scene.remove(rec.mesh);
    disposeModel(rec.mesh);
    if (rec.solid) this.world.rects.splice(this.world.rects.indexOf(rec.solid), 1);
    if (rec.walk) this.world.walkables.splice(this.world.walkables.indexOf(rec.walk), 1);
    this.placed.splice(this.placed.indexOf(rec), 1);
    // Если герой стоял на снесённом мосту — update игрока сам вернёт его, когда он упадёт
  }

  reset() {
    this.cancel();
    [...this.placed].forEach(b => this.remove(b));
  }

  toSave() {
    return this.placed.map(b => ({ id: b.id, x: b.x, z: b.z, rot: b.rot }));
  }

  fromSave(list) {
    this.reset();
    for (const b of list ?? []) {
      if (Object.hasOwn(BUILDINGS, b.id) && this.placed.length < MAX_BUILDINGS) this.add(b);
    }
  }
}

export { DEMOLISH };
