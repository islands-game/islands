import * as THREE from 'three';
import { VESSELS, BOARD_RANGE, DOCK_RANGE } from '../config/vessels.js';
import { WATER_Y } from './World.js';
import { t } from '../config/i18n.js';

const lam = (c, e = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...e });
const M = { wood: lam(0x9b6b3a), dark: lam(0x6b4a28), sail: lam(0xf4efe0, { side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthWrite: false }), red: lam(0xd9534f, { side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthWrite: false }), barrel: lam(0x7a5230) };
const G = {
  plank: new THREE.BoxGeometry(2.4, 0.18, 3.2),
  barrel: new THREE.CylinderGeometry(0.3, 0.3, 0.45, 8),
  hull: new THREE.BoxGeometry(1.7, 0.55, 3.2),
  bow: new THREE.ConeGeometry(0.85, 1.4, 4),
  mast: new THREE.CylinderGeometry(0.06, 0.08, 3, 6),
  sail: new THREE.PlaneGeometry(1.5, 1.9),
  bigHull: new THREE.BoxGeometry(2.6, 0.9, 5),
  bigBow: new THREE.ConeGeometry(1.3, 2, 4),
  bigMast: new THREE.CylinderGeometry(0.09, 0.11, 5, 6),
  bigSail: new THREE.PlaneGeometry(2.3, 3),
};

// Модели из простых фигур: плот (доски и бочки), лодка (корпус и парус), корабль (два паруса)
function buildMesh(lvl) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); g.add(m); return m; };
  if (lvl <= 1) {
    add(G.plank, M.wood, 0, 0.1, 0);
    for (const [x, z] of [[-1, -1.3], [1, -1.3], [-1, 1.3], [1, 1.3]]) add(G.barrel, M.barrel, x, 0.3, z);
  } else if (lvl === 2) {
    add(G.hull, M.wood, 0, 0.3, 0);
    add(G.bow, M.wood, 0, 0.3, 2.1, Math.PI / 2, Math.PI / 4).scale.set(1, 1, 0.65);
    add(G.mast, M.dark, 0, 2, 0);
    add(G.sail, M.sail, 0, 2.3, 0.05);
  } else {
    add(G.bigHull, M.wood, 0, 0.5, 0);
    add(G.bigBow, M.wood, 0, 0.5, 3.3, Math.PI / 2, Math.PI / 4).scale.set(1, 1, 0.65);
    add(G.bigMast, M.dark, 0, 3, 1.1);
    add(G.bigMast, M.dark, 0, 3, -1.2);
    add(G.bigSail, M.sail, 0, 3.4, 1.15);
    add(G.bigSail, M.red, 0, 3.4, -1.15);
  }
  return g;
}

// Транспорт у пирса: плот (1 уровень пирса), лодка (2), корабль (3). Улучшается инструментом «Улучшить» на пирсе.
// Стоит у конца пирса; герой садится («Действие»), плывёт джойстиком по воде и причаливает к берегу или пирсу.
export class Vessels {
  constructor(game) {
    this.game = game;
    this.list = [];            // { rec, lvl, mesh, x, z, rot, boarded }
    this.t = 0;
  }

  get boarded() {
    return this.list.find(v => v.boarded) ?? null;
  }

  // Место стоянки: за дальним концом пирса, в воде
  mooring(rec) {
    const g = this.game;
    const end = g.gnomes.pierEnd(rec);
    const len = Math.hypot(end.x, end.z) || 1;
    const dx = end.x / len, dz = end.z / len;
    for (let d = 2.2; d < 8; d += 0.6) {
      const x = end.x + dx * d, z = end.z + dz * d;
      if (g.world.groundAt(x, z) === null) return { x, z, rot: Math.atan2(dx, dz) };
    }
    return { x: end.x + dx * 4, z: end.z + dz * 4, rot: Math.atan2(dx, dz) };
  }

  // Каждый кадр: у каждого пирса есть своё судно; после улучшения пирса меняется модель
  sync() {
    const g = this.game, piers = g.build.placed.filter(r => r.id === 'pier');
    for (const v of [...this.list]) {
      if (!piers.includes(v.rec)) { if (v.boarded) this.dock(true); this.dispose(v); this.list.splice(this.list.indexOf(v), 1); }
    }
    for (const rec of piers) {
      let v = this.list.find(x => x.rec === rec);
      const lvl = rec.lvl ?? 1;
      if (!v) {
        const m = Number.isFinite(rec.vx) && Number.isFinite(rec.vz) ? { x: rec.vx, z: rec.vz, rot: rec.vr ?? 0 } : this.mooring(rec);
        v = { rec, lvl: 0, mesh: null, x: m.x, z: m.z, rot: m.rot, boarded: false };
        this.list.push(v);
      }
      if (v.lvl !== lvl) {
        const first = v.lvl === 0;
        this.dispose(v);
        v.lvl = lvl;
        v.mesh = buildMesh(lvl);
        g.world.scene.add(v.mesh);
        if (!first) g.ui.toast(`${t('vessel.ready')}: ${t('vessel.' + VESSELS[lvl - 1].id)}`);
      }
    }
  }

  dispose(v) {
    if (v.mesh) v.mesh.parent?.remove(v.mesh);
    v.mesh = null;
  }

  spec(v) {
    return VESSELS[Math.min(VESSELS.length, v.lvl) - 1];
  }

  nearest(pos) {
    let best = null, bd = BOARD_RANGE;
    for (const v of this.list) {
      if (v.boarded) continue;
      const d = Math.hypot(pos.x - v.x, pos.z - v.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  board(v) {
    const p = this.game.player;
    v.boarded = true;
    p.vessel = { v, speed: this.spec(v).speed };
    p.pos.set(v.x, WATER_Y + 0.3, v.z);
    p.facing = v.rot;
    p.vy = 0;
    this.game.fishing?.cancel();
  }

  // Точка на суше рядом с судном (берег, пляж, пирс) или null
  landPoint(v) {
    const w = this.game.world;
    for (const r of [2.4, 3.0, DOCK_RANGE]) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
        if (w.groundAt(x, z) !== null) return { x, z };
      }
    }
    return null;
  }

  canDock() {
    const v = this.boarded;
    return !!v && !!this.landPoint(v);
  }

  // Причалить: герой сходит на берег, судно остаётся на воде (force — сойти любой ценой, если судно исчезло)
  dock(force = false) {
    const g = this.game, v = this.boarded, p = g.player;
    if (!v) return false;
    const pt = this.landPoint(v);
    if (!pt && !force) return false;
    v.boarded = false;
    v.x = p.pos.x; v.z = p.pos.z; v.rot = p.facing;
    p.vessel = null;
    const land = pt ?? g.world.shorePoint(p.pos.x, p.pos.z);
    p.pos.set(land.x, 0, land.z);
    p.vy = 0;
    return true;
  }

  // Герой погиб или началась новая игра: суда возвращаются к пирсам
  returnAll() {
    this.game.player.vessel = null;
    for (const v of this.list) {
      v.boarded = false;
      const m = this.mooring(v.rec);
      v.x = m.x; v.z = m.z; v.rot = m.rot;
    }
  }

  // Перед сохранением: положение судна записывается в запись пирса
  writeBack() {
    for (const v of this.list) { v.rec.vx = +v.x.toFixed(1); v.rec.vz = +v.z.toFixed(1); v.rec.vr = +v.rot.toFixed(2); }
  }

  update(dt) {
    this.t += dt;
    this.sync();
    const p = this.game.player;
    for (const v of this.list) {
      if (!v.mesh) continue;
      if (v.boarded) { v.x = p.pos.x; v.z = p.pos.z; v.rot = p.facing; }
      v.mesh.position.set(v.x, WATER_Y + 0.12 + Math.sin(this.t * 1.6 + v.x) * 0.06, v.z);
      v.mesh.rotation.y = v.rot;
      v.mesh.rotation.z = Math.sin(this.t * 1.3 + v.z) * 0.03;
    }
  }
}
