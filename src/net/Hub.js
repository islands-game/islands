import * as THREE from 'three';
import { Cloud } from './Cloud.js';
import { HUB, NICK_ADJ, NICK_NOUN, PHRASES } from '../config/social.js';
import { HEROES, DEFAULT_HERO } from '../config/heroes.js';
import { buildHeroModel } from '../player/HeroModels.js';
import { ISLANDS } from '../world/World.js';
import { t } from '../config/i18n.js';

// Гавань: общий остров. Игроки в одной комнате видят друг друга вживую (Supabase Realtime).
// Общение только готовыми фразами. Всё, что приходит из сети, проверяется: чужим данным не верим.
// Личных данных нет: только случайный номер сессии, ник из готовых слов и герой.

const NICK_KEY = 'islands.nick';
const ISLAND = ISLANDS.find(i => i.id === HUB.island);
const ID_RE = /^[a-z0-9]{4,12}$/;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* хранилище недоступно */ } },
};

const randInt = n => Math.floor(Math.random() * n);
const isInt = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
const validNick = n => Array.isArray(n) && n.length === 3 && isInt(n[0], NICK_ADJ) && isInt(n[1], NICK_NOUN) && isInt(n[2], 100);
export const nickText = n => `${t('nick.a' + n[0])} ${t('nick.n' + n[1])} ${n[2]}`;

function loadNick() {
  try { const n = JSON.parse(store.get(NICK_KEY)); if (validNick(n)) return n; } catch { /* нет сохранённого */ }
  const n = [randInt(NICK_ADJ), randInt(NICK_NOUN), 10 + randInt(90)];
  store.set(NICK_KEY, JSON.stringify(n));
  return n;
}

// Надпись над героем: рисуется на холсте, один раз на текст
function makeSprite(text, { bg = '#1e2a4acc', color = '#fff', size = 34, maxW = 560 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `700 ${size}px sans-serif`;
  const w = Math.min(maxW, Math.ceil(ctx.measureText(text).width) + 36), h = size + 22;
  c.width = w; c.height = h;
  ctx.font = `700 ${size}px sans-serif`;
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, 16); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2, w - 24);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(w / 100 * 0.55, h / 100 * 0.55, 1);
  sp.renderOrder = 20;
  sp.userData.dispose = () => { tex.dispose(); sp.material.dispose(); };
  return sp;
}

class Remote {
  constructor(hub, id) {
    this.hub = hub; this.id = id;
    this.grp = new THREE.Group();
    this.hero = DEFAULT_HERO; this.nick = null;
    this.target = { x: ISLAND.spawn.x, z: ISLAND.spawn.z, r: 0 };
    this.seen = hub.now;
    this.label = null; this.bubble = null; this.bubbleUntil = 0;
    this.model = null;
    this.setHero(DEFAULT_HERO);
    hub.scene.add(this.grp);
    this.grp.position.set(this.target.x, 0, this.target.z);
  }

  setHero(id) {
    if (!Object.hasOwn(HEROES, id)) id = DEFAULT_HERO;
    if (this.model && this.hero === id) return;
    this.hero = id;
    if (this.model) this.grp.remove(this.model);
    const h = HEROES[id];
    this.model = buildHeroModel(h.cls, h.element);
    this.grp.add(this.model);
  }

  setNick(n) {
    if (!validNick(n)) return;
    const key = nickText(n);
    if (this.nickKey === key) return;
    this.nickKey = key; this.nick = n;
    if (this.label) { this.grp.remove(this.label); this.label.userData.dispose(); }
    this.label = makeSprite(key);
    this.label.position.y = 2.7;
    this.grp.add(this.label);
  }

  say(id) {
    if (this.bubble) { this.grp.remove(this.bubble); this.bubble.userData.dispose(); }
    const p = PHRASES.find(x => x.id === id);
    this.bubble = makeSprite(`${p.icon} ${t('phrase.' + id)}`, { bg: '#ffffffee', color: '#1b2540', size: 36 });
    this.bubble.position.y = 3.5;
    this.grp.add(this.bubble);
    this.bubbleUntil = this.hub.now + HUB.bubbleSecs;
  }

  update(dt) {
    const k = Math.min(1, dt * 8), g = this.grp;
    g.position.x += (this.target.x - g.position.x) * k;
    g.position.z += (this.target.z - g.position.z) * k;
    let d = this.target.r - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * k;
    if (this.bubble && this.hub.now > this.bubbleUntil) { g.remove(this.bubble); this.bubble.userData.dispose(); this.bubble = null; }
  }

  dispose() {
    this.hub.scene.remove(this.grp);
    for (const s of [this.label, this.bubble]) s?.userData.dispose();
  }
}

export class Hub {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.now = 0;
    this.id = Math.random().toString(36).slice(2, 10);
    this.nick = loadNick();
    this.channel = null;
    this.room = 0;
    this.joining = false;
    this.remotes = new Map();
    this.sendT = 0; this.checkT = 0; this.sayT = 0;
    this.last = { x: 1e9, z: 1e9, r: 0 };
    this.mine = null;          // свой пузырь с фразой
    this.buildUi();
  }

  get joined() { return !!this.channel && !this.joining; }
  get here() { return this.game.world.islandIdAt(this.game.player.pos.x, this.game.player.pos.z) === HUB.island; }

  // ---------- интерфейс ----------

  buildUi() {
    const hud = document.getElementById('hud');
    const btn = document.createElement('button');
    btn.id = 'hub-btn'; btn.className = 'hidden'; btn.textContent = '💬';
    const panel = document.createElement('div');
    panel.id = 'hub-panel'; panel.className = 'hidden';
    btn.onclick = () => { panel.classList.toggle('hidden'); this.renderPanel(); };
    hud.append(btn, panel);
    this.btn = btn; this.panel = panel;
  }

  renderPanel() {
    const p = this.panel;
    if (p.classList.contains('hidden')) return;
    p.textContent = '';
    const head = document.createElement('div');
    head.className = 'hub-head';
    const who = document.createElement('b');
    who.textContent = `${t('hub.you')}: ${nickText(this.nick)}`;
    const dice = document.createElement('button');
    dice.textContent = '🎲'; dice.title = t('hub.nickNew');
    dice.onclick = () => this.newNick();
    const count = document.createElement('span');
    count.textContent = `${t('hub.online')}: ${this.remotes.size + 1}`;
    head.append(who, dice, count);
    const grid = document.createElement('div');
    grid.className = 'hub-grid';
    for (const ph of PHRASES) {
      const b = document.createElement('button');
      b.textContent = `${ph.icon} ${t('phrase.' + ph.id)}`;
      b.onclick = () => { this.say(ph.id); p.classList.add('hidden'); };
      grid.append(b);
    }
    const note = document.createElement('div');
    note.className = 'hub-note';
    note.textContent = this.remotes.size ? t('hub.guest') : `${t('hub.empty')} ${t('hub.guest')}`;
    p.append(head, grid, note);
  }

  newNick() {
    this.nick = [randInt(NICK_ADJ), randInt(NICK_NOUN), 10 + randInt(90)];
    store.set(NICK_KEY, JSON.stringify(this.nick));
    this.channel?.track(this.myState());
    this.renderPanel();
  }

  // ---------- сеть ----------

  myState() { return { n: this.nick, h: this.game.player.heroId }; }

  async join() {
    if (!Cloud.client) await Cloud.init().catch(() => {});             // клиент мог не загрузиться при старте
    const client = Cloud.client;
    if (!client) { this.game.ui.toast(t('hub.off')); return false; }
    this.joining = true;
    for (let room = 1; room <= HUB.maxRooms; room++) {
      const ch = client.channel(`islands-hub-${room}`, { config: { broadcast: { self: false }, presence: { key: this.id } } });
      this.channel = ch;
      ch.on('presence', { event: 'sync' }, () => this.onPresence(ch));
      ch.on('broadcast', { event: 'p' }, m => this.onPos(m.payload));
      ch.on('broadcast', { event: 'c' }, m => this.onSay(m.payload));
      const ok = await new Promise(res => {
        const to = setTimeout(() => res(false), 8000);
        ch.subscribe(status => { if (status === 'SUBSCRIBED') { clearTimeout(to); res(true); } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(to); res(false); } });
      });
      if (!ok) { await client.removeChannel(ch).catch(() => {}); this.channel = null; this.joining = false; this.game.ui.toast(t('hub.off')); return false; }
      await ch.track(this.myState());
      await new Promise(r => setTimeout(r, 700));                      // ждём список тех, кто уже в комнате
      if (Object.keys(ch.presenceState()).length <= HUB.roomSize) { this.room = room; break; }
      await client.removeChannel(ch).catch(() => {});                 // комната полна: пробуем следующую
      this.channel = null;
    }
    this.joining = false;
    if (!this.channel) { this.game.ui.toast(t('hub.off')); return false; }
    this.game.ui.toast(t('hub.join'));
    this.last = { x: 1e9, z: 1e9, r: 0 };
    return true;
  }

  async leave() {
    const ch = this.channel;
    this.channel = null;
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    if (this.mine) { this.game.scene.remove(this.mine); this.mine = null; }
    this.panel.classList.add('hidden');
    if (ch) { try { await Cloud.client?.removeChannel(ch); } catch { /* ничего */ } }
  }

  entity(id) {
    let r = this.remotes.get(id);
    if (!r && ID_RE.test(id) && id !== this.id && this.remotes.size < HUB.roomSize * 2) { r = new Remote(this, id); this.remotes.set(id, r); }
    return r;
  }

  onPresence(ch) {
    const state = ch.presenceState();
    const alive = new Set();
    for (const [id, metas] of Object.entries(state)) {
      if (id === this.id || !ID_RE.test(id)) continue;
      alive.add(id);
      const m = metas[metas.length - 1] ?? {};
      const r = this.entity(id);
      if (!r) continue;
      r.seen = this.now;
      if (typeof m.h === 'string') r.setHero(m.h);
      if (validNick(m.n)) r.setNick(m.n);
    }
    for (const [id, r] of this.remotes) if (!alive.has(id)) { r.dispose(); this.remotes.delete(id); }
    this.renderPanel();
  }

  onPos(p) {
    if (!p || typeof p.i !== 'string') return;
    const r = this.entity(p.i);
    if (!r) return;
    const lim = ISLAND.r + 8;
    if (![p.x, p.z, p.r].every(Number.isFinite) || Math.hypot(p.x - ISLAND.x, p.z - ISLAND.z) > lim) return;
    r.target = { x: p.x, z: p.z, r: p.r };
    r.seen = this.now;
  }

  onSay(p) {
    if (!p || typeof p.i !== 'string' || typeof p.p !== 'string' || !PHRASES.some(x => x.id === p.p)) return;
    this.entity(p.i)?.say(p.p);
  }

  say(id) {
    if (!this.joined || this.now - this.sayT < HUB.phraseCooldown || !PHRASES.some(x => x.id === id)) return;
    this.sayT = this.now;
    this.channel.send({ type: 'broadcast', event: 'c', payload: { i: this.id, p: id } });
    // Свою фразу показываем над своим героем
    const ph = PHRASES.find(x => x.id === id);
    if (this.mine) { this.scene.remove(this.mine); this.mine.userData.dispose(); }
    this.mine = makeSprite(`${ph.icon} ${t('phrase.' + id)}`, { bg: '#ffffffee', color: '#1b2540', size: 36 });
    this.mineUntil = this.now + HUB.bubbleSecs;
    this.scene.add(this.mine);
  }

  // ---------- каждый кадр ----------

  update(dt) {
    this.now += dt;
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      const here = this.here;
      this.btn.classList.toggle('hidden', !here || !this.joined);
      if (here && !this.channel && !this.joining) this.join();
      else if (!here && this.channel) this.leave();
      if (this.joined) for (const [id, r] of this.remotes) if (this.now - r.seen > HUB.timeout * 4) { r.dispose(); this.remotes.delete(id); }
    }
    if (!this.joined) return;
    for (const r of this.remotes.values()) r.update(dt);
    const p = this.game.player;
    if (this.mine) {
      if (this.now > this.mineUntil) { this.scene.remove(this.mine); this.mine.userData.dispose(); this.mine = null; }
      else this.mine.position.set(p.pos.x, 3.5, p.pos.z);
    }
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = HUB.sendEvery;
      const ry = p.mesh.rotation.y;
      if (Math.hypot(p.pos.x - this.last.x, p.pos.z - this.last.z) > 0.05 || Math.abs(ry - this.last.r) > 0.05 || this.now % 3 < HUB.sendEvery) {
        this.last = { x: p.pos.x, z: p.pos.z, r: ry };
        this.channel.send({ type: 'broadcast', event: 'p', payload: { i: this.id, x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), r: +ry.toFixed(2) } });
      }
    }
  }
}
