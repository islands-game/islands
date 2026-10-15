import * as THREE from 'three';

export const ISLAND_RADIUS = 14;
export const GROUND_Y = 0;
export const WALK_Y = 0.1; // высота платформ и мостов

// Остров: земля, деревья, камни, кристаллы, дом, портал, облака, освещение.
// colliders — круги {x, z, r}, через которые персонаж не проходит.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.rects = [];      // твёрдые прямоугольники (стены, дома): { x, z, hw, hd }
    this.walkables = [];  // платформы и мосты: по ним можно ходить
    this.nodes = []; // ресурсы, которые можно собрать (деревья, камни, кристаллы)
    this.clouds = [];
    this.crystals = [];
    this.time = 0;

    scene.background = new THREE.Color(0x8fd3ff);
    scene.fog = new THREE.Fog(0x8fd3ff, 40, 120);

    this.buildLights();
    this.buildIsland();
    this.buildProps();
    this.buildHouse();
    this.buildPortal();
    this.buildClouds();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2cc, 1.6);
    sun.position.set(20, 30, 10);
    this.scene.add(sun);
  }

  buildIsland() {
    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS, 1, 32),
      new THREE.MeshLambertMaterial({ color: 0x6cd05a, flatShading: true })
    );
    grass.position.y = GROUND_Y - 0.5;
    this.scene.add(grass);

    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(ISLAND_RADIUS, 12, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a6f55, flatShading: true })
    );
    rock.rotation.x = Math.PI;
    rock.position.y = GROUND_Y - 1 - 6;
    this.scene.add(rock);

    // Стартовая площадка
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 0.1, 24),
      new THREE.MeshLambertMaterial({ color: 0xe9dfae })
    );
    pad.position.set(0, GROUND_Y + 0.05, 6);
    this.scene.add(pad);
  }

  // Случайные, но одинаковые при каждом запуске (фиксированное зерно)
  rng(seed) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  buildProps() {
    const rand = this.rng(42);
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.4, 6);
    const leafGeo = new THREE.ConeGeometry(1.3, 2.8, 7);
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const crystalGeo = new THREE.OctahedronGeometry(0.6, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a4e2d });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44, flatShading: true });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a6, flatShading: true });
    const crystalMat = new THREE.MeshLambertMaterial({
      color: 0x7df9ff, emissive: 0x2aa9c9, flatShading: true,
    });

    const place = (minR, maxR) => {
      for (let i = 0; i < 20; i++) {
        const a = rand() * Math.PI * 2;
        const r = minR + rand() * (maxR - minR);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (this.isFree(x, z, 1.8)) return { x, z };
      }
      return null;
    };

    for (let i = 0; i < 16; i++) {
      const p = place(5, ISLAND_RADIUS - 1.5);
      if (!p) continue;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.7;
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.y = 2.6;
      tree.add(trunk, leaves);
      tree.position.set(p.x, GROUND_Y, p.z);
      tree.scale.setScalar(0.8 + rand() * 0.6);
      this.scene.add(tree);
      this.addNode('wood', tree, p.x, p.z, 0.5);
    }
    for (let i = 0; i < 8; i++) {
      const p = place(4, ISLAND_RADIUS - 1);
      if (!p) continue;
      const m = new THREE.Mesh(rockGeo, rockMat);
      const s = 0.6 + rand() * 0.7;
      m.scale.set(s, s * 0.8, s);
      m.position.set(p.x, GROUND_Y + s * 0.4, p.z);
      m.rotation.y = rand() * 6;
      this.scene.add(m);
      this.addNode('stone', m, p.x, p.z, s * 0.9);
    }
    for (let i = 0; i < 6; i++) {
      const p = place(3, ISLAND_RADIUS - 2);
      if (!p) continue;
      const m = new THREE.Mesh(crystalGeo, crystalMat);
      m.scale.set(1, 1.8, 1);
      m.position.set(p.x, GROUND_Y + 1, p.z);
      this.scene.add(m);
      this.crystals.push(m);
      this.addNode('crystal', m, p.x, p.z, 0.5);
    }
  }

  buildHouse() {
    const house = new THREE.Group();
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.6, 4),
      new THREE.MeshLambertMaterial({ color: 0xf2d9a6 })
    );
    walls.position.y = 1.3;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3.6, 2, 4),
      new THREE.MeshLambertMaterial({ color: 0xd9534f, flatShading: true })
    );
    roof.position.y = 3.6;
    roof.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.6, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x6b4423 })
    );
    door.position.set(0, 0.8, 2.05);
    house.add(walls, roof, door);
    house.position.set(-7, GROUND_Y, -4);
    this.scene.add(house);
    this.colliders.push({ x: -7, z: -4, r: 2.9 });
  }

  buildPortal() {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.25, 8, 28),
      new THREE.MeshLambertMaterial({ color: 0xb388ff, emissive: 0x6a3fd1 })
    );
    ring.position.set(8, GROUND_Y + 2, -6);
    ring.rotation.y = -0.6;
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xd9c2ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    core.position.copy(ring.position);
    core.rotation.copy(ring.rotation);
    this.portal = ring;
    this.scene.add(ring, core);
    this.colliders.push({ x: 8, z: -6, r: 1.2 });
  }

  buildClouds() {
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const rand = this.rng(7);
    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(geo, mat);
        puff.position.set(j * 1.4 - 2, rand() * 0.6, rand());
        puff.scale.set(1.8 + rand(), 1 + rand() * 0.5, 1.4);
        cloud.add(puff);
      }
      const a = rand() * Math.PI * 2;
      const r = 28 + rand() * 40;
      cloud.position.set(Math.cos(a) * r, -6 + rand() * 22, Math.sin(a) * r);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  // Объект, который можно собрать: у него есть collider, который выключается, пока ресурс "отрастает"
  addNode(type, obj, x, z, r) {
    const collider = { x, z, r, active: true };
    this.colliders.push(collider);
    this.nodes.push({ type, obj, x, z, collider, active: true, respawnAt: 0 });
  }

  isFree(x, z, margin = 0) {
    if (Math.hypot(x - 0, z - 6) < 3.5) return false; // стартовая площадка
    return !this.colliders.some(c => c.active && Math.hypot(x - c.x, z - c.z) < c.r + margin);
  }

  // Ближайшее свободное место рядом с точкой (для появления существ и врагов)
  findFree(x, z, margin = 1.2) {
    for (let r = 0; r <= 10; r++) {
      const steps = r === 0 ? 1 : r * 6;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
        if (Math.hypot(cx, cz) < ISLAND_RADIUS - 1.5 && this.isFree(cx, cz, margin)) return { x: cx, z: cz };
      }
    }
    return { x: 0, z: 0 };
  }

  // Высота земли в точке; null — за краем острова (падение)
  groundAt(x, z) {
    let y = Math.hypot(x, z) <= ISLAND_RADIUS ? GROUND_Y : null;
    // Платформы и мосты — тоже земля (можно стоять и выходить за край острова)
    for (const w of this.walkables) {
      if (Math.abs(x - w.x) <= w.hw && Math.abs(z - w.z) <= w.hd) y = WALK_Y;
    }
    return y;
  }

  // Выталкивает точку из препятствий
  resolveCollisions(pos, radius) {
    // Прямоугольные препятствия: стены и дома
    for (const r of this.rects) {
      const nx = Math.max(r.x - r.hw, Math.min(r.x + r.hw, pos.x));
      const nz = Math.max(r.z - r.hd, Math.min(r.z + r.hd, pos.z));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d = Math.hypot(dx, dz);
      if (d > 0.0001) {
        if (d < radius) { pos.x = nx + (dx / d) * radius; pos.z = nz + (dz / d) * radius; }
      } else {
        // Точка внутри прямоугольника — выталкиваем через ближайший край
        const px = r.hw - Math.abs(pos.x - r.x), pz = r.hd - Math.abs(pos.z - r.z);
        if (px < pz) pos.x = r.x + (pos.x >= r.x ? 1 : -1) * (r.hw + radius);
        else pos.z = r.z + (pos.z >= r.z ? 1 : -1) * (r.hd + radius);
      }
    }
    for (const c of this.colliders) {
      if (!c.active) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const dist = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (dist < min && dist > 0.0001) {
        pos.x = c.x + (dx / dist) * min;
        pos.z = c.z + (dz / dist) * min;
      }
    }
  }

  update(dt) {
    this.time += dt;
    this.crystals.forEach((c, i) => {
      c.rotation.y += dt;
      c.position.y = GROUND_Y + 1 + Math.sin(this.time * 2 + i) * 0.12;
    });
    this.portal.rotation.z += dt * 0.8;
    this.clouds.forEach((c, i) => {
      c.position.x += dt * (0.3 + (i % 3) * 0.1);
      if (c.position.x > 70) c.position.x = -70;
    });
  }
}
