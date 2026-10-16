import { QUESTS } from '../config/quests.js';
import { STORY } from '../config/story.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

// Все задания по порядку: сначала сюжетная цепочка «Путь выжившего» (config/story.js), потом «Приключения» (config/quests.js).
const ALL = [...STORY, ...QUESTS];
export const STORY_LENGTH = STORY.length;

// Задания: ведёт счётчик текущего задания, выдаёт награду и переходит к следующему.
// Одни задания считаются по событиям игры (collect, kill, tame, portal...), другие проверяют состояние (есть ли ферма).
export class QuestManager {
  constructor(game) {
    this.game = game;
    this.index = 0;     // номер текущего задания в ALL
    this.progress = 0;  // сколько уже сделано
    this.began = false; // началась ли цепочка (после заставки)
    this.walkLast = null;

    events.on('collect', (type, n = 1) => {
      this.add('collect', type, n);
      if (type === 'berries' || type === 'grain') this.add('harvest', 'any', n);     // урожай с грядок
    });
    events.on('kill', enemy => this.add('kill', enemy?.def?.id, 1));
    events.on('tame', () => this.add('tame', 'any', 1));
    events.on('portal', island => this.add('visit', island, 1));
    events.on('arenaWin', () => this.add('arena', 'any', 1));
    events.on('fed', () => this.add('fed', 'any', 1));
    events.on('build', () => this.check());
  }

  get list() {
    return ALL;
  }

  get total() {
    return ALL.length;
  }

  get current() {
    return this.began ? (ALL[this.index] ?? null) : null;
  }

  get done() {
    return this.index >= ALL.length;
  }

  isStory(q) {
    return q?.chapter !== undefined;
  }

  // С чего начинается счётчик: то, что уже есть у игрока, засчитывается сразу
  startProgress(q) {
    if (!q) return 0;
    if (q.type === 'tame') return this.game.creatures.collection.length;
    if (q.type === 'build') return this.game.build.placed.length;
    return 0;
  }

  add(type, key, n) {
    const q = this.current;
    if (!q || q.type !== type) return;
    if (q.target !== undefined && q.target !== 'any' && q.target !== key) return;
    this.progress += n;
    this.check();
  }

  value(q) {
    const g = this.game;
    if (q.type === 'level') return g.player.level;
    if (q.type === 'has') return g.build.placed.some(r => r.id === q.target) ? 1 : 0;
    return this.progress;
  }

  check() {
    const q = this.current;
    if (q && this.value(q) >= q.amount) this.complete(q);
  }

  // Началось новое задание: реплика героя
  announce(q) {
    if (q?.voice) this.game.ui.toast(t('story.' + q.voice));
    if (q?.voice) events.emit('quest');
  }

  // Награда и переход к следующему заданию
  complete(q) {
    const g = this.game;
    const { xp = 0, gold = 0, items = {} } = q.reward;
    for (const [k, v] of Object.entries(items)) g.inventory.add(k, v);
    if (gold) {
      const got = g.inventory.add('gold', gold);
      if (got > 0) g.ui.floatText(g.player.pos.clone().setY(2.6), `+${got} 💰`, '#ffd23f');
    }
    g.ui.toast(`${t('quest.done')}: ${t('quest.' + q.id)}`);
    events.emit('quest');
    const chapter = q.chapter;
    this.index++;
    this.progress = this.startProgress(this.current);
    this.walkLast = null;
    if (xp) g.gainXp(xp);
    const next = this.current;
    if (chapter !== undefined && next?.chapter !== chapter) g.ui.toast(`${t('chapter.done')}: ${t('chapter.' + chapter)}`);
    this.announce(next);
    this.check(); // следующее задание могло уже быть выполнено
  }

  // Каждый кадр: прогулка, уровень, «подойти к цели», «построено»
  update() {
    const q = this.current;
    if (!q) return;
    const g = this.game, p = g.player.pos;
    if (q.type === 'walk') {
      if (this.walkLast && !g.player.vessel) {
        const d = Math.hypot(p.x - this.walkLast.x, p.z - this.walkLast.z);
        if (d < 3) this.progress += d;                    // телепорт и рывки не считаются шагами
      }
      this.walkLast = { x: p.x, z: p.z };
    } else if (q.type === 'reach') {
      const target = g.guide?.resolve(q);
      if (target && Math.hypot(target.x - p.x, target.z - p.z) < q.radius) this.progress = q.amount;
    }
    this.check();
  }

  // Начало цепочки: после заставки
  begin() {
    this.began = true;
    this.progress = this.startProgress(this.current);
    this.announce(this.current);
    this.check();
  }

  reset() {
    this.index = 0;
    this.began = false;
    this.progress = 0;
    this.walkLast = null;
  }

  toSave() {
    return { index: this.index, progress: Math.floor(this.progress) };
  }

  fromSave(data) {
    this.index = Math.max(0, Math.min(ALL.length, data?.index ?? 0));
    this.progress = Math.max(0, data?.progress ?? 0);
    this.began = true;
    this.walkLast = null;
  }
}
