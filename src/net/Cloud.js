import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { events } from '../core/Events.js';
import { SaveManager } from '../save/SaveManager.js';

// Вход через Google и облачное сохранение. Игра работает и без облака: любая ошибка связи тихо игнорируется.
// Облако хранит ТОЛЬКО игровое сохранение (JSON). Почту и имя из Google игра не читает и не хранит.

const PUSH_EVERY = 60000;                       // в облако не чаще раза в минуту (экономим бесплатные лимиты)
const CONSENT_KEY = 'islands.cloudConsent';
const CLOUD_AT_KEY = 'islands.cloudAt';         // время облачной записи, которую это устройство видело последней

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* хранилище недоступно */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ничего */ } },
};

export const Cloud = {
  client: null,
  user: null,
  // 'off' (не вошёл) | 'sync' (сверяем) | 'ok' | 'conflict' | 'error'
  status: 'off',
  conflict: null,
  lastPush: 0,
  dirty: false,
  busy: false,
  reconciledFor: null,

  listen() {
    events.on('saved', () => this.onSaved());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
  },

  async init() {
    if (this.client) return;
    if (!this.listening) { this.listening = true; this.listen(); }      // повторный вызов (повтор после сбоя загрузки) не дублирует слушателей
    try {
      const { createClient } = await import('@supabase/supabase-js');      // грузится отдельным файлом, игра стартует быстрее
      this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } catch { this.client = null; return; }
    this.client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      const changed = (user?.id ?? null) !== (this.user?.id ?? null);
      this.user = user;
      if (!user) { this.status = 'off'; this.reconciledFor = null; }
      if (changed) events.emit('cloud:auth');
      if (user && this.reconciledFor !== user.id) { this.reconciledFor = user.id; this.reconcile(); }
    });
  },

  get hasConsent() { return store.get(CONSENT_KEY) === '1'; },
  setConsent(v) { if (v) store.set(CONSENT_KEY, '1'); else store.del(CONSENT_KEY); },
  get signedIn() { return !!this.user; },

  // Включён ли вход через Google в настройках проекта (чтобы не отправлять игрока на страницу с ошибкой)
  async providerReady() {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
      if (!r.ok) return false;
      const j = await r.json();
      return j?.external?.google === true;
    } catch { return false; }
  },

  async signIn() {
    if (!this.client || !this.hasConsent) return 'consent';
    if (!(await this.providerReady())) return 'offline';
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
    });
    return error ? 'error' : 'redirect';
  },

  async signOut() {
    this.flush();
    try { await this.client?.auth.signOut(); } catch { /* ничего */ }
    this.user = null; this.status = 'off'; this.reconciledFor = null; this.conflict = null;
    store.del(CLOUD_AT_KEY);
    events.emit('cloud:auth');
  },

  // Удалить аккаунт и облачные данные (локальное сохранение остаётся на устройстве)
  async deleteAccount() {
    if (!this.client || !this.user) return false;
    const { error } = await this.client.rpc('delete_my_account');
    if (error) return false;
    await this.signOut();
    return true;
  },

  // Сверка локального и облачного сохранения после входа
  async reconcile() {
    if (!this.client || !this.user) return;
    this.status = 'sync'; events.emit('cloud:status');
    try {
      const { data, error } = await this.client.from('saves').select('data,updated_at').eq('user_id', this.user.id).maybeSingle();
      if (error) throw error;
      const local = SaveManager.load();
      if (!data) {
        this.status = 'ok';
        if (local) await this.push(true);
      } else if (!local) {
        this.take(data);
      } else if (store.get(CLOUD_AT_KEY) === data.updated_at) {
        this.status = 'ok';                              // облако содержит то, что это устройство отправило само: местное сохранение новее
        await this.push(true);
      } else {
        // Сохранения разные: автоматически берём самое свежее, второе остаётся запасной копией на этом устройстве.
        // Если время сохранения на устройстве неизвестно (старое сохранение), побеждает облако, если в нём уровень не ниже.
        const localAt = SaveManager.savedAt(), cloudAt = Date.parse(data.updated_at) || 0;
        const cloudLevel = Number.isFinite(data.data?.player?.level) ? data.data.player.level : 0;
        const useCloud = localAt ? cloudAt > localAt : cloudLevel >= local.player.level;
        if (useCloud) { SaveManager.backup('local', local); this.take(data, true); }
        else { SaveManager.backup('cloud', data.data); this.status = 'ok'; await this.push(true); }
      }
    } catch { this.status = 'error'; }
    events.emit('cloud:status');
  },

  // Взять облачное сохранение на это устройство
  take(row, auto = false) {
    if (SaveManager.import(row.data, row.updated_at)) {
      store.set(CLOUD_AT_KEY, row.updated_at);
      this.status = 'ok'; this.conflict = null;
      events.emit('cloud:imported', auto);
    } else { this.status = 'error'; }
    events.emit('cloud:status');
  },

  async resolve(useCloud) {
    const c = this.conflict;
    if (!c) return;
    if (useCloud) this.take({ data: c.cloud, updated_at: c.at });
    else { this.conflict = null; this.status = 'ok'; events.emit('cloud:status'); await this.push(true); }
  },

  onSaved() {
    if (this.status !== 'ok' || !this.user) return;
    this.dirty = true;
    if (Date.now() - this.lastPush >= PUSH_EVERY) this.push();
  },

  flush() {
    if (this.dirty && this.status === 'ok' && this.user) this.push(true);
  },

  async push(force = false) {
    if (this.busy || !this.client || !this.user || this.status === 'conflict') return;
    if (!force && Date.now() - this.lastPush < PUSH_EVERY) return;
    const data = SaveManager.load();
    if (!data) return;
    this.busy = true;
    try {
      const { data: row, error } = await this.client.from('saves')
        .upsert({ user_id: this.user.id, data, version: data.version }, { onConflict: 'user_id' })
        .select('updated_at').single();
      if (error) throw error;
      store.set(CLOUD_AT_KEY, row.updated_at);
      this.lastPush = Date.now(); this.dirty = false;
      if (this.status === 'error') this.status = 'ok';
    } catch { this.status = this.status === 'ok' ? 'ok' : this.status; this.lastPush = Date.now() - PUSH_EVERY + 15000; } // повтор через 15 секунд
    this.busy = false;
    events.emit('cloud:status');
  },
};
