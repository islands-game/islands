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
  slamWarn: () => tone(120, 1.1, { type: 'sawtooth', vol: 0.14, slideTo: 60 }),
  slam: () => { tone(90, 0.35, { type: 'square', vol: 0.3, slideTo: 40 }); noise(0.3, { vol: 0.3, freq: 600 }); },
  raidWarn: () => { tone(220, 0.5, { type: 'sawtooth', vol: 0.18, slideTo: 330 }); tone(220, 0.5, { type: 'sawtooth', vol: 0.18, slideTo: 330, delay: 0.7 }); },
  raid: () => { tone(160, 0.4, { type: 'square', vol: 0.2, slideTo: 90 }); noise(0.25, { vol: 0.2, freq: 700 }); },
  quest: () => arpeggio([523, 659, 784, 1047, 1319], 'triangle', 0.08),
  evolve: () => { arpeggio([392, 494, 587, 784, 988, 1175], 'triangle', 0.1); tone(200, 0.6, { type: 'sawtooth', vol: 0.12, slideTo: 800 }); },
  portal: () => { tone(200, 0.5, { type: 'sine', vol: 0.2, slideTo: 1200 }); tone(1200, 0.4, { type: 'triangle', vol: 0.12, slideTo: 300, delay: 0.25 }); },
  build: () => { tone(130, 0.16, { type: 'square', vol: 0.22, slideTo: 60 }); noise(0.1, { vol: 0.15 }); },
  demolish: () => { noise(0.25, { vol: 0.2, freq: 900 }); tone(90, 0.2, { type: 'square', vol: 0.15, slideTo: 50 }); },
};

// Музыка заставки: низкий гул, шум моря и медленная мелодия в ля миноре. Играет только пока идёт заставка.
let musicTimer = null, musicNodes = [];

export function startIntroMusic() {
  const s = Settings.get();
  if (!s.sound || s.volume <= 0 || !ensureContext()) return;
  if (ctx.state === 'suspended') ctx.resume();
  stopMusic(0);
  master.gain.value = s.volume * 0.6;
  const now = ctx.currentTime;
  const drone = ctx.createOscillator(), dg = ctx.createGain();
  drone.type = 'sine'; drone.frequency.value = 110;
  dg.gain.setValueAtTime(0, now); dg.gain.linearRampToValueAtTime(0.08, now + 3);
  drone.connect(dg).connect(master); drone.start();
  const sea = ctx.createBufferSource(); sea.buffer = noiseBuffer; sea.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 450;
  const sg = ctx.createGain(); sg.gain.setValueAtTime(0, now); sg.gain.linearRampToValueAtTime(0.05, now + 2);
  sea.connect(lp).connect(sg).connect(master); sea.start();
  const notes = [220, 261.63, 329.63, 392, 329.63, 261.63, 293.66, 220];
  let i = 0;
  const step = () => {
    const n = notes[i % notes.length];
    tone(n, 1.8, { type: 'triangle', vol: 0.1 });
    if (i % 4 === 0) tone(n / 2, 3, { type: 'sine', vol: 0.08 });
    i++;
  };
  step();
  musicTimer = setInterval(step, 1100);
  musicNodes = [{ src: drone, gain: dg }, { src: sea, gain: sg }];
}

export function stopMusic(fade = 1.5) {
  clearInterval(musicTimer);
  musicTimer = null;
  if (!ctx) return;
  for (const { src, gain } of musicNodes) {
    try {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + Math.max(0.01, fade));
      src.stop(ctx.currentTime + fade + 0.05);
    } catch { /* уже остановлен */ }
  }
  musicNodes = [];
}

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
