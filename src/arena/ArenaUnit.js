import * as THREE from 'three';
import { HealthBar } from '../combat/HealthBar.js';
import { HEROES } from '../config/heroes.js';
import { buildHeroModel } from '../player/HeroModels.js';

// Цвет полоски здоровья = команда (красный на красном теле не виден, поэтому цвета яркие и с белой рамкой)
const BAR_COLOR = { blue: 0x2fd0ff, red: 0xff3b30, neutral: 0xffd23f };

// Участники матча: герои, крипы, башни, кристаллы, лесные монстры и короли.
// Общие геометрии и материалы используются повторно — так арена работает и на слабых телефонах.
export const TEAM_COLOR = { blue: 0x4a8dff, red: 0xff5a5a, neutral: 0xb8a56a };

const G = {
  sphere: new THREE.SphereGeometry(0.45, 10, 8),
  octa: new THREE.OctahedronGeometry(0.5, 0),
  capsule: new THREE.CapsuleGeometry(0.4, 0.6, 3, 8),
  head: new THREE.SphereGeometry(0.32, 10, 8),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  blob: new THREE.SphereGeometry(0.7, 12, 10),
  eye: new THREE.SphereGeometry(0.1, 6, 6),
};
const mats = new Map();
const mat = (color, extra = {}) => {
  const key = `${color}:${JSON.stringify(extra)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return mats.get(key);
};
const mesh = (geo, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};

// Модели
function minionModel(team, ranged) {
  const g = new THREE.Group();
  g.add(mesh(ranged ? G.octa : G.sphere, mat(TEAM_COLOR[team]), 0, 0.5, 0, 1, ranged ? 1.3 : 0.9, 1));
  return g;
}
function towerModel(team, tier) {
  const g = new THREE.Group();
  const h = tier === 2 ? 4.4 : 3.6;
  g.add(mesh(G.cylinder, mat(0x8a8f98), 0, h / 2, 0, 1.1, h, 1.1));
  g.add(mesh(G.cone, mat(TEAM_COLOR[team]), 0, h + 0.7, 0, 1.5, 1.5, 1.5));
  return g;
}
function crystalModel(team) {
  const g = new THREE.Group();
  g.add(mesh(G.cylinder, mat(0x6a6f78), 0, 0.4, 0, 2.2, 0.8, 2.2));
  g.add(mesh(G.octa, mat(TEAM_COLOR[team], { emissive: TEAM_COLOR[team] === TEAM_COLOR.blue ? 0x123a7a : 0x7a1212 }), 0, 3, 0, 3.2, 5.2, 3.2));
  return g;
}
function monsterModel(team) {
  const g = new THREE.Group();
  g.add(mesh(G.cylinder, mat(0x5a3a22), 0, 0.7, 0, 0.4, 1.4, 0.4));
  const crown = mesh(G.cone, mat(team === 'neutral' ? 0x2d6b3a : TEAM_COLOR[team]), 0, 2.2, 0, 1.2, 2.2, 1.2);
  g.add(crown);
  g.userData.crown = crown;
  g.add(mesh(G.eye, mat(0xff3030), -0.2, 1.2, 0.35), mesh(G.eye, mat(0xff3030), 0.2, 1.2, 0.35));
  return g;
}
function kingModel(color) {
  const g = new THREE.Group();
  g.add(mesh(G.blob, mat(color), 0, 0.55, 0, 1, 0.8, 1));
  g.add(mesh(G.eye, mat(0x222222), -0.25, 0.8, 0.58), mesh(G.eye, mat(0x222222), 0.25, 0.8, 0.58));
  for (const x of [-0.3, 0, 0.3]) g.add(mesh(G.cone, mat(0xffd23f, { emissive: 0x664400 }), x, 1.25, 0, 0.12, x === 0 ? 0.55 : 0.4, 0.12));
  return g;
}

// Юнит. kind: hero | minion | tower | crystal | monster | king
export class Unit {
  constructor(sys, kind, team, s, x, z) {
    this.sys = sys;
    this.kind = kind;
    this.team = team;
    this.pos = new THREE.Vector3(x, 0, z);
    this.maxHp = s.hp;
    this.hp = s.hp;
    this.atk = s.atk ?? 0;
    this.range = s.range ?? 0;
    this.speed = s.speed ?? 0;
    this.cooldown = s.cooldown ?? 1;
    this.radius = s.radius ?? 0.5;
    this.atkCd = Math.random() * 0.5;
    this.dead = false;
    this.owner = null;        // чей спутник (лесной монстр, король)
    this.shielded = false;    // неуязвима (башня, пока не разрушена предыдущая)
    this.flash = 0;
    this.facing = 0;
    this.s = s;
    this.t = Math.random() * 6;

    const scale = s.scale ?? 1;
    // body вращается в сторону движения, mesh (с полоской здоровья) — нет
    if (s.external) this.body = new THREE.Group();            // игрок: модель героя уже есть у самого игрока
    else if (kind === 'hero') this.body = buildHeroModel(HEROES[s.heroId].cls, HEROES[s.heroId].element, TEAM_COLOR[team]);
    else if (kind === 'minion') this.body = minionModel(team, s.ranged);
    else if (kind === 'tower') this.body = towerModel(team, s.tier);
    else if (kind === 'crystal') this.body = crystalModel(team);
    else if (kind === 'monster') this.body = monsterModel(team);
    else this.body = kingModel(s.color);
    this.mesh = new THREE.Group();
    this.mesh.add(this.body);
    this.mesh.scale.setScalar(scale);
    this.mesh.position.copy(this.pos);

    // Полоска здоровья (у минионов видна только когда они ранены)
    const w = { hero: 1.5, minion: 1, tower: 2.4, crystal: 3.2, monster: 1.4, king: 3.2 }[kind];
    this.bar = new HealthBar(w, true);
    this.bar.setColor(BAR_COLOR[team] ?? BAR_COLOR.neutral);
    this.bar.group.position.y = { hero: 2.5, minion: 1.4, tower: 6.2, crystal: 6.8, monster: 3.2, king: 3.2 }[kind];
    this.bar.group.scale.setScalar(1 / scale);
    this.mesh.add(this.bar.group);
    sys.scene.add(this.mesh);
    if (s.external) this.pos.copy(s.external.pos);
  }

  get alive() {
    return !this.dead;
  }

  // Смена стороны (лесной монстр или король победили — и теперь на стороне победителя)
  setTeam(team) {
    this.team = team;
    this.bar.setColor(BAR_COLOR[team] ?? BAR_COLOR.neutral);
    const crown = this.mesh.userData.crown;
    if (crown) crown.material = mat(TEAM_COLOR[team]);
  }

  // Возвращает фактический урон
  takeDamage(amount, source) {
    if (this.dead || this.shielded) return 0;
    this.flash = 0.12;
    this.lastHurt = this.sys.time;
    if (source && source !== this) this.lastAttacker = source;   // нейтралы мстят обидчику
    const player = this.s.external;
    let dealt = amount;
    if (player) {                       // герой-игрок: щит спутника и полоска здоровья берутся у самого игрока
      dealt = player.takeDamage(amount).dealt;
      this.hp = player.hp;
      this.sys.ui.flashHurt();
    } else {
      amount *= this.s.dmgTaken ?? 1;           // земля: меньше получаемого урона
      if (this.shieldAmt > 0) {            // щит от умений поглощает урон
        const absorbed = Math.min(this.shieldAmt, amount);
        this.shieldAmt -= absorbed;
        amount -= absorbed;
      }
      this.hp = Math.max(0, this.hp - amount);
    }
    if (this.hp <= 0) this.sys.killUnit(this, source);
    return dealt;
  }

  heal(amount) {
    const player = this.s.external;
    if (player) { player.heal(amount); this.hp = player.hp; return; }
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  syncMesh(dt, camera) {
    this.t += dt;
    if (this.s.external) this.pos.copy(this.s.external.pos);
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.body.rotation.y = this.facing;
    this.flash = Math.max(0, this.flash - dt);
    const tint = this.flash > 0 ? 1.6 : 1;
    this.body.scale.setScalar(tint > 1 ? 1.08 : 1); // вспышка при попадании
    this.bar.set(this.hp / this.maxHp);
    if (this.kind !== 'minion') this.bar.group.visible = !this.dead;
    this.bar.face(camera);
  }

  dispose() {
    this.sys.scene.remove(this.mesh);
  }
}
