import { Cloud } from '../net/Cloud.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

// Окно «Аккаунт и облако»: вход через Google, выход, выбор сохранения при конфликте, удаление данных.
export class CloudPanel {
  constructor($, ui) {
    this.$ = $;
    this.ui = ui;
    this.msg = '';
    $('btn-cloud').onclick = () => { this.msg = ''; this.show(true); };
    $('cl-close').onclick = () => this.show(false);
    $('cl-age').onchange = e => { Cloud.setConsent(e.target.checked); this.msg = ''; this.render(); };
    $('cl-signin').onclick = async () => {
      if (!Cloud.hasConsent) { this.msg = t('cloud.needAge'); this.render(); return; }
      this.msg = '…'; this.render();
      const r = await Cloud.signIn();
      this.msg = r === 'offline' ? t('cloud.offline') : r === 'error' ? t('cloud.error') : r === 'consent' ? t('cloud.needAge') : '';
      this.render();
    };
    $('cl-signout').onclick = () => Cloud.signOut();
    $('cl-delete').onclick = async () => {
      if (!confirm(t('cloud.deleteConfirm'))) return;
      const ok = await Cloud.deleteAccount();
      this.msg = ok ? t('cloud.deleted') : t('cloud.error');
      this.render();
    };
    $('cl-use-cloud').onclick = () => Cloud.resolve(true);
    $('cl-use-local').onclick = () => Cloud.resolve(false);
    events.on('cloud:auth', () => { if (Cloud.signedIn) this.show(false); this.render(); });
    events.on('cloud:status', () => {
      if (Cloud.status === 'conflict') this.show(true);          // игроку надо выбрать сохранение
      this.render();
    });
    events.on('cloud:imported', () => { ui.refreshTexts(); ui.toast(t('cloud.imported')); });
  }

  show(on) {
    this.$('cloud-panel').classList.toggle('hidden', !on);
    if (on) this.render();
  }

  render() {
    const $ = this.$;
    const signed = Cloud.signedIn;
    const conflict = Cloud.status === 'conflict' && Cloud.conflict;
    $('cl-title').textContent = t('cloud.title');
    $('btn-cloud').textContent = `☁ ${t('cloud.btn')}${signed ? ' ✓' : ''}`;
    $('cl-close').textContent = t('close');
    $('cl-text').textContent = signed ? t('cloud.signedIn') : t('cloud.intro');
    $('cl-stores').textContent = t('cloud.stores');
    $('cl-age-l').textContent = t('cloud.age');
    $('cl-age').checked = Cloud.hasConsent;
    $('cl-signin').textContent = t('cloud.signin');
    $('cl-signout').textContent = t('cloud.signout');
    $('cl-delete').textContent = t('cloud.delete');
    $('cl-c-title').textContent = t('cloud.conflictTitle');
    $('cl-c-text').textContent = conflict
      ? `${t('cloud.conflictText')} (${t('level')} ${conflict.level ?? '?'} / ${t('level')} ${conflict.localLevel})`
      : '';
    $('cl-use-cloud').textContent = t('cloud.useCloud');
    $('cl-use-local').textContent = t('cloud.useLocal');
    $('cl-age-row').classList.toggle('hidden', signed);
    $('cl-signin').classList.toggle('hidden', signed);
    $('cl-signout').classList.toggle('hidden', !signed);
    $('cl-delete').classList.toggle('hidden', !signed);
    $('cl-conflict').classList.toggle('hidden', !conflict);
    $('cl-msg').textContent = this.msg || (Cloud.status === 'error' ? t('cloud.error') : '');
    $('cl-close').classList.toggle('hidden', !!conflict);       // пока не выбрано сохранение, окно не закрыть
  }
}
