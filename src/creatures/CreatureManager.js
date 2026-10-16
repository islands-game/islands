import { Creature } from './Creature.js';
import { updateCreature, updateGuard, tryAbility } from './CreatureAI.js';
import { t } from '../config/i18n.js';
import { events } from '../core/Events.js';
import { LEVELS } from '../config/levels.js';
import { HEROES, CLASSES } from '../config/heroes.js';

// Звери героя: коллекция, кто идёт рядом, освобождение и отпускание, команды, опыт.
export class CreatureManager {
  constructor({ scene, world, player, inventory, combat, ui }) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.inventory = inventory;
    this.combat = combat;
    this.ui = ui;
    this.collection = []; // звери героя: [{ id, level, xp }]
    this.actives = [];    // звери, которые идут за героем (сколько — зависит от класса героя: 1, у поддержки до 3)
    this.guards = [];     // остальные звери коллекции: охраняют домашний остров и тоже растут
    this.arena = null;    // режим арены: { mul } — одинаковые характеристики у всех
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

  // Охранники: все звери коллекции, которых нет рядом с героем, стоят на постах домашнего острова
  rebuildGuards() {
    this.guards.forEach(g => g.dispose());
    this.guards = [];
    const following = new Set(this.actives.map(c => c.id));
    let i = 0;
    for (const r of this.collection) {
      if (following.has(r.id)) continue;
      const a = Math.PI * 0.25 + (i++ / 5) * Math.PI * 2;           // посты по кругу вокруг центра острова
      const post = this.world.findFree(Math.cos(a) * 10, Math.sin(a) * 10, 1.4);
      const c = new Creature(r.id, this.scene, { level: r.level, xp: r.xp, fed: r.fed, hunger: r.hunger });
      c.post = { x: post.x, z: post.z };
      c.pos.set(post.x, 0, post.z);
      this.applyMode(c);
      c.normalized = false;
      c.syncMesh(0, false);
      this.guards.push(c);
    }
  }

  // Герой ложится спать: все звери перестают ходить за ним и идут патрулировать базу
  dismissAll() {
    const n = this.actives.length;
    if (!n) return 0;
    this.syncActive();
    this.actives.forEach(c => c.dispose());
    this.actives = [];
    this.rebuildGuards();
    return n;
  }

  // Охранники получают часть опыта за врагов, побеждённых на домашнем острове
  gainGuardXp(enemy, xp) {
    if (!this.guards.length || this.world.islandIdAt(enemy.pos.x, enemy.pos.z) !== 'home') return;
    for (const c of this.guards) this.gainOne(c, Math.ceil(xp * LEVELS.guardShare));
    this.syncActive();
  }

  // Зверь есть в коллекции?
  has(id) {
    return this.collection.some(r => r.id === id);
  }

  // Зверя освободили из клетки: он попадает в коллекцию и сразу идёт за героем
  addFreed(id, at) {
    if (this.has(id)) return;
    this.collection.push({ id, level: 1, xp: 0, fed: true, hunger: 0 });
    this.summon(id, at);
    this.rebuildGuards();
  }

  // После кормления: передаёт сытость и голод из записей в живых зверей
  applyHunger() {
    for (const c of [...this.actives, ...this.guards]) {
      const rec = this.collection.find(r => r.id === c.id);
      if (rec) { c.fed = rec.fed !== false; c.hunger = rec.hunger ?? 0; }
    }
  }

  // Опыт за еду (любимая еда даёт больше)
  addXpToRecord(rec, xp) {
    const c = [...this.actives, ...this.guards].find(x => x.id === rec.id);
    if (c) this.gainOne(c, xp);
    this.syncActive();
  }

  // Зверь убегает от голода: уходит из коллекции
  runAway(id) {
    this.release(id);
  }

  // Отпустить зверя на свободу: он уходит из коллекции навсегда (получить такого же можно в портале снова)
  release(id) {
    const i = this.collection.findIndex(r => r.id === id);
    if (i < 0) return false;
    this.syncActive();
    const c = this.actives.find(x => x.id === id);
    if (c) { this.actives = this.actives.filter(x => x !== c); c.dispose(); }
    this.collection.splice(i, 1);
    this.rebuildGuards();
    return true;
  }

  // Позвать зверя. Если места нет, уходит тот, который с героем дольше всех.
  summon(id, at) {
    const rec = this.collection.find(r => r.id === id);
    if (!rec || this.actives.some(c => c.id === id)) return;
    this.syncActive();
    while (this.actives.length >= this.limit) this.actives.shift().dispose();
    const c = new Creature(id, this.scene, { level: rec.level, xp: rec.xp, fed: rec.fed, hunger: rec.hunger });
    const p = at ?? { x: this.player.pos.x + 1.5, z: this.player.pos.z + 1.5 };
    c.pos.set(p.x, 0, p.z);
    this.applyMode(c);
    c.syncMesh(0, false);
    this.actives.push(c);
    this.rebuildGuards();
  }

  // Кнопка в панели: позвать или отпустить
  toggle(id) {
    const c = this.actives.find(x => x.id === id);
    if (!c) return this.summon(id);
    this.syncActive();
    this.actives = this.actives.filter(x => x !== c);
    c.dispose();
    this.rebuildGuards();                         // отпущенный из «рядом» зверь идёт охранять остров
  }

  // Записывает уровень и опыт зверей (рядом и на посту) в коллекцию
  syncActive() {
    for (const c of [...this.actives, ...this.guards]) {
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
      this.ui.toast(`${t('evolved')} ${c.displayName}`);
      this.combat.ring(c.pos, 0xff9bf5, 5, 0.9);
      events.emit('evolve');
    } else {
      this.ui.toast(`${c.displayName}: ${t('levelUp')} ${c.level}`);
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
    // Звери рядом занимают разные места вокруг героя, чтобы не слипаться
    const n = this.actives.length;
    this.actives.forEach((c, i) => {
      if (n > 1) {
        const a = Math.PI + (i / n) * Math.PI * 2;
        c.anchor = { x: this.player.pos.x + Math.cos(a) * 2.4, z: this.player.pos.z + Math.sin(a) * 2.4 };
      } else c.anchor = null;
      updateCreature(c, dt, this.ctx());
    });
    // Охранники работают, пока герой на домашнем острове (там нападают рейды)
    const home = this.world.islandIdAt(this.player.pos.x, this.player.pos.z) === 'home';
    for (const c of this.guards) {
      if (home) updateGuard(c, dt, this.ctx());
      else c.syncMesh(dt, false);
    }
  }

  reset() {
    this.actives.forEach(c => c.dispose());
    this.guards.forEach(c => c.dispose());
    this.actives = [];
    this.guards = [];
    this.collection = [];
  }

  toSave() {
    this.syncActive();
    return { active: this.activeId, actives: this.activeIds, collection: this.collection.map(r => ({ ...r })) };
  }

  fromSave(data) {
    this.reset();
    if (!data) return;
    this.collection = data.collection.map(r => ({ ...r }));
    const ids = Array.isArray(data.actives) ? data.actives : (data.active ? [data.active] : []);
    for (const id of ids.slice(0, this.limit)) if (this.has(id)) this.summon(id);   // если класс героя берёт меньше зверей, остаются первые
    this.rebuildGuards();
  }
}
