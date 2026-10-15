import * as THREE from 'three';
import { t, setLang, getLang, LANGS } from '../config/i18n.js';
import { SaveManager } from '../save/SaveManager.js';
import { RESOURCES, RESOURCE_ORDER } from '../config/resources.js';
import { MAX_LEVEL } from '../progression/Progression.js';

const COMMANDS = ['follow', 'stay', 'defend', 'attack', 'ability', 'return'];
const _v = new THREE.Vector3();

// Интерфейс: меню, полоски, ресурсы, спутник, подсказки, панель существ, всплывающий урон.
export class UIManager {
  constructor({ onStart, onContinue, onMenu, onSummon, press, isTouch }) {
    this.$ = id => document.getElementById(id);
    this.isTouch = isTouch;
    this.press = press;
    this.onSummon = onSummon;
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
    this.$('btn-creatures').onclick = () => press('panel');
    this.$('cr-close').onclick = () => this.showPanel(false);
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
    this.refreshTexts();
  }

  setCamera(camera) {
    this.camera = camera;
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
    this.$('btn-attack').textContent = `⚔ ${t('attack')}`;
    this.$('btn-interact').textContent = t('interact');
    this.$('cr-title').textContent = t('creatures');
    this.$('cr-close').textContent = t('close');
    document.querySelectorAll('[data-lang]').forEach(b =>
      b.classList.toggle('active', b.dataset.lang === getLang()));
    if (!this.$('hud').classList.contains('hidden')) this.showHint();
  }

  showMenu(show) {
    this.$('menu').classList.toggle('hidden', !show);
    this.$('hud').classList.toggle('hidden', show);
    if (show) { this.showPanel(false); this.refreshTexts(); }
  }

  showHint() {
    const h = this.$('hint');
    h.textContent = this.isTouch ? t('hintTouch') : t('hintDesktop');
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
      this.$('pet-name').textContent = `${t('creature.' + pet.id)} · ${t('level')} ${pet.level}`;
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
      info.textContent = t('creature.' + r.id);
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
