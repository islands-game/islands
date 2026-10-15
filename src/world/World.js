import * as THREE from 'three';
import { events } from '../core/Events.js';
import { BUILDINGS } from '../config/buildings.js';
import { buildModel } from '../building/BuildingModels.js';
import { structureRects, interiorRect, bedPosition } from '../building/Structures.js';

export const DAY_LENGTH = 240; // сколько секунд длятся целые сутки
const SKY_DAY = new THREE.Color(0x8fd3ff);
const SKY_DUSK = new THREE.Color(0xff9a6b);
const SKY_NIGHT = new THREE.Color(0x101a40);
const _sky = new THREE.Color();

export const ISLAND_RADIUS = 14; // радиус домашнего острова
export const GROUND_Y = 0;
export const WALK_Y = 0.1; // высота платформ и мостов

// Острова мира. Чтобы добавить новый остров: допиши запись сюда, портал в PORTALS,
// врагов в config/enemies.js (ENEMY_SPAWNS) и, если хочешь, существо в config/creatures.js.
//   x, z, r — центр и радиус;  spawn — где появляется герой;  seed — "зерно" расстановки деревьев и камней
//   trees / rocks / crystals — сколько деревьев, камней и кристаллов;  colors — краски острова
export const ISLANDS = [
  {
    id: 'home', x: 0, z: 0, r: 14, spawn: { x: 0, z: 6 }, seed: 42,
    trees: 16, rocks: 8, crystals: 6,
    colors: { grass: 0x6cd05a, rock: 0x8a6f55, trunk: 0x7a4e2d, leaf: 0x2f9e44, stone: 0x9aa0a6, crystal: 0x7df9ff, glow: 0x2aa9c9, pad: 0xe9dfae },
  },
  {
    id: 'ice', x: 70, z: 0, r: 12, spawn: { x: 70, z: 4 }, seed: 99, nameKey: 'island.ice',
    trees: 10, rocks: 8, crystals: 9,
    colors: { grass: 0xeaf6ff, rock: 0x7aa6c4, trunk: 0x8a9db0, leaf: 0xcfeaff, stone: 0xa8c4d8, crystal: 0xb8f0ff, glow: 0x4aa8e0, pad: 0xbfe3ff },
  },
  {
    id: 'fire', x: 140, z: 0, r: 12, spawn: { x: 140, z: 4 }, seed: 123, nameKey: 'island.fire',
    trees: 8, rocks: 10, crystals: 8,
    colors: { grass: 0x4a3535, rock: 0x7a2a1a, trunk: 0x2a1a1a, leaf: 0x8a3a1f, stone: 0x5a4545, crystal: 0xffa04a, glow: 0xff4a00, pad: 0x8a5a4a },
  },
];

// Порталы между островами: x, z — где стоит портал, dest — куда он переносит героя
// recLevel — рекомендуемый уровень героя (портал предупредит, если уровень ниже)
export const PORTALS = [
  { x: 8, z: -6, rot: -0.6, color: 0xb388ff, glow: 0x6a3fd1, dest: { x: 70, z: 4 }, nameKey: 'island.ice', recLevel: 3 },
  { x: 70, z: -7, rot: 0.4, color: 0x8fe3ff, glow: 0x2a9fd0, dest: { x: 8, z: -3.2 }, nameKey: 'island.home' },
  { x: -10, z: 7, rot: 0.8, color: 0xff9a4a, glow: 0xd04a10, dest: { x: 140, z: 4 }, nameKey: 'island.fire', recLevel: 6 },
  { x: 140, z: -7, rot: 0.4, color: 0xffb070, glow: 0xd04a10, dest: { x: -8.5, z: 5 }, nameKey: 'island.home' },
];

// Остров: земля, деревья, камни, кристаллы, дом, порталы, облака, освещение.
// colliders — круги {x, z, r}, через которые персонаж не проходит.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.rects = [];      // твёрдые прямоугольники (стены, дома): { x, z, hw, hd }
    this.walkables = [];  // платформы и мосты: по ним можно ходить
    this.interiors = [];  // комнаты домов: внутри безопасно
    this.nodes = []; // ресурсы, которые можно собрать (деревья, камни, кристаллы)
    this.portals = [];
    this.clouds = [];
    this.crystals = [];
    this.portalRings = [];
    this.time = 0;
    this.day = 0.12;       // время суток: начинаем утром
    this.night = 0;        // 0 — день, 1 — глубокая ночь
    this.isNight = false;
    this.dayCount = 0;     // сколько суток прошло (нужно рейдам)
    // Места, где ничего не должно стоять: точки появления и порталы дальних островов
    this.reserved = ISLANDS.map(i => ({ x: i.spawn.x, z: i.spawn.z, r: 3.5 }));
    // Порталы на дальних островах (на домашнем острове расстановка уже сложилась, её не трогаем)
    for (const p of PORTALS) if (p.x > 30) this.reserved.push({ x: p.x, z: p.z, r: 3 });

    scene.background = new THREE.Color(0x8fd3ff);
    scene.fog = new THREE.Fog(0x8fd3ff, 40, 140);

    this.buildLights();
    for (const island of ISLANDS) {
      this.buildIsland(island);
      this.buildProps(island);
    }
    this.buildHouse();
    for (const p of PORTALS) this.buildPortal(p);
    this.buildClouds();
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.1);
    this.sun = new THREE.DirectionalLight(0xfff2cc, 1.6);
    this.sun.position.set(20, 30, 10);
    this.scene.add(this.hemi, this.sun);
    this.applyLighting();
  }

  // Смена дня и ночи: свет, цвет неба и тумана зависят от времени суток this.day (0..1).
  // 0 — рассвет, 0.25 — полдень, 0.5 — закат, 0.75 — полночь.
  applyLighting() {
    const h = Math.sin(this.day * Math.PI * 2);            // высота солнца: 1 — полдень, -1 — полночь
    const k = THREE.MathUtils.smoothstep(h, -0.45, 0.5);  // 0 — ночь, 1 — день
    const warm = Math.max(0, 1 - Math.abs(h) / 0.5);       // рассвет и закат
    this.night = 1 - k;

    _sky.copy(SKY_NIGHT).lerp(SKY_DAY, k).lerp(SKY_DUSK, warm * 0.55);
    this.scene.background.copy(_sky);
    this.scene.fog.color.copy(_sky);
    this.hemi.intensity = 0.62 + 0.48 * k;   // ночью всё равно хорошо видно землю и существ
    this.sun.intensity = 0.2 + 1.42 * k;
    this.sun.color.setHex(0xfff2cc).lerp(SKY_DUSK, warm * 0.6);
    this.sun.position.set(30 * Math.cos(this.day * Math.PI * 2), 8 + 22 * Math.max(0, h), 10);

    const isNight = this.night > 0.6;
    if (isNight !== this.isNight) {
      this.isNight = isNight;
      events.emit(isNight ? 'nightfall' : 'daybreak');
    }
  }

  buildIsland(island) {
    const { x, z, r, colors } = island;
    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 1, 32),
      new THREE.MeshLambertMaterial({ color: colors.grass, flatShading: true })
    );
    grass.position.set(x, GROUND_Y - 0.5, z);
    this.scene.add(grass);

    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(r, 12, 8),
      new THREE.MeshLambertMaterial({ color: colors.rock, flatShading: true })
    );
    rock.rotation.x = Math.PI;
    rock.position.set(x, GROUND_Y - 1 - 6, z);
    this.scene.add(rock);

    // Стартовая площадка
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 0.1, 24),
      new THREE.MeshLambertMaterial({ color: colors.pad })
    );
    pad.position.set(island.spawn.x, GROUND_Y + 0.05, island.spawn.z);
    this.scene.add(pad);
  }

  // Случайные, но одинаковые при каждом запуске (фиксированное зерно)
  rng(seed) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  buildProps(island) {
    const { x: cx, z: cz, r: R, colors } = island;
    const rand = this.rng(island.seed);
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.4, 6);
    const leafGeo = new THREE.ConeGeometry(1.3, 2.8, 7);
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const crystalGeo = new THREE.OctahedronGeometry(0.6, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: colors.trunk });
    const leafMat = new THREE.MeshLambertMaterial({ color: colors.leaf, flatShading: true });
    const rockMat = new THREE.MeshLambertMaterial({ color: colors.stone, flatShading: true });
    const crystalMat = new THREE.MeshLambertMaterial({
      color: colors.crystal, emissive: colors.glow, flatShading: true,
    });

    const place = (minR, maxR) => {
      for (let i = 0; i < 20; i++) {
        const a = rand() * Math.PI * 2;
        const r = minR + rand() * (maxR - minR);
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (this.isFree(x, z, 1.8)) return { x, z };
      }
      return null;
    };

    for (let i = 0; i < island.trees; i++) {
      const p = place(5, R - 1.5);
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
      this.addNode('wood', tree, p.x, p.z, 0.5, 0.85 * tree.scale.x);
    }
    for (let i = 0; i < island.rocks; i++) {
      const p = place(4, R - 1);
      if (!p) continue;
      const m = new THREE.Mesh(rockGeo, rockMat);
      const s = 0.6 + rand() * 0.7;
      m.scale.set(s, s * 0.8, s);
      m.position.set(p.x, GROUND_Y + s * 0.4, p.z);
      m.rotation.y = rand() * 6;
      this.scene.add(m);
      this.addNode('stone', m, p.x, p.z, s * 0.9);
    }
    for (let i = 0; i < island.crystals; i++) {
      const p = place(3, R - 2);
      if (!p) continue;
      const m = new THREE.Mesh(crystalGeo, crystalMat);
      m.scale.set(1, 1.8, 1);
      m.position.set(p.x, GROUND_Y + 1, p.z);
      this.scene.add(m);
      this.crystals.push(m);
      this.addNode('crystal', m, p.x, p.z, 0.5);
    }
  }

  // Стартовый дом: такой же, как дом, который можно построить (с дверью, комнатой и кроватью)
  buildHouse() {
    const def = BUILDINGS.house;
    // Расчищаем место: деревья и камни, которые стояли на месте дома и у его двери, убираем
    this.clearArea(-10, -6.5, -4, 3);
    const mesh = buildModel(def, { roof: 0xd9534f });
    mesh.position.set(-7, GROUND_Y, -4);
    this.scene.add(mesh);
    this.registerStructure(def, -7, -4, 0, mesh);
    // Невидимая отметка: здесь нельзя строить и появляться существам (но она не мешает ходить)
    this.colliders.push({ x: -7, z: -4, r: 0, pr: 2.9, active: true, placeOnly: true });
  }

  // Убирает собираемые объекты (деревья, камни, кристаллы) в прямоугольнике x1..x2, z1..z2
  clearArea(x1, z1, x2, z2) {
    for (const n of [...this.nodes]) {
      if (n.x < x1 || n.x > x2 || n.z < z1 || n.z > z2) continue;
      this.scene.remove(n.obj);
      this.nodes.splice(this.nodes.indexOf(n), 1);
      this.colliders.splice(this.colliders.indexOf(n.collider), 1);
      const c = this.crystals.indexOf(n.obj);
      if (c >= 0) this.crystals.splice(c, 1);
    }
  }

  // Постройка со стенами: регистрирует твёрдые стены и (для дома) комнату, где можно спрятаться
  registerStructure(def, x, z, rot, mesh) {
    const rec = { solids: [], interior: null, roof: mesh.userData.roof ?? null, bed: null };
    for (const r of structureRects(def, x, z, rot)) {
      const wall = { ...r };
      this.rects.push(wall);
      rec.solids.push(wall);
    }
    if (def.structure === 'house') {
      rec.interior = interiorRect(def, x, z, rot);
      rec.bed = bedPosition(def, x, z, rot);
      this.interiors.push(rec);
    }
    return rec;
  }

  removeStructure(rec) {
    for (const wall of rec.solids) {
      const i = this.rects.indexOf(wall);
      if (i >= 0) this.rects.splice(i, 1);
    }
    const j = this.interiors.indexOf(rec);
    if (j >= 0) this.interiors.splice(j, 1);
  }

  // Комната, в которой стоит точка (или null)
  interiorAt(x, z) {
    for (const r of this.interiors) {
      if (Math.abs(x - r.interior.x) < r.interior.hw && Math.abs(z - r.interior.z) < r.interior.hd) return r;
    }
    return null;
  }

  // Крыша дома, в котором стоит герой, исчезает — видно комнату
  updateRoofs(inside) {
    for (const r of this.interiors) if (r.roof) r.roof.visible = r !== inside;
  }

  // Портал: кольцо со светящимся центром. Подойди и нажми "Действие", чтобы перенестись на другой остров.
  buildPortal(p) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.25, 8, 28),
      new THREE.MeshLambertMaterial({ color: p.color, emissive: p.glow })
    );
    ring.position.set(p.x, GROUND_Y + 2, p.z);
    ring.rotation.y = p.rot;
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xd9c2ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    core.position.copy(ring.position);
    core.rotation.copy(ring.rotation);
    this.portalRings.push(ring);
    this.scene.add(ring, core);
    this.colliders.push({ x: p.x, z: p.z, r: 1.2, active: true });
    this.portals.push({ x: p.x, z: p.z, r: 1.2, dest: p.dest, nameKey: p.nameKey, recLevel: p.recLevel ?? 1 });
  }

  buildClouds() {
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const rand = this.rng(7);
    for (let i = 0; i < 34; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(geo, mat);
        puff.position.set(j * 1.4 - 2, rand() * 0.6, rand());
        puff.scale.set(1.8 + rand(), 1 + rand() * 0.5, 1.4);
        cloud.add(puff);
      }
      const a = rand() * Math.PI * 2;
      const r = 28 + rand() * 40;
      // Облака вокруг каждого острова: первые 14 — домашний, дальше ледяной и огненный
      const ox = i < 14 ? 0 : i < 24 ? 70 : 140;
      cloud.position.set(ox + Math.cos(a) * r, -6 + rand() * 22, Math.sin(a) * r);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  // Объект, который можно собрать: у него есть collider, который выключается, пока ресурс "отрастает"
  // r — радиус для расстановки (чтобы мир не менялся), collideR — радиус, через который не пройти
  addNode(type, obj, x, z, r, collideR = r) {
    const collider = { x, z, r: collideR, pr: r, active: true };
    this.colliders.push(collider);
    this.nodes.push({ type, obj, x, z, collider, active: true, respawnAt: 0 });
  }

  isFree(x, z, margin = 0) {
    if (this.reserved.some(p => Math.hypot(x - p.x, z - p.z) < p.r)) return false; // площадки и порталы
    return !this.colliders.some(c => c.active && Math.hypot(x - c.x, z - c.z) < (c.pr ?? c.r) + margin);
  }

  // Находится ли точка на острове (с отступом от края)
  onIsland(x, z, inset = 0) {
    return ISLANDS.some(i => Math.hypot(x - i.x, z - i.z) <= i.r - inset);
  }

  // Ближайшее свободное место рядом с точкой (для появления существ и врагов)
  findFree(x, z, margin = 1.2) {
    for (let r = 0; r <= 10; r++) {
      const steps = r === 0 ? 1 : r * 6;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
        if (this.onIsland(cx, cz, 1.5) && this.isFree(cx, cz, margin)) return { x: cx, z: cz };
      }
    }
    return { x, z };
  }

  // Какой остров под точкой (id) или null. Платформы и мосты за краем засчитываются ближайшему острову.
  islandIdAt(x, z) {
    let best = null, bestD = Infinity;
    for (const i of ISLANDS) {
      const d = Math.hypot(x - i.x, z - i.z) - i.r;
      if (d < 8 && d < bestD) { bestD = d; best = i.id; }
    }
    return best;
  }

  // Ближайший портал, до которого можно дотянуться (расстояние до края портала)
  nearestPortal(pos, range = 2.2) {
    let best = null, bestD = range;
    for (const p of this.portals) {
      const d = Math.hypot(pos.x - p.x, pos.z - p.z) - p.r;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best ? { portal: best, dist: bestD } : null;
  }

  // Сон: сразу наступает утро (если уже за полночь, новые сутки не считаем второй раз)
  skipToMorning() {
    if (this.day > 0.2) this.dayCount++;
    this.day = 0.02;
    this.applyLighting();
  }

  // Высота земли в точке; null — за краем острова (падение)
  groundAt(x, z) {
    let y = this.onIsland(x, z) ? GROUND_Y : null;
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
      if (!c.active || c.placeOnly) continue;
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
    const before = this.day;
    this.day = (this.day + dt / DAY_LENGTH) % 1;
    if (this.day < before) this.dayCount++;
    this.applyLighting();
    this.crystals.forEach((c, i) => {
      c.rotation.y += dt;
      c.position.y = GROUND_Y + 1 + Math.sin(this.time * 2 + i) * 0.12;
    });
    this.portalRings.forEach(p => { p.rotation.z += dt * 0.8; });
    this.clouds.forEach((c, i) => {
      c.position.x += dt * (0.3 + (i % 3) * 0.1);
      if (c.position.x > 210) c.position.x = -70;
    });
  }
}
