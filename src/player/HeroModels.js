import * as THREE from 'three';
import { ELEMENTS } from '../config/heroes.js';

// Модели героев из простых фигур: тело одного цвета (команда или стихия), у каждого класса свой силуэт,
// у каждого героя (класс × стихия) своё оружие. Общие геометрии и материалы — на слабых телефонах это дёшево.
const G = {
  capsule: new THREE.CapsuleGeometry(0.4, 0.6, 3, 8),
  head: new THREE.SphereGeometry(0.32, 10, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  sphere: new THREE.SphereGeometry(1, 10, 8),
  torus: new THREE.TorusGeometry(1, 0.18, 6, 14),
  arc: new THREE.TorusGeometry(1, 0.1, 6, 12, Math.PI),
  octa: new THREE.OctahedronGeometry(1, 0),
  rock: new THREE.DodecahedronGeometry(1, 0),
};
const mats = new Map();
const mat = (color, extra = {}) => {
  const key = `${color}:${JSON.stringify(extra)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return mats.get(key);
};
// part(геометрия, материал, x, y, z, масштаб x/y/z, поворот x, поворот z)
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
const HALF = Math.PI / 2;

// Оружие героя. Герой смотрит в +z, оружие в руке сбоку (x = ±0.55).
function addWeapon(g, cls, element, accentMat) {
  const id = `${cls}_${element}`;
  const steel = mat(STEEL), wood = mat(WOOD), dark = mat(0x4a3a2a);
  const staff = head => { g.add(part(G.cyl, wood, 0.6, 1.0, 0.1, 0.05, 1.9, 0.05)); head(); };
  switch (id) {
    // Воины
    case 'warrior_fire':   // огромный меч с пламенем на гарде
      g.add(part(G.box, steel, 0.6, 1.2, 0.5, 0.18, 0.06, 1.9));
      g.add(part(G.box, accentMat, 0.6, 1.2, -0.3, 0.6, 0.08, 0.12));
      g.add(part(G.cone, accentMat, 0.6, 1.2, 1.55, 0.1, 0.4, 0.1, HALF));
      break;
    case 'warrior_water':  // трезубец
      g.add(part(G.cyl, wood, 0.6, 1.2, 0.2, 0.05, 2.0, 0.05, HALF));
      for (const dx of [-0.18, 0, 0.18]) g.add(part(G.cone, accentMat, 0.6 + dx, 1.2, 1.35, 0.06, 0.45, 0.06, HALF));
      g.add(part(G.box, accentMat, 0.6, 1.2, 1.15, 0.5, 0.05, 0.05));
      break;
    case 'warrior_ice':    // топор и круглый щит
      g.add(part(G.cyl, wood, 0.6, 1.1, 0.4, 0.05, 1.5, 0.05, HALF));
      g.add(part(G.box, accentMat, 0.6, 1.1, 1.0, 0.1, 0.55, 0.45));
      g.add(part(G.cyl, steel, -0.6, 1.1, 0.2, 0.5, 0.08, 0.5, 0, HALF));
      g.add(part(G.sphere, accentMat, -0.66, 1.1, 0.2, 0.14, 0.14, 0.14));
      break;
    case 'warrior_earth':  // огромный молот
      g.add(part(G.cyl, wood, 0.6, 1.1, 0.3, 0.06, 1.7, 0.06, HALF));
      g.add(part(G.box, mat(0x6d6f73), 0.6, 1.15, 1.2, 0.5, 0.55, 0.55));
      g.add(part(G.box, accentMat, 0.6, 1.15, 1.2, 0.54, 0.1, 0.59));
      break;
    case 'warrior_air':    // двойные клинки
      for (const dx of [0.5, -0.5]) {
        g.add(part(G.box, steel, dx, 1.1, 0.55, 0.07, 0.04, 1.2));
        g.add(part(G.box, accentMat, dx, 1.1, 1.15, 0.07, 0.05, 0.25));
      }
      break;
    // Стрелки
    case 'archer_fire':    // арбалет с горящим болтом
      g.add(part(G.box, wood, 0.5, 1.0, 0.3, 0.1, 0.1, 0.8));
      g.add(part(G.box, dark, 0.5, 1.0, 0.6, 0.9, 0.07, 0.07));
      g.add(part(G.box, accentMat, 0.5, 1.07, 0.55, 0.05, 0.05, 0.55));
      break;
    case 'archer_water':   // копьё-дротик
      g.add(part(G.cyl, wood, 0.6, 1.1, 0.5, 0.04, 2.3, 0.04, HALF));
      g.add(part(G.cone, accentMat, 0.6, 1.1, 1.75, 0.09, 0.4, 0.09, HALF));
      break;
    case 'archer_ice':     // длинный лук
      g.add(part(G.arc, accentMat, 0.55, 1.15, 0.5, 0.75, 0.75, 0.75, 0, HALF + Math.PI));
      g.add(part(G.box, steel, 0.55, 1.15, 0.5, 0.02, 1.5, 0.02));
      break;
    case 'archer_earth':   // бумеранг в руке
      g.add(part(G.box, mat(0xb78a4a), 0.55, 1.15, 0.45, 0.8, 0.07, 0.17));
      g.add(part(G.box, mat(0xb78a4a), 0.85, 1.15, 0.2, 0.17, 0.07, 0.6));
      g.add(part(G.box, accentMat, 0.55, 1.2, 0.45, 0.2, 0.08, 0.2));
      break;
    case 'archer_air':     // перевязь с метательными ножами
      for (const [x, y] of [[-0.25, 0.9], [0, 1.05], [0.25, 1.2]]) g.add(part(G.box, steel, x, y, 0.42, 0.06, 0.34, 0.04, 0, 0.5));
      g.add(part(G.box, accentMat, 0, 1.05, 0.38, 0.8, 0.05, 0.03, 0, 0.5));
      break;
    // Маги: посох с разной головкой
    case 'mage_fire':
      staff(() => g.add(part(G.sphere, accentMat, 0.6, 2.0, 0.1, 0.18, 0.18, 0.18)));
      break;
    case 'mage_water':
      staff(() => {
        g.add(part(G.sphere, accentMat, 0.6, 2.0, 0.1, 0.16, 0.2, 0.16));
        g.add(part(G.torus, accentMat, 0.6, 1.8, 0.1, 0.2, 0.2, 0.2, HALF));
      });
      break;
    case 'mage_ice':
      staff(() => g.add(part(G.octa, accentMat, 0.6, 2.05, 0.1, 0.16, 0.3, 0.16)));
      break;
    case 'mage_earth':
      staff(() => g.add(part(G.rock, mat(0x7a6a50), 0.6, 2.0, 0.1, 0.24, 0.24, 0.24)));
      break;
    case 'mage_air':       // лёгкий жезл и три кружащих шарика
      g.add(part(G.cyl, wood, 0.55, 0.95, 0.15, 0.04, 1.2, 0.04));
      for (const [x, y, z] of [[0.55, 1.75, 0.15], [0.8, 1.9, 0.0], [0.4, 1.95, 0.3]]) g.add(part(G.sphere, accentMat, x, y, z, 0.1, 0.1, 0.1));
      break;
    // Убийцы
    case 'assassin_fire':  // два кинжала с огоньком
      for (const dx of [0.5, -0.5]) {
        g.add(part(G.box, steel, dx, 0.95, 0.3, 0.06, 0.06, 0.6));
        g.add(part(G.sphere, accentMat, dx, 0.95, 0.65, 0.08, 0.08, 0.08));
      }
      break;
    case 'assassin_water': // длинные парные мечи
      for (const dx of [0.5, -0.5]) {
        g.add(part(G.box, steel, dx, 0.95, 0.4, 0.05, 0.05, 1.0));
        g.add(part(G.box, accentMat, dx, 0.95, -0.05, 0.25, 0.05, 0.06));
      }
      break;
    case 'assassin_ice':   // ледяные иглы пучком
      for (const [x, y] of [[0.45, 1.0], [0.55, 0.9], [0.65, 1.0], [-0.45, 1.0], [-0.55, 0.9], [-0.65, 1.0]]) g.add(part(G.cone, accentMat, x, y, 0.4, 0.05, 0.5, 0.05, HALF));
      break;
    case 'assassin_earth': // когти на руках
      for (const dx of [0.55, -0.55]) for (const o of [-0.08, 0, 0.08]) g.add(part(G.cone, mat(0x8a7a60), dx + o, 0.95, 0.4, 0.04, 0.4, 0.04, HALF));
      break;
    case 'assassin_air':   // шурикены у пояса
      for (const dx of [0.5, -0.5]) {
        g.add(part(G.box, steel, dx, 0.95, 0.3, 0.4, 0.03, 0.08));
        g.add(part(G.box, steel, dx, 0.95, 0.3, 0.08, 0.03, 0.4));
        g.add(part(G.sphere, accentMat, dx, 0.95, 0.3, 0.06, 0.06, 0.06));
      }
      break;
    // Поддержка: посох с символом стихии
    case 'support_fire':
      staff(() => g.add(part(G.cone, accentMat, 0.6, 2.05, 0.1, 0.16, 0.4, 0.16)));
      break;
    case 'support_water':
      staff(() => g.add(part(G.sphere, accentMat, 0.6, 2.05, 0.1, 0.16, 0.24, 0.16)));
      break;
    case 'support_ice':
      staff(() => {
        g.add(part(G.box, accentMat, 0.6, 2.05, 0.1, 0.5, 0.06, 0.06));
        g.add(part(G.box, accentMat, 0.6, 2.05, 0.1, 0.06, 0.5, 0.06));
      });
      break;
    case 'support_earth':
      staff(() => g.add(part(G.cone, mat(0x5a8a40), 0.6, 2.05, 0.1, 0.22, 0.4, 0.22, Math.PI)));
      break;
    case 'support_air':
      staff(() => {
        g.add(part(G.cone, accentMat, 0.6, 2.05, 0.1, 0.1, 0.5, 0.1, 0, 0.5));
        g.add(part(G.cone, accentMat, 0.6, 2.05, 0.1, 0.1, 0.5, 0.1, 0, -0.5));
      });
      break;
    default: break;
  }
}

// cls — класс, element — стихия (цвет деталей и оружия), body — цвет тела (по умолчанию цвет стихии)
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
  } else if (cls === 'mage') {
    g.add(part(G.cone, bodyMat, 0, 0.7, 0, 0.62, 1.4, 0.62));                           // мантия
    g.add(part(G.head, mat(SKIN), 0, 1.5, 0));
    g.add(part(G.cone, mat(0x3b2a6b), 0, 2.0, 0, 0.45, 0.8, 0.45));                    // колпак
  } else if (cls === 'archer') {
    g.add(part(G.capsule, bodyMat, 0, 0.75, 0));
    g.add(part(G.head, mat(SKIN), 0, 1.5, 0));
    g.add(part(G.cone, mat(0x2f6b3a), 0, 1.82, 0, 0.34, 0.4, 0.34));                   // зелёная шапка
  } else if (cls === 'support') {
    g.add(part(G.cone, mat(0xf2f2f2), 0, 0.7, 0, 0.55, 1.4, 0.55));                    // светлая мантия
    g.add(part(G.capsule, bodyMat, 0, 1.0, 0, 0.9, 0.6, 0.9));                          // цветной нагрудник
    g.add(part(G.head, mat(SKIN), 0, 1.5, 0));
  } else {                                                                              // warrior
    g.add(part(G.capsule, bodyMat, 0, 0.75, 0, 1.15, 1, 1.15));
    g.add(part(G.head, mat(SKIN), 0, 1.52, 0));
    g.add(part(G.sphere, mat(0x555a66), 0.5, 1.2, 0, 0.22, 0.22, 0.22));                // наплечники
    g.add(part(G.sphere, mat(0x555a66), -0.5, 1.2, 0, 0.22, 0.22, 0.22));
    g.add(part(G.cyl, mat(0x555a66), 0, 1.85, 0, 0.36, 0.22, 0.36));                    // шлем
  }
  addWeapon(g, cls, element, accentMat);
  return g;
}
