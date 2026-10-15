import * as THREE from 'three';
import { t, setLang, getLang, LANGS } from '../config/i18n.js';
import { SaveManager } from '../save/SaveManager.js';
import { RESOURCES, RESOURCE_ORDER } from '../config/resources.js';
import { CREATURES, creatureNameKey } from '../config/creatures.js';
import { MAX_LEVEL } from '../progression/Progression.js';
import { Settings, QUALITIES } from '../save/Settings.js';
import { events } from '../core/Events.js';

const COMMANDS = ['follow', 'stay', 'defend', 'attack', 'ability', 'return'];
const _v = new THREE.Vector3();

// Интерфейс: меню, полоски, ресурсы, спутник, подсказки, панель существ, всплывающий урон.
export class UIManager {
  constructor({ onStart, onContinue, onMenu, onSummon, onSelectBuilding, onSkipTutorial, press, isTouch }) {
    this.$ = id => document.getElementById(id);
    this.isTouch = isTouch;
    this.press = press;
    this.onSummon = onSummon;
    this.onSelectBuilding = onSelectBuilding;
    this.buildPanelOpen = false;
    this.hintTimer = 0;
    this.toastTimer = 0;
    this.camera = null;
    this.panelOpen = false;

    const saved = SaveManager.loadLang();
    setLang(LANGS.includes(saved) ? saved : 'ru');

    this.$('btn-new').onclick = () => {
      if (SaveManager.load() && !confirm(t('confirmNew'))) return;
      onStart();
    };
    this.$('btn-continue').onclick = onContinue;
    this.$('btn-menu').onclick = onMenu;
    this.$('btn-attack').onclick = () => press('attack');
    this.$('btn-interact').onclick = () => press('interact');
    this.$('btn-ability').onclick = () => press('ability');
    this.$('btn-spell1').onclick = () => press('spell1');
    this.$('btn-spell2').onclick = () => press('spell2');
    this.$('ar-again').onclick = () => press('arenaAgain');
    this.$('ar-exit').onclick = () => press('arenaExit');
    this.$('btn-creatures').onclick = () => press('panel');
    this.$('cr-close').onclick = () => this.showPanel(false);
    this.$('btn-build').onclick = () => press('build');
    this.$('bp-close').onclick = () => this.showBuildPanel(false);
    this.$('bb-rot').onclick = () => press('rotate');
    this.$('bb-ok').onclick = () => press('confirm');
    this.$('bb-cancel').onclick = () => press('cancel');
    this.$('tut-skip').onclick = onSkipTutorial;
    this.initSettings();
    document.querySelectorAll('[data-lang]').forEach(b => {
      b.onclick = () => {
        setLang(b.dataset.lang);
        SaveManager.saveLang(b.dataset.lang);
        this.refreshTexts();
      };
    });
    if (isTouch) this.$('touch').classList.remove('hidden');

    // Счётчики ресурсов
    this.resEls = {};
    for (const k of RESOURCE_ORDER) {
      const span = document.createElement('span');
      this.$('res').appendChild(span);
      this.resEls[k] = span;
    }
    // Часы: солнце или луна
    this.clockEl = document.createElement('span');
    this.$('res').appendChild(this.clockEl);
    this.refreshTexts();
  }

  setCamera(camera) {
    this.camera = camera;
  }

  // --- Настройки (звук, качество, FPS) ---

  initSettings() {
    this.$('btn-settings').onclick = () => this.$('settings-panel').classList.remove('hidden');
    this.$('st-close').onclick = () => this.$('settings-panel').classList.add('hidden');
    this.$('st-sound').onclick = () => { Settings.set({ sound: !Settings.get().sound }); this.refreshSettings(); };
    this.$('st-fps').onclick = () => { Settings.set({ showFps: !Settings.get().showFps }); this.refreshSettings(); };
    this.$('st-vol').oninput = e => Settings.set({ volume: e.target.value / 100 });
    this.$('st-vol').onchange = () => events.emit('collect'); // пробный звук нужной громкости
    const q = this.$('st-q');
    for (const name of QUALITIES) {
      const b = document.createElement('button');
      b.dataset.q = name;
      b.onclick = () => { Settings.set({ quality: name }); this.refreshSettings(); };
      q.appendChild(b);
    }
  }

  refreshSettings() {
    const s = Settings.get();
    this.$('st-title').textContent = t('settings');
    this.$('st-close').textContent = t('close');
    this.$('st-sound-l').textContent = t('sound');
    this.$('st-vol-l').textContent = t('volume');
    this.$('st-q-l').textContent = t('quality');
    this.$('st-fps-l').textContent = t('showFps');
    const sound = this.$('st-sound');
    sound.textContent = s.sound ? t('on') : t('off');
    sound.classList.toggle('on', s.sound);
    const fps = this.$('st-fps');
    fps.textContent = s.showFps ? t('on') : t('off');
    fps.classList.toggle('on', s.showFps);
    this.$('st-vol').value = Math.round(s.volume * 100);
    this.$('st-q').querySelectorAll('button').forEach(b => {
      b.textContent = t('q.' + b.dataset.q);
      b.classList.toggle('active', b.dataset.q === s.quality);
    });
  }

  // Значок времени суток: ☀ днём, ☾ ночью
  setClock(night) {
    const icon = night > 0.6 ? '☾' : night > 0.25 ? '◐' : '☀';
    if (this.clockEl.textContent !== icon) this.clockEl.textContent = icon;
  }

  // Задание: q — запись из config/quests.js, 'done' — все выполнены, null — скрыть
  setQuest(q, progress, total) {
    const box = this.$('quest');
    box.classList.toggle('hidden', q === null);
    if (q === null) return;
    this.$('quest-title').textContent = t('quest.title');
    if (q === 'done') {
      this.$('quest-text').textContent = t('quest.allDone');
      this.$('quest-count').textContent = '';
      this.$('quest-fill').style.width = '100%';
      this.$('quest-reward').textContent = '';
      return;
    }
    const key = `${q.id}:${progress}`;
    if (key === this.questKey && getLang() === this.questLang) return; // ничего не изменилось
    this.questKey = key;
    this.questLang = getLang();
    this.$('quest-text').textContent = t('quest.' + q.id);
    this.$('quest-count').textContent = `${progress}/${q.amount}`;
    this.$('quest-fill').style.width = `${(progress / q.amount) * 100}%`;
    const r = q.reward;
    const items = Object.entries(r.items ?? {}).map(([k, v]) => `${RESOURCES[k].icon}${v}`).join(' ');
    this.$('quest-reward').textContent = `${t('quest.reward')}: ${r.xp ? `${r.xp} XP ` : ''}${items}`;
  }

  // Полоска сверху экрана: здоровье босса или оставшиеся слизни рейда (name === null — скрыть)
  setBar(name, ratio) {
    const box = this.$('boss');
    box.classList.toggle('hidden', !name);
    if (!name) return;
    if (this.$('boss-name').textContent !== name) this.$('boss-name').textContent = name;
    this.$('boss-fill').style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  // Затемнение экрана (сон)
  fade(on) {
    this.$('fade').classList.toggle('on', on);
  }

  // --- Арена ---

  setArena(on) {
    this.arenaOn = on;
    this.$('arena-hud').classList.toggle('hidden', !on);
    this.$('minimap').classList.toggle('hidden', !on);
    if (!on) {
      this.$('arena-result').classList.add('hidden');
      this.$('arena-count').classList.add('hidden');
    } else {
      this.$('arena-result').classList.add('hidden');
    }
  }

  // Большая надпись по центру: отсчёт до начала или время до возрождения
  setArenaCountdown(n, small = false) {
    const el = this.$('arena-count');
    el.classList.toggle('hidden', n <= 0);
    el.classList.toggle('small', small);
    el.textContent = n > 0 ? (small ? `${t('arena.respawn')}: ${n}` : String(n)) : '';
  }

  updateArena(d) {
    const mm = String(Math.floor(d.time / 60)).padStart(2, '0') + ':' + String(Math.floor(d.time % 60)).padStart(2, '0');
    this.$('arena-score').innerHTML = `<span class="b">${d.kills.blue}</span> : <span class="r">${d.kills.red}</span>`;
    this.$('arena-info').textContent = `${mm} · ${t('arena.towers')} ${d.towers.blue}:${d.towers.red}`;
    ['spell1', 'spell2'].forEach((id, i) => {
      const b = this.$('btn-' + id), cd = Math.ceil(d.spellCd[i]);
      b.classList.toggle('cd', cd > 0);
      b.textContent = cd > 0 ? String(cd) : t('arena.' + id);
    });
    if (d.phase === 'playing') this.setArenaCountdown(d.respawn, true);
    this.drawMinimap(d.units);
  }

  drawMinimap(units) {
    const cv = this.$('minimap'), c = cv.getContext('2d');
    const W = cv.width, H = cv.height, sx = W / 76, sz = H / 120;
    const X = x => W / 2 + x * sx, Z = z => H / 2 + z * sz;
    c.fillStyle = '#16301f';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#d8c590';
    c.lineWidth = 3;
    for (const lx of [-28, 0, 28]) { c.beginPath(); c.moveTo(X(lx), Z(-42)); c.lineTo(X(lx), Z(42)); c.stroke(); }
    const col = { blue: '#6aa8ff', red: '#ff6a6a', neutral: '#d9c86a' };
    for (const u of units) {
      if (u.dead) continue;
      const size = { crystal: 5, tower: 3.5, hero: 3, king: 4, monster: 2, minion: 1.4 }[u.kind] ?? 2;
      c.fillStyle = col[u.team];
      if (u.kind === 'tower' || u.kind === 'crystal') c.fillRect(X(u.x) - size, Z(u.z) - size, size * 2, size * 2);
      else { c.beginPath(); c.arc(X(u.x), Z(u.z), size, 0, 6.3); c.fill(); }
      if (u.me) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(X(u.x), Z(u.z), 5, 0, 6.3); c.stroke(); }
    }
  }

  showArenaResult(win, kills, time) {
    this.$('ar-title').textContent = t(win ? 'arena.win' : 'arena.lose');
    const mm = Math.floor(time / 60), ss = String(Math.floor(time % 60)).padStart(2, '0');
    this.$('ar-stats').textContent = `${t('arena.score')} ${kills.blue}:${kills.red} · ${mm}:${ss}`;
    this.$('arena-result').classList.remove('hidden');
    this.$('arena-count').classList.add('hidden');
  }

  hideArenaResult() {
    this.$('arena-result').classList.add('hidden');
  }

  showFps(show) {
    this.$('fps').classList.toggle('hidden', !show);
  }

  setFps(fps, ratio) {
    const el = this.$('fps');
    if (!el.classList.contains('hidden')) el.textContent = `${Math.round(fps)} FPS · x${ratio.toFixed(2)}`;
  }

  refreshTexts() {
    document.documentElement.lang = getLang();
    this.$('menu-sub').textContent = t('subtitle');
    this.$('btn-new').textContent = t('newGame');
    this.$('btn-continue').textContent = t('continue');
    this.$('btn-continue').classList.toggle('hidden', !SaveManager.load());
    this.$('hp-label').textContent = t('hp');
    this.$('lvl-label').textContent = `${t('level')} ${this.level ?? 1}`;
    this.$('btn-jump').textContent = t('jump');
    this.$('btn-spell1').textContent = t('arena.spell1');
    this.$('btn-spell2').textContent = t('arena.spell2');
    this.$('ar-again').textContent = t('arena.again');
    this.$('ar-exit').textContent = t('arena.exit');
    this.$('btn-attack').textContent = `⚔ ${t('attack')}`;
    this.$('btn-interact').textContent = t('interact');
    this.$('cr-title').textContent = t('creatures');
    this.$('cr-close').textContent = t('close');
    this.$('bp-title').textContent = t('buildMenu');
    this.$('bp-close').textContent = t('close');
    this.$('btn-settings').textContent = `⚙ ${t('settings')}`;
    this.refreshSettings();
    this.$('tut-title').textContent = t('tut.title');
    this.$('tut-skip').textContent = t('skip');
    if (this.tutorialState) this.setTutorial(...this.tutorialState);
    document.querySelectorAll('[data-lang]').forEach(b =>
      b.classList.toggle('active', b.dataset.lang === getLang()));
    if (!this.$('hud').classList.contains('hidden')) this.showHint(this.hintKey);
  }

  showMenu(show) {
    this.$('menu').classList.toggle('hidden', !show);
    this.$('hud').classList.toggle('hidden', show);
    if (show) { this.showPanel(false); this.showBuildPanel(false); this.setBuildBar(false); this.refreshTexts(); }
  }

  get anyPanelOpen() {
    return this.panelOpen || this.buildPanelOpen;
  }

  costText(cost) {
    return Object.entries(cost).map(([k, v]) => `${RESOURCES[k].icon}${v}`).join(' ');
  }

  // Меню строительства. items: [{ id, cost, canAfford }]
  showBuildPanel(show, items = []) {
    this.buildPanelOpen = show;
    this.$('build-panel').classList.toggle('hidden', !show);
    if (!show) return;
    const list = this.$('bp-list');
    list.textContent = '';
    const add = (id, name, costText, enabled) => {
      const row = document.createElement('div');
      row.className = 'cr-row';
      const info = document.createElement('div');
      info.textContent = name;
      const small = document.createElement('small');
      small.textContent = costText;
      info.appendChild(small);
      const btn = document.createElement('button');
      btn.textContent = t('select');
      btn.style.opacity = enabled ? 1 : 0.6;
      btn.onclick = () => this.onSelectBuilding(id);
      row.append(info, btn);
      list.appendChild(row);
    };
    for (const it of items) add(it.id, t('building.' + it.id), this.costText(it.cost), it.canAfford);
    add('demolish', '🗑 ' + t('demolish'), '', true);
  }

  // Панель управления строительством (сверху по центру)
  setBuildBar(active, text = '', ok = true) {
    this.$('build-bar').classList.toggle('hidden', !active);
    if (!active) return;
    const info = this.$('bb-info');
    info.textContent = text;
    info.classList.toggle('bad', !ok);
  }

  // Обучение: step — номер шага (0..total-1), null — скрыть
  setTutorial(step, total, key) {
    this.tutorialState = step === null ? null : [step, total, key];
    this.$('hint').style.visibility = step === null ? '' : 'hidden';   // обучение заменяет подсказку
    const box = this.$('tutorial');
    box.classList.toggle('hidden', step === null);
    if (step === null) return;
    this.$('tut-count').textContent = `${step + 1}/${total}`;
    this.$('tut-text').textContent = t(key);
  }

  // Подсказка внизу: обычная или (key = 'arena') для арены
  showHint(key = '') {
    this.hintKey = key;
    const h = this.$('hint');
    h.textContent = this.isTouch ? t(key ? key + 'Touch' : 'hintTouch') : t(key ? key + 'Desktop' : 'hintDesktop');
    h.style.opacity = 1;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { h.style.opacity = 0; }, 9000);
  }

  toast(text) {
    const el = this.$('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  // Всплывающее число над точкой мира (урон, лечение, награда)
  floatText(worldPos, text, color = '#fff') {
    if (!this.camera) return;
    _v.copy(worldPos).project(this.camera);
    if (_v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  flashHurt() {
    const el = this.$('hurt');
    el.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('on')));
  }

  // Подсказка "что можно сделать рядом"; null — скрыть
  setPrompt(text, isNeed = false) {
    const el = this.$('prompt');
    el.classList.toggle('hidden', !text);
    el.classList.toggle('need', isNeed);
    if (text) el.textContent = text;
  }

  updateHud(player, inventory, pet, xpNeed) {
    this.level = player.level;
    this.$('hp-fill').style.width = `${(player.hp / player.maxHp) * 100}%`;
    const full = player.level >= MAX_LEVEL;
    this.$('xp-fill').style.width = `${full ? 100 : Math.min(100, (player.xp / xpNeed) * 100)}%`;
    this.$('lvl-label').textContent = `${t('level')} ${player.level}`;
    for (const k of RESOURCE_ORDER) this.resEls[k].textContent = `${RESOURCES[k].icon} ${inventory.items[k]}`;

    this.$('pet').classList.toggle('hidden', !pet);
    if (pet) {
      this.$('pet-name').textContent = `${t(pet.nameKey)} · ${t('level')} ${pet.level}`;
      this.$('pet-cd').style.width = `${Math.max(0, Math.min(1, pet.abilityReady)) * 100}%`;
      this.$('btn-ability').title = t('ability.' + pet.def.ability.id);
    }
  }

  // Панель существ: список приручённых и команды
  showPanel(show, collection = [], activeId = null) {
    this.panelOpen = show;
    this.$('creatures-panel').classList.toggle('hidden', !show);
    if (show) this.renderPanel(collection, activeId);
  }

  renderPanel(collection, activeId) {
    const list = this.$('cr-list');
    list.textContent = '';
    if (!collection.length) {
      const e = document.createElement('div');
      e.className = 'cr-empty';
      e.textContent = t('noCreatures');
      list.appendChild(e);
    }
    for (const r of collection) {
      const row = document.createElement('div');
      row.className = 'cr-row';
      const info = document.createElement('div');
      info.textContent = t(creatureNameKey(CREATURES[r.id], r.level));
      const small = document.createElement('small');
      small.textContent = `${t('level')} ${r.level}`;
      info.appendChild(small);
      const btn = document.createElement('button');
      btn.textContent = r.id === activeId ? t('active') : t('summon');
      btn.disabled = r.id === activeId;
      btn.onclick = () => this.onSummon(r.id);
      row.append(info, btn);
      list.appendChild(row);
    }
    const cmds = this.$('cr-cmds');
    cmds.textContent = '';
    for (const c of COMMANDS) {
      const b = document.createElement('button');
      b.textContent = t('cmd.' + c);
      b.onclick = () => this.press('cmd-' + c);
      cmds.appendChild(b);
    }
  }
}
