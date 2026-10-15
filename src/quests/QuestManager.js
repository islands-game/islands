import { QUESTS } from '../config/quests.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

// Задания: ведёт счётчик текущего задания, выдаёт награду и переходит к следующему.
// Слушает события игры (collect, kill, tame, build, portal) — так задания не мешают остальному коду.
export class QuestManager {
  constructor(game) {
    this.game = game;
    this.index = 0;     // номер текущего задания в QUESTS
    this.progress = 0;  // сколько уже сделано

    events.on('collect', (type, n = 1) => this.add('collect', type, n));
    events.on('kill', enemy => this.add('kill', enemy?.def?.id, 1));
    events.on('tame', () => this.add('tame', 'any', 1));
    events.on('build', () => this.add('build', 'any', 1));
    events.on('portal', island => this.add('visit', island, 1));
    events.on('arenaWin', () => this.add('arena', 'any', 1));
  }

  get current() {
    return QUESTS[this.index] ?? null;
  }

  get done() {
    return this.index >= QUESTS.length;
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
    if (q.target !== 'any' && q.target !== key) return;
    this.progress += n;
    this.check();
  }

  value(q) {
    return q.type === 'level' ? this.game.player.level : this.progress;
  }

  check() {
    const q = this.current;
    if (q && this.value(q) >= q.amount) this.complete(q);
  }

  // Награда и переход к следующему заданию
  complete(q) {
    const g = this.game;
    const { xp = 0, items = {} } = q.reward;
    for (const [k, v] of Object.entries(items)) g.inventory.add(k, v);
    g.ui.toast(`${t('quest.done')}: ${t('quest.' + q.id)}`);
    events.emit('quest');
    this.index++;
    this.progress = this.startProgress(this.current);
    if (xp) g.gainXp(xp);
    this.check(); // следующее задание могло уже быть выполнено
  }

  // Задания на уровень проверяются каждый кадр
  update() {
    if (this.current?.type === 'level') this.check();
  }

  reset() {
    this.index = 0;
    this.progress = this.startProgress(QUESTS[0]);
  }

  toSave() {
    return { index: this.index, progress: this.progress };
  }

  fromSave(data) {
    this.index = Math.max(0, Math.min(QUESTS.length, data?.index ?? 0));
    this.progress = Math.max(0, data?.progress ?? 0);
  }
}
