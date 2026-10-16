import * as THREE from 'three';
import { REALMS, REALM_ORDER } from '../config/realms.js';
import { CREATURES, SPECIES_ORDER, beastTitle } from '../config/creatures.js';
import { ELEMENTS } from '../config/heroes.js';
import { buildCreatureModel } from '../creatures/CreatureModels.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

const barGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6);
const topGeo = new THREE.ConeGeometry(1.3, 0.5, 10);
const floorGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.1, 16);
const ringGeo = new THREE.RingGeometry(1.5, 1.75, 28).rotateX(-Math.PI / 2);

// Простой хеш строки (одинаковый результат у всех игроков)
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Дата в формате ГГГГ-ММ-ДД по UTC: звери меняются раз в сутки, у всех игроков одновременно
export const todayKey = () => new Date().toISOString().slice(0, 10);

// Какой зверь в плену у стихии element в день day
export function beastSpecies(element, day = todayKey()) {
  return SPECIES_ORDER[hash(`${day}:${element}`) % SPECIES_ORDER.length];
}
export const beastIdOf = (element, day = todayKey()) => `${beastSpecies(element, day)}_${element}`;

// Порталы стихий: клетки со зверями дня, освобождение зверя после победы над королём.
export class Realms {
  constructor(game) {
    this.game = game;
    this.freed = {};          // { стихия: 'ГГГГ-ММ-ДД' } — когда зверя стихии освободили в последний раз
    this.day = todayKey();
    this.cages = {};
    this.timer = 0;
    this.t = 0;
    for (const el of REALM_ORDER) this.buildCage(el);
  }

  state(el) {
    if (this.freed[el] === this.day) return 'freed';
    const king = this.game.combat.enemies.find(e => e.def.id === REALMS[el].king);
    return king?.dead ? 'ready' : 'locked';
  }

  beastId(el) {
    return beastIdOf(el, this.day);
  }

  beastName(el) {
    return beastTitle(CREATURES[this.beastId(el)], 1);
  }

  buildCage(el) {
    const { cage } = REALMS[el];
    const world = this.game.world;
    world.clearArea(cage.x - 2.2, cage.z - 2.2, cage.x + 2.2, cage.z + 2.2);
    const root = new THREE.Group();
    root.position.set(cage.x, 0, cage.z);
    const metal = new THREE.MeshLambertMaterial({ color: 0xc9a54a, flatShading: true });
    const bars = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const b = new THREE.Mesh(barGeo, metal);
      b.position.set(Math.cos(a) * 1.1, 1.15, Math.sin(a) * 1.1);
      bars.add(b);
    }
    const top = new THREE.Mesh(topGeo, metal);
    top.position.y = 2.5;
    bars.add(top);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ color: 0x6a6f78, flatShading: true }));
    floor.position.y = 0.05;
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ELEMENTS[el].color, transparent: true, opacity: 0.7, depthWrite: false }));
    ring.position.y = 0.12;
    root.add(bars, floor, ring);
    world.scene.add(root);
    const collider = { x: cage.x, z: cage.z, r: 1.4, pr: 1.4, active: true };
    world.colliders.push(collider);
    this.cages[el] = { root, bars, ring, beast: null, collider, beastId: null };
    this.refresh(el);
  }

  // Перерисовывает клетку: какой зверь внутри, открыта ли клетка
  refresh(el) {
    const c = this.cages[el];
    const id = this.beastId(el);
    const state = this.state(el);
    if (c.beastId !== id || (c.beast === null && state !== 'freed')) {
      if (c.beast) { c.root.remove(c.beast); c.beast.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); c.beast = null; }
      if (state !== 'freed') {
        const def = CREATURES[id];
        c.beast = buildCreatureModel(def.model, def.color);
        c.beast.scale.setScalar(1.15);
        c.beast.position.y = 0.1;
        c.root.add(c.beast);
      }
      c.beastId = id;
    }
    if (state === 'freed' && c.beast) { c.root.remove(c.beast); c.beast = null; }
    c.bars.visible = state === 'locked';                    // клетка открыта, когда король побеждён
    c.collider.active = state === 'locked';
    c.ring.visible = state !== 'freed';
    c.state = state;
  }

  // Ближайшая клетка рядом с героем
  nearest(pos, range = 3) {
    let best = null, bestD = range;
    for (const el of REALM_ORDER) {
      const { cage } = REALMS[el];
      const d = Math.hypot(pos.x - cage.x, pos.z - cage.z);
      if (d < bestD) { bestD = d; best = el; }
    }
    return best ? { element: best, state: this.state(best), dist: bestD } : null;
  }

  // Освободить зверя. Возвращает 'ok' | 'locked' | 'freed' | 'owned'
  free(el) {
    const st = this.state(el);
    if (st !== 'ready') return st;
    const id = this.beastId(el);
    const g = this.game;
    if (g.creatures.has(id)) return 'owned';
    const { cage } = REALMS[el];
    g.creatures.addFreed(id, cage);
    this.freed[el] = this.day;
    g.combat.ring(cage, ELEMENTS[el].color, 4, 0.8);
    events.emit('tame', id);
    this.refresh(el);
    return 'ok';
  }

  // Герой вошёл на остров: сразу сообщаем, какой зверь в плену сегодня
  onEnter(islandId) {
    const el = REALM_ORDER.find(e => REALMS[e].island === islandId);
    if (!el) return;
    const st = this.state(el);
    const g = this.game;
    if (st === 'freed') g.ui.toast(`${t('realm.freedToday')}`);
    else g.ui.toast(`${t('realm.today')}: ${this.beastName(el)}. ${t('realm.beat')} ${t('enemy.' + REALMS[el].king)}`);
  }

  update(dt) {
    this.t += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1;
      const day = todayKey();
      if (day !== this.day) this.day = day;               // наступил новый день: в клетках другие звери
      for (const el of REALM_ORDER) this.refresh(el);
    }
    for (const el of REALM_ORDER) {
      const c = this.cages[el];
      if (c.beast) c.beast.rotation.y += dt * 0.8;
      c.ring.material.opacity = 0.45 + Math.sin(this.t * 3) * 0.25;
    }
  }

  toSave() {
    return { freed: { ...this.freed } };
  }

  fromSave(data) {
    this.freed = {};
    for (const el of REALM_ORDER) if (typeof data?.freed?.[el] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.freed[el])) this.freed[el] = data.freed[el];
    for (const el of REALM_ORDER) this.refresh(el);
  }

  reset() {
    this.freed = {};
    for (const el of REALM_ORDER) this.refresh(el);
  }
}
