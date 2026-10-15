import { events } from '../core/Events.js';

// Настройки игры (звук, качество, FPS). Хранятся отдельно от сохранения игры.
const KEY = 'islands.settings';
export const QUALITIES = ['auto', 'low', 'medium', 'high'];

const DEFAULTS = { sound: true, volume: 0.6, quality: 'auto', showFps: false };

function validate(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    sound: typeof r.sound === 'boolean' ? r.sound : DEFAULTS.sound,
    volume: Number.isFinite(r.volume) ? Math.max(0, Math.min(1, r.volume)) : DEFAULTS.volume,
    quality: QUALITIES.includes(r.quality) ? r.quality : DEFAULTS.quality,
    showFps: typeof r.showFps === 'boolean' ? r.showFps : DEFAULTS.showFps,
  };
}

let current = (() => {
  try { return validate(JSON.parse(localStorage.getItem(KEY))); } catch { return { ...DEFAULTS }; }
})();

export const Settings = {
  get() {
    return current;
  },
  set(patch) {
    current = validate({ ...current, ...patch });
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* хранилище недоступно */ }
    events.emit('settings', current);
  },
};
