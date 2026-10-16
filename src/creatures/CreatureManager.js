import { Creature } from './Creature.js';
import { updateCreature, tryAbility } from './CreatureAI.js';
import { CREATURES } from '../config/creatures.js';
import { t } from '../config/i18n.js';
import { events } from '../core/Events.js';
import { HEROES, CLASSES } from '../config/heroes.js';

const TAME_RANGE = 2.8;

// Дикие и приручённые существа: появление, приручение, команды, опыт.
export class CreatureManager {
  constructor({ scene, world, player, inventory, combat, ui }) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.inventory = inventory;
    this.combat = combat;
    this.ui = ui;
    this.wild = [];
    this.collection = []; // приручённые: [{ id, level, xp }]
    this.actives = [];    // существа, которые идут за героем (сколько — зависит от класса героя: 1, у поддержки до 3)
    this.arena = null;    // режим арены: { mul } — одинаковые характеристики у всех
    this.spawnWild();
  }

  // Первое существо (для значка в углу экрана и строительства)
  get active() {
    return this.actives[0] ?? null;
  }

  get activeId() {
    return this.active?.id ?? null;
  }

  get activeIds() {
    return this.actives.map(c => c.id);
  }

  // Сколько зверей может сопровождать героя
  get limit() {
    return CLASSES[HEROES[this.player.heroId].cls].beasts;
  }

  // Арена: все спутники получают одинаковые характеристики (mul — множитель силы класса героя)
  setArenaMode(on) {
    const mul = CLASSES[HEROES[this.player.heroId].cls].beastPower ?? 1;
    this.arena = on ? { mul } : null;
    for (const c of this.actives) this.applyMode(c);
  }

  applyMode(c) {
    c.normalized = !!this.arena;
    c.arenaMul = this.arena?.mul ?? 1;
    c.team = this.arena ? 'blue' : null;             // команда героя на арене (чтобы проходить свои ворота)
  }

  spawnWild() {
    for (const def of Object.values(CREATURES)) {
      if (this.collection.some(r => r.id === def.id) || this.wild.some(w => w.id === def.id)) continue;
      const p = this.world.findFree(def.spawn.x, def.spawn.z, 1.5);
      const c = new Creature(def.id, this.scene, { wild: true });
      c.pos.set(p.x, 0, p.z);
      c.syncMesh(0, false);
      this.wild.push(c);
    }
  }

  nearestWild(pos) {
    let best = null, bestD = TAME_RANGE;
    for (const w of this.wild) {
      const d = Math.hypot(w.pos.x - pos.x, w.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best ? { creature: best, dist: bestD } : null;
  }

  // Приручение: отдаём нужные ресурсы — существо становится спутником
  tame(wild) {
    const cost = wild.def.tame.cost;
    if (!this.inventory.spend(cost)) return false;
    wild.dispose();
    this.wild = this.wild.filter(w => w !== wild);
    this.collection.push({ id: wild.id, level: 1, xp: 0 });
    this.summon(wild.id, wild.pos);
    return true;
  }

  // Позвать существо. Если места нет, уходит то, которое с героем дольше всех.
  summon(id, at) {
    const rec = this.collection.find(r => r.id === id);
    if (!rec || this.actives.some(c => c.id === id)) return;
    this.syncActive();
    while (this.actives.length >= this.limit) this.actives.shift().dispose();
    const c = new Creature(id, this.scene, { level: rec.level, xp: rec.xp });
    const p = at ?? { x: this.player.pos.x + 1.5, z: this.player.pos.z + 1.5 };
    c.pos.set(p.x, 0, p.z);
    this.applyMode(c);
    c.syncMesh(0, false);
    this.actives.push(c);
  }

  // Кнопка в панели: позвать или отпустить
  toggle(id) {
    const c = this.actives.find(x => x.id === id);
    if (!c) return this.summon(id);
    this.syncActive();
    this.actives = this.actives.filter(x => x !== c);
    c.dispose();
  }

  // Записывает уровень и опыт существ рядом в коллекцию
  syncActive() {
    for (const c of this.actives) {
      const rec = this.collection.find(r => r.id === c.id);
      if (rec) { rec.level = c.level; rec.xp = c.xp; }
    }
  }

  list() {
    this.syncActive();
    return this.collection.map(r => ({ ...r }));
  }

  // Опыт делится между всеми зверями рядом (с небольшой надбавкой за каждого)
  gainXp(n) {
    const share = Math.ceil((n / Math.max(1, this.actives.length)) * (1 + 0.15 * (this.actives.length - 1)));
    for (const c of this.actives) this.gainOne(c, share);
  }

  gainOne(c, n) {
    if (!c.addXp(n)) return;
    if (c.justEvolved) {
      // Эволюция: новая стадия, большой эффект и особый звук
      c.justEvolved = false;
      this.ui.toast(`${t('evolved')} ${t(c.nameKey)}`);
      this.combat.ring(c.pos, 0xff9bf5, 5, 0.9);
      events.emit('evolve');
    } else {
      this.ui.toast(`${t(c.nameKey)}: ${t('levelUp')} ${c.level}`);
      this.combat.ring(c.pos, 0xffe066, 3, 0.6);
      events.emit('levelUp');
    }
  }

  // Команды: follow | stay | defend | attack | ability | return
  // Команда действует на всех зверей рядом
  command(cmd) {
    if (!this.actives.length) { this.ui.toast(t('noCreatures')); return; }
    const ctx = this.ctx();
    if (cmd === 'attack') {
      const target = this.combat.nearestEnemy(this.player.pos, 14);
      if (!target) { this.ui.toast(t('noTarget')); return; }
      for (const c of this.actives) { c.command = 'attack'; c.manualTarget = target; }
      return;
    }
    if (cmd === 'ability') {
      let used = 0, waiting = 0;
      for (const c of this.actives) {
        if (tryAbility(c, ctx, c.manualTarget, true)) used++;
        else if (c.cd > 0) waiting++;
      }
      if (!used) this.ui.toast(waiting ? t('notReady') : t('noTarget'));
      return;
    }
    for (const c of this.actives) {
      if (cmd === 'return') { c.command = 'follow'; c.manualTarget = null; c.state = 'return'; }
      else { c.command = cmd; c.manualTarget = null; }       // follow | stay | defend
    }
  }

  ctx() {
    return { player: this.player, combat: this.combat, world: this.world, ui: this.ui };
  }

  update(dt) {
    for (const w of this.wild) {
      // Дикие существа просто стоят и поглядывают на героя
      const dx = this.player.pos.x - w.pos.x, dz = this.player.pos.z - w.pos.z;
      if (Math.hypot(dx, dz) < 8) w.facing = Math.atan2(dx, dz);
      w.syncMesh(dt, false);
    }
    // Звери рядом занимают разные места вокруг героя, чтобы не слипаться
    const n = this.actives.length;
    this.actives.forEach((c, i) => {
      if (n > 1) {
        const a = Math.PI + (i / n) * Math.PI * 2;
        c.anchor = { x: this.player.pos.x + Math.cos(a) * 2.4, z: this.player.pos.z + Math.sin(a) * 2.4 };
      } else c.anchor = null;
      updateCreature(c, dt, this.ctx());
    });
  }

  reset() {
    this.actives.forEach(c => c.dispose());
    this.actives = [];
    this.wild.forEach(w => w.dispose());
    this.wild = [];
    this.collection = [];
    this.spawnWild();
  }

  toSave() {
    this.syncActive();
    return { active: this.activeId, actives: this.activeIds, collection: this.collection.map(r => ({ ...r })) };
  }

  fromSave(data) {
    this.reset();
    if (!data) return;
    this.collection = data.collection.map(r => ({ ...r }));
    const tamed = new Set(this.collection.map(r => r.id));
    this.wild.filter(w => tamed.has(w.id)).forEach(w => w.dispose());
    this.wild = this.wild.filter(w => !tamed.has(w.id));
    // Версия 7 хранит список зверей рядом, старые — одного (active)
    const ids = Array.isArray(data.actives) ? data.actives : (data.active ? [data.active] : []);
    for (const id of ids) if (tamed.has(id)) this.summon(id);
  }
}
