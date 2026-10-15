import { t, setLang, getLang, LANGS } from '../config/i18n.js';
import { SaveManager } from '../save/SaveManager.js';

// Интерфейс: меню, полоски здоровья/опыта, подсказки, выбор языка.
export class UIManager {
  constructor({ onStart, onContinue, onMenu, isTouch }) {
    this.$ = id => document.getElementById(id);
    this.isTouch = isTouch;
    this.hintTimer = 0;

    const saved = SaveManager.loadLang();
    setLang(LANGS.includes(saved) ? saved : 'ru');

    this.$('btn-new').onclick = () => {
      if (SaveManager.load() && !confirm(t('confirmNew'))) return;
      onStart();
    };
    this.$('btn-continue').onclick = onContinue;
    this.$('btn-menu').onclick = onMenu;
    document.querySelectorAll('[data-lang]').forEach(b => {
      b.onclick = () => {
        setLang(b.dataset.lang);
        SaveManager.saveLang(b.dataset.lang);
        this.refreshTexts();
      };
    });
    if (isTouch) this.$('touch').classList.remove('hidden');
    this.refreshTexts();
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
    document.querySelectorAll('[data-lang]').forEach(b =>
      b.classList.toggle('active', b.dataset.lang === getLang()));
    if (!this.$('hud').classList.contains('hidden')) this.showHint();
  }

  showMenu(show) {
    this.$('menu').classList.toggle('hidden', !show);
    this.$('hud').classList.toggle('hidden', show);
    if (show) this.refreshTexts();
  }

  showHint() {
    const h = this.$('hint');
    h.textContent = this.isTouch ? t('hintTouch') : t('hintDesktop');
    h.style.opacity = 1;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { h.style.opacity = 0; }, 8000);
  }

  updateHud(player, xpNeeded) {
    this.level = player.level;
    this.$('hp-fill').style.width = `${(player.hp / player.maxHp) * 100}%`;
    this.$('xp-fill').style.width = `${Math.min(100, (player.xp / xpNeeded) * 100)}%`;
    this.$('lvl-label').textContent = `${t('level')} ${player.level}`;
  }
}
