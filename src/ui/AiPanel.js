import { Cloud } from '../net/Cloud.js';
import { Requests, KINDS } from '../net/Requests.js';
import { events } from '../core/Events.js';
import { t } from '../config/i18n.js';

// «Попросить ИИ»: мастер заявки. Вопросы учат хорошо описывать задачу: что, как выглядит, что делает, где.
// Заявка уходит владельцу проекта (таблица requests); правку делает ИИ-помощник, владелец проверяет и вливает.
const FIELDS = [
  { id: 'look', max: 140 },
  { id: 'does', max: 140 },
  { id: 'where', max: 100 },
];

export class AiPanel {
  constructor(ui) {
    this.ui = ui;
    this.kind = 'creature';
    this.msg = '';
    this.sending = false;
    this.list = null;
    const menu = document.querySelector('#menu .panel');
    this.menuBtn = document.createElement('button');
    this.menuBtn.id = 'btn-ai'; this.menuBtn.className = 'big';
    this.menuBtn.onclick = () => this.show(true);
    menu.append(this.menuBtn);
    this.root = document.createElement('div');
    this.root.id = 'ai-panel'; this.root.className = 'overlay hidden';
    document.body.append(this.root);
    events.on('cloud:auth', () => { this.list = null; if (!this.root.classList.contains('hidden')) this.open(); });
    this.relabel();
  }

  relabel() {
    this.menuBtn.textContent = `✨ ${t('ai.title')}`;
    if (!this.root.classList.contains('hidden')) this.render();
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
    if (on) this.open();
  }

  async open() {
    this.render();
    if (Cloud.signedIn) { this.list = await Requests.list(); this.render(); }
  }

  el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  render() {
    const root = this.root;
    root.textContent = '';
    const panel = this.el('div', 'panel wide ai-box');
    root.append(panel);
    panel.append(this.el('h2', '', `✨ ${t('ai.title')}`));
    if (!Cloud.signedIn) {
      panel.append(this.el('p', '', t('ai.signin')));
      const b = this.el('button', 'big primary', t('ai.signinBtn'));
      b.onclick = () => { this.show(false); this.ui.cloudPanel?.show(true); };
      panel.append(b);
      panel.append(this.closeBtn());
      return;
    }
    panel.append(this.el('p', 'ai-intro', t('ai.intro')));

    const kinds = this.el('div', 'ai-kinds');
    for (const k of KINDS) {
      const b = this.el('button', k === this.kind ? 'on' : '', t('ai.kind.' + k));
      b.onclick = () => { this.kind = k; this.render(); };
      kinds.append(b);
    }
    panel.append(kinds);

    this.inputs = {};
    const title = this.field(panel, 'title', 60, false);
    for (const f of FIELDS) this.field(panel, f.id, f.max, true);
    this.inputs.title = title;

    this.meter = this.el('div', 'ai-meter');
    this.tip = this.el('div', 'ai-tip');
    panel.append(this.meter, this.tip, this.el('div', 'ai-warn', t('ai.personal')));
    this.updateMeter();

    if (this.msg) panel.append(this.el('div', 'ai-msg', this.msg));
    const send = this.el('button', 'big primary', this.sending ? '…' : t('ai.send'));
    send.disabled = this.sending;
    send.onclick = () => this.send();
    panel.append(send);

    panel.append(this.el('h3', '', t('ai.mine')));
    const list = this.el('div', 'ai-list');
    if (this.list === null) list.append(this.el('div', 'ai-small', '…'));
    else if (!this.list.length) list.append(this.el('div', 'ai-small', t('ai.empty')));
    else for (const r of this.list) {
      const row = this.el('div', 'ai-row');
      row.append(this.el('b', '', r.title), this.el('span', 'ai-st ' + r.status, t('ai.st.' + r.status)));
      if (r.reply) row.append(this.el('div', 'ai-small', `💬 ${r.reply}`));
      if (r.status === 'new') {
        const d = this.el('button', 'ai-del', '✕');
        d.onclick = async () => { await Requests.remove(r.id); this.list = await Requests.list(); this.render(); };
        row.append(d);
      }
      list.append(row);
    }
    panel.append(list, this.closeBtn());
  }

  closeBtn() {
    const b = this.el('button', 'big', t('close'));
    b.onclick = () => this.show(false);
    return b;
  }

  field(panel, id, max, multi) {
    const wrap = this.el('label', 'ai-field');
    wrap.append(this.el('span', '', t('ai.f.' + id)));
    const inp = document.createElement(multi ? 'textarea' : 'input');
    inp.maxLength = max; inp.placeholder = t('ai.ph.' + id);
    if (multi) inp.rows = 2;
    inp.value = this.values?.[id] ?? '';
    inp.oninput = () => { (this.values ??= {})[id] = inp.value; this.updateMeter(); };
    wrap.append(inp);
    panel.append(wrap);
    this.inputs[id] = inp;
    return inp;
  }

  filled() {
    return FIELDS.filter(f => (this.values?.[f.id] ?? '').trim().length >= 12).length;
  }

  updateMeter() {
    if (!this.meter) return;
    const n = this.filled();
    this.meter.textContent = `${'⭐'.repeat(n)}${'☆'.repeat(FIELDS.length - n)}  ${t('ai.quality')}`;
    this.tip.textContent = t('ai.tip' + n);
  }

  async send() {
    const v = this.values ?? {};
    const title = (v.title ?? '').trim();
    const parts = FIELDS.map(f => [f.id, (v[f.id] ?? '').trim()]).filter(([, s]) => s);
    if (title.length < 3 || !parts.length) { this.msg = t('ai.need'); this.render(); return; }
    const body = parts.map(([id, s]) => `${t('ai.f.' + id)}: ${s}`).join('\n');
    if (body.length < 10) { this.msg = t('ai.need'); this.render(); return; }
    if (Requests.looksPersonal(`${title}\n${body}`)) { this.msg = t('ai.personalBlock'); this.render(); return; }
    this.sending = true; this.msg = ''; this.render();
    const r = await Requests.submit({ kind: this.kind, title, body });
    this.sending = false;
    if (r === 'ok') { this.values = {}; this.msg = t('ai.sent'); this.list = await Requests.list(); }
    else this.msg = r === 'too_many' ? t('ai.tooMany') : t('ai.error');
    this.render();
  }
}
