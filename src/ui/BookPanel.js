import { COMBOS, COMBO_ORDER, SLOT_INFO, SET_FULL } from '../config/items.js';
import { ELEMENT_ORDER } from '../config/heroes.js';
import { EL_ICON } from './ItemsPanel.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

// «Книга открытий»: наборы стихий (известны всем) и тайные сочетания (скрыты, пока игрок их не соберёт сам).
// Здесь же большое поздравление, когда игрок открывает сочетание.
export class BookPanel {
  constructor($, game) {
    this.$ = $;
    this.game = game;
    this.open = false;
    this.timer = 0;
    $('bk-close').onclick = () => this.show(false);
    events.on('discover', id => this.celebrate(id));
    events.on('items', () => { if (this.open) this.render(); });
  }

  show(on) {
    this.open = on;
    this.$('book-panel').classList.toggle('hidden', !on);
    if (on) this.render();
  }

  // Что нужно для сочетания: «⚔ Оружие · Огонь + ✨ Амулет · Вода»
  needText(id) {
    const c = COMBOS[id];
    if (c.harmony) return t('combo.harmony.d');
    return c.need.map(([slot, el]) => `${SLOT_INFO[slot].icon} ${t('items.slot.' + slot)} · ${t('el.' + el)}`).join(' + ');
  }

  render() {
    const $ = this.$, book = this.game.items.book;
    $('bk-title').textContent = `📖 ${t('book.title')}`;
    $('bk-close').textContent = t('close');
    $('bk-count').textContent = `${t('book.found')} ${book.length} ${t('book.of')} ${COMBO_ORDER.length}`;
    const list = $('bk-list');
    list.textContent = '';
    const head = (text) => { const h = document.createElement('div'); h.className = 'bk-head'; h.textContent = text; list.appendChild(h); };
    const row = (title, small, secret) => {
      const r = document.createElement('div');
      r.className = 'bk-row' + (secret ? ' secret' : '');
      const b = document.createElement('b'); b.textContent = title;
      const s = document.createElement('small'); s.textContent = small;
      r.append(b, s);
      list.appendChild(r);
    };
    head(t('book.sets'));
    for (const el of ELEMENT_ORDER) row(`${EL_ICON[el]} ${t('super.' + el)}`, `${SET_FULL} × ${t('el.' + el)}: ${t('super.' + el + '.d')}`, false);
    head(`${t('book.title')}`);
    for (const id of COMBO_ORDER) {
      if (book.includes(id)) row(`✨ ${t('combo.' + id)}`, `${t('combo.' + id + '.d')} · ${this.needText(id)}`, false);
      else row('???', t('book.secret'), true);
    }
  }

  // Большое поздравление: надпись, кольца, звук
  celebrate(id) {
    this.banner(t('book.congrats'), `✨ ${t('combo.' + id)} ✨`, t('combo.' + id + '.d'));
  }

  // Большая надпись с поздравлением (тайные сочетания и звание в конце обучения)
  banner(top, name, desc) {
    const $ = this.$, g = this.game;
    $('dc-t').textContent = top;
    $('dc-n').textContent = name;
    $('dc-d').textContent = desc;
    const box = $('discover');
    box.classList.add('hidden');
    void box.offsetWidth;                              // перезапуск анимации
    box.classList.remove('hidden');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => box.classList.add('hidden'), 4700);
    if (g.player) {
      const colors = [0xffd23f, 0xff6a2a, 0x2f8cff, 0x8fe3ff, 0xbff0e0];
      colors.forEach((c, i) => setTimeout(() => g.combat?.ring(g.player.pos, c, 3 + i * 1.6, 0.9), i * 150));
    }
    events.emit('evolve');
    events.emit('levelUp');
    if (this.open) this.render();
  }
}
