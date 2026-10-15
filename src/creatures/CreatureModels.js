import * as THREE from 'three';

// Модели существ из простых фигур. Позже любую можно заменить на GLB-модель из public/models.
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

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

function golem(color) {
  const g = new THREE.Group();
  const main = lambert(color), dark = lambert(0x6a6f78);
  const glow = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  g.add(
    mesh(new THREE.BoxGeometry(0.95, 0.9, 0.7), main, 0, 0.95, 0),
    mesh(new THREE.BoxGeometry(0.55, 0.45, 0.5), main, 0, 1.65, 0),
    mesh(new THREE.BoxGeometry(0.28, 0.75, 0.28), dark, -0.65, 0.95, 0),
    mesh(new THREE.BoxGeometry(0.28, 0.75, 0.28), dark, 0.65, 0.95, 0),
    mesh(new THREE.BoxGeometry(0.32, 0.5, 0.32), dark, -0.26, 0.25, 0),
    mesh(new THREE.BoxGeometry(0.32, 0.5, 0.32), dark, 0.26, 0.25, 0),
    mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), glow, -0.14, 1.68, 0.26),
    mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), glow, 0.14, 1.68, 0.26),
    mesh(new THREE.OctahedronGeometry(0.18, 0), lambert(0x7df9ff), 0, 1.0, 0.38)
  );
  return g;
}

function spirit(color) {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.45, 12, 10), lambert(color, { transparent: true, opacity: 0.92 }), 0, 0.9, 0);
  const hat = mesh(new THREE.ConeGeometry(0.38, 0.55, 6), lambert(0x2f9e44), 0, 1.45, 0);
  const leaf = mesh(new THREE.ConeGeometry(0.1, 0.3, 4), lambert(0x7bd88f), 0.3, 1.5, 0);
  leaf.rotation.z = -1;
  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
  g.add(body, hat, leaf,
    mesh(eyeGeo, eyeMat, -0.15, 0.95, 0.4), mesh(eyeGeo, eyeMat, 0.15, 0.95, 0.4));
  return g;
}

const BUILDERS = { fox, golem, spirit };

export function buildCreatureModel(model, color) {
  return (BUILDERS[model] ?? fox)(color);
}
