import * as THREE from 'three';

// Модели зверей из простых фигур. Позже любую можно заменить на GLB-модель из public/models.
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
const darker = c => {
  const r = ((c >> 16) & 255) * 0.65, g = ((c >> 8) & 255) * 0.65, b = (c & 255) * 0.65;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

function fox(color) {
  const g = new THREE.Group();
  const main = lambert(color), white = lambert(0xffffff);
  const body = mesh(new THREE.SphereGeometry(0.4, 10, 8), main, 0, 0.5, 0);
  body.scale.set(1, 0.85, 1.5);
  const head = mesh(new THREE.SphereGeometry(0.28, 10, 8), main, 0, 0.8, 0.6);
  const snout = mesh(new THREE.ConeGeometry(0.12, 0.3, 6), white, 0, 0.72, 0.9);
  snout.rotation.x = Math.PI / 2;
  const earGeo = new THREE.ConeGeometry(0.1, 0.28, 4);
  const tail = mesh(new THREE.SphereGeometry(0.2, 8, 6), main, 0, 0.6, -0.8);
  tail.scale.set(1, 1, 2);
  const tip = mesh(new THREE.SphereGeometry(0.14, 8, 6), white, 0, 0.62, -1.15);
  const eyeGeo = new THREE.SphereGeometry(0.045, 6, 6);
  g.add(body, head, snout, tail, tip,
    mesh(earGeo, main, -0.14, 1.08, 0.55), mesh(earGeo, main, 0.14, 1.08, 0.55),
    mesh(eyeGeo, eyeMat, -0.12, 0.88, 0.84), mesh(eyeGeo, eyeMat, 0.12, 0.88, 0.84));
  return g;
}

// Медведь: большой, круглый, коренастый
function bear(color) {
  const g = new THREE.Group();
  const main = lambert(color), dark = lambert(darker(color)), light = lambert(0xe8d2b0);
  const body = mesh(new THREE.SphereGeometry(0.6, 10, 8), main, 0, 0.8, 0);
  body.scale.set(1, 0.9, 1.25);
  const head = mesh(new THREE.SphereGeometry(0.38, 10, 8), main, 0, 1.3, 0.62);
  const snout = mesh(new THREE.SphereGeometry(0.17, 8, 6), light, 0, 1.2, 0.95);
  const nose = mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat, 0, 1.25, 1.1);
  const earGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const legGeo = new THREE.CylinderGeometry(0.17, 0.2, 0.5, 8);
  const eyeGeo = new THREE.SphereGeometry(0.05, 6, 6);
  g.add(body, head, snout, nose,
    mesh(earGeo, dark, -0.27, 1.62, 0.55), mesh(earGeo, dark, 0.27, 1.62, 0.55),
    mesh(legGeo, dark, -0.35, 0.25, 0.5), mesh(legGeo, dark, 0.35, 0.25, 0.5),
    mesh(legGeo, dark, -0.35, 0.25, -0.5), mesh(legGeo, dark, 0.35, 0.25, -0.5),
    mesh(eyeGeo, eyeMat, -0.15, 1.38, 0.95), mesh(eyeGeo, eyeMat, 0.15, 1.38, 0.95));
  return g;
}

// Волк: поджарый, длинная морда, острые уши, хвост
function wolf(color) {
  const g = new THREE.Group();
  const main = lambert(color), dark = lambert(darker(color)), white = lambert(0xe8ecf0);
  const body = mesh(new THREE.SphereGeometry(0.38, 10, 8), main, 0, 0.62, 0);
  body.scale.set(0.9, 0.8, 1.7);
  const head = mesh(new THREE.SphereGeometry(0.26, 10, 8), main, 0, 0.95, 0.72);
  const snout = mesh(new THREE.ConeGeometry(0.13, 0.42, 6), white, 0, 0.88, 1.05);
  snout.rotation.x = Math.PI / 2;
  const earGeo = new THREE.ConeGeometry(0.09, 0.3, 4);
  const legGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.5, 6);
  const tail = mesh(new THREE.ConeGeometry(0.12, 0.7, 6), dark, 0, 0.72, -0.95);
  tail.rotation.x = -1.2;
  const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
  g.add(body, head, snout, tail,
    mesh(earGeo, dark, -0.13, 1.25, 0.68), mesh(earGeo, dark, 0.13, 1.25, 0.68),
    mesh(legGeo, dark, -0.2, 0.25, 0.5), mesh(legGeo, dark, 0.2, 0.25, 0.5),
    mesh(legGeo, dark, -0.2, 0.25, -0.5), mesh(legGeo, dark, 0.2, 0.25, -0.5),
    mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0xffe066 }), -0.11, 1.0, 0.92), mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0xffe066 }), 0.11, 1.0, 0.92));
  return g;
}

// Дракон: длинная шея, крылья, шипы на спине, хвост
function dragon(color) {
  const g = new THREE.Group();
  const main = lambert(color), dark = lambert(darker(color)), belly = lambert(0xf2e2b8);
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  const body = mesh(new THREE.SphereGeometry(0.5, 10, 8), main, 0, 0.8, 0);
  body.scale.set(0.95, 0.85, 1.5);
  const bellyM = mesh(new THREE.SphereGeometry(0.4, 8, 6), belly, 0, 0.68, 0.1);
  bellyM.scale.set(0.9, 0.6, 1.3);
  const neck = mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.6, 8), main, 0, 1.2, 0.55);
  neck.rotation.x = 0.5;
  const head = mesh(new THREE.SphereGeometry(0.26, 10, 8), main, 0, 1.55, 0.85);
  const snout = mesh(new THREE.ConeGeometry(0.14, 0.3, 6), main, 0, 1.5, 1.15);
  snout.rotation.x = Math.PI / 2;
  const tail = mesh(new THREE.ConeGeometry(0.2, 1.0, 6), dark, 0, 0.65, -1.05);
  tail.rotation.x = -1.35;
  const wingGeo = new THREE.BoxGeometry(0.08, 0.7, 0.9);
  const wl = mesh(wingGeo, dark, -0.55, 1.2, -0.05), wr = mesh(wingGeo, dark, 0.55, 1.2, -0.05);
  wl.rotation.z = 0.7; wr.rotation.z = -0.7;
  const horn = new THREE.ConeGeometry(0.05, 0.22, 4);
  const spike = new THREE.ConeGeometry(0.07, 0.22, 4);
  const eyeGeo = new THREE.SphereGeometry(0.045, 6, 6);
  g.add(body, bellyM, neck, head, snout, tail, wl, wr,
    mesh(horn, glow, -0.1, 1.82, 0.8), mesh(horn, glow, 0.1, 1.82, 0.8),
    mesh(spike, dark, 0, 1.3, -0.2), mesh(spike, dark, 0, 1.28, -0.55), mesh(spike, dark, 0, 1.2, -0.9),
    mesh(eyeGeo, eyeMat, -0.12, 1.62, 1.05), mesh(eyeGeo, eyeMat, 0.12, 1.62, 1.05));
  return g;
}

// Сова: круглое тело, огромные глаза, крылья, ушки-перья
function owl(color) {
  const g = new THREE.Group();
  const main = lambert(color), dark = lambert(darker(color)), white = lambert(0xffffff);
  const body = mesh(new THREE.SphereGeometry(0.45, 10, 8), main, 0, 0.8, 0);
  body.scale.set(1, 1.15, 0.95);
  const belly = mesh(new THREE.SphereGeometry(0.32, 8, 6), white, 0, 0.72, 0.18);
  belly.scale.set(1, 1.1, 0.7);
  const wingGeo = new THREE.SphereGeometry(0.3, 6, 6);
  const wl = mesh(wingGeo, dark, -0.45, 0.8, 0), wr = mesh(wingGeo, dark, 0.45, 0.8, 0);
  wl.scale.set(0.35, 1, 0.8); wr.scale.set(0.35, 1, 0.8);
  const eyeW = new THREE.SphereGeometry(0.15, 8, 6), pupil = new THREE.SphereGeometry(0.07, 6, 6);
  const beak = mesh(new THREE.ConeGeometry(0.07, 0.16, 4), lambert(0xffb347), 0, 0.98, 0.45);
  beak.rotation.x = Math.PI / 2;
  const tuft = new THREE.ConeGeometry(0.08, 0.25, 4);
  g.add(body, belly, wl, wr, beak,
    mesh(eyeW, white, -0.17, 1.05, 0.36), mesh(eyeW, white, 0.17, 1.05, 0.36),
    mesh(pupil, eyeMat, -0.17, 1.05, 0.48), mesh(pupil, eyeMat, 0.17, 1.05, 0.48),
    mesh(tuft, dark, -0.24, 1.42, 0.05), mesh(tuft, dark, 0.24, 1.42, 0.05));
  return g;
}

const BUILDERS = { fox, bear, wolf, dragon, owl };

export function buildCreatureModel(model, color) {
  return (BUILDERS[model] ?? fox)(color);
}
