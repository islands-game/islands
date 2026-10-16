import { RAIDS } from '../config/raids.js';
import { TUTORIAL_FIGHT_STEP } from '../ui/Tutorial.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

// Рейды: вечером раз в несколько суток слизни нападают на домашний остров.
// Состояния: idle (спокойно) -> warning (предупреждение) -> active (рейд идёт).
// Спрятаться можно в доме; рейд закончится сам, если слизней не победить.
export class RaidSystem {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.timer = 0;
    this.total = 0;
    this.pending = 0;
    this.raidedDay = -1;     // в какие сутки уже был рейд
    this.firstDone = false;  // был ли первый рейд (из обучения)
  }

  get active() {
    return this.state === 'active';
  }

  get remaining() {
    return this.game.combat.raiders().filter(e => !e.dead).length;
  }

  atHome() {
    const p = this.game.player.pos;
    return this.game.world.islandIdAt(p.x, p.z) === 'home';
  }

  begin(count) {
    this.state = 'warning';
    this.timer = RAIDS.warnSeconds;
    this.pending = count;
    this.raidedDay = this.game.world.dayCount;
    this.game.ui.toast(t('raidWarn'));
    events.emit('raidWarn');
  }

  spawn() {
    const g = this.game;
    for (let i = 0; i < this.pending; i++) {
      const a = (i / this.pending) * Math.PI * 2 + Math.random() * 0.6;
      const spot = g.world.findFree(Math.cos(a) * 22, Math.sin(a) * 22, 1.2);       // слизни выходят с края большого острова
      g.combat.spawnRaider(RAIDS.enemy, spot.x, spot.z);
    }
    this.total = this.pending;
    this.state = 'active';
    this.timer = RAIDS.durationSeconds;
    g.ui.toast(t('raidStart'));
    events.emit('raid');
  }

  // Рейд заканчивается: why = 'win' | 'gone' | 'sleep' | 'left'
  endRaid(why) {
    if (this.state === 'idle') return;
    const g = this.game;
    const wasActive = this.state === 'active';
    this.state = 'idle';
    if (g.combat.raiders().some(e => !e.dead && e.loot)) g.ui.toast(t('loot.lost'));   // слизни ушли с добычей
    g.combat.clearRaiders();
    if (why === 'win' && wasActive) {
      const xp = RAIDS.rewardXp + RAIDS.rewardPerEnemy * this.total;
      g.ui.toast(`${t('raidWin')} +${xp} XP`);
      events.emit('quest');
      g.gainXp(xp);
    } else if (why === 'gone' && wasActive) {
      g.ui.toast(t('raidGone'));
    }
  }

  update(dt) {
    const g = this.game, w = g.world;
    if (this.state === 'idle') {
      if (!this.atHome() || g.player.dead) return;
      if (!this.firstDone && g.tutorialStep === TUTORIAL_FIGHT_STEP) {
        this.firstDone = true;
        this.begin(RAIDS.firstCount);
      } else if (w.day >= RAIDS.duskFrom && w.day < RAIDS.duskTo
        && (w.dayCount + 1) % RAIDS.everyDays === 0 && this.raidedDay !== w.dayCount) {
        this.firstDone = true;
        this.begin(Math.min(RAIDS.maxCount, RAIDS.baseCount + Math.floor(g.player.level / 2)));
      }
      return;
    }
    // Герой улетел на другой остров — рейд тихо отменяется
    if (!this.atHome()) return this.endRaid('left');
    this.timer -= dt;
    if (this.state === 'warning') {
      if (this.timer <= 0) this.spawn();
    } else if (this.remaining === 0) {
      this.endRaid('win');
    } else if (this.timer <= 0) {
      this.endRaid('gone');
    }
  }

  toSave() {
    return { raidedDay: this.raidedDay, firstDone: this.firstDone };
  }

  fromSave(data) {
    this.reset();
    this.raidedDay = data?.raidedDay ?? -1;
    this.firstDone = data?.firstDone ?? true;
  }
}
