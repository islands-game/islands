import * as THREE from 'three';
import { MERCHANT } from '../config/upgrades.js';
import { FOODS, FOOD_ORDER } from '../config/food.js';
import { RESOURCES } from '../config/resources.js';
import { todayKey } from './Realms.js';
import { t } from '../config/i18n.js';
import { events } from '../core/Events.js';
import { ITEMS, SLOTS, SHOP, SELL_RATIO, NEUTRAL } from '../config/items.js';
import { ELEMENT_ORDER } from '../config/heroes.js';
import { itemName, itemBonus } from '../inventory/Items.js';

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
    this.earned = 0;          // сколько золота заплатил сегодня (за ресурсы и за проданные предметы вместе)
    this.bought = [];         // какие предметы дня уже куплены
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
    if (d !== this.day) { this.day = d; this.earned = 0; this.bought = []; }
  }

  price(item) {
    return Math.max(1, Math.round(MERCHANT.base[item] * priceMul(item, this.day)));
  }

  have(item) {
    const inv = this.game.inventory;
    return FOOD_ORDER.includes(item) ? inv.food[item] : inv.items[item];
  }

  // Предметы дня: одинаковые у всех игроков в один день (зависят от даты). Первый — простой и дешёвый.
  stock() {
    const used = new Set();
    return Array.from({ length: SHOP.size }, (_, i) => {
      let id, n = 0;
      do {
        const h = hash(`${this.day}:shop:${i}:${n++}`);
        const slot = i === 0 ? ['weapon', 'armor'][h % 2] : SLOTS[h % SLOTS.length];       // первый (дешёвый) предмет всегда оружие или броня: их можно надеть с 5 уровня
        const el = i === 0 ? NEUTRAL : ELEMENT_ORDER[(h >>> 4) % ELEMENT_ORDER.length];
        id = `${slot}_${el}_${i === 0 ? 1 : SHOP.tiers[i]}`;
      } while (used.has(id) && n < 30);
      used.add(id);
      const steps = Math.round((SHOP.mulMax - SHOP.mulMin) * 10);
      const mul = +(SHOP.mulMin + (hash(`${this.day}:shopmul:${i}`) % (steps + 1)) / 10).toFixed(1);
      return { i, id, mul, price: Math.max(1, Math.round(ITEMS[id].price * mul)) };
    });
  }

  sellPrice(id) {
    return Math.max(1, Math.floor(ITEMS[id].price * SELL_RATIO));
  }

  buyItem(i) {
    this.rollDay();
    const g = this.game;
    const row = this.stock()[i];
    if (!row || this.bought.includes(i)) return;
    if (g.items.full) return g.ui.toast(t('items.bagFull'));
    if (!g.inventory.spend({ gold: row.price })) return g.ui.toast(t('merchant.noGoldBuy'));
    g.items.add(row.id);
    this.bought.push(i);
    events.emit('collect');
    events.emit('buyItem');
  }

  // Продать предмет из сумки. Деньги идут из того же дневного лимита, что и за ресурсы (золото на острове не должно литься рекой)
  sellItem(index) {
    this.rollDay();
    const g = this.game;
    const id = g.items.bag[index];
    if (!id) return;
    const price = this.sellPrice(id);
    const room = Math.max(0, MERCHANT.dailyGold - this.earned);
    if (price > room) return g.ui.toast(t('merchant.noGold'));
    if (g.inventory.room('gold') < price) return g.ui.toast(`${t('bagFull')}: ${t('res.gold')}`);
    g.items.drop(index);
    const gold = g.inventory.add('gold', price);
    this.earned += price;
    g.ui.floatText(g.player.pos.clone().setY(2.4), `+${gold} ${RESOURCES.gold.icon}`, '#ffd23f');
    events.emit('collect');
    events.emit('sell', 1);
  }

  view() {
    this.rollDay();
    const gold = this.game.inventory.items.gold;
    const left = Math.max(0, MERCHANT.dailyGold - this.earned);
    return {
      shop: this.stock().map(r => ({
        i: r.i, name: itemName(ITEMS[r.id]), bonus: itemBonus(ITEMS[r.id]), price: r.price, mul: r.mul,
        bought: this.bought.includes(r.i), canBuy: !this.bought.includes(r.i) && gold >= r.price && !this.game.items.full,
      })),
      sellItems: this.game.items.bag.map((id, index) => {
        const price = this.sellPrice(id);
        return { index, name: itemName(ITEMS[id]), bonus: itemBonus(ITEMS[id]), price, canSell: price <= left };
      }),
      left,
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
    events.emit('sell', n);
  }

  toSave() {
    return { day: this.day, earned: this.earned, bought: [...this.bought] };
  }

  fromSave(data) {
    this.day = typeof data?.day === 'string' ? data.day : todayKey();
    this.earned = Number.isFinite(data?.earned) ? Math.max(0, Math.min(500, Math.floor(data.earned))) : 0;
    this.bought = (Array.isArray(data?.bought) ? data.bought : []).filter(n => Number.isInteger(n) && n >= 0 && n < SHOP.size);
    this.rollDay();
  }
}
