import { startIntroMusic, stopMusic } from '../core/Sound.js';
import { t } from '../config/i18n.js';

// Заставка новой игры: три кадра с текстом и музыкой (шторм, берег, зов о помощи). Обязательная, но кадры листаются касанием.
export class Intro {
  constructor($, game) {
    this.$ = $;
    this.game = game;
    this.frame = 0;
    this.onDone = null;
    this.active = false;
    $('intro-next').onclick = () => this.next();
    $('intro').addEventListener('pointerdown', e => { if (e.target.id === 'intro' || e.target.id === 'intro-text') this.next(); });
  }

  show(onDone) {
    this.frame = 0;
    this.onDone = onDone;
    this.active = true;
    this.$('intro').classList.remove('hidden');
    startIntroMusic();
    this.render();
  }

  render() {
    const $ = this.$;
    $('intro-text').textContent = t('intro.' + (this.frame + 1));
    $('intro-next').textContent = this.frame >= 2 ? t('intro.start') : t('intro.next');
    $('intro-dots').textContent = [0, 1, 2].map(i => (i === this.frame ? '●' : '○')).join(' ');
    $('intro-text').classList.remove('in');
    void $('intro-text').offsetWidth;                      // перезапуск плавного появления
    $('intro-text').classList.add('in');
  }

  next() {
    if (!this.active) return;
    if (this.frame < 2) { this.frame++; this.render(); return; }
    this.active = false;
    this.$('intro').classList.add('hidden');
    stopMusic();
    this.onDone?.();
  }
}
