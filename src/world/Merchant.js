import * as THREE from 'three';
import { MERCHANT } from '../config/upgrades.js';
import { FOODS, FOOD_ORDER } from '../config/food.js';
import { RESOURCES } from '../config/resources.js';
import { todayKey } from './Realms.js';
import { t } from '../config/i18n.js';
import { events } from '../core/Events.js';

const SELL_ORDER = ['wood', 'stone', ...FOOD_ORDER];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Множитель цены на день: от mulMin до mulMax с шагом 0.1, одинаков у всех игроков (зависит от даты)
export function priceMul(item, day = todayKey()) {
  const steps = Math.round((MERCHANT.mulMax - MERCHANT.mulMin) * 10);
  return +(MERCHANT.mulMin + (hash(`${day}:${item}`) % (steps + 1)) / 10).toFixed(1);
}

// Торговец-путешественник на домашнем острове: покупает лишнее дерево, камень и еду за золото.
// Цены меняются каждый день. Больше dailyGold золота в сутки не платит.
export class Merchant {
  constructor(game) {
    this.game = game;
    this.day = todayKey();
    this.earned = 0;          // сколько золота заплатил сегодня
    const spot = game.world.findFree(4.5, -4.5, 1.8);
    game.world.clearArea(spot.x - 1.8, spot.z - 1.8, spot.x + 1.8, spot.z + 1.8);
    this.pos = { x: spot.x, z: spot.z };
    const g = new THREE.Group();
    const lam = (c, e = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...e });
    const cart = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 1.1), lam(0x8b5a2b)); cart.position.set(0, 0.75, 0);
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.8, 8, 1, false, 0, Math.PI), lam(0xe0a030)); cover.rotation.z = Math.PI / 2; cover.position.set(0, 1.25, 0);
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.12, 10);
    for (const sx of [-0.7, 0.7]) { const w = new THREE.Mesh(wheelGeo, lam(0x4a3a2a)); w.rotation.x = Math.PI / 2; w.position.set(sx, 0.4, 0.62); g.add(w); const w2 = w.clone(); w2.position.z = -0.62; g.add(w2); }
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 3, 8), lam(0x2f6bd1)); body.position.set(1.5, 0.75, 0.2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), lam(0xffd9b3)); head.position.set(1.5, 1.5, 0.2);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.45, 8), lam(0xd9534f)); hat.position.set(1.5, 1.9, 0.2);
    g.add(cart, cover, body, head, hat);
    g.position.set(this.pos.x, 0, this.pos.z);
    g.rotation.y = Math.PI * 0.25;
    game.world.scene.add(g);
    this.mesh = g;
    game.world.colliders.push({ x: this.pos.x, z: this.pos.z, r: 1.3, pr: 1.6, active: true });
  }

  near(pos, range = 3) {
    return Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z) < range;
  }

  rollDay() {
    const d = todayKey();
    if (d !== this.day) { this.day = d; this.earned = 0; }
  }

  price(item) {
    return Math.max(1, Math.round(MERCHANT.base[item] * priceMul(item, this.day)));
  }

  have(item) {
    const inv = this.game.inventory;
    return FOOD_ORDER.includes(item) ? inv.food[item] : inv.items[item];
  }

  view() {
    this.rollDay();
    return {
      left: Math.max(0, MERCHANT.dailyGold - this.earned),
      rows: SELL_ORDER.map(k => ({
        key: k, icon: FOODS[k]?.icon ?? RESOURCES[k].icon, name: t(FOODS[k] ? 'food.' + k : 'res.' + k),
        price: this.price(k), have: this.have(k), mul: priceMul(k, this.day),
      })),
    };
  }

  // Продать amount штук (или всё, что влезает в дневной лимит золота)
  sell(item, all) {
    this.rollDay();
    const g = this.game, inv = g.inventory;
    const price = this.price(item);
    const room = Math.max(0, MERCHANT.dailyGold - this.earned);
    const n = Math.min(all ? this.have(item) : 1, Math.floor(room / price));
    if (n <= 0) return g.ui.toast(this.have(item) <= 0 ? t('merchant.noItem') : t('merchant.noGold'));
    if (FOOD_ORDER.includes(item)) inv.food[item] -= n; else inv.items[item] -= n;
    const gold = inv.add('gold', n * price);
    this.earned += n * price;
    g.ui.floatText(g.player.pos.clone().setY(2.4), `+${gold} ${RESOURCES.gold.icon}`, '#ffd23f');
    events.emit('collect');
  }

  toSave() {
    return { day: this.day, earned: this.earned };
  }

  fromSave(data) {
    this.day = typeof data?.day === 'string' ? data.day : todayKey();
    this.earned = Number.isFinite(data?.earned) ? Math.max(0, Math.min(500, Math.floor(data.earned))) : 0;
    this.rollDay();
  }
}
