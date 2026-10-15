import * as THREE from 'three';
import { ARENA } from '../config/arena.js';

// Оформление арены: дороги-линии, базы, лагеря в лесу и яма королей. Сами башни и кристаллы появляются в начале матча.
const flat = (geo, color, x, y, z) => {
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  m.position.set(x, y, z);
  return m;
};

export function buildArenaMap(scene) {
  const g = new THREE.Group();
  g.position.set(ARENA.center.x, 0, ARENA.center.z);
  const len = ARENA.spawnZ * 2 + 12;
  const road = 0xd8c590;

  // Три линии
  for (const x of Object.values(ARENA.lanes)) {
    g.add(flat(new THREE.BoxGeometry(6, 0.06, len), road, x, 0.03, 0));
  }
  // Дороги от баз к линиям
  for (const sign of [1, -1]) {
    g.add(flat(new THREE.BoxGeometry(ARENA.lanes.right * 2 + 6, 0.06, 5), road, 0, 0.03, sign * ARENA.spawnZ));
    // База: площадка с цветом команды
    const base = flat(new THREE.CylinderGeometry(9, 9, 0.1, 28), sign > 0 ? 0x4a78c9 : 0xc94a4a, 0, 0.05, sign * ARENA.baseZ);
    g.add(base);
  }
  // Лагеря лесных монстров
  for (const c of ARENA.camps) {
    g.add(flat(new THREE.CylinderGeometry(3.2, 3.2, 0.08, 20), 0x2f6a35, c.x, 0.04, c.z));
  }
  // Яма королей в центре
  g.add(flat(new THREE.CylinderGeometry(6, 6, 0.1, 24), 0x3b2a4a, 0, 0.05, 0));
  g.add(flat(new THREE.TorusGeometry(6, 0.18, 6, 32).rotateX(Math.PI / 2), 0xffb347, 0, 0.12, 0));

  scene.add(g);
  return g;
}
