import { t } from '../config/i18n.js';
import { events } from '../core/Events.js';

const PAY = 5;                       // премия гному, золота

// Разговоры с гномом и торговцем. Первая встреча — знакомство, дальше короткие реплики с выбором.
// Окно внизу экрана (герой остаётся виден), кнопки-ответы большие.
export class Dialogs {
  constructor($, game) {
    this.$ = $;
    this.game = game;
    this.open = false;
    this.met = { gnome: false, merchant: false };       // знакомства сохраняются в сохранении
    this.paidDay = -1;                                    // в какие сутки гному уже платили премию
  }

  reset() {
    this.met = { gnome: false, merchant: false };
    this.paidDay = -1;
    this.hide();
  }

  toSave() {
    return { gnome: this.met.gnome, merchant: this.met.merchant };
  }

  fromSave(data) {
    this.met = { gnome: data?.gnome === true, merchant: data?.merchant === true };
    this.paidDay = -1;
  }

  hide() {
    this.open = false;
    this.$('dialog-panel').classList.add('hidden');
  }

  // speaker: 'gnome' | 'merchant'; text — реплика; choices: [{ label, act }]
  show(speaker, text, choices) {
    const $ = this.$;
    this.open = true;
    $('dlg-icon').textContent = speaker === 'gnome' ? '🧙' : '🧳';
    $('dlg-name').textContent = t(speaker === 'gnome' ? 'dlg.gnome.name' : 'dlg.merchant.name');
    $('dlg-text').textContent = text;
    const list = $('dlg-choices');
    list.textContent = '';
    for (const c of choices) {
      const b = document.createElement('button');
      b.className = 'big' + (c.primary ? ' primary' : '');
      b.textContent = c.label;
      b.onclick = () => { this.hide(); c.act?.(); };
      list.appendChild(b);
    }
    $('dialog-panel').classList.remove('hidden');
  }

  bye() {
    return { label: t('dlg.bye') };
  }

  // Разговор с гномом (slot — с каким из гномов)
  gnome(slot) {
    const g = this.game;
    slot = slot ?? g.gnomes.slots.find(s => s.hired && s.alive) ?? null;
    const work = { label: t('dlg.gnome.work'), act: () => g.openGnomes(), primary: true };
    if (!this.met.gnome) {
      this.met.gnome = true;
      return this.show('gnome', t('dlg.gnome.first'), [work, this.bye()]);
    }
    const pay = {
      label: `${t('dlg.gnome.pay')} (💰${PAY})`,
      act: () => {
        if (this.paidDay === g.world.dayCount) return this.show('gnome', t('dlg.gnome.enough'), [work, this.bye()]);
        if (!g.inventory.spend({ gold: PAY })) return this.show('gnome', t('dlg.gnome.nogold'), [work, this.bye()]);
        this.paidDay = g.world.dayCount;
        if (slot) slot.tasks += 5;                      // премия: гному засчитывается 5 дел к следующему уровню
        events.emit('collect');
        this.show('gnome', t('dlg.gnome.thanks'), [work, this.bye()]);
      },
    };
    this.show('gnome', t('dlg.gnome.again'), [pay, work, this.bye()]);
  }

  // Разговор с торговцем: в первый раз он представляется и рассказывает про гильдию
  merchant() {
    const g = this.game;
    const ask = () => this.show('merchant', t('dlg.merchant.ask'), [
      { label: t('dlg.merchant.show'), act: () => g.ui.showMerchant(true, g.merchant.view()), primary: true }, this.bye(),
    ]);
    if (!this.met.merchant) {
      this.met.merchant = true;
      return this.show('merchant', t('dlg.merchant.first'), [{ label: t('dlg.next'), act: ask, primary: true }]);
    }
    ask();
  }
}
