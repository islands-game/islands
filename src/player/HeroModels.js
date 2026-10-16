import * as THREE from 'three';
import { ELEMENTS } from '../config/heroes.js';

// Модели героев из простых фигур: тело одного цвета (команда или стихия), у каждого класса своё оружие и силуэт.
// Общие геометрии и материалы — на слабых телефонах это дёшево.
const G = {
  capsule: new THREE.CapsuleGeometry(0.4, 0.6, 3, 8),
  head: new THREE.SphereGeometry(0.32, 10, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  sphere: new THREE.SphereGeometry(1, 10, 8),
  torus: new THREE.TorusGeometry(1, 0.18, 6, 14),
};
const mats = new Map();
const mat = (color, extra = {}) => {
  const key = `${color}:${JSON.stringify(extra)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return mats.get(key);
};
const part = (geo, material, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, 0, rz);
  return m;
};

const SKIN = 0xffd9b3;
const STEEL = 0xd5dbe3;
const WOOD = 0x7a4f2a;

// cls — класс, element — стихия (цвет деталей), body — цвет тела (по умолчанию цвет стихии)
export function buildHeroModel(cls, element, body = null) {
  const accent = ELEMENTS[element]?.color ?? 0xffffff;
  const bodyColor = body ?? accent;
  const g = new THREE.Group();
  const bodyMat = mat(bodyColor);
  const accentMat = mat(accent, { emissive: accent, emissiveIntensity: 0.35 });

  if (cls === 'assassin') {
    g.add(part(G.capsule, bodyMat, 0, 0.75, 0, 0.8, 1, 0.8));
    g.add(part(G.head, mat(SKIN), 0, 1.48, 0, 0.9, 0.9, 0.9));
    g.add(part(G.cone, mat(0x2a2a33), 0, 1.78, -0.04, 0.4, 0.55, 0.4));               // капюшон
    g.add(part(G.box, mat(STEEL), 0.5, 0.95, 0.25, 0.06, 0.06, 0.6));                 // два кинжала
    g.add(part(G.box, mat(STEEL), -0.5, 0.95, 0.25, 0.06, 0.06, 0.6));
    g.add(part(G.sphere, accentMat, 0.5, 0.95, 0.58, 0.07, 0.07, 0.07));
    g.add(part(G.sphere, accentMat, -0.5, 0.95, 0.58, 0.07, 0.07, 0.07));
  } else if (cls === 'mage') {
    g.add(part(G.cone, bodyMat, 0, 0.7, 0, 0.62, 1.4, 0.62));                           // мантия
    g.add(part(G.head, mat(SKIN), 0, 1.5, 0));
    g.add(part(G.cone, mat(0x3b2a6b), 0, 2.0, 0, 0.45, 0.8, 0.45));                    // колпак
    g.add(part(G.cyl, mat(WOOD), 0.6, 1.0, 0.1, 0.05, 1.9, 0.05));                      // посох
    g.add(part(G.sphere, accentMat, 0.6, 2.0, 0.1, 0.18, 0.18, 0.18));
  } else if (cls === 'archer') {
    g.add(part(G.capsule, bodyMat, 0, 0.75, 0));
    g.add(part(G.head, mat(SKIN), 0, 1.5, 0));
    g.add(part(G.cone, mat(0x2f6b3a), 0, 1.82, 0, 0.34, 0.4, 0.34));                   // зелёная шапка
    g.add(part(G.box, mat(WOOD), 0.5, 1.0, 0.3, 0.1, 0.1, 0.8));                        // арбалет: ложе
    g.add(part(G.box, mat(0x4a3a2a), 0.5, 1.0, 0.55, 0.9, 0.07, 0.07));                 // дуги
    g.add(part(G.box, accentMat, 0.5, 1.05, 0.5, 0.05, 0.05, 0.5));                     // болт цвета стихии
  } else if (cls === 'support') {
    g.add(part(G.cone, mat(0xf2f2f2), 0, 0.7, 0, 0.55, 1.4, 0.55));                    // светлая мантия
    g.add(part(G.capsule, bodyMat, 0, 1.0, 0, 0.9, 0.6, 0.9));                          // цветной нагрудник
    g.add(part(G.head, mat(SKIN), 0, 1.5, 0));
    g.add(part(G.cyl, mat(WOOD), 0.6, 1.0, 0.1, 0.05, 1.9, 0.05));                      // посох с кольцом
    g.add(part(G.torus, accentMat, 0.6, 2.0, 0.1, 0.22, 0.22, 0.22));
  } else {                                                                              // warrior
    g.add(part(G.capsule, bodyMat, 0, 0.75, 0, 1.15, 1, 1.15));
    g.add(part(G.head, mat(SKIN), 0, 1.52, 0));
    g.add(part(G.sphere, mat(0x555a66), 0.5, 1.2, 0, 0.22, 0.22, 0.22));                // наплечники
    g.add(part(G.sphere, mat(0x555a66), -0.5, 1.2, 0, 0.22, 0.22, 0.22));
    g.add(part(G.cyl, mat(0x555a66), 0, 1.85, 0, 0.36, 0.22, 0.36));                    // шлем
    g.add(part(G.box, mat(STEEL), 0.6, 1.15, 0.45, 0.14, 0.06, 1.6));                   // большой меч
    g.add(part(G.box, accentMat, 0.6, 1.15, -0.2, 0.5, 0.06, 0.1));                     // гарда цвета стихии
  }
  return g;
}
