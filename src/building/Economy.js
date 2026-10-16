import * as THREE from 'three';
import { BUILDINGS, DEFENSE } from '../config/buildings.js';
import { RAIDS } from '../config/raids.js';
import { UPGRADES, BAG } from '../config/upgrades.js';
import { rectOf } from './geometry.js';
import { HealthBar } from '../combat/HealthBar.js';
import { FARM, PEN, BARN, FOODS, FOOD_ORDER, FAVORITE, BEAST_FOOD, BARN_ITEMS } from '../config/food.js';
import { CREATURES } from '../config/creatures.js';
import { newState } from './BuildingState.js';
import { toWorld } from './Structures.js';
import { RESOURCES } from '../config/resources.js';
import { t } from '../config/i18n.js';
import { events } from '../core/Events.js';

const ACT_RANGE = 1.5;     // до центра грядки
const EDGE_RANGE = 1.9;    // до края загона или амбара

// Общие геометрии и материалы грядок (помечены keep, чтобы снос постройки их не удалял)
const keep = m => { m.userData.keep = true; return m; };
const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra });
const G = {
  soil: new THREE.BoxGeometry(2.2, 0.12, 2.2),
  bush: new THREE.SphereGeometry(0.28, 7, 6),
  berry: new THREE.SphereGeometry(0.09, 6, 5),
  ear: new THREE.BoxGeometry(0.07, 0.6, 0.07),
  body: new THREE.SphereGeometry(0.18, 7, 6),
  pig: new THREE.BoxGeometry(0.5, 0.3, 0.3),
  comb: new THREE.ConeGeometry(0.05, 0.1, 4),
  mark: new THREE.OctahedronGeometry(0.22, 0),
};
const M = {
  soilEmpty: lam(0x6b4a2a), soilWet: lam(0x4d3520),
  leaf: lam(0x3f9e44), berry: lam(0xe0334a), grain: lam(0xe6c84a),
  gold: lam(0xffd23f, { emissive: 0x7a5200 }), spoiled: lam(0x5a4a3a),
  chicken: lam(0xffffff), comb: lam(0xe0334a), pig: lam(0xf2a6b0),
  mark: lam(0xffd23f, { emissive: 0x7a5200 }),
};

// Хозяйство острова: грядки растут, животные в загоне дают еду, амбар хранит запасы, звери едят раз в сутки.
// Состояние каждой постройки хранится в rec.state (см. BuildingState.js) и попадает в сохранение.
export class Economy {
  constructor(game) {
    this.game = game;
    this.lastDay = 0;
    this.t = 0;
    // Стартовый дом тоже можно улучшать: делаем для него «запись» с прямоугольником и уровнем
    const hs = BUILDINGS.house, struct = game.world.startStruct;
    this.startHouse = { id: 'house', isStart: true, x: -7, z: -4, rot: 0, rect: rectOf(-7, -4, hs.size.w, hs.size.d, 0), struct,
      get lvl() { return struct.lvl; }, set lvl(v) { struct.lvl = v; } };
  }

  // ---------- улучшения ----------

  levelOf(rec) {
    return rec.lvl ?? 1;
  }

  // Что можно улучшить (у ловушки, стены, платформ улучшений нет)
  canUpgradeKind(rec) {
    return Object.hasOwn(UPGRADES, rec.id);
  }

  upgradeCost(rec) {
    if (!this.canUpgradeKind(rec) || this.levelOf(rec) >= 3) return null;
    return UPGRADES[rec.id].cost[this.levelOf(rec) - 1];
  }

  canUpgrade(rec) {
    const c = this.upgradeCost(rec);
    return !!c && this.game.inventory.has(c);
  }

  upgradeText(rec) {
    const name = rec.isStart ? t('building.house') : t('building.' + rec.id);
    if (!this.canUpgradeKind(rec)) return `${name}: ${t('upgrade.none')}`;
    const c = this.upgradeCost(rec);
    if (!c) return `${name}: ${t('upgrade.max')}`;
    return `${name} ${t('level')} ${this.levelOf(rec)} → ${this.levelOf(rec) + 1}: ${this.game.ui.costText(c)}`;
  }

  upgrade(rec) {
    const g = this.game, c = this.upgradeCost(rec);
    if (!c) return g.ui.toast(this.canUpgradeKind(rec) ? t('upgrade.max') : t('upgrade.none'));
    if (!g.inventory.spend(c)) return g.ui.toast(t('needResources'));
    rec.lvl = this.levelOf(rec) + 1;
    this.applyLevel(rec, true);
    g.combat.ring({ x: rec.x, y: 0, z: rec.z }, 0xffd23f, 4, 0.7);
    g.ui.toast(`${t('upgrade.done')}: ${rec.isStart ? t('building.house') : t('building.' + rec.id)} ${t('level')} ${rec.lvl}`);
    events.emit('levelUp');
  }

  // Применяет уровень: защита амбара, значки уровня
  applyLevel(rec, fresh = false) {
    const lvl = this.levelOf(rec);
    if (rec.struct) rec.struct.lvl = lvl;
    if (rec.id === 'barn') {
      const max = UPGRADES.barn.defense[lvl - 1];
      if (fresh) rec.def = Math.min(max, (rec.def ?? 0) + (max - (rec.maxDef ?? max)));
      rec.maxDef = max;
      rec.def = Math.min(rec.def ?? max, max);
    }
    if (rec.mesh) {
      rec.mesh.remove(...(rec.marks ?? []));
      rec.marks = [];
      for (let i = 1; i < lvl; i++) {
        const m = new THREE.Mesh(G.mark, M.mark);
        m.userData.keep = true;
        m.position.set((i - 1.5) * 0.45, 4.3, 0);
        rec.mesh.add(m);
        rec.marks.push(m);
      }
    }
  }

  capOf(rec) {
    return UPGRADES.barn.cap[this.levelOf(rec) - 1];
  }

  // Рюкзак: стоимость следующего уровня или null
  bagCost() {
    const lvl = this.game.inventory.bag;
    return lvl >= BAG.max ? null : BAG.cost[lvl];
  }

  buyBag() {
    const g = this.game, cost = this.bagCost();
    if (cost === null) return g.ui.toast(t('upgrade.max'));
    if (!g.inventory.spend({ gold: cost })) return g.ui.toast(t('needResources'));
    g.inventory.bag++;
    g.ui.toast(`${t('bag.upgraded')} ${g.inventory.bag}`);
    events.emit('levelUp');
  }

  get recs() {
    return this.game.build.placed.filter(r => BUILDINGS[r.id].economy);
  }

  barns() {
    return this.game.build.placed.filter(r => r.id === 'barn');
  }

  // Постройки, которые могут ломать враги: у них есть прочность (или защита амбара)
  breakables() {
    return this.game.build.placed.filter(r => r.maxHp !== undefined || r.maxDef !== undefined);
  }

  // Что имеет смысл атаковать рейдерам: сломать постройку или (для амбара) сбить защиту и украсть запасы
  targets() {
    return this.breakables().filter(r => {
      if (r.maxDef !== undefined) return r.def > 0 || BARN_ITEMS.some(k => r.state.items[k] > 0);
      return r.hp > 0;
    });
  }

  // Вызывается при размещении или загрузке постройки: создаёт состояние и картинку хозяйства
  attach(rec) {
    const kind = BUILDINGS[rec.id].economy;
    // Полоска прочности (видна, когда постройка повреждена)
    if (rec.maxHp !== undefined || rec.maxDef !== undefined) {
      const def = BUILDINGS[rec.id];
      const bar = new HealthBar(Math.max(def.size.w, def.size.d) * 0.7, true);
      bar.setColor(rec.maxDef !== undefined ? 0x4aa8ff : 0x7dff5a);
      bar.group.position.set(0, { tower: 6.4, barn: 3.8, wall: 2.8 }[rec.id] ?? 2.4, 0);
      for (const m of [bar.bg, bar.fill, bar.rim].filter(Boolean)) m.userData.keep = true;      // общие геометрии
      rec.mesh.add(bar.group);
      rec.bar = bar;
    }
    if (rec.lvl > 1 || rec.id === 'barn') this.applyLevel(rec);
    if (!kind) return;
    rec.state = rec.state ?? newState(rec.id);
    rec.fx = {};
    if (kind === 'farm') {
      rec.fx.plots = FARM.plots.map(p => {
        const grp = new THREE.Group();
        grp.position.set(p.x, 0, p.z);
        const soil = new THREE.Mesh(G.soil, M.soilEmpty);
        soil.position.y = 0.09;
        keep(soil);
        const crop = new THREE.Group();
        if (p.crop === 'berries') {
          for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [0, 0], [-0.6, 0.6], [0.6, 0.6]]) {
            const b = new THREE.Mesh(G.bush, M.leaf); b.position.set(x, 0.3, z); keep(b); crop.add(b);
            for (const [dx, dz] of [[0.15, 0.1], [-0.12, 0.15]]) {
              const f = new THREE.Mesh(G.berry, M.berry); f.position.set(x + dx, 0.5, z + dz); keep(f); crop.add(f);
            }
          }
        } else {
          for (let i = 0; i < 9; i++) {
            const e = new THREE.Mesh(G.ear, M.grain);
            e.position.set(-0.7 + (i % 3) * 0.7, 0.4, -0.7 + Math.floor(i / 3) * 0.7);
            keep(e); crop.add(e);
          }
        }
        crop.visible = false;
        grp.add(soil, crop);
        rec.mesh.add(grp);
        return { grp, soil, crop, kind: p.crop };
      });
    } else if (kind === 'pen') {
      rec.fx.animals = [];
      const spots = [[-1.2, -1], [1.3, -1.2], [0, 0.6]];
      spots.forEach(([x, z], i) => {
        const a = new THREE.Group();
        if (i < 2) {
          const b = new THREE.Mesh(G.body, M.chicken); b.position.y = 0.2; keep(b);
          const c = new THREE.Mesh(G.comb, M.comb); c.position.set(0, 0.42, 0.05); keep(c);
          a.add(b, c);
        } else {
          const p = new THREE.Mesh(G.pig, M.pig); p.position.y = 0.25; keep(p); a.add(p);
        }
        a.position.set(x, 0, z);
        rec.mesh.add(a);
        rec.fx.animals.push({ obj: a, x, z, ph: Math.random() * 6 });
      });
    }
  }

  // ---------- каждый кадр ----------

  update(dt) {
    this.t += dt;
    for (const rec of this.recs) {
      const st = rec.state;
      if (!st) continue;
      if (rec.id === 'farm') this.updateFarm(rec, dt);
      else if (rec.id === 'pen') this.updatePen(rec, dt);
      else if (rec.id === 'tower') this.updateTower(rec, dt);
      else if (rec.id === 'trap') this.updateTrap(rec);
    }
    this.updateStructures(dt);
    // Новые сутки: звери едят
    const day = this.game.world.dayCount;
    if (day !== this.lastDay) {
      this.lastDay = day;
      this.feedBeasts();
    }
  }

  updateFarm(rec, dt) {
    rec.state.plots.forEach((p, i) => {
      const fx = rec.fx?.plots?.[i];
      if (p.s === 'grow') {
        p.t += dt;
        if (p.t >= FARM.growTime) {
          p.s = 'ready';
          p.t = 0;
          const [a, b] = FARM.yield;
          p.left = Math.round((a + Math.floor(Math.random() * (b - a + 1))) * (p.gold ? FARM.goldenMul : 1) * UPGRADES.farm.yield[this.levelOf(rec) - 1]);
        }
      } else if (p.s === 'ready') {
        p.t += dt;
        if (p.t >= FARM.spoilAfter) { p.s = 'spoiled'; p.t = 0; p.left = 0; }
      }
      if (!fx) return;
      fx.crop.visible = p.s !== 'empty';
      fx.soil.material = p.water && p.s === 'grow' ? M.soilWet : M.soilEmpty;
      const k = p.s === 'grow' ? 0.2 + 0.8 * (p.t / FARM.growTime) : p.s === 'spoiled' ? 0.6 : 1;
      fx.crop.scale.setScalar(k);
      fx.crop.children.forEach((m, j) => {
        if (p.s === 'spoiled') m.material = M.spoiled;
        else if (p.gold && p.s !== 'empty') m.material = M.gold;
        else m.material = fx.kind === 'berries' ? (j % 3 === 0 ? M.leaf : M.berry) : M.grain;
      });
    });
  }

  updatePen(rec, dt) {
    const U = UPGRADES.pen, lv = this.levelOf(rec) - 1;
    rec.state.slots.forEach((s, i) => {
      const def = PEN.slots[i], max = Math.floor(def.max * U.max[lv]);
      if (s.stock >= max) { s.t = 0; return; }
      s.t += dt;
      if (s.t >= def.every / U.rate[lv]) { s.t = 0; s.stock++; }
    });
    rec.fx?.animals?.forEach(a => {
      a.ph += dt;
      a.obj.position.set(a.x + Math.sin(a.ph * 0.5) * 0.5, Math.abs(Math.sin(a.ph * 3)) * 0.05, a.z + Math.cos(a.ph * 0.4) * 0.4);
      a.obj.rotation.y = Math.sin(a.ph * 0.5) * 2;
    });
  }

  // ---------- оборона и повреждения ----------

  // Полоски прочности, восстановление защиты амбара
  updateStructures(dt) {
    const camera = this.game.camera;
    for (const rec of this.breakables()) {
      if (rec.maxDef !== undefined && rec.def < rec.maxDef && this.t - (rec.lastHit ?? -999) > DEFENSE.barn.regenDelay) {
        rec.def = Math.min(rec.maxDef, rec.def + DEFENSE.barn.regenPerSec * dt);
      }
      if (rec.bar) {
        rec.bar.set(rec.maxDef !== undefined ? rec.def / rec.maxDef : rec.hp / rec.maxHp);
        rec.bar.face(camera);
      }
    }
  }

  // Сторожевая башня стреляет по ближайшему врагу в радиусе
  updateTower(rec, dt) {
    const st = rec.state, lv = this.levelOf(rec) - 1, U = UPGRADES.tower;
    const D = { range: U.range[lv], damage: U.damage[lv], cooldown: U.cooldown[lv] };
    st.cd = Math.max(0, st.cd - dt);
    if (st.cd > 0) return;
    const combat = this.game.combat;
    let best = null, bestD = D.range;
    for (const e of combat.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - rec.x, e.pos.z - rec.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return;
    st.cd = D.cooldown;
    const target = best;
    combat.projectile({ x: rec.x, z: rec.z }, target, 0xffe066, () => combat.damageEnemy(target, D.damage, '#ffe066'), 0.3);
  }

  // Ловушка срабатывает один раз, когда на неё наступает враг
  updateTrap(rec) {
    const D = DEFENSE.trap, combat = this.game.combat;
    const e = combat.enemies.find(x => !x.dead && Math.hypot(x.pos.x - rec.x, x.pos.z - rec.z) < D.radius);
    if (!e) return;
    combat.ring({ x: rec.x, y: 0, z: rec.z }, 0xffe066, 3, 0.4);
    combat.damageEnemy(e, D.damage, '#ffe066');
    combat.applySlow(e, D.slow, D.slowTime);
    this.game.ui.toast(t('trap.sprung'));
    events.emit('slam');
    this.game.build.remove(rec);
  }

  // Враг бьёт постройку. Амбар: сначала сбивается защита, потом можно красть. Остальное: теряет прочность и ломается.
  hitStructure(enemy, rec) {
    const g = this.game;
    const dmg = enemy.def.atk * RAIDS.structureDamage;
    rec.lastHit = this.t;
    if (this.t - (this.alertT ?? -99) > 12) { this.alertT = this.t; g.ui.toast(`${t('struct.attacked')}: ${t('building.' + rec.id)}`); events.emit('raidWarn'); }
    if (rec.maxDef !== undefined) {
      if (rec.def > 0) {
        rec.def = Math.max(0, rec.def - dmg);
        if (rec.def === 0) g.ui.toast(t('barn.defenseDown'));
        return;
      }
      // Защита сбита: враг крадёт запасы (вернуть их можно, победив вора)
      const have = BARN_ITEMS.filter(k => rec.state.items[k] > 0);
      if (!have.length) return;
      const k = have[Math.floor(Math.random() * have.length)];
      const n = Math.min(rec.state.items[k], DEFENSE.barn.lootPerHit);
      rec.state.items[k] -= n;
      enemy.loot = enemy.loot ?? {};
      enemy.loot[k] = (enemy.loot[k] ?? 0) + n;
      g.ui.toast(t('barn.robbed'));
      return;
    }
    rec.hp -= dmg;
    if (rec.hp <= 0) {
      g.combat.ring({ x: rec.x, y: 0, z: rec.z }, 0xff6a2a, 5, 0.6);
      g.ui.toast(`${t('struct.destroyed')}: ${t('building.' + rec.id)}`);
      events.emit('slam');
      g.build.remove(rec);
    }
  }

  // Победили вора: добыча возвращается в амбар (а если амбара нет — в рюкзак)
  returnLoot(enemy) {
    if (!enemy.loot) return;
    const barn = this.barns()[0];
    let back = 0;
    for (const [k, n] of Object.entries(enemy.loot)) {
      let left = n;
      if (barn) { const put = Math.min(left, this.capOf(barn) - barn.state.items[k]); barn.state.items[k] += put; left -= put; }
      if (left > 0) left -= FOOD_ORDER.includes(k) ? this.game.inventory.addFood(k, left) : this.game.inventory.add(k, left);
      back += n - left;
    }
    enemy.loot = null;
    if (back > 0) this.game.ui.toast(t('loot.returned'));
  }

  // Починка прочности (за дерево) и защиты амбара
  repair(rec) {
    const g = this.game;
    if (!g.inventory.spend(DEFENSE.repair.cost)) return g.ui.toast(t('needResources'));
    rec.hp = Math.min(rec.maxHp, rec.hp + DEFENSE.repair.heal);
    g.combat.ring({ x: rec.x, y: 0, z: rec.z }, 0x7dff5a, 3, 0.4);
    events.emit('collect');
  }

  // ---------- взаимодействие ----------

  // Что рядом: грядка, загон или амбар. Возвращает { type, rec, plot?, text, disabled } или null
  target(pos) {
    let best = null, bestD = Infinity;
    for (const rec of this.recs) {
      const rot = rec.rot;
      if (rec.id === 'farm') {
        FARM.plots.forEach((p, i) => {
          const w = toWorld(p.x, p.z, rec.x, rec.z, rot);
          const d = Math.hypot(pos.x - w.x, pos.z - w.z);
          if (d < ACT_RANGE && d < bestD) { bestD = d; best = { type: 'plot', rec, plot: i }; }
        });
      } else {
        const r = rec.rect;
        const nx = Math.max(r.x - r.hw, Math.min(r.x + r.hw, pos.x)), nz = Math.max(r.z - r.hd, Math.min(r.z + r.hd, pos.z));
        const d = Math.hypot(pos.x - nx, pos.z - nz);
        if (d < EDGE_RANGE && d < bestD) { bestD = d; best = { type: rec.id, rec }; }
      }
    }
    // Ничего полезного рядом — но постройка повреждена: можно починить
    if (!best || this.describe(best).disabled) {
      const dmg = this.game.build.placed.find(r => r.maxHp !== undefined && r.hp < r.maxHp && this.near(r, pos));
      if (dmg) best = { type: 'repair', rec: dmg };
    }
    return best ? { ...best, ...this.describe(best) } : null;
  }

  near(rec, pos) {
    const r = rec.rect;
    const nx = Math.max(r.x - r.hw, Math.min(r.x + r.hw, pos.x)), nz = Math.max(r.z - r.hd, Math.min(r.z + r.hd, pos.z));
    return Math.hypot(pos.x - nx, pos.z - nz) < EDGE_RANGE;
  }

  // Подсказка для кнопки «Действие»
  describe(tg) {
    if (tg.type === 'plot') {
      const p = tg.rec.state.plots[tg.plot], crop = FARM.plots[tg.plot].crop, icon = FOODS[crop].icon;
      if (p.s === 'empty') return { text: `${t('econ.plant')}: ${icon} ${t('food.' + crop)}` };
      if (p.s === 'grow') {
        const canWater = !p.water && p.t < FARM.growTime * FARM.waterBefore;
        if (canWater) return { text: `${t('econ.water')} (${t('econ.golden')})` };
        return { text: `${t('econ.growing')} ${Math.floor(p.t / FARM.growTime * 100)}%`, disabled: true };
      }
      if (p.s === 'ready') return { text: `${t('econ.harvest')}: ${icon} ${p.left}${p.gold ? ' ✨' : ''}` };
      return { text: t('econ.clear') };
    }
    if (tg.type === 'repair') {
      const c = DEFENSE.repair.cost;
      return { text: `${t('econ.repair')} (${RESOURCES.wood.icon}${c.wood}) ${Math.round(tg.rec.hp)}/${tg.rec.maxHp}`, disabled: !this.game.inventory.has(c) };
    }
    if (tg.type === 'tower') return { text: t('econ.towerInfo'), disabled: true };
    if (tg.type === 'trap') return { text: t('econ.trapInfo'), disabled: true };
    if (tg.type === 'pen') {
      const parts = tg.rec.state.slots.map((s, i) => s.stock > 0 ? `${FOODS[PEN.slots[i].food].icon}${s.stock}` : '').filter(Boolean).join(' ');
      return parts ? { text: `${t('econ.penCollect')}: ${parts}` } : { text: t('econ.penEmpty'), disabled: true };
    }
    return { text: t('econ.barnOpen') };
  }

  act(tg) {
    const g = this.game, inv = g.inventory;
    if (tg.type === 'repair') return this.repair(tg.rec);
    if (tg.type === 'tower' || tg.type === 'trap') return;
    if (tg.type === 'plot') {
      const p = tg.rec.state.plots[tg.plot], crop = FARM.plots[tg.plot].crop;
      if (p.s === 'empty') { p.s = 'grow'; p.t = 0; p.water = false; p.gold = false; g.ui.toast(`${t('econ.planted')}: ${t('food.' + crop)}`); events.emit('collect'); return; }
      if (p.s === 'grow') {
        if (!p.water && p.t < FARM.growTime * FARM.waterBefore) { p.water = true; p.gold = true; g.ui.toast(t('econ.watered')); events.emit('collect'); }
        else g.ui.toast(t('econ.growing'));
        return;
      }
      if (p.s === 'ready') {
        const got = inv.addFood(crop, p.left);
        if (got === 0) return g.ui.toast(t('bagFull'));
        p.left -= got;
        g.ui.floatText(g.player.pos.clone().setY(2.2), `+${got} ${FOODS[crop].icon}`, '#ffffff');
        events.emit('collect', crop, got);
        g.gainXp(4);
        if (p.left <= 0) { p.s = 'empty'; p.t = 0; p.water = false; p.gold = false; }
        else g.ui.toast(t('bagFull'));
        return;
      }
      p.s = 'empty'; p.t = 0; p.left = 0; p.gold = false; p.water = false;
      return;
    }
    if (tg.type === 'pen') {
      let any = false;
      tg.rec.state.slots.forEach((s, i) => {
        if (s.stock <= 0) return;
        const food = PEN.slots[i].food;
        const got = inv.addFood(food, s.stock);
        if (got > 0) { s.stock -= got; any = true; g.ui.floatText(g.player.pos.clone().setY(2.2 + i * 0.4), `+${got} ${FOODS[food].icon}`, '#ffffff'); }
      });
      if (any) { events.emit('collect'); g.gainXp(3); } else g.ui.toast(t('bagFull'));
      return;
    }
    g.openBarn(tg.rec);
  }

  // ---------- амбар ----------

  stored(key) {
    return this.barns().reduce((s, r) => s + (r.state?.items[key] ?? 0), 0);
  }

  // Сдать всё из рюкзака (дерево, камень, еду) в амбар
  deposit(rec) {
    const inv = this.game.inventory, items = rec.state.items;
    for (const k of ['wood', 'stone']) {
      const n = Math.min(inv.items[k], this.capOf(rec) - items[k]);
      if (n > 0) { inv.items[k] -= n; items[k] += n; }
    }
    for (const k of FOOD_ORDER) {
      const n = Math.min(inv.food[k], this.capOf(rec) - items[k]);
      if (n > 0) { inv.food[k] -= n; items[k] += n; }
    }
  }

  // Взять из амбара в рюкзак не больше n
  take(rec, key, n) {
    const inv = this.game.inventory, items = rec.state.items;
    const want = Math.min(n, items[key]);
    const got = FOOD_ORDER.includes(key) ? inv.addFood(key, want) : inv.add(key, want);
    items[key] -= got;
    return got;
  }

  // Страховка амбара: после нападения защита восстанавливается сама (раз в сутки, пока страховка действует)
  insure(rec) {
    const g = this.game, D = DEFENSE.barn;
    if (!g.inventory.spend({ gold: D.insuranceGold })) return g.ui.toast(t('needResources'));
    rec.state.ins = D.insuranceDays;
    g.ui.toast(t('barn.insured'));
  }

  // Усилить защиту амбара за дерево
  repairDefense(rec) {
    const g = this.game, D = DEFENSE.barn;
    if (rec.def >= rec.maxDef) return;
    if (!g.inventory.spend(D.repairCost)) return g.ui.toast(t('needResources'));
    rec.def = Math.min(rec.maxDef, rec.def + D.repairDefense);
  }

  // ---------- питание зверей ----------

  // Сколько еды в день нужно зверю: 1, с 4 уровня 2, с 8 уровня 3
  upkeep(rec) {
    return 1 + Math.floor((rec.level - 1) / 4);
  }

  // Берёт одну порцию еды (сначала любимую): из амбаров, потом из рюкзака. Возвращает вид еды или null.
  takeOne(prefer) {
    const order = [prefer, ...FOOD_ORDER.filter(k => k !== prefer)];
    for (const k of order) {
      const barn = this.barns().find(r => r.state.items[k] > 0);
      if (barn) { barn.state.items[k]--; return k; }
      if (this.game.inventory.takeFood(k, 1)) return k;
    }
    return null;
  }

  // Новые сутки: страховка амбара чинит защиту
  insuranceDay() {
    for (const b of this.barns()) {
      if (b.state.ins > 0) { b.def = b.maxDef; b.state.ins--; }
    }
  }

  feedBeasts() {
    this.insuranceDay();
    const cm = this.game.creatures;
    if (!cm.collection.length) return;
    let fed = 0, hungry = 0;
    const fled = [];
    for (const rec of [...cm.collection]) {
      const species = CREATURES[rec.id].species, fav = FAVORITE[species];
      let need = this.upkeep(rec), ate = 0, loved = false;
      while (need > 0) {
        const k = this.takeOne(fav);
        if (!k) break;
        need--; ate++;
        if (k === fav) loved = true;
      }
      if (ate >= this.upkeep(rec)) {
        rec.fed = true; rec.hunger = 0; fed++;
        cm.addXpToRecord(rec, loved ? BEAST_FOOD.favoriteXp : BEAST_FOOD.otherXp);
      } else {
        rec.fed = false; rec.hunger = (rec.hunger ?? 0) + 1; hungry++;
        if (rec.hunger >= BEAST_FOOD.fleeAfterDays) fled.push(rec.id);
      }
    }
    for (const id of fled) cm.runAway(id);
    cm.applyHunger();
    const ui = this.game.ui;
    if (fled.length) ui.toast(`${fled.map(id => this.game.creatureName(id)).join(', ')}: ${t('beast.ranAway')}`);
    else if (hungry) ui.toast(`${t('beast.hungry')}: ${hungry}. ${t('beast.needFood')}`);
    else if (fed) ui.toast(`${t('beast.fed')}: ${fed}`);
  }

  // ---------- сохранение ----------

  reset() {
    this.lastDay = this.game.world.dayCount;
    this.t = 0;
  }
}

