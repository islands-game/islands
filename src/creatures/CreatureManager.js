import { Creature } from './Creature.js';
import { updateCreature, tryAbility } from './CreatureAI.js';
import { CREATURES } from '../config/creatures.js';
import { t } from '../config/i18n.js';
import { events } from '../core/Events.js';

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
    this.active = null;   // существо, которое идёт за героем
    this.spawnWild();
  }

  get activeId() {
    return this.active?.id ?? null;
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

  summon(id, at) {
    const rec = this.collection.find(r => r.id === id);
    if (!rec) return;
    this.syncActive();
    this.active?.dispose();
    const c = new Creature(id, this.scene, { level: rec.level, xp: rec.xp });
    const p = at ?? { x: this.player.pos.x + 1.5, z: this.player.pos.z + 1.5 };
    c.pos.set(p.x, 0, p.z);
    c.syncMesh(0, false);
    this.active = c;
  }

  // Записывает уровень и опыт активного существа в коллекцию
  syncActive() {
    if (!this.active) return;
    const rec = this.collection.find(r => r.id === this.active.id);
    if (rec) { rec.level = this.active.level; rec.xp = this.active.xp; }
  }

  list() {
    this.syncActive();
    return this.collection.map(r => ({ ...r }));
  }

  gainXp(n) {
    if (this.active?.addXp(n)) {
      this.ui.toast(`${t('creature.' + this.active.id)}: ${t('levelUp')} ${this.active.level}`);
      this.combat.ring(this.active.pos, 0xffe066, 3, 0.6);
      events.emit('levelUp');
    }
  }

  // Команды: follow | stay | defend | attack | ability | return
  command(cmd) {
    const c = this.active;
    if (!c) { this.ui.toast(t('noCreatures')); return; }
    const ctx = this.ctx();
    switch (cmd) {
      case 'follow':
      case 'stay':
      case 'defend':
        c.command = cmd;
        c.manualTarget = null;
        break;
      case 'return':
        c.command = 'follow';
        c.manualTarget = null;
        c.state = 'return';
        break;
      case 'attack': {
        const target = this.combat.nearestEnemy(this.player.pos, 14);
        if (!target) { this.ui.toast(t('noTarget')); return; }
        c.command = 'attack';
        c.manualTarget = target;
        break;
      }
      case 'ability':
        if (!tryAbility(c, ctx, c.manualTarget, true)) {
          this.ui.toast(c.cd > 0 ? t('notReady') : t('noTarget'));
        }
        break;
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
    if (this.active) updateCreature(this.active, dt, this.ctx());
  }

  reset() {
    this.active?.dispose();
    this.active = null;
    this.wild.forEach(w => w.dispose());
    this.wild = [];
    this.collection = [];
    this.spawnWild();
  }

  toSave() {
    this.syncActive();
    return { active: this.activeId, collection: this.collection.map(r => ({ ...r })) };
  }

  fromSave(data) {
    this.reset();
    if (!data) return;
    this.collection = data.collection.map(r => ({ ...r }));
    const tamed = new Set(this.collection.map(r => r.id));
    this.wild.filter(w => tamed.has(w.id)).forEach(w => w.dispose());
    this.wild = this.wild.filter(w => !tamed.has(w.id));
    if (data.active && tamed.has(data.active)) this.summon(data.active);
  }
}
