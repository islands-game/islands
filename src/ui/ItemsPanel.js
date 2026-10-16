import { ITEMS, SLOTS, SLOT_INFO, BAG_SIZE, ROMAN, NEUTRAL } from '../config/items.js';
import { events } from '../core/Events.js';
import { itemName, itemBonus } from '../inventory/Items.js';
import { SET_BONUS, SET_FULL } from '../config/items.js';
import { ELEMENT_ORDER } from '../config/heroes.js';

export const EL_ICON = { fire: '🔥', water: '💧', ice: '❄', earth: '⛰', air: '🌪' };
import { t } from '../config/i18n.js';

const hex = c => `#${c.toString(16).padStart(6, '0')}`;
const pct = v => `${Math.round(v * 100)}%`;

// Окно «Снаряжение»: пять ячеек героя сверху, сумка на 12 мест ниже, у выбранного предмета кнопки.
export class ItemsPanel {
  constructor($, game) {
    this.$ = $;
    this.game = game;
    this.open = false;
    this.sel = null;                           // { from: 'bag', index } | { from: 'slot', slot }
    $('it-close').onclick = () => this.show(false);
    $('btn-items').onclick = () => game.input.press('items');
    $('it-act').onclick = () => this.act();
    $('it-drop').onclick = () => this.drop();
    $('it-book').onclick = () => game.bookPanel.show(true);
    events.on('items', () => { if (this.open) this.render(); });
  }

  show(on) {
    this.open = on;
    this.sel = null;
    this.$('items-panel').classList.toggle('hidden', !on);
    if (on) this.render();
  }

  toggle() {
    this.show(!this.open);
  }

  // Название: «⚔ Клинок · Огонь · II»
  name(it) {
    return itemName(it);
  }

  // Что даёт предмет: «+16% к урону» / «−9% к перезарядке умений»
  bonusText(it) {
    return itemBonus(it);
  }

  selected() {
    const s = this.sel;
    if (!s) return null;
    const id = s.from === 'bag' ? this.game.items.bag[s.index] : this.game.items.equipped[s.slot];
    return id ? ITEMS[id] : null;
  }

  pick(sel) {
    this.sel = sel;
    this.render();
  }

  act() {
    const it = this.game.items, s = this.sel;
    if (!s || !this.selected()) return;
    if (s.from === 'bag') it.equip(s.index);
    else it.unequip(s.slot);
    this.sel = null;
    this.render();
  }

  drop() {
    const s = this.sel;
    if (!s || s.from !== 'bag' || !this.selected()) return;
    if (!confirm(t('items.dropConfirm'))) return;
    this.game.items.drop(s.index);
    this.sel = null;
    this.render();
  }

  cell(id, color) {
    const b = document.createElement('button');
    b.className = 'it-cell';
    if (id) {
      const it = ITEMS[id];
      b.style.borderColor = hex(it.color);
      b.style.background = `${hex(it.color)}33`;
      b.textContent = `${SLOT_INFO[it.slot].icon}${ROMAN[it.tier]}`;
      b.title = this.name(it);
    }
    return b;
  }

  render() {
    const $ = this.$, items = this.game.items, level = this.game.player.level;
    $('it-title').textContent = t('items.title');
    $('it-bag-l').textContent = `${t('items.bag')} ${items.bag.length}/${BAG_SIZE}`;
    $('it-close').textContent = t('close');
    $('btn-items').textContent = '🎒';

    // Ячейки героя
    const slots = $('it-slots');
    slots.textContent = '';
    for (const slot of SLOTS) {
      const info = SLOT_INFO[slot];
      const open = items.slotOpen(slot);
      const id = items.equipped[slot];
      const b = this.cell(id);
      b.classList.add('it-slot');
      if (!id) b.textContent = open ? info.icon : `🔒${info.unlock}`;
      if (!open) b.classList.add('locked');
      if (this.sel?.from === 'slot' && this.sel.slot === slot) b.classList.add('sel');
      if (!id && !open) b.title = `${t('items.locked')} ${info.unlock}`;
      b.onclick = () => (id ? this.pick({ from: 'slot', slot }) : this.game.ui.toast(open ? t('items.slotEmpty') : `${t('items.locked')} ${info.unlock}`));
      slots.appendChild(b);
    }

    // Сумка
    const bag = $('it-bag');
    bag.textContent = '';
    for (let i = 0; i < BAG_SIZE; i++) {
      const id = items.bag[i];
      const b = this.cell(id);
      if (this.sel?.from === 'bag' && this.sel.index === i) b.classList.add('sel');
      if (id) b.onclick = () => this.pick({ from: 'bag', index: i });
      bag.appendChild(b);
    }

    // Итог по всем надетым предметам
    const m = items.totals();
    const parts = [];
    if (m.dmg > 1) parts.push(`+${pct(m.dmg - 1)} ${t('items.stat.dmg')}`);
    if (m.hp > 1) parts.push(`+${pct(m.hp - 1)} ${t('items.stat.hp')}`);
    if (m.effect > 1) parts.push(`+${pct(m.effect - 1)} ${t('items.stat.effect')}`);
    if (m.speed > 1) parts.push(`+${pct(m.speed - 1)} ${t('items.stat.speed')}`);
    if (m.cd < 1) parts.push(`−${pct(1 - m.cd)} ${t('items.stat.cd')}`);
    // Наборы стихий и открытые сочетания
    const info = items.info, lines = [];
    for (const el of ELEMENT_ORDER) {
      const c = info.counts[el];
      if (c >= 2) lines.push(`${EL_ICON[el]} ${t('el.' + el)} ${c}/${SET_FULL}: +${Math.round(SET_BONUS[c] * 100)}%${c >= SET_FULL ? ' · ' + t('super.' + el) : ''}`);
    }
    for (const id of info.combos) lines.push(`✨ ${t('combo.' + id)}`);
    $('it-sets').textContent = lines.join('\n');
    $('it-book').textContent = `📖 ${t('book.title')} (${items.book.length})`;
    $('it-total').textContent = parts.length ? `${t('items.total')}: ${parts.join(' · ')}` : t('items.noneWorn');

    // Выбранный предмет
    const it = this.selected();
    $('it-detail').classList.toggle('hidden', !it);
    if (it) {
      const locked = !items.slotOpen(it.slot);
      $('it-name').textContent = this.name(it);
      $('it-name').style.color = hex(it.color);
      $('it-bonus').textContent = this.bonusText(it) + (locked ? ` · ${t('items.locked')} ${SLOT_INFO[it.slot].unlock}` : '');
      $('it-price').textContent = `${t('items.price')}: ${it.price} 💰`;
      $('it-act').textContent = this.sel.from === 'bag' ? t('items.equip') : t('items.unequip');
      $('it-act').disabled = this.sel.from === 'bag' ? locked : items.full;
      $('it-drop').classList.toggle('hidden', this.sel.from !== 'bag');
      $('it-drop').textContent = t('items.drop');
    }
    $('it-hint').textContent = level < 5 ? t('items.hintEarly') : t('items.hint');
  }
}
