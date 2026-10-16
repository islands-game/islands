import * as THREE from 'three';
import { localWalls, bedPosition, HOUSE_WALL } from './Structures.js';

const DOOR_HALF = 0.7; // половина ширины двери (как в Structures.js)

// Модели построек из простых фигур. Начало координат — центр основания, ширина вдоль x, глубина вдоль z.
const lambert = color => new THREE.MeshLambertMaterial({ color, flatShading: true });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// Верх платформ и мостов находится на высоте 0.1 (WALK_Y в World.js)
function platform({ w, d }, color) {
  const g = new THREE.Group();
  g.add(box(w, 0.3, d, lambert(color), 0, -0.05, 0));
  g.add(box(w - 0.4, 0.04, d - 0.4, lambert(0xd9b88a), 0, 0.1, 0)); // светлый настил
  return g;
}

function wall({ w, d }, color) {
  const g = new THREE.Group();
  const stone = lambert(color);
  g.add(box(w, 2, d, stone, 0, 1, 0));
  const n = Math.max(2, Math.round(w / 1));
  for (let i = 0; i < n; i += 2) {
    g.add(box(w / n, 0.3, d, stone, -w / 2 + (i + 0.5) * (w / n), 2.15, 0));
  }
  return g;
}

function bridge({ w, d }, color) {
  const g = new THREE.Group();
  const planks = lambert(color), rail = lambert(0x7a4e2d);
  const n = Math.floor(d / 0.6);
  for (let i = 0; i < n; i++) g.add(box(w, 0.12, 0.5, planks, 0, 0.04, -d / 2 + (i + 0.5) * (d / n)));
  for (const sx of [-1, 1]) {
    g.add(box(0.1, 0.1, d, rail, sx * (w / 2 - 0.05), 0.7, 0));
    for (const sz of [-1, 1]) g.add(box(0.14, 0.8, 0.14, rail, sx * (w / 2 - 0.05), 0.4, sz * (d / 2 - 0.1)));
  }
  return g;
}

// Дом: стены с дверью, пол, кровать. Крыша — отдельная группа (userData.roof): когда герой внутри, её прячут.
function house({ w, d }, color, def, opts = {}) {
  const g = new THREE.Group();
  const wallMat = lambert(color);
  for (const r of localWalls(def)) g.add(box(r.hw * 2, 2.4, r.hd * 2, wallMat, r.x, 1.2, r.z));
  g.add(box(DOOR_HALF * 2 + 0.2, 0.4, HOUSE_WALL, wallMat, 0, 2.2, d / 2 - HOUSE_WALL / 2)); // перемычка над дверью
  g.add(box(w - 2 * HOUSE_WALL, 0.05, d - 2 * HOUSE_WALL, lambert(0xcaa972), 0, 0.03, 0));    // пол
  const bed = bedPosition(def, 0, 0, 0);
  g.add(
    box(1.3, 0.35, 0.8, lambert(0x8b5a2b), bed.x, 0.2, bed.z),
    box(1.2, 0.15, 0.7, lambert(0xf2f2f2), bed.x, 0.45, bed.z),
    box(0.5, 0.12, 0.5, lambert(0xff9aa2), bed.x - 0.35, 0.58, bed.z)
  );
  const roofMat = lambert(opts.roof ?? 0x5b8def);
  const roof = new THREE.Group();
  roof.add(box(w, 0.2, d, roofMat, 0, 2.5, 0));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 1.8, 4), roofMat);
  cone.position.y = 3.5;
  cone.rotation.y = Math.PI / 4;
  roof.add(cone);
  g.add(roof);
  g.userData.roof = roof;
  return g;
}

// Загон: забор по краю с проходом спереди (по оси +z)
function pen({ w, d }, color) {
  const g = new THREE.Group();
  const wood = lambert(color);
  g.add(box(w, 0.04, d, lambert(0xb8d98a), 0, 0.02, 0));
  const post = (x, z) => g.add(box(0.2, 1, 0.2, wood, x, 0.5, z));
  const rails = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    for (const y of [0.4, 0.8]) {
      const r = box(len, 0.08, 0.08, wood, (x1 + x2) / 2, y, (z1 + z2) / 2);
      r.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      g.add(r);
    }
  };
  const hw = w / 2 - 0.1, hd = d / 2 - 0.1, gap = 1.2;
  rails(-hw, -hd, hw, -hd);      // задняя сторона
  rails(-hw, -hd, -hw, hd);      // левая
  rails(hw, -hd, hw, hd);        // правая
  rails(-hw, hd, -gap, hd);      // передняя слева от прохода
  rails(gap, hd, hw, hd);        // передняя справа от прохода
  for (let x = -hw; x <= hw + 0.01; x += (2 * hw) / Math.round(w)) { post(x, -hd); }
  for (let z = -hd; z <= hd + 0.01; z += (2 * hd) / Math.round(d)) { post(-hw, z); post(hw, z); }
  post(-gap, hd); post(gap, hd);
  return g;
}

// Амбар: красный сарай с двускатной крышей и большими воротами спереди (+z)
function barn({ w, d }, color) {
  const g = new THREE.Group();
  const red = lambert(color), dark = lambert(0x6a2a20), roof = lambert(0x5a4a3a), white = lambert(0xf2e8d8);
  g.add(box(w, 2.2, d, red, 0, 1.1, 0));
  // двускатная крыша: два наклонных листа
  for (const side of [-1, 1]) {
    const sheet = box(w + 0.5, 0.15, d * 0.62, roof, 0, 2.2 + d * 0.16, side * d * 0.22);
    sheet.rotation.x = side * -0.55;
    g.add(sheet);
  }
  g.add(box(1.6, 1.7, 0.1, dark, 0, 0.85, d / 2 + 0.02));                       // ворота
  g.add(box(1.7, 0.1, 0.12, white, 0, 1.75, d / 2 + 0.03));
  g.add(box(0.08, 1.7, 0.12, white, 0, 0.85, d / 2 + 0.03));
  return g;
}

// Ферма: грядки рисует Economy (они меняются по мере роста), здесь только земля и бордюр
function farm({ w, d }, color) {
  const g = new THREE.Group();
  g.add(box(w, 0.06, d, lambert(0x8a6a40), 0, 0.03, 0));
  const edge = lambert(color);
  g.add(box(w, 0.2, 0.15, edge, 0, 0.1, -d / 2 + 0.07), box(w, 0.2, 0.15, edge, 0, 0.1, d / 2 - 0.07));
  g.add(box(0.15, 0.2, d, edge, -w / 2 + 0.07, 0.1, 0), box(0.15, 0.2, d, edge, w / 2 - 0.07, 0.1, 0));
  return g;
}

// Сторожевая башня: каменное основание, деревянная площадка с перилами и острая крыша
function tower({ w }, color) {
  const g = new THREE.Group();
  const stone = lambert(color), wood = lambert(0x8b5a2b), roof = lambert(0xb5493a);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.38, w * 0.46, 3.2, 8), stone);
  base.position.y = 1.6;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.52, w * 0.52, 0.25, 8), wood);
  deck.position.y = 3.3;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(w * 0.55, 1.2, 8), roof);
  cone.position.y = 4.9;
  g.add(base, deck, cone);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(box(0.12, 1.2, 0.12, wood, Math.cos(a) * w * 0.48, 3.95, Math.sin(a) * w * 0.48));
  }
  return g;
}

// Ловушка: плоская доска с шипами
function trap({ w }, color) {
  const g = new THREE.Group();
  g.add(box(w, 0.08, w, lambert(color), 0, 0.04, 0));
  const spike = lambert(0xc9ccd1);
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3], [0, 0]]) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), spike);
    s.position.set(x, 0.23, z);
    g.add(s);
  }
  return g;
}

const BUILDERS = { platform, wall, bridge, house, pen, barn, farm, tower, trap };

export function buildModel(def, opts) {
  return (BUILDERS[def.model] ?? platform)(def.size, def.color, def, opts);
}

// Освобождает память модели
export function disposeModel(group) {
  group.traverse(o => {
    if (o.isMesh && !o.userData.keep) { o.geometry.dispose(); o.material.dispose(); }   // keep — общие геометрии грядок и животных
  });
}
