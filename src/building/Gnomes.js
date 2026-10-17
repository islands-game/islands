import * as THREE from 'three';
import { GNOME, wageOf } from '../config/gnomes.js';
import { hireFee } from '../config/scaling.js';
import { FARM, PEN, FOOD_ORDER, BARN_ITEMS } from '../config/food.js';
import { DEFENSE } from '../config/buildings.js';
import { UPGRADES } from '../config/upgrades.js';
import { RESOURCES } from '../config/resources.js';
import { rollFish, FISH_REWARD } from '../config/fishing.js';
import { toWorld } from './Structures.js';
import { HealthBar } from '../combat/HealthBar.js';
import { todayKey } from '../world/Realms.js';
import { t } from '../config/i18n.js';
import { events } from '../core/Events.js';

const SPEC_COLOR = { all: 0xffd23f, farmer: 0x5de08a, porter: 0xc9955a, fixer: 0x6ab0ff, lumber: 0x2f8f3a, mason: 0xb0b6c0, fisher: 0x39a7d6 };
export const SPEC_ICON = { all: '⭐', farmer: '🌱', porter: '📦', fixer: '🔧', lumber: '🪓', mason: '⛏', fisher: '🎣' };
const GATHER = { lumber: 'wood', mason: 'stone' };     // что собирает специальность

// Общие геометрии и материалы гномов
const G = {
  body: new THREE.CapsuleGeometry(0.28, 0.35, 3, 8),
  head: new THREE.SphereGeometry(0.24, 8, 6),
  hat: new THREE.ConeGeometry(0.3, 0.5, 8),
  beard: new THREE.ConeGeometry(0.2, 0.4, 6),
  dot: new THREE.SphereGeometry(0.09, 6, 5),
};
const lam = (c, e = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...e });
const M = { body: lam(0x7a4f2a), head: lam(0xffd9b3), beard: lam(0xf2f2f2), hats: {}, dots: {} };
for (const [k, c] of Object.entries(SPEC_COLOR)) { M.hats[k] = lam(c); M.dots[k] = lam(c, { emissive: c, emissiveIntensity: 0.4 }); }

const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Гномы острова: наём, зарплата, работа (грядки, загон, амбар, починка), прятки при рейде, опыт.
export class Gnomes {
  constructor(game) {
    this.game = game;
    this.slots = [];
    this.quest = { day: null, done: false };
    this.t = 0;
    this.claimed = new Map();
    this.reset();
  }

  // ---------- слоты и данные ----------

  blank(spec = 'farmer') {
    return { spec, level: 1, tasks: 0, hired: false, alive: true, unpaid: 0, hp: GNOME.hp[0], run: null };
  }

  reset() {
    for (const s of this.slots) this.despawn(s);
    this.slots = [this.blank('all')];
    this.quest = { day: null, done: false };
    this.spawn(this.slots[0], 0);
  }

  cave() {
    return this.game.build.placed.find(r => r.id === 'cave') ?? null;
  }

  // Сколько мест для гномов: первый гном всегда, остальные открывает пещера
  slotCount() {
    const cave = this.cave();
    return 1 + (cave ? GNOME.caveSlots[(cave.lvl ?? 1) - 1] : 0);
  }

  ensureSlots() {
    const n = this.slotCount();
    while (this.slots.length < n) this.slots.push(this.blank('farmer'));
    // Если пещеру снесли, гномы из неё уходят (первый остаётся)
    while (this.slots.length > n) { const s = this.slots.pop(); this.despawn(s); }
  }

  wage(slot) {
    return wageOf(slot.level);
  }

  maxHp(slot) {
    return GNOME.hp[slot.level - 1];
  }

  // Точка, где гном прячется и отдыхает: у пещеры или у двери стартового дома
  refuge() {
    const cave = this.cave();
    if (cave) { const p = toWorld(0, 2.6, cave.x, cave.z, cave.rot); return { x: p.x, z: p.z }; }
    return { x: -7, z: -1.4 };
  }

  // ---------- картинка ----------

  spawn(slot, i) {
    if (slot.run || !slot.alive) return;
    const grp = new THREE.Group();
    const body = new THREE.Mesh(G.body, M.body); body.position.y = 0.5;
    const head = new THREE.Mesh(G.head, M.head); head.position.y = 1.0;
    const beard = new THREE.Mesh(G.beard, M.beard); beard.position.set(0, 0.8, 0.14); beard.rotation.x = Math.PI;
    const hat = new THREE.Mesh(G.hat, M.hats[slot.spec]); hat.position.y = 1.4;
    const dot = new THREE.Mesh(G.dot, M.dots[slot.spec]); dot.position.y = 1.85;
    grp.add(body, head, beard, hat, dot);
    const bar = new HealthBar(0.9);
    bar.group.position.y = 2.1;
    grp.add(bar.group);
    const r = this.refuge();
    const pos = new THREE.Vector3(r.x + (i % 3 - 1) * 0.8, 0, r.z + 0.8);
    grp.position.copy(pos);
    this.game.world.scene.add(grp);
    slot.run = { grp, hat, dot, bar, pos, state: 'idle', timer: 0, task: null, carry: {}, hidden: false, stuck: 0, wander: null, rec: null, flash: 0, wait: Math.random() };
    slot.run.rec = { isGnome: true, id: 'gnome', slot, rect: { x: pos.x, z: pos.z, hw: 0.4, hd: 0.4 }, x: pos.x, z: pos.z, hp: slot.hp, maxHp: this.maxHp(slot) };
  }

  despawn(slot) {
    if (!slot?.run) return;
    this.game.world.scene.remove(slot.run.grp);
    this.releaseClaim(slot);
    slot.run = null;
  }

  setHatColor(slot) {
    if (slot.run) { slot.run.hat.material = M.hats[slot.spec]; slot.run.dot.material = M.dots[slot.spec]; }
  }

  // ---------- наём, увольнение, специальность, зарплата ----------

  // Возвращает текст ошибки (ключ i18n) или null, если получилось
  hire(i) {
    const g = this.game, s = this.slots[i];
    if (!s || s.hired) return null;
    const fee = this.hireFee(i);
    if (fee > 0 && !g.inventory.spend({ gold: fee })) return 'needResources';
    if (!s.alive) {
      Object.assign(s, this.blank(i === 0 ? 'all' : s.spec), { hired: true });       // новичок: первый уровень
    }
    s.hired = true;
    s.unpaid = 0;
    s.alive = true;
    s.hp = this.maxHp(s);
    this.spawn(s, i);
    g.ui.toast(t('gnome.hired'));
    events.emit('levelUp');
    events.emit('hire');
    return null;
  }

  // Плата за наём: первый гном при первом найме бесплатно, обучение нового после гибели и гномы пещеры стоят trainFee
  hireFee(i) {
    const s = this.slots[i];
    if (i === 0 && s.alive) return 0;
    // Чем больше гномов уже нанято, тем дороже следующий (30, 50, 75, 125...)
    const others = this.slots.filter((x, j) => j !== i && x.hired && x.alive).length;
    return hireFee(others, GNOME.trainFee);
  }

  fire(i) {
    const s = this.slots[i];
    if (!s?.hired) return;
    s.hired = false;
    this.releaseClaim(s);
    if (i > 0) { this.despawn(s); this.slots[i] = this.blank(s.spec); }
    else if (s.run) { s.run.task = null; s.run.state = 'idle'; }
    this.game.ui.toast(t('gnome.fired'));
  }

  setSpec(i, spec) {
    const s = this.slots[i];
    if (!s || i === 0 || !GNOME.specs.includes(spec)) return;
    s.spec = spec;
    this.setHatColor(s);
    if (s.run) { this.releaseClaim(s); s.run.task = null; s.run.state = 'idle'; }
  }

  // Новые сутки: зарплата. Нет золота — забастовка, второй день подряд — гном уходит.
  payDay() {
    const g = this.game;
    let paid = 0, strike = 0;
    this.slots.forEach((s, i) => {
      if (!s.hired || !s.alive) return;
      const w = this.wage(s);
      if (g.inventory.spend({ gold: w })) { s.unpaid = 0; paid += w; return; }
      s.unpaid++;
      if (s.unpaid >= 2) { this.fire(i); g.ui.toast(t('gnome.quit')); } else strike++;
    });
    if (strike) g.ui.toast(`${t('gnome.strike')}: ${strike}`);
    else if (paid) g.ui.toast(`${t('gnome.paid')}: 💰${paid}`);
    if (paid && !strike) events.emit('payDay');
  }

  // ---------- поручение дня (первый гном) ----------

  questInfo() {
    const day = todayKey();
    if (this.quest.day !== day) this.quest = { day, done: false };
    const amount = GNOME.questAmounts[hash(`${day}:gnome`) % GNOME.questAmounts.length];
    return { amount, reward: Math.round(amount / 2) + GNOME.questReward, done: this.quest.done };
  }

  // Сдать еду гному: сначала из рюкзака, потом из амбара
  deliverQuest() {
    const g = this.game, q = this.questInfo();
    if (q.done) return g.ui.toast(t('gnome.questDone'));
    const barns = g.economy.barns();
    const have = g.inventory.foodTotal() + barns.reduce((s, b) => s + FOOD_ORDER.reduce((a, k) => a + b.state.items[k], 0), 0);
    if (have < q.amount) return g.ui.toast(t('gnome.questNeed'));
    let need = q.amount;
    for (const k of FOOD_ORDER) { const n = Math.min(need, g.inventory.food[k]); g.inventory.food[k] -= n; need -= n; }
    for (const b of barns) for (const k of FOOD_ORDER) { const n = Math.min(need, b.state.items[k]); b.state.items[k] -= n; need -= n; }
    this.quest.done = true;
    g.inventory.add('gold', q.reward);
    g.ui.toast(`${t('gnome.questOk')} 💰${q.reward}`);
    events.emit('quest');
    events.emit('gnomeQuest');
  }

  // ---------- что рядом ----------

  nearest(pos, range = 2.6) {
    let best = null, bestD = range;
    for (const s of this.slots) {
      if (!s.run || s.run.hidden) continue;
      const d = dist2(pos, s.run.pos);
      if (d < bestD) { bestD = d; best = s; }
    }
    const cave = this.cave();
    if (cave) {
      const r = cave.rect;
      const nx = Math.max(r.x - r.hw, Math.min(r.x + r.hw, pos.x)), nz = Math.max(r.z - r.hd, Math.min(r.z + r.hd, pos.z));
      if (Math.hypot(pos.x - nx, pos.z - nz) < 2) return { cave: true };
    }
    return best ? { slot: best } : null;
  }

  // Рейдеры могут бить гномов (прячущиеся неуязвимы)
  targets() {
    return this.slots.filter(s => s.run && s.hired && s.alive && !s.run.hidden).map(s => s.run.rec);
  }

  hurt(rec, dmg) {
    const s = rec.slot, g = this.game;
    s.hp -= dmg;
    if (s.run) s.run.flash = 0.2;
    if (s.hp > 0) return;
    const i = this.slots.indexOf(s);
    s.alive = false;
    s.hired = false;
    this.despawn(s);
    g.combat.ring({ x: rec.x, y: 0, z: rec.z }, 0xff6a2a, 3, 0.5);
    g.ui.toast(t('gnome.died'));
    events.emit('hurt');
    if (i > 0) this.slots[i] = Object.assign(this.blank(s.spec), { alive: false });
  }

  // ---------- работа ----------

  carryTotal(r) {
    return Object.values(r.carry).reduce((s, n) => s + n, 0);
  }

  capacity(slot) {
    return GNOME.carry + GNOME.carryStep * (slot.level - 1);
  }

  walkSpeed(slot) {
    return GNOME.speed + GNOME.speedStep * (slot.level - 1);
  }

  // Сколько секунд занимает рубка дерева или добыча камня
  gatherTime(slot) {
    return GNOME.gatherTime / (1 + GNOME.levelSpeed * (slot.level - 1)) / GNOME.specBonus;
  }

  // Точка рядом с деревом или камнем (в сам объект зайти нельзя)
  nodeApproach(node, from) {
    let dx = from.x - node.x, dz = from.z - node.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = 0; dz = 1; d = 1; }
    const r = node.collider.r + 0.7;
    return { x: node.x + (dx / d) * r, z: node.z + (dz / d) * r };
  }

  // Дальний от центра острова конец пирса (там удят рыбу)
  pierEnd(rec) {
    const r = rec.rect;
    let best = null, bestD = -1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = { x: r.x + sx * Math.max(0, r.hw - 0.5), z: r.z + sz * Math.max(0, r.hd - 0.5) };
      const d = Math.hypot(p.x, p.z);
      if (d > bestD) { bestD = d; best = p; }
    }
    return best;
  }

  workTime(slot) {
    const spec = slot.spec === 'all' ? 1 : GNOME.specBonus;
    return GNOME.workTime / (1 + GNOME.levelSpeed * (slot.level - 1)) / spec;
  }

  releaseClaim(slot) {
    for (const [k, v] of this.claimed) if (v === slot) this.claimed.delete(k);
  }

  dangerNear() {
    const g = this.game;
    if (g.raids.state === 'warning' || g.raids.state === 'active') return true;
    const r = this.refuge();
    return g.combat.enemies.some(e => !e.dead && e.hunter && dist2(e.pos, r) < 16);
  }

  // Кладёт в амбар то, что несёт гном
  deliver(slot) {
    const g = this.game, run = slot.run;
    const barn = this.nearestBarn(run.pos);
    if (!barn) return;
    const cap = g.economy.capOf(barn);
    for (const [k, n] of Object.entries(run.carry)) {
      const put = Math.min(n, cap - barn.state.items[k]);
      barn.state.items[k] += put;
      run.carry[k] = n - put;
      if (run.carry[k] <= 0) delete run.carry[k];
    }
  }

  nearestBarn(pos) {
    let best = null, bd = Infinity;
    for (const b of this.game.economy.barns()) { const d = dist2(pos, b); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  // Выбирает дело по специальности. Возвращает { type, pos, key, ... } или null
  pickTask(slot) {
    const g = this.game, eco = g.economy, run = slot.run;
    const spec = slot.spec, all = spec === 'all';
    const room = this.capacity(slot) - this.carryTotal(run);
    const bad = run.bad ?? {};
    const mine = k => (!this.claimed.has(k) || this.claimed.get(k) === slot) && !(bad[k] > this.t);     // недоступные дела пропускаем 25 с
    const cands = [];
    const barn = this.nearestBarn(run.pos);
    const carrying = this.carryTotal(run);

    // Отнести груз: полный рюкзак или нечего больше делать
    const deliverTask = barn && carrying > 0 ? { type: 'deliver', pos: this.approach(barn, run.pos), key: 'deliver:' + slot.spec, rec: barn, pri: carrying >= this.capacity(slot) ? 0 : carrying >= this.capacity(slot) * 0.66 ? 3.5 : 9 } : null;

    for (const rec of eco.recs) {
      if (rec.id === 'farm') {
        rec.state.plots.forEach((p, i) => {
          const key = `plot:${rec.x}:${rec.z}:${i}`;
          if (!mine(key)) return;
          const pos = toWorld(FARM.plots[i].x, FARM.plots[i].z, rec.x, rec.z, rec.rot);
          if (p.s === 'ready' && room > 0 && (all || spec === 'farmer' || spec === 'porter') && barn) cands.push({ type: 'harvest', rec, plot: i, pos, key, pri: 1 });
          else if (p.s === 'spoiled' && (all || spec === 'farmer')) cands.push({ type: 'clear', rec, plot: i, pos, key, pri: 2 });
          else if (p.s === 'grow' && !p.water && p.t < FARM.growTime * FARM.waterBefore && (all || spec === 'farmer')) cands.push({ type: 'water', rec, plot: i, pos, key, pri: 4 });
          else if (p.s === 'empty' && (all || spec === 'farmer')) cands.push({ type: 'plant', rec, plot: i, pos, key, pri: 5 });
        });
      } else if (rec.id === 'pen' && (all || spec === 'porter') && room > 0 && barn) {
        const key = `pen:${rec.x}:${rec.z}`;
        if (mine(key) && rec.state.slots.some(s => s.stock > 0)) cands.push({ type: 'pen', rec, pos: this.approach(rec, run.pos), key, pri: 1 });
      }
    }
    // Дровосек и каменотёс: срубить дерево / добыть камень на домашнем острове и отнести в амбар
    const gather = GATHER[spec];
    if (gather && barn && room > 0 && barn.state.items[gather] < g.economy.capOf(barn)) {
      for (const n of g.world.nodes) {
        if (n.type !== gather || !n.active || n.locked || g.world.islandIdAt(n.x, n.z) !== 'home') continue;
        const key = `node:${Math.round(n.x * 10)}:${Math.round(n.z * 10)}`;
        if (!mine(key)) continue;
        cands.push({ type: 'gather', node: n, pos: this.nodeApproach(n, run.pos), key, pri: 2 });
      }
    }
    // Рыбак: ловит рыбу на конце пирса и носит в амбар
    if (spec === 'fisher' && barn && room > 0 && barn.state.items.fish < g.economy.capOf(barn)) {
      for (const pier of g.build.placed) {
        if (pier.id !== 'pier') continue;
        const key = `pier:${Math.round(pier.x * 10)}:${Math.round(pier.z * 10)}`;
        if (mine(key)) cands.push({ type: 'fish', rec: pier, pos: this.pierEnd(pier), key, pri: 2 });
      }
    }
    // Починка: нужны повреждённая постройка и дерево в амбаре
    if ((all || spec === 'fixer') && barn && barn.state.items.wood >= DEFENSE.repair.cost.wood) {
      for (const rec of eco.breakables()) {
        const key = `fix:${rec.x}:${rec.z}`;
        if (!mine(key)) continue;
        if (rec.maxHp !== undefined && rec.hp < rec.maxHp) cands.push({ type: 'fix', rec, pos: this.approach(rec, run.pos), key, pri: 3 });
        else if (rec.maxDef !== undefined && rec.def < rec.maxDef && barn.state.items.wood >= DEFENSE.barn.repairCost.wood) cands.push({ type: 'fixDef', rec, pos: this.approach(rec, run.pos), key, pri: 3 });
      }
    }
    if (deliverTask && deliverTask.pri === 0) return deliverTask;
    if (deliverTask) cands.push(deliverTask);
    cands.sort((a, b) => a.pri - b.pri || dist2(run.pos, a.pos) - dist2(run.pos, b.pos));
    return cands[0] ?? null;
  }

  // Куда подойти к постройке: ближайшая к гному точка рядом с её стеной (работать можно с любой стороны, обходить не нужно)
  approach(rec, from) {
    const r = rec.rect;
    const nx = Math.max(r.x - r.hw, Math.min(r.x + r.hw, from.x)), nz = Math.max(r.z - r.hd, Math.min(r.z + r.hd, from.z));
    let dx = from.x - nx, dz = from.z - nz, d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = 0; dz = 1; d = 1; }
    return { x: nx + (dx / d) * 1.0, z: nz + (dz / d) * 1.0 };
  }

  // Дело сделано: меняем мир и даём опыт
  complete(slot, task) {
    const g = this.game, eco = g.economy, run = slot.run, rec = task.rec;
    let did = true;
    if (task.type === 'plant') {
      const p = rec.state.plots[task.plot];
      if (p.s === 'empty') { p.s = 'grow'; p.t = 0; p.water = false; p.gold = false; } else did = false;
    } else if (task.type === 'water') {
      const p = rec.state.plots[task.plot];
      if (p.s === 'grow' && !p.water && p.t < FARM.growTime * FARM.waterBefore) { p.water = true; p.gold = true; } else did = false;
    } else if (task.type === 'clear') {
      const p = rec.state.plots[task.plot];
      if (p.s === 'spoiled') { p.s = 'empty'; p.t = 0; p.left = 0; p.water = false; p.gold = false; } else did = false;
    } else if (task.type === 'harvest') {
      const p = rec.state.plots[task.plot], crop = FARM.plots[task.plot].crop;
      if (p.s === 'ready') {
        const take = Math.min(p.left, this.capacity(slot) - this.carryTotal(run));
        run.carry[crop] = (run.carry[crop] ?? 0) + take;
        p.left -= take;
        if (p.left <= 0) { p.s = 'empty'; p.t = 0; p.water = false; p.gold = false; }
      } else did = false;
    } else if (task.type === 'pen') {
      let any = false;
      rec.state.slots.forEach((s, i) => {
        const take = Math.min(s.stock, this.capacity(slot) - this.carryTotal(run));
        if (take > 0) { const food = PEN.slots[i].food; run.carry[food] = (run.carry[food] ?? 0) + take; s.stock -= take; any = true; }
      });
      did = any;
    } else if (task.type === 'fix') {
      const barn = this.nearestBarn(run.pos);
      if (barn && barn.state.items.wood >= DEFENSE.repair.cost.wood && rec.hp < rec.maxHp) {
        barn.state.items.wood -= DEFENSE.repair.cost.wood;
        rec.hp = Math.min(rec.maxHp, rec.hp + GNOME.fixAmount);
        g.combat.ring({ x: rec.x, y: 0, z: rec.z }, 0x7dff5a, 2.5, 0.35);
      } else did = false;
    } else if (task.type === 'fixDef') {
      const barn = this.nearestBarn(run.pos);
      if (barn && barn.state.items.wood >= DEFENSE.barn.repairCost.wood && rec.def < rec.maxDef) {
        barn.state.items.wood -= DEFENSE.barn.repairCost.wood;
        rec.def = Math.min(rec.maxDef, rec.def + DEFENSE.barn.repairDefense);
      } else did = false;
    } else if (task.type === 'gather') {
      const n = task.node, def = RESOURCES[n.type];
      if (n.active && !n.locked && this.capacity(slot) > this.carryTotal(run)) {
        const [min, max] = def.amount;
        const amount = min + Math.floor(Math.random() * (max - min + 1));
        const take = Math.min(amount, this.capacity(slot) - this.carryTotal(run));
        run.carry[n.type] = (run.carry[n.type] ?? 0) + take;
        g.resources.setActive(n, false);                    // дерево или камень вырастет заново, как после сбора героем
        n.respawnAt = g.resources.time + def.respawn;
        g.combat.ring({ x: n.x, y: 0, z: n.z }, n.type === 'wood' ? 0x7dff5a : 0xc9d0d8, 1.8, 0.3);
      } else did = false;
    } else if (task.type === 'fish') {
      const kind = rollFish({ pier: true, night: g.world.isNight });
      const n = kind === 'rare' ? FISH_REWARD.rare.fish : 1;                       // сундучки рыбак не достаёт: считаем за одну рыбу
      const take = Math.min(n, this.capacity(slot) - this.carryTotal(run));
      if (take > 0) {
        run.carry.fish = (run.carry.fish ?? 0) + take;
        g.combat.ring({ x: run.pos.x, y: 0, z: run.pos.z }, 0x39a7d6, 1.6, 0.3);
      } else did = false;
    } else if (task.type === 'deliver') {
      this.deliver(slot);
      did = false;       // доставка опыта не даёт
    }
    this.releaseClaim(slot);
    if (!did) return;
    slot.tasks++;
    const need = slot.level * GNOME.tasksPerLevel;
    if (slot.level < GNOME.maxLevel && slot.tasks >= need) {
      slot.level++;
      slot.hp = Math.min(this.maxHp(slot), slot.hp + 10);
      g.ui.toast(`${t('gnome.levelUp')} ${slot.level}`);
      events.emit('levelUp');
    }
  }

  // ---------- каждый кадр ----------

  update(dt) {
    this.t += dt;
    this.ensureSlots();
    const danger = this.dangerNear();
    this.slots.forEach((slot, i) => {
      if (!slot.alive) return;
      if (slot.hired || i === 0) { if (!slot.run) this.spawn(slot, i); }
      const run = slot.run;
      if (!run) return;
      this.tick(slot, i, run, dt, danger);
    });
  }

  moveTo(slot, run, tx, tz, dt) {
    const world = this.game.world;
    const dx = tx - run.pos.x, dz = tz - run.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.15) return true;
    const step = Math.min(this.walkSpeed(slot) * dt, d);
    const ox = run.pos.x, oz = run.pos.z;
    run.pos.x += (dx / d) * step;
    run.pos.z += (dz / d) * step;
    world.resolveCollisions(run.pos, 0.35);
    if (world.groundAt(run.pos.x, run.pos.z) === null) { run.pos.x = ox; run.pos.z = oz; }
    run.grp.rotation.y = Math.atan2(dx, dz);
    // Застрял у препятствия: через секунду бросает это дело
    if (Math.hypot(run.pos.x - ox, run.pos.z - oz) < step * 0.25) run.stuck += dt; else run.stuck = Math.max(0, run.stuck - dt);
    return false;
  }

  tick(slot, i, run, dt, danger) {
    // Раны заживают: быстро в укрытии, медленно на ходу
    if (slot.hp < this.maxHp(slot)) slot.hp = Math.min(this.maxHp(slot), slot.hp + (run.hidden ? 4 : 0.4) * dt);
    run.flash = Math.max(0, run.flash - dt);
    run.bar.set(slot.hp / this.maxHp(slot));
    run.bar.face(this.game.camera);
    run.rec.hp = slot.hp;
    run.rec.maxHp = this.maxHp(slot);

    // Прятки
    if (danger && !run.hidden) {
      this.releaseClaim(slot);
      run.task = null;
      run.state = 'hide';
    }
    if (run.state === 'hide') {
      const r = this.refuge();
      if (this.moveTo(slot, run, r.x, r.z, dt) || run.stuck > 1.5) { run.hidden = true; run.grp.visible = false; run.state = 'hiding'; run.stuck = 0; }
    } else if (run.state === 'hiding') {
      if (!danger) { run.hidden = false; run.grp.visible = true; run.state = 'idle'; }
    }
    run.grp.position.set(run.pos.x, Math.abs(Math.sin(this.t * 6 + i)) * (run.state === 'walk' || run.state === 'hide' ? 0.08 : 0), run.pos.z);
    run.rec.x = run.pos.x; run.rec.z = run.pos.z; run.rec.rect.x = run.pos.x; run.rec.rect.z = run.pos.z;
    if (run.hidden || run.state === 'hide') return;

    const working = slot.hired && slot.unpaid === 0;
    if (!working) { this.idle(slot, i, run, dt); return; }

    if (run.state === 'idle') {
      run.wait -= dt;
      if (run.wait > 0) return;
      const task = this.pickTask(slot);
      if (!task) { run.wait = 1.2; this.idle(slot, i, run, dt); return; }
      run.task = task;
      this.claimed.set(task.key, slot);
      run.state = 'walk';
      run.stuck = 0;
      run.tries = 0;
      run.detour = null;
    } else if (run.state === 'walk') {
      const tk = run.task;
      // Упёрся в препятствие: обходит его в сторону (до трёх попыток), потом бросает дело
      if (run.detour && run.detour.until > this.t) {
        this.moveTo(slot, run, run.detour.x, run.detour.z, dt);
      } else if (this.moveTo(slot, run, tk.pos.x, tk.pos.z, dt)) { run.state = 'work'; run.timer = tk.type === 'gather' ? this.gatherTime(slot) : tk.type === 'fish' ? this.gatherTime(slot) * 1.1 : this.workTime(slot); }
      else if (run.stuck > 0.5 && (run.tries ?? 0) < 3) {
        const dx = tk.pos.x - run.pos.x, dz = tk.pos.z - run.pos.z, d = Math.hypot(dx, dz) || 1, side = Math.random() < 0.5 ? 1 : -1;
        run.detour = { x: run.pos.x - (dz / d) * 3 * side + (dx / d), z: run.pos.z + (dx / d) * 3 * side + (dz / d), until: this.t + 1.3 };
        run.tries = (run.tries ?? 0) + 1;
        run.stuck = 0;
      } else if (run.stuck > 1.2) {
        run.bad = run.bad ?? {};
        run.bad[tk.key] = this.t + 25;
        this.releaseClaim(slot); run.task = null; run.state = 'idle'; run.wait = 0.5; run.stuck = 0;
      }
    } else if (run.state === 'work') {
      run.timer -= dt;
      run.grp.rotation.y += Math.sin(this.t * 14) * 0.02;
      if (run.timer <= 0) { this.complete(slot, run.task); run.task = null; run.state = 'idle'; run.wait = 0.2; }
    }
  }

  // Гулять возле своего места
  idle(slot, i, run, dt) {
    const r = this.refuge();
    if (!run.wander || dist2(run.pos, run.wander) < 0.3 || Math.random() < dt * 0.1) {
      const a = Math.random() * Math.PI * 2;
      run.wander = { x: r.x + Math.cos(a) * 2.2, z: r.z + Math.sin(a) * 1.6 };
    }
    this.moveTo(slot, run, run.wander.x, run.wander.z, dt * 0.35);
  }

  // ---------- вид для панели ----------

  status(slot, i) {
    if (i >= this.slotCount()) return 'locked';
    if (!slot.alive) return 'dead';
    if (!slot.hired) return 'notHired';
    if (slot.unpaid > 0) return 'strike';
    if (slot.run?.hidden || slot.run?.state === 'hide') return 'hiding';
    return 'working';
  }

  view() {
    const q = this.questInfo();
    const rows = [];
    const total = this.slotCount();
    for (let i = 0; i < 5; i++) {
      const slot = this.slots[i];
      if (!slot) { rows.push({ i, status: i === 0 ? 'notHired' : 'locked' }); continue; }
      const nextNeed = slot.level * GNOME.tasksPerLevel;
      rows.push({
        i, status: i < total ? this.status(slot, i) : 'locked', spec: slot.spec, icon: SPEC_ICON[slot.spec], level: slot.level,
        tasks: slot.tasks, nextNeed: slot.level >= GNOME.maxLevel ? null : nextNeed, hp: Math.round(slot.hp), maxHp: this.maxHp(slot),
        wage: this.wage(slot), fee: this.hireFee(i), hired: slot.hired, canSpec: i > 0,
      });
    }
    const wages = this.slots.reduce((s, sl) => s + (sl.hired && sl.alive ? this.wage(sl) : 0), 0);
    return { rows, wages, quest: q, hasCave: !!this.cave() };
  }

  // ---------- сохранение ----------

  toSave() {
    return {
      slots: this.slots.map(s => ({ spec: s.spec, level: s.level, tasks: s.tasks, hired: s.hired, alive: s.alive, unpaid: s.unpaid, hp: Math.round(s.hp) })),
      quest: { day: this.quest.day, done: this.quest.done },
    };
  }

  fromSave(data) {
    for (const s of this.slots) this.despawn(s);
    this.claimed.clear();
    this.slots = [];
    const list = Array.isArray(data?.slots) ? data.slots.slice(0, 5) : [];
    list.forEach((r, i) => {
      const s = this.blank(i === 0 ? 'all' : (GNOME.specs.includes(r?.spec) ? r.spec : 'farmer'));
      s.level = Math.max(1, Math.min(GNOME.maxLevel, Math.floor(r?.level ?? 1)));
      s.tasks = Math.max(0, Math.floor(r?.tasks ?? 0));
      s.hired = r?.hired === true;
      s.alive = r?.alive !== false;
      s.unpaid = Math.max(0, Math.min(2, Math.floor(r?.unpaid ?? 0)));
      s.hp = Math.max(1, Math.min(this.maxHp(s), Number.isFinite(r?.hp) ? r.hp : this.maxHp(s)));
      this.slots.push(s);
    });
    if (!this.slots.length) this.slots.push(this.blank('all'));
    this.quest = { day: typeof data?.quest?.day === 'string' ? data.quest.day : null, done: data?.quest?.done === true };
    this.slots.forEach((s, i) => { if (s.alive && (s.hired || i === 0)) this.spawn(s, i); });
  }
}

