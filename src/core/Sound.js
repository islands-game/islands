import { events } from './Events.js';
import { Settings } from '../save/Settings.js';

// Звуки делаются прямо в браузере (WebAudio), файлов не нужно.
// Чтобы добавить звук: допиши его в SOUNDS и вызови events.emit('имя') там, где он нужен.
let ctx = null;
let master = null;
let noiseBuffer = null;

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    // Одна секунда белого шума для ударов
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
  return ctx;
}

// Короткий тон: частота freq (можно плавно менять до slideTo), длительность dur секунд
function tone(freq, dur, { type = 'sine', vol = 0.25, slideTo = null, delay = 0 } = {}) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Шум (удары, взмахи)
function noise(dur, { vol = 0.2, filter = 'lowpass', freq = 1500, delay = 0 } = {}) {
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const arpeggio = (notes, type, step = 0.1) =>
  notes.forEach((n, i) => tone(n, 0.18, { type, vol: 0.2, delay: i * step }));

const SOUNDS = {
  click: () => tone(620, 0.04, { vol: 0.12 }),
  swing: () => noise(0.07, { vol: 0.1, filter: 'highpass', freq: 2500 }),
  hit: () => { tone(200, 0.1, { type: 'square', vol: 0.2, slideTo: 90 }); noise(0.06, { vol: 0.15 }); },
  hurt: () => tone(240, 0.22, { type: 'sawtooth', vol: 0.22, slideTo: 90 }),
  kill: () => { tone(420, 0.12, { type: 'triangle', vol: 0.22, slideTo: 840 }); tone(630, 0.15, { type: 'triangle', vol: 0.2, delay: 0.1 }); },
  collect: () => { tone(660, 0.07, { vol: 0.2 }); tone(990, 0.1, { vol: 0.2, delay: 0.07 }); },
  ability: () => tone(280, 0.28, { type: 'sawtooth', vol: 0.14, slideTo: 1000 }),
  tame: () => arpeggio([523, 659, 784, 1046], 'sine'),
  levelUp: () => arpeggio([392, 523, 659, 784, 1046], 'triangle', 0.09),
  evolve: () => { arpeggio([392, 494, 587, 784, 988, 1175], 'triangle', 0.1); tone(200, 0.6, { type: 'sawtooth', vol: 0.12, slideTo: 800 }); },
  build: () => { tone(130, 0.16, { type: 'square', vol: 0.22, slideTo: 60 }); noise(0.1, { vol: 0.15 }); },
  demolish: () => { noise(0.25, { vol: 0.2, freq: 900 }); tone(90, 0.2, { type: 'square', vol: 0.15, slideTo: 50 }); },
};

function play(name) {
  const s = Settings.get();
  if (!s.sound || s.volume <= 0) return;
  if (!ensureContext()) return;
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.value = s.volume * 0.6;
  try { SOUNDS[name]?.(); } catch { /* звук не должен ломать игру */ }
}

export function initSound() {
  for (const name of Object.keys(SOUNDS)) events.on(name, () => play(name));
  // Браузеры включают звук только после нажатия — готовим его при первом касании
  const unlock = () => { if (ensureContext() && ctx.state === 'suspended') ctx.resume(); };
  addEventListener('pointerdown', unlock, { once: true });
  addEventListener('keydown', unlock, { once: true });
  // Щелчок на любой кнопке интерфейса
  document.addEventListener('click', e => { if (e.target.closest('button')) play('click'); });
}
