import * as THREE from 'three';
import { FISHING, FISH_REWARD, rollFish } from '../config/fishing.js';
import { ISLANDS, BEACH, WATER_Y } from './World.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

const bobberGeo = new THREE.SphereGeometry(0.2, 8, 6);
const bobberMat = new THREE.MeshLambertMaterial({ color: 0xff4a4a, emissive: 0x551111 });
const bubbleGeo = new THREE.RingGeometry(0.55, 0.85, 16).rotateX(-Math.PI / 2);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// Рыбалка героя: забросить (Действие) → ждать поклёвку → подсечь (Действие) → улов.
// Места клёва — пузыри на воде у берега: рядом с ними рыба идёт лучше и ждать меньше.
export class Fishing {
  constructor(game) {
    this.game = game;
    this.state = 'idle';           // idle | wait | bite
    this.t = 0;
    this.target = null;
    this.from = new THREE.Vector3();
    this.time = 0;
    const scene = game.world.scene;
    this.bobber = new THREE.Mesh(bobberGeo, bobberMat);
    this.bobber.visible = false;
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.line.visible = false;
    this.line.frustumCulled = false;
    scene.add(this.bobber, this.line);
    this.buildSpots(scene);
  }

  // Места клёва: по нескольку у каждого острова (кроме арены), в воде за пляжем. Все пузыри — один InstancedMesh.
  buildSpots(scene) {
    this.spots = [];
    for (const isl of ISLANDS) {
      if (isl.id === 'arena') continue;
      for (let k = 0; k < FISHING.hotPerIsland; k++) {
        const a = (k / FISHING.hotPerIsland) * Math.PI * 2 + (isl.seed % 7) * 0.37;
        this.spots.push({ x: isl.x + Math.cos(a) * (isl.r + BEACH + 3.2), z: isl.z + Math.sin(a) * (isl.r + BEACH + 3.2), phase: k + isl.seed });
      }
    }
    this.bubbles = new THREE.InstancedMesh(bubbleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }), this.spots.length);
    this.bubbles.frustumCulled = false;
    this.bubbles.renderOrder = 1;
    scene.add(this.bubbles);
  }

  get busy() {
    return this.state !== 'idle';
  }

  nearIsland(x, z) {
    return ISLANDS.some(i => i.id !== 'arena' && Math.hypot(x - i.x, z - i.z) < i.r + BEACH + 7);
  }

  hotNear(x, z) {
    return this.spots.some(s => Math.hypot(x - s.x, z - s.z) < FISHING.hotRadius);
  }

  // Куда можно забросить удочку: вода перед героем у берега. null — нельзя.
  castTarget() {
    const g = this.game, p = g.player, w = g.world;
    if (g.arena.active || p.dead || p.inside || w.groundAt(p.pos.x, p.pos.z) === null) return null;
    for (const d of FISHING.castDist) {
      const x = p.pos.x + Math.sin(p.facing) * d, z = p.pos.z + Math.cos(p.facing) * d;
      if (w.groundAt(x, z) === null && this.nearIsland(x, z)) return { x, z };
    }
    return null;
  }

  promptText() {
    return t(this.state === 'bite' ? 'fish.reel' : this.state === 'wait' ? 'fish.pull' : 'fish.cast');
  }

  // Нажатие «Действие» у воды
  act() {
    const g = this.game;
    if (this.state === 'idle') {
      const target = this.castTarget();
      if (!target) return;
      this.target = target;
      this.from.copy(g.player.pos);
      const hot = this.hotNear(target.x, target.z);
      this.state = 'wait';
      this.t = (FISHING.waitMin + Math.random() * (FISHING.waitMax - FISHING.waitMin)) * (hot ? FISHING.hotWaitMul : 1);
      this.bobber.visible = this.line.visible = true;
      this.bobber.position.set(target.x, WATER_Y + 0.05, target.z);
      g.combat.ring({ x: target.x, y: 0, z: target.z }, 0xffffff, 1.2, 0.5);
      events.emit('swing');
    } else if (this.state === 'wait') {
      this.cancel();
      g.ui.toast(t('fish.canceled'));
    } else if (this.state === 'bite') {
      this.catchFish();
    }
  }

  cancel() {
    this.state = 'idle';
    this.bobber.visible = this.line.visible = false;
  }

  // Улов: условия (ночь, место клёва, пирс, остров стихии) меняют шансы редкой рыбы и сундучка
  catchFish() {
    const g = this.game, p = g.player;
    const opts = {
      night: g.world.isNight, hot: this.hotNear(this.target.x, this.target.z),
      pier: p.pos.y > 0.05, island: g.world.islandIdAt(p.pos.x, p.pos.z) !== 'home',
    };
    const kind = rollFish(opts);
    this.cancel();
    this.give(kind, p.pos);
  }

  // Выдать улов герою (kind: common | rare | chest)
  give(kind, at) {
    const g = this.game, R = FISH_REWARD[kind];
    const pos = at.clone ? at.clone() : at;
    events.emit('collect');
    if (kind === 'chest') {
      const a = R.wood, b = R.stone;
      const wood = g.inventory.add('wood', a[0] + Math.floor(Math.random() * (a[1] - a[0] + 1)));
      const stone = g.inventory.add('stone', b[0] + Math.floor(Math.random() * (b[1] - b[0] + 1)));
      g.ui.floatText(pos.clone().setY(2.6), `${t('fish.chest')} +${wood}🌲 +${stone}⛰`, '#ffe066');
      if (Math.random() < R.itemChance) g.giveDrop({ element: null, tiers: [1, 1] }, pos);
    } else {
      const got = g.inventory.addFood('fish', R.fish);
      if (got <= 0) g.ui.toast(`${t('bagFull')}: ${t('food.fish')}`);
      else g.ui.floatText(pos.clone().setY(2.6), `${kind === 'rare' ? '✨ ' : ''}+${got} 🐟`, kind === 'rare' ? '#ffe066' : '#ffffff');
    }
    g.stats.collected++;
    g.gainXp(R.xp);
  }

  update(dt) {
    this.time += dt;
    // Пузыри на местах клёва покачиваются
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i], k = 0.85 + 0.2 * Math.sin(this.time * 2 + s.phase);
      _p.set(s.x, WATER_Y + 0.06, s.z); _s.set(k, 1, k);
      this.bubbles.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    this.bubbles.instanceMatrix.needsUpdate = true;

    if (this.state === 'idle') return;
    const g = this.game, p = g.player;
    // Отошёл, умер или ушёл в бой: удочка убирается
    if (p.dead || Math.hypot(p.pos.x - this.from.x, p.pos.z - this.from.z) > FISHING.moveCancel || g.arena.active) return this.cancel();
    if (this.state === 'wait') {
      this.t -= dt;
      this.bobber.position.y = WATER_Y + 0.05 + Math.sin(this.time * 3) * 0.04;
      if (this.t <= 0) {
        this.state = 'bite';
        this.t = FISHING.biteWindow;
        g.ui.toast(t('fish.bite'));
        g.combat.ring({ x: this.target.x, y: 0, z: this.target.z }, 0xffe066, 2, 0.4);
        events.emit('quest');
      }
    } else if (this.state === 'bite') {
      this.t -= dt;
      this.bobber.position.y = WATER_Y - 0.1 + Math.sin(this.time * 25) * 0.08;      // поплавок дёргается
      if (this.t <= 0) { this.cancel(); g.ui.toast(t('fish.escaped')); }
    }
    // Леска от руки героя к поплавку
    const a = this.line.geometry.attributes.position;
    a.setXYZ(0, p.pos.x + Math.sin(p.facing) * 0.4, p.pos.y + 1.3, p.pos.z + Math.cos(p.facing) * 0.4);
    a.setXYZ(1, this.bobber.position.x, this.bobber.position.y, this.bobber.position.z);
    a.needsUpdate = true;
  }
}
