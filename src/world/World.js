import * as THREE from 'three';
import { events } from '../core/Events.js';
import { BUILDINGS } from '../config/buildings.js';
import { buildModel } from '../building/BuildingModels.js';
import { structureRects, interiorRect, bedPosition } from '../building/Structures.js';
import { buildArenaMap } from '../arena/ArenaMap.js';

export const DAY_LENGTH = 240; // сколько секунд длятся целые сутки
const SKY_DAY = new THREE.Color(0x8fd3ff);
const SKY_DUSK = new THREE.Color(0xff9a6b);
const SKY_NIGHT = new THREE.Color(0x101a40);
const _sky = new THREE.Color();

export const ISLAND_RADIUS = 28; // радиус домашнего острова (был 14: острову не хватало места под постройки)
export const GROUND_Y = 0;
export const WALK_Y = 0.1; // высота платформ и мостов
export const WATER_Y = -0.45;   // уровень моря: острова лежат в воде
export const BEACH = 2;         // ширина песчаного пляжа вокруг острова (по нему можно ходить)
const SEA_SIZE = 240, SEA_CELLS = 40;

// Острова мира. Чтобы добавить новый остров: допиши запись сюда, портал в PORTALS,
// врагов в config/enemies.js (ENEMY_SPAWNS) и, если хочешь, существо в config/creatures.js.
//   x, z, r — центр и радиус;  spawn — где появляется герой;  seed — "зерно" расстановки деревьев и камней
//   trees / rocks / gold — сколько деревьев, камней и золотых жил (на домашнем острове золота нет);  colors — краски острова
export const ISLANDS = [
  {
    id: 'home', x: 0, z: 0, r: 28, spawn: { x: 0, z: 6 }, seed: 42,
    trees: 34, rocks: 16, gold: 0,
    colors: { grass: 0x6cd05a, rock: 0x8a6f55, trunk: 0x7a4e2d, leaf: 0x2f9e44, stone: 0x9aa0a6, crystal: 0xffc93c, glow: 0x2aa9c9, pad: 0xe9dfae },
  },
  {
    id: 'ice', x: 70, z: 0, r: 12, spawn: { x: 70, z: 4 }, seed: 99, nameKey: 'island.ice',
    trees: 10, rocks: 8, gold: 9,
    colors: { grass: 0xeaf6ff, rock: 0x7aa6c4, trunk: 0x8a9db0, leaf: 0xcfeaff, stone: 0xa8c4d8, crystal: 0xffc93c, glow: 0x4aa8e0, pad: 0xbfe3ff },
  },
  {
    id: 'fire', x: 140, z: 0, r: 12, spawn: { x: 140, z: 4 }, seed: 123, nameKey: 'island.fire',
    trees: 8, rocks: 10, gold: 8,
    colors: { grass: 0x4a3535, rock: 0x7a2a1a, trunk: 0x2a1a1a, leaf: 0x8a3a1f, stone: 0x5a4545, crystal: 0xffc93c, glow: 0xff4a00, pad: 0x8a5a4a },
  },
  {
    id: 'water', x: 210, z: 0, r: 12, spawn: { x: 210, z: 4 }, seed: 211, nameKey: 'island.water',
    trees: 8, rocks: 6, gold: 9,
    colors: { grass: 0x5ec4d8, rock: 0x3a7a9a, trunk: 0x4a6a7a, leaf: 0x2f9ea8, stone: 0x8ab4c8, crystal: 0xffc93c, glow: 0x2a8ad0, pad: 0xbfe8f5 },
  },
  {
    id: 'earth', x: -70, z: 0, r: 12, spawn: { x: -70, z: 4 }, seed: 311, nameKey: 'island.earth',
    trees: 10, rocks: 12, gold: 6,
    colors: { grass: 0x8a9a4a, rock: 0x6a4a2a, trunk: 0x5a3a1a, leaf: 0x6a8a2a, stone: 0x8a7a60, crystal: 0xffc93c, glow: 0xa07030, pad: 0xc8b080 },
  },
  {
    id: 'air', x: -140, z: 0, r: 12, spawn: { x: -140, z: 4 }, seed: 411, nameKey: 'island.air',
    trees: 6, rocks: 6, gold: 10,
    colors: { grass: 0xe8f6f0, rock: 0x9ab8c0, trunk: 0xb0c8d0, leaf: 0xd8f0e8, stone: 0xc0d4d8, crystal: 0xffc93c, glow: 0x9ae0d0, pad: 0xf0fcf8 },
  },
  {
    id: 'arena', x: 300, z: 0, r: 58, spawn: { x: 300, z: 44 }, seed: 5, nameKey: 'island.arena',
    trees: 0, rocks: 0, gold: 0,
    colors: { grass: 0x5f9a58, rock: 0x6a5a4a, trunk: 0x6a4a2a, leaf: 0x2f9e44, stone: 0x9aa0a6, crystal: 0xffc93c, glow: 0x2aa9c9, pad: 0x9cc2ff },
  },
];

// Порталы стихий и арены стоят по берегу домашнего острова (на разных сторонах, разного цвета):
// центр острова остаётся свободным для хозяйства. shore(угол) считает место на берегу и поворот лицом к центру.
const HOME_PORTAL_R = 25.5;
function shore(deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const x = +(c * HOME_PORTAL_R).toFixed(2), z = +(s * HOME_PORTAL_R).toFixed(2);
  return { x, z, rot: +Math.atan2(-x, -z).toFixed(3), inside: { x: +(c * (HOME_PORTAL_R - 3.4)).toFixed(2), z: +(s * (HOME_PORTAL_R - 3.4)).toFixed(2) } };
}
export const HOME_SHORE = { arena: shore(0), ice: shore(60), fire: shore(120), earth: shore(180), air: shore(240), water: shore(300) };
const H = HOME_SHORE;

// Порталы между островами: x, z — где стоит портал, dest — куда он переносит героя
// recLevel — рекомендуемый уровень героя (портал предупредит, если уровень ниже); shore — портал на берегу (с фонарями и дорожкой)
export const PORTALS = [
  // Лёд, огонь, земля, вода, воздух: у каждой стихии свой остров с королём, который охраняет зверя дня (config/realms.js)
  { x: H.ice.x, z: H.ice.z, rot: H.ice.rot, color: 0xb388ff, glow: 0x6a3fd1, dest: { x: 70, z: 4 }, nameKey: 'island.ice', recLevel: 3, shore: true },
  { x: 70, z: -7, rot: 0.4, color: 0x8fe3ff, glow: 0x2a9fd0, dest: H.ice.inside, nameKey: 'island.home' },
  { x: H.fire.x, z: H.fire.z, rot: H.fire.rot, color: 0xff9a4a, glow: 0xd04a10, dest: { x: 140, z: 4 }, nameKey: 'island.fire', recLevel: 6, shore: true },
  { x: 140, z: -7, rot: 0.4, color: 0xffb070, glow: 0xd04a10, dest: H.fire.inside, nameKey: 'island.home' },
  { x: H.earth.x, z: H.earth.z, rot: H.earth.rot, color: 0xd8b070, glow: 0xa07030, dest: { x: -70, z: 4 }, nameKey: 'island.earth', recLevel: 2, shore: true },
  { x: -70, z: -7, rot: 0.4, color: 0xd8b070, glow: 0xa07030, dest: H.earth.inside, nameKey: 'island.home' },
  { x: H.water.x, z: H.water.z, rot: H.water.rot, color: 0x5ac8ff, glow: 0x1a7ad0, dest: { x: 210, z: 4 }, nameKey: 'island.water', recLevel: 3, shore: true },
  { x: 210, z: -7, rot: 0.4, color: 0x8fe3ff, glow: 0x2a9fd0, dest: H.water.inside, nameKey: 'island.home' },
  { x: H.air.x, z: H.air.z, rot: H.air.rot, color: 0xbff0e0, glow: 0x5ac8b0, dest: { x: -140, z: 4 }, nameKey: 'island.air', recLevel: 4, shore: true },
  { x: -140, z: -7, rot: 0.4, color: 0xbff0e0, glow: 0x5ac8b0, dest: H.air.inside, nameKey: 'island.home' },
  // Арена 5 на 5: портал на берегу домашнего острова и обратный портал у синей базы
  { x: H.arena.x, z: H.arena.z, rot: H.arena.rot, color: 0x6aa8ff, glow: 0x1a4aa0, dest: { x: 300, z: 44 }, nameKey: 'island.arena', shore: true },
  { x: 288, z: 50, rot: 0.4, color: 0x8fe3ff, glow: 0x2a9fd0, dest: H.arena.inside, nameKey: 'island.home' },
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
    this.sea = null;
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
    for (const p of PORTALS) if (Math.hypot(p.x, p.z) > 25) this.reserved.push({ x: p.x, z: p.z, r: 3 });

    scene.background = new THREE.Color(0x8fd3ff);
    scene.fog = new THREE.Fog(0x8fd3ff, 40, 140);

    this.buildLights();
    for (const island of ISLANDS) {
      this.buildIsland(island);
      this.buildProps(island);
    }
    this.buildHouse();
    for (const p of PORTALS) if (p.shore) this.clearArea(p.x - 3, p.z - 3, p.x + 3, p.z + 3);
    buildArenaMap(scene);
    for (const p of PORTALS) this.buildPortal(p);
    this.buildClouds();
    this.buildSea();
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

    // Пляж и пена вокруг острова: остров лежит в море (арена огорожена стенами, у неё пляжа нет)
    if (island.id !== 'arena') {
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(r + BEACH, r + BEACH + 0.5, 1, 32), new THREE.MeshLambertMaterial({ color: colors.pad, flatShading: true }));
      sand.position.set(x, GROUND_Y - 0.52, z);
      this.scene.add(sand);
      const foam = new THREE.Mesh(new THREE.RingGeometry(r + BEACH + 0.45, r + BEACH + 1.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
      foam.position.set(x, WATER_Y + 0.03, z);
      foam.renderOrder = 1;
      this.scene.add(foam);
    }

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
      color: colors.crystal, emissive: 0x7a5200, flatShading: true,    // золотая жила
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
    for (let i = 0; i < island.gold; i++) {
      const p = place(3, R - 2);
      if (!p) continue;
      const m = new THREE.Mesh(crystalGeo, crystalMat);
      m.scale.set(1, 1.8, 1);
      m.position.set(p.x, GROUND_Y + 1, p.z);
      this.scene.add(m);
      this.crystals.push(m);
      this.addNode('gold', m, p.x, p.z, 0.5);
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
    this.startStruct = this.registerStructure(def, -7, -4, 0, mesh);     // стартовый дом (его тоже можно улучшать)
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
    const rec = { solids: [], interior: null, roof: mesh.userData.roof ?? null, bed: null, lvl: 1 };
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
    if (p.shore) this.buildShoreDecor(p);
    this.portals.push({ x: p.x, z: p.z, r: 1.2, dest: p.dest, nameKey: p.nameKey, recLevel: p.recLevel ?? 1 });
  }

  // Береговой портал: две опоры с фонарями цвета портала и деревянная дорожка к воде
  buildShoreDecor(p) {
    const wood = new THREE.MeshLambertMaterial({ color: 0x8b5a2b, flatShading: true });
    const lamp = new THREE.MeshLambertMaterial({ color: p.color, emissive: p.glow, flatShading: true });
    const wx = Math.cos(p.rot), wz = -Math.sin(p.rot);          // вдоль кольца
    const ox = -Math.sin(p.rot), oz = -Math.cos(p.rot);         // от центра острова к морю
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(this.postGeo ?? (this.postGeo = new THREE.CylinderGeometry(0.14, 0.18, 2.6, 6)), wood);
      post.position.set(p.x + wx * 2.5 * side, 1.3, p.z + wz * 2.5 * side);
      const light = new THREE.Mesh(this.lampGeo ?? (this.lampGeo = new THREE.OctahedronGeometry(0.3, 0)), lamp);
      light.position.set(post.position.x, 2.85, post.position.z);
      this.scene.add(post, light);
      this.colliders.push({ x: post.position.x, z: post.position.z, r: 0.25, active: true });
    }
    const plank = new THREE.Mesh(this.plankGeo ?? (this.plankGeo = new THREE.BoxGeometry(2.2, 0.1, 4)), wood);
    plank.position.set(p.x + ox * 2.6, 0.05, p.z + oz * 2.6);
    plank.rotation.y = p.rot;
    this.scene.add(plank);
  }

  // Море: одна плоскость с лёгкими волнами, следует за героем (setSeaCenter), вдали растворяется в тумане
  buildSea() {
    const geo = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_CELLS, SEA_CELLS).rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x2f8fd0, flatShading: true }));
    this.sea.position.y = WATER_Y;
    this.sea.renderOrder = -2;
    this.scene.add(this.sea);
    this.seaBase = geo.attributes.position.array.slice();
    this.seaT = 0;
  }

  setSeaCenter(x, z) {
    const cell = SEA_SIZE / SEA_CELLS;
    this.sea.position.x = Math.round(x / cell) * cell;        // сетка двигается шагом в клетку, волны не «плывут» по воде
    this.sea.position.z = Math.round(z / cell) * cell;
  }

  animateSea(dt) {
    this.seaT += dt;
    if (this.seaT < 0.06) return;                              // волны обновляем ~16 раз в секунду
    const t = this.time, pos = this.sea.geometry.attributes.position, a = pos.array, base = this.seaBase;
    const cx = this.sea.position.x, cz = this.sea.position.z;
    for (let i = 0; i < a.length; i += 3) {
      const wx = base[i] + cx, wz = base[i + 2] + cz;
      a[i + 1] = Math.sin(wx * 0.18 + t * 1.2) * 0.1 + Math.cos(wz * 0.15 + t * 0.9) * 0.08;
    }
    pos.needsUpdate = true;
    this.seaT = 0;
  }

  // Ближайшая точка на берегу (для спасения из воды): внутри острова на 2 м от края
  shorePoint(x, z) {
    let best = null, bestD = Infinity;
    for (const i of ISLANDS) {
      if (i.id === 'arena') continue;
      const d = Math.hypot(x - i.x, z - i.z) - i.r;
      if (d < bestD) { bestD = d; best = i; }
    }
    const dx = x - best.x, dz = z - best.z, len = Math.hypot(dx, dz) || 1;
    return { x: best.x + (dx / len) * (best.r - 2), z: best.z + (dz / len) * (best.r - 2) };
  }

  buildClouds() {
    const geo = new THREE.SphereGeometry(1, 8, 6);
    // Облака полупрозрачные, висят высоко над островами и ни с чем не сталкиваются
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.45, depthWrite: false });
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
      const home = i < 14;                          // облака домашнего острова держатся дальше от большого острова
      // Облака вокруг каждого острова: первые 14 — домашний, дальше ледяной и огненный
      const ox = i < 14 ? 0 : i < 24 ? 70 : 140;
      const rr = home ? r + 20 : r;
      cloud.position.set(ox + Math.cos(a) * rr, 14 + rand() * 18, Math.sin(a) * rr);
      cloud.renderOrder = -1;
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
  islandOf(id) {
    return ISLANDS.find(i => i.id === id);
  }

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
    let y = ISLANDS.some(i => Math.hypot(x - i.x, z - i.z) <= i.r + (i.id === 'arena' ? 0 : BEACH)) ? GROUND_Y : null;     // остров и пляж вокруг него
    // Платформы и мосты — тоже земля (можно стоять и выходить за край острова)
    for (const w of this.walkables) {
      if (Math.abs(x - w.x) <= w.hw && Math.abs(z - w.z) <= w.hd) y = WALK_Y;
    }
    return y;
  }

  // Выталкивает точку из препятствий
  // team — команда на арене: свои ворота она проходит, чужие нет
  resolveCollisions(pos, radius, team = null) {
    // Прямоугольные препятствия: стены и дома
    for (const r of this.rects) {
      if (team && r.team === team) continue;
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
    if (this.timeFrozen) { this.updateVisuals(dt); return; }
    const before = this.day;
    this.day = (this.day + dt / DAY_LENGTH) % 1;
    if (this.day < before) this.dayCount++;
    this.applyLighting();
    this.updateVisuals(dt);
  }

  // Анимация: вращающиеся кристаллы, порталы, облака
  updateVisuals(dt) {
    this.crystals.forEach((c, i) => {
      c.rotation.y += dt;
      c.position.y = GROUND_Y + 1 + Math.sin(this.time * 2 + i) * 0.12;
    });
    this.portalRings.forEach(p => { p.rotation.z += dt * 0.8; });
    if (this.sea) this.animateSea(dt);
    this.clouds.forEach((c, i) => {
      c.position.x += dt * (0.3 + (i % 3) * 0.1);
      if (c.position.x > 210) c.position.x = -70;
    });
  }
}
