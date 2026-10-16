import * as THREE from 'three';
import { REALMS } from '../config/realms.js';
import { Settings } from '../save/Settings.js';
import { t } from '../config/i18n.js';

const arrowGeo = new THREE.ConeGeometry(0.28, 0.9, 4).rotateX(Math.PI / 2);        // острие вдоль +z
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false });
const beamGeo = new THREE.CylinderGeometry(0.22, 0.22, 20, 8, 1, true);
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
const ringGeo = new THREE.RingGeometry(0.9, 1.25, 24).rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.6, depthWrite: false });

// Стрелка-подсказка к цели текущего задания: конус у ног героя поворачивается к цели, на цели столб света.
// Цель на другом острове: стрелка ведёт к нужному порталу (на берегу), потом к цели на острове.
export class Guide {
  constructor(game) {
    this.game = game;
    this.arrow = new THREE.Mesh(arrowGeo, arrowMat);
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.arrow.renderOrder = 5;
    this.arrow.visible = this.beam.visible = this.ring.visible = false;
    game.world.scene.add(this.arrow, this.beam, this.ring);
    this.target = null;
    this.distance = 0;
    this.time = 0;
  }

  get enabled() {
    return Settings.get().guide;
  }

  // Портал, который ведёт на остров island (или домой): ищем среди порталов того острова, где стоит герой
  portalToward(island, here) {
    const w = this.game.world;
    const find = fn => w.portals.find(p => w.islandIdAt(p.x, p.z) === here && fn(p));
    const p = here === 'home' ? find(q => q.nameKey === 'island.' + island) : find(q => q.nameKey === 'island.home');
    return p ? { x: p.x, z: p.z } : null;
  }

  // Куда сейчас показывать для задания q: { x, z } или null
  resolve(q) {
    const g = this.game, guide = q?.guide;
    if (!guide || g.arena.active) return null;
    const pos = g.player.pos, w = g.world;
    const here = w.islandIdAt(pos.x, pos.z) ?? 'home';
    const go = (island, x, z) => (here === island ? { x, z } : this.portalToward(island, here));
    switch (guide.kind) {
      case 'point':
        return go('home', guide.x, guide.z);
      case 'node': {
        let best = null, bd = Infinity;
        for (const n of w.nodes) {
          if (n.type !== guide.res || !n.active || n.locked || w.islandIdAt(n.x, n.z) !== here) continue;
          const d = Math.hypot(n.x - pos.x, n.z - pos.z);
          if (d < bd) { bd = d; best = n; }
        }
        return best ? { x: best.x, z: best.z } : (here === 'home' ? null : this.portalToward('home', here));
      }
      case 'portal':
        return here === guide.island ? this.portalToward('home', here) : this.portalToward(guide.island, here);
      case 'enemy': {
        let best = null, bd = Infinity;
        for (const e of g.combat.enemies) {
          if (e.dead || e.def.id !== guide.id) continue;
          const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) return null;
        const island = w.islandIdAt(best.home.x, best.home.z) ?? 'home';
        return go(island, best.pos.x, best.pos.z);
      }
      case 'cage': {
        const r = REALMS[guide.element];
        return go(r.island, r.cage.x, r.cage.z);
      }
      case 'building': {
        const b = g.build.placed.find(r => r.id === guide.id);
        const spot = b ? { x: b.x, z: b.z } : guide.spot;
        return go('home', spot.x, spot.z);
      }
      case 'beast': {
        const c = g.creatures.actives[0];
        return c ? { x: c.pos.x, z: c.pos.z } : null;
      }
      default:
        return null;
    }
  }

  // Подпись «Куда идти» для окна задания
  distanceText() {
    return this.target ? `📍 ${Math.round(this.distance)} ${t('unit.m')}` : '';
  }

  update(dt) {
    this.time += dt;
    const g = this.game, q = g.quests.current;
    const p = g.player.pos;
    const target = this.enabled && q && g.playing && !g.player.dead ? this.resolve(q) : null;
    this.target = target;
    if (!target) { this.arrow.visible = this.beam.visible = this.ring.visible = false; this.distance = 0; return; }
    const dx = target.x - p.x, dz = target.z - p.z;
    this.distance = Math.hypot(dx, dz);
    const far = this.distance > 4;
    this.arrow.visible = far;
    this.beam.visible = this.ring.visible = true;
    if (far) {
      const a = Math.atan2(dx, dz), bob = Math.sin(this.time * 5) * 0.08;
      this.arrow.position.set(p.x + Math.sin(a) * 1.7, Math.max(p.y, 0) + 0.25 + bob, p.z + Math.cos(a) * 1.7);
      this.arrow.rotation.y = a;
    }
    this.beam.position.set(target.x, 10, target.z);
    this.ring.position.set(target.x, 0.12, target.z);
    const s = 1 + Math.sin(this.time * 4) * 0.12;
    this.ring.scale.set(s, 1, s);
  }
}
