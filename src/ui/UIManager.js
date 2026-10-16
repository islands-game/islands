import * as THREE from 'three';
import { t, setLang, getLang, LANGS } from '../config/i18n.js';
import { SaveManager } from '../save/SaveManager.js';
import { CloudPanel } from './CloudPanel.js';
import { Intro } from './Intro.js';
import { RESOURCES, RESOURCE_ORDER } from '../config/resources.js';
import { CREATURES, beastTitle } from '../config/creatures.js';
import { MAX_LEVEL } from '../progression/Progression.js';
import { Settings, QUALITIES } from '../save/Settings.js';
import { events } from '../core/Events.js';
import { FOOD_CARRY } from '../config/food.js';
import { DEFENSE } from '../config/buildings.js';
import { GNOME } from '../config/gnomes.js';
import { HEROES, CLASSES, CLASS_ORDER, ELEMENT_ORDER, ENABLED_ELEMENTS, DEFAULT_HERO, SKILLS, arenaStats } from '../config/heroes.js';

const SPEC_ICONS = { all: '⭐', farmer: '🌱', porter: '📦', fixer: '🔧', lumber: '🪓', mason: '⛏', fisher: '🎣' };
const COMMANDS = ['follow', 'stay', 'defend', 'attack', 'ability', 'return'];
const _v = new THREE.Vector3();

// Интерфейс: меню, полоски, ресурсы, спутник, подсказки, панель существ, всплывающий урон.
export class UIManager {
  constructor({ onStart, onContinue, onMenu, onSummon, onRelease, onBarn, onMerchant, onGnomes, onSelectBuilding, onSkipTutorial, press, isTouch }) {
    this.$ = id => document.getElementById(id);
    this.isTouch = isTouch;
    this.press = press;
    this.onSummon = onSummon;
    this.onRelease = onRelease;
    this.onBarn = onBarn;
    this.onMerchant = onMerchant;
    this.onGnomes = onGnomes;
    this.$('gnome-close').onclick = () => onGnomes('close');
    this.$('merchant-close').onclick = () => onMerchant('close');
    this.$('barn-bag').onclick = () => onBarn('bag');
    this.$('barn-upgrade').onclick = () => onBarn('upgrade');
    this.$('barn-deposit').onclick = () => onBarn('deposit');
    this.$('barn-close').onclick = () => onBarn('close');
    this.$('barn-insure').onclick = () => onBarn('insure');
    this.$('barn-repair').onclick = () => onBarn('repairDef');
    this.onSelectBuilding = onSelectBuilding;
    this.buildPanelOpen = false;
    this.hintTimer = 0;
    this.toastTimer = 0;
    this.camera = null;
    this.panelOpen = false;

    const saved = SaveManager.loadLang();
    setLang(LANGS.includes(saved) ? saved : 'ru');

    this.selectedHero = DEFAULT_HERO;
    this.$('btn-new').onclick = () => {
      if (SaveManager.load() && !confirm(t('confirmNew'))) return;
      this.showHeroSelect(true);
    };
    this.$('hs-go').onclick = () => { this.showHeroSelect(false); onStart(this.selectedHero); };
    this.$('hs-back').onclick = () => this.showHeroSelect(false);
    this.$('btn-continue').onclick = onContinue;
    this.$('btn-menu').onclick = onMenu;
    // Боевые кнопки срабатывают в момент касания (pointerdown), а не после отпускания пальца: так их можно жать, пока другой палец ведёт джойстик.
    // Кнопка «Атака» при удержании бьёт снова и снова.
    this.tap('btn-attack', 'attack', 130);
    this.tap('btn-interact', 'interact');
    this.tap('btn-ability', 'ability');
    this.tap('btn-spell1', 'spell1');
    this.tap('btn-spell2', 'spell2');
    this.tap('btn-spell3', 'spell3');
    for (const c of ['follow', 'stay', 'defend', 'attack']) this.tap('pc-' + c, 'cmd-' + c);
    this.$('ar-again').onclick = () => press('arenaAgain');
    this.$('ar-exit').onclick = () => press('arenaExit');
    this.$('btn-creatures').onclick = () => press('panel');
    this.$('cr-close').onclick = () => this.showPanel(false);
    this.$('btn-build').onclick = () => press('build');
    this.$('bp-close').onclick = () => this.showBuildPanel(false);
    this.$('bb-rot').onclick = () => press('rotate');
    this.$('bb-ok').onclick = () => press('confirm');
    this.$('bb-cancel').onclick = () => press('cancel');
    this.$('tut-skip').onclick = onSkipTutorial;
    this.initSettings();
    this.cloudPanel = new CloudPanel(id => this.$(id), this);
    this.intro = new Intro(id => this.$(id), null);
    this.$('quest-where').onclick = () => { Settings.set({ guide: !Settings.get().guide }); };
    document.querySelectorAll('[data-lang]').forEach(b => {
      b.onclick = () => {
        setLang(b.dataset.lang);
        SaveManager.saveLang(b.dataset.lang);
        this.refreshTexts();
      };
    });
    if (isTouch) this.$('touch').classList.remove('hidden');

    // Счётчики ресурсов
    this.resEls = {};
    for (const k of RESOURCE_ORDER) {
      const span = document.createElement('span');
      this.$('res').appendChild(span);
      this.resEls[k] = span;
    }
    // Еда в рюкзаке: одной строкой (всего не больше FOOD_CARRY)
    this.foodEl = document.createElement('span');
    this.$('res').appendChild(this.foodEl);
    // Часы: солнце или луна
    this.clockEl = document.createElement('span');
    this.$('res').appendChild(this.clockEl);
    this.refreshTexts();
  }

  setCamera(camera) {
    this.camera = camera;
  }

  // --- Настройки (звук, качество, FPS) ---

  initSettings() {
    this.$('btn-settings').onclick = () => this.$('settings-panel').classList.remove('hidden');
    this.$('st-close').onclick = () => this.$('settings-panel').classList.add('hidden');
    this.$('st-sound').onclick = () => { Settings.set({ sound: !Settings.get().sound }); this.refreshSettings(); };
    this.$('st-fps').onclick = () => { Settings.set({ showFps: !Settings.get().showFps }); this.refreshSettings(); };
    this.$('st-vol').oninput = e => Settings.set({ volume: e.target.value / 100 });
    this.$('st-vol').onchange = () => events.emit('collect'); // пробный звук нужной громкости
    const q = this.$('st-q');
    for (const name of QUALITIES) {
      const b = document.createElement('button');
      b.dataset.q = name;
      b.onclick = () => { Settings.set({ quality: name }); this.refreshSettings(); };
      q.appendChild(b);
    }
  }

  refreshSettings() {
    const s = Settings.get();
    this.$('st-title').textContent = t('settings');
    this.$('st-close').textContent = t('close');
    this.$('st-sound-l').textContent = t('sound');
    this.$('st-vol-l').textContent = t('volume');
    this.$('st-q-l').textContent = t('quality');
    this.$('st-fps-l').textContent = t('showFps');
    const sound = this.$('st-sound');
    sound.textContent = s.sound ? t('on') : t('off');
    sound.classList.toggle('on', s.sound);
    const fps = this.$('st-fps');
    fps.textContent = s.showFps ? t('on') : t('off');
    fps.classList.toggle('on', s.showFps);
    this.$('st-vol').value = Math.round(s.volume * 100);
    this.$('st-q').querySelectorAll('button').forEach(b => {
      b.textContent = t('q.' + b.dataset.q);
      b.classList.toggle('active', b.dataset.q === s.quality);
    });
  }

  // Значок времени суток: ☀ днём, ☾ ночью
  setClock(night) {
    const icon = night > 0.6 ? '☾' : night > 0.25 ? '◐' : '☀';
    if (this.clockEl.textContent !== icon) this.clockEl.textContent = icon;
  }

  // Задание: q — запись из config/quests.js, 'done' — все выполнены, null — скрыть
  setQuest(q, progress, total) {
    const box = this.$('quest');
    box.classList.toggle('hidden', q === null);
    if (q === null) return;
    this.$('quest-title').textContent = q !== 'done' && q.chapter !== undefined ? `${t('chapter.' + q.chapter)}` : t('quest.title');
    if (q === 'done') {
      this.$('quest-text').textContent = t('quest.allDone');
      this.$('quest-count').textContent = '';
      this.$('quest-fill').style.width = '100%';
      this.$('quest-reward').textContent = '';
      return;
    }
    progress = Math.floor(progress);
    const key = `${q.id}:${progress}`;
    if (key === this.questKey && getLang() === this.questLang) return; // ничего не изменилось
    this.questKey = key;
    this.questLang = getLang();
    this.$('quest-text').textContent = t('quest.' + q.id);
    this.$('quest-count').textContent = `${progress}/${q.amount}`;
    this.$('quest-fill').style.width = `${(progress / q.amount) * 100}%`;
    const r = q.reward;
    const items = Object.entries(r.items ?? {}).map(([k, v]) => `${RESOURCES[k].icon}${v}`).join(' ');
    this.$('quest-reward').textContent = `${t('quest.reward')}: ${r.gold ? `💰${r.gold} ` : ''}${r.xp ? `${r.xp} XP ` : ''}${items}`;
  }

  // Стрелка-подсказка: расстояние и состояние кнопки (вкл/выкл)
  setGuide(distText) {
    this.$('quest-dist').textContent = distText;
    this.$('quest-where').classList.toggle('off', !Settings.get().guide);
  }

  // Полоска сверху экрана: здоровье босса или оставшиеся слизни рейда (name === null — скрыть)
  setBar(name, ratio) {
    const box = this.$('boss');
    box.classList.toggle('hidden', !name);
    if (!name) return;
    if (this.$('boss-name').textContent !== name) this.$('boss-name').textContent = name;
    this.$('boss-fill').style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  // Затемнение экрана (сон)
  fade(on) {
    this.$('fade').classList.toggle('on', on);
  }

  // --- Арена ---

  setArena(on) {
    this.arenaOn = on;
    this.$('arena-hud').classList.toggle('hidden', !on);
    this.$('minimap').classList.toggle('hidden', !on);
    if (!on) {
      this.$('arena-result').classList.add('hidden');
      this.$('arena-count').classList.add('hidden');
    } else {
      this.$('arena-result').classList.add('hidden');
    }
  }

  // Большая надпись по центру: отсчёт до начала или время до возрождения
  setArenaCountdown(n, small = false) {
    const el = this.$('arena-count');
    el.classList.toggle('hidden', n <= 0);
    el.classList.toggle('small', small);
    el.textContent = n > 0 ? (small ? `${t('arena.respawn')}: ${n}` : String(n)) : '';
  }

  updateArena(d) {
    const mm = String(Math.floor(d.time / 60)).padStart(2, '0') + ':' + String(Math.floor(d.time % 60)).padStart(2, '0');
    this.$('arena-score').innerHTML = `<span class="b">${d.kills.blue}</span> : <span class="r">${d.kills.red}</span>`;
    this.$('arena-info').textContent = `${mm} · ${t('arena.towers')} ${d.towers.blue}:${d.towers.red}`;
    this.setSkills(d.skillIds, d.spellCd);
    if (d.phase === 'playing') this.setArenaCountdown(d.respawn, true);
    this.drawMinimap(d.units);
  }

  // Амбар: что лежит на складе и что в рюкзаке; кнопки «взять» и «сдать всё»
  showBarn(show, view) {
    this.$('barn-panel').classList.toggle('hidden', !show);
    if (!show) return;
    this.$('barn-title').textContent = `${t('building.barn')} ${t('level')} ${view.lvl} · ${t('barn.cap')} ${view.cap}`;
    this.$('barn-bag').textContent = view.bagCost === null ? `${t('bag.title')} ${view.bagLvl}: ${t('upgrade.max')}` : `${t('bag.expand')} ${view.bagLvl} → ${view.bagLvl + 1} (💰${view.bagCost})`;
    this.$('barn-bag').classList.toggle('dim', view.bagCost === null);
    this.$('barn-info').textContent = `🛡 ${t('barn.defense')}: ${view.def}/${view.maxDef} · ${t('barn.insurance')}: ${view.ins > 0 ? `${view.ins} ${t('barn.days')}` : t('barn.none')}`;
    this.$('barn-insure').textContent = `${t('barn.insure')} (💰${DEFENSE.barn.insuranceGold})`;
    this.$('barn-repair').textContent = `${t('barn.repairDef')} (🌲${DEFENSE.barn.repairCost.wood})`;
    // Кнопки всегда нажимаются: если нечего делать или не хватает ресурсов, игра подскажет сообщением
    this.$('barn-upgrade').textContent = view.upCost
      ? `${t('barn.upgrade')}: ${t('barn.cap')} ${view.cap}→${view.nextCap}, ${t('barn.defense')} ${view.maxDef}→${view.nextDef} (${view.upCost})`
      : `${t('barn.upgrade')}: ${t('upgrade.max')}`;
    this.$('barn-upgrade').classList.toggle('dim', !view.upCan);
    this.$('barn-deposit').textContent = t('barn.deposit');
    this.$('barn-close').textContent = t('close');
    const list = this.$('barn-list');
    list.textContent = '';
    for (const r of view.rows) {
      const row = document.createElement('div');
      row.className = 'cr-row';
      const info = document.createElement('div');
      info.textContent = `${r.icon} ${r.name}: ${r.stored}`;
      const small = document.createElement('small');
      small.textContent = `${t('barn.carried')}: ${r.carried}`;
      info.appendChild(small);
      const btn = document.createElement('button');
      btn.textContent = t('barn.take');
      btn.classList.toggle('dim', r.stored <= 0);
      btn.onclick = () => this.onBarn('take', r.key);
      row.append(info, btn);
      list.appendChild(row);
    }
  }

  // Панель гномов: наём, специальность, зарплата, поручение дня
  showGnomes(show, view) {
    this.$('gnome-panel').classList.toggle('hidden', !show);
    if (!show) return;
    this.$('gnome-title').textContent = t('gnome.title');
    this.$('gnome-close').textContent = t('close');
    this.$('gnome-info').textContent = `${t('gnome.wages')}: 💰${view.wages} ${t('gnome.perDay')}${view.hasCave ? '' : ' · ' + t('gnome.needCave')}`;
    const q = view.quest, qe = this.$('gnome-quest');
    qe.textContent = '';
    const qt = document.createElement('div');
    qt.textContent = `${t('gnome.quest')}: ${t('gnome.questText')} ${q.amount} 🍎 → 💰${q.reward}${q.done ? ' ✔' : ''}`;
    qe.appendChild(qt);
    if (!q.done) {
      const b = document.createElement('button');
      b.textContent = t('gnome.questGive');
      b.onclick = () => this.onGnomes('quest');
      qe.appendChild(b);
    }
    const list = this.$('gnome-list');
    list.textContent = '';
    for (const r of view.rows) {
      const row = document.createElement('div');
      row.className = 'cr-row';
      const info = document.createElement('div');
      const name = r.i === 0 ? t('gnome.first') : `${t('gnome.n')} ${r.i}`;
      if (r.status === 'locked') info.textContent = `${name}: ${t(view.hasCave ? 'gnome.lockedUp' : 'gnome.locked')}`;
      else {
        info.textContent = `${r.icon} ${name} · ${t('level')} ${r.level} · ${t('gnome.spec.' + r.spec)}`;
        const small = document.createElement('small');
        const prog = r.nextNeed ? ` · ${r.tasks}/${r.nextNeed}` : '';
        small.textContent = `${t('gnome.status.' + r.status)} · ❤ ${r.hp}/${r.maxHp}${prog} · 💰${r.wage}/${t('gnome.perDay')}`;
        info.appendChild(small);
      }
      row.appendChild(info);
      const btns = document.createElement('div');
      btns.className = 'gn-btns';
      const mk = (text, fn) => { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; btns.appendChild(b); return b; };
      if (r.status === 'notHired') mk(`${t('gnome.hire')}${r.fee ? ' 💰' + r.fee : ''}`, () => this.onGnomes('hire', r.i));
      else if (r.status === 'dead') mk(`${t('gnome.train')} 💰${r.fee}`, () => this.onGnomes('hire', r.i));
      else if (r.status !== 'locked') {
        mk(t('gnome.fire'), () => this.onGnomes('fire', r.i));
        if (r.canSpec) mk(`${SPEC_ICONS[r.spec]} ▶`, () => this.onGnomes('spec', r.i, GNOME.specs[(GNOME.specs.indexOf(r.spec) + 1) % GNOME.specs.length]));
      }
      if (btns.children.length) row.appendChild(btns);
      list.appendChild(row);
    }
  }

  // Торговец: цены дня, сколько золота ещё заплатит
  showMerchant(show, view) {
    this.$('merchant-panel').classList.toggle('hidden', !show);
    if (!show) return;
    this.$('merchant-title').textContent = t('merchant.title');
    this.$('merchant-info').textContent = `${t('merchant.left')}: 💰${view.left}`;
    this.$('merchant-close').textContent = t('close');
    const list = this.$('merchant-list');
    list.textContent = '';
    for (const r of view.rows) {
      const row = document.createElement('div');
      row.className = 'cr-row';
      const info = document.createElement('div');
      info.textContent = `${r.icon} ${r.name}: ${r.have}`;
      const small = document.createElement('small');
      small.textContent = `💰${r.price} ${t('merchant.each')}${r.mul >= 1.3 ? ' 📈' : r.mul <= 0.8 ? ' 📉' : ''}`;
      info.appendChild(small);
      const one = document.createElement('button');
      one.textContent = '1';
      one.disabled = r.have <= 0 || view.left < r.price;
      one.onclick = () => this.onMerchant('sell', r.key);
      const all = document.createElement('button');
      all.textContent = t('merchant.all');
      all.disabled = one.disabled;
      all.onclick = () => this.onMerchant('sellAll', r.key);
      row.append(info, one, all);
      list.appendChild(row);
    }
    // Предметы дня (купить) и продажа предметов из сумки
    this.$('merchant-shop-h').textContent = t('merchant.shop');
    this.$('merchant-sell-h').textContent = t('merchant.sellItems');
    const shop = this.$('merchant-shop');
    shop.textContent = '';
    for (const r of view.shop ?? []) {
      const row = document.createElement('div');
      row.className = 'cr-row';
      const info = document.createElement('div');
      info.textContent = r.name;
      const small = document.createElement('small');
      small.textContent = `${r.bonus} · 💰${r.price}${r.mul >= 1.1 ? ' 📈' : r.mul <= 0.9 ? ' 📉' : ''}`;
      info.appendChild(small);
      const buy = document.createElement('button');
      buy.textContent = r.bought ? t('merchant.sold') : t('merchant.buy');
      buy.disabled = !r.canBuy;
      buy.onclick = () => this.onMerchant('buyItem', r.i);
      row.append(info, buy);
      shop.appendChild(row);
    }
    const sell = this.$('merchant-sell');
    sell.textContent = '';
    if (!(view.sellItems ?? []).length) {
      const e = document.createElement('div');
      e.className = 'cr-empty';
      e.textContent = t('merchant.noItems');
      sell.appendChild(e);
    }
    for (const r of view.sellItems ?? []) {
      const row = document.createElement('div');
      row.className = 'cr-row';
      const info = document.createElement('div');
      info.textContent = r.name;
      const small = document.createElement('small');
      small.textContent = `${r.bonus} · 💰${r.price}`;
      info.appendChild(small);
      const b = document.createElement('button');
      b.textContent = t('merchant.sellOne');
      b.disabled = !r.canSell;
      b.onclick = () => this.onMerchant('sellItem', r.index);
      row.append(info, b);
      sell.appendChild(row);
    }
  }

  // Кнопка действия: нажатие считается сразу при касании; repeatMs — повтор, пока палец держит кнопку
  tap(id, name, repeatMs = 0) {
    const b = this.$(id);
    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.press(name);
      if (repeatMs) { stop(); timer = setInterval(() => this.press(name), repeatMs); }
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, stop);
    b.addEventListener('click', e => { if (e.detail === 0) this.press(name); });      // клавиатура (Enter) на выбранной кнопке
  }

  // Экран выбора героя: карточки классов и описание выбранного
  showHeroSelect(show) {
    this.$('hero-select').classList.toggle('hidden', !show);
    this.$('menu').classList.toggle('hidden', show);
    if (show) this.renderHeroSelect();
  }

  renderHeroSelect() {
    this.$('hs-title').textContent = t('heroTitle');
    this.$('hs-go').textContent = t('heroGo');
    this.$('hs-back').textContent = t('heroBack');
    const list = this.$('hs-list'), els = this.$('hs-elements');
    list.innerHTML = '';
    els.innerHTML = '';
    const ICON = { warrior: '⚔', archer: '🏹', mage: '🔮', assassin: '🗡', support: '💚' };
    const EL_ICON = { fire: '🔥', water: '💧', ice: '❄', earth: '⛰', air: '🌪' };
    const cur = HEROES[this.selectedHero];
    for (const el of ELEMENT_ORDER.filter(e => ENABLED_ELEMENTS.includes(e))) {
      const b = document.createElement('button');
      b.className = el === cur.element ? 'sel' : '';
      b.innerHTML = `<span class="ic">${EL_ICON[el]}</span><span>${t('el.' + el)}</span>`;
      b.onclick = () => { this.selectedHero = `${cur.cls}_${el}`; this.renderHeroSelect(); };
      els.appendChild(b);
    }
    for (const cls of CLASS_ORDER) {
      const b = document.createElement('button');
      b.className = cls === cur.cls ? 'sel' : '';
      b.innerHTML = `<span class="ic">${ICON[cls]}</span><span>${t('cls.' + cls)}</span>`;
      b.onclick = () => { this.selectedHero = `${cls}_${cur.element}`; this.renderHeroSelect(); };
      list.appendChild(b);
    }
    const h = HEROES[this.selectedHero], st = arenaStats(this.selectedHero);
    const spec = h.attack ?? {}, kind = ['boomerang', 'fan', 'multi', 'pierce', 'chain', 'splash'].find(k => spec[k]) ?? 'plain';
    const skills = h.skills.map(s => `<div class="sk"><b>${SKILLS[s].icon} ${t('skill.' + s)}</b><span>${t('skilltype.' + SKILLS[s].type)}</span></div>`).join('');
    this.$('hs-info').innerHTML =
      `<div class="desc"><b>${t('cls.' + h.cls)} · ${t('el.' + h.element)}</b><br>${t('clsd.' + h.cls)}<br>${t('elp.' + h.element)}</div>` +
      `<div class="stats"><span>❤ ${t('stat.hp')}: ${st.hp}</span><span>⚔ ${t('stat.atk')}: ${Math.round(st.atk)}</span>` +
      `<span>🎯 ${t('stat.range')}: ${st.range}</span><span>👟 ${t('stat.speed')}: ${st.speed}</span>` +
      `<span>🐾 ${t('stat.beasts')}: ${CLASSES[h.cls].beasts}</span></div>` +
      `<h4>${t('autoAttack')}</h4><div class="sk"><b>⚔ ${t('weapon')}</b><span>${t('atk.' + kind)}</span></div><h4>${t('skillsLabel')}</h4>${skills}`;
  }

  // Три кнопки умений героя: значок умения или секунды до готовности
  setSkills(ids, cds) {
    ids.forEach((sid, i) => {
      const b = this.$('btn-spell' + (i + 1)), cd = Math.ceil(cds[i]);
      b.classList.toggle('cd', cd > 0);
      const text = cd > 0 ? String(cd) : (SKILLS[sid]?.icon ?? '?');
      if (b.textContent !== text) b.textContent = text;
      b.title = t('skill.' + sid);
    });
  }

  drawMinimap(units) {
    const cv = this.$('minimap'), c = cv.getContext('2d');
    const W = cv.width, H = cv.height, sx = W / 76, sz = H / 120;
    const X = x => W / 2 + x * sx, Z = z => H / 2 + z * sz;
    c.fillStyle = '#16301f';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#d8c590';
    c.lineWidth = 3;
    for (const lx of [-28, 0, 28]) { c.beginPath(); c.moveTo(X(lx), Z(-42)); c.lineTo(X(lx), Z(42)); c.stroke(); }
    const col = { blue: '#6aa8ff', red: '#ff6a6a', neutral: '#d9c86a' };
    for (const u of units) {
      if (u.dead) continue;
      const size = { crystal: 5, tower: 3.5, hero: 3, king: 4, monster: 2, minion: 1.4 }[u.kind] ?? 2;
      c.fillStyle = col[u.team];
      if (u.kind === 'tower' || u.kind === 'crystal') c.fillRect(X(u.x) - size, Z(u.z) - size, size * 2, size * 2);
      else { c.beginPath(); c.arc(X(u.x), Z(u.z), size, 0, 6.3); c.fill(); }
      if (u.me) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(X(u.x), Z(u.z), 5, 0, 6.3); c.stroke(); }
    }
  }

  showArenaResult(win, kills, time, gold = 0) {
    this.$('ar-title').textContent = t(win ? 'arena.win' : 'arena.lose');
    const mm = Math.floor(time / 60), ss = String(Math.floor(time % 60)).padStart(2, '0');
    this.$('ar-stats').textContent = `${t('arena.score')} ${kills.blue}:${kills.red} · ${mm}:${ss} · ${RESOURCES.gold.icon} +${gold}`;
    this.$('arena-result').classList.remove('hidden');
    this.$('arena-count').classList.add('hidden');
  }

  hideArenaResult() {
    this.$('arena-result').classList.add('hidden');
  }

  showFps(show) {
    this.$('fps').classList.toggle('hidden', !show);
  }

  setFps(fps, ratio) {
    const el = this.$('fps');
    if (!el.classList.contains('hidden')) el.textContent = `${Math.round(fps)} FPS · x${ratio.toFixed(2)}`;
  }

  refreshTexts() {
    document.documentElement.lang = getLang();
    this.$('menu-sub').textContent = t('subtitle');
    this.$('btn-new').textContent = t('newGame');
    this.$('btn-continue').textContent = t('continue');
    this.$('btn-continue').classList.toggle('hidden', !SaveManager.load());
    this.$('hp-label').textContent = t('hp');
    this.$('lvl-label').textContent = `${t('level')} ${this.level ?? 1}`;
    this.$('btn-jump').textContent = t('jump');
    this.$('ar-again').textContent = t('arena.again');
    this.$('ar-exit').textContent = t('arena.exit');
    this.$('btn-attack').textContent = `⚔ ${t('attack')}`;
    this.$('btn-interact').textContent = t('interact');
    this.$('cr-title').textContent = t('creatures');
    this.$('cr-close').textContent = t('close');
    this.$('bp-title').textContent = t('buildMenu');
    this.$('bp-close').textContent = t('close');
    this.$('btn-settings').textContent = `⚙ ${t('settings')}`;
    this.refreshSettings();
    this.cloudPanel?.render();
    this.itemsPanel?.render();
    this.bookPanel?.render();
    this.$('tut-title').textContent = t('tut.title');
    this.$('tut-skip').textContent = t('skip');
    if (this.tutorialState) this.setTutorial(...this.tutorialState);
    document.querySelectorAll('[data-lang]').forEach(b =>
      b.classList.toggle('active', b.dataset.lang === getLang()));
    if (!this.$('hud').classList.contains('hidden')) this.showHint(this.hintKey);
  }

  showMenu(show) {
    this.$('menu').classList.toggle('hidden', !show);
    this.$('hud').classList.toggle('hidden', show);
    if (show) { this.showPanel(false); this.showBuildPanel(false); this.setBuildBar(false); this.refreshTexts(); }
  }

  get anyPanelOpen() {
    return this.panelOpen || this.buildPanelOpen;
  }

  costText(cost) {
    return Object.entries(cost).map(([k, v]) => `${RESOURCES[k].icon}${v}`).join(' ');
  }

  // Меню строительства. items: [{ id, cost, canAfford }]
  showBuildPanel(show, items = []) {
    this.buildPanelOpen = show;
    this.$('build-panel').classList.toggle('hidden', !show);
    if (!show) return;
    const list = this.$('bp-list');
    list.textContent = '';
    const add = (id, name, costText, enabled) => {
      const row = document.createElement('div');
      row.className = 'cr-row';
      const info = document.createElement('div');
      info.textContent = name;
      const small = document.createElement('small');
      small.textContent = costText;
      info.appendChild(small);
      const btn = document.createElement('button');
      btn.textContent = t('select');
      btn.style.opacity = enabled ? 1 : 0.6;
      btn.onclick = () => this.onSelectBuilding(id);
      row.append(info, btn);
      list.appendChild(row);
    };
    for (const it of items) add(it.id, t('building.' + it.id), this.costText(it.cost), it.canAfford);
    add('upgrade', '⬆ ' + t('upgrade'), t('upgrade.hint'), true);
    add('demolish', '🗑 ' + t('demolish'), '', true);
  }

  // Панель управления строительством (сверху по центру)
  setBuildBar(active, text = '', ok = true) {
    this.$('build-bar').classList.toggle('hidden', !active);
    if (!active) return;
    const info = this.$('bb-info');
    info.textContent = text;
    info.classList.toggle('bad', !ok);
  }

  // Обучение: step — номер шага (0..total-1), null — скрыть
  setTutorial(step, total, key) {
    this.tutorialState = step === null ? null : [step, total, key];
    this.$('hint').style.visibility = step === null ? '' : 'hidden';   // обучение заменяет подсказку
    const box = this.$('tutorial');
    box.classList.toggle('hidden', step === null);
    if (step === null) return;
    this.$('tut-count').textContent = `${step + 1}/${total}`;
    this.$('tut-text').textContent = t(key);
  }

  // Подсказка внизу: обычная или (key = 'arena') для арены
  showHint(key = '') {
    this.hintKey = key;
    const h = this.$('hint');
    h.textContent = this.isTouch ? t(key ? key + 'Touch' : 'hintTouch') : t(key ? key + 'Desktop' : 'hintDesktop');
    h.style.opacity = 1;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { h.style.opacity = 0; }, 9000);
  }

  toast(text) {
    const el = this.$('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  // Всплывающее число над точкой мира (урон, лечение, награда)
  floatText(worldPos, text, color = '#fff') {
    if (!this.camera) return;
    _v.copy(worldPos).project(this.camera);
    if (_v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  flashHurt() {
    const el = this.$('hurt');
    el.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('on')));
  }

  // Подсказка "что можно сделать рядом"; null — скрыть
  setPrompt(text, isNeed = false) {
    const el = this.$('prompt');
    el.classList.toggle('hidden', !text);
    el.classList.toggle('need', isNeed);
    if (text) el.textContent = text;
  }

  updateHud(player, inventory, pet, xpNeed, petCount = 1) {
    this.level = player.level;
    this.$('hp-fill').style.width = `${(player.hp / player.maxHp) * 100}%`;
    const full = player.level >= MAX_LEVEL;
    this.$('xp-fill').style.width = `${full ? 100 : Math.min(100, (player.xp / xpNeed) * 100)}%`;
    this.$('lvl-label').textContent = `${t('level')} ${player.level}`;
    for (const k of RESOURCE_ORDER) {
      const el = this.resEls[k], n = inventory.items[k], cap = inventory.capacity(k);
      el.textContent = `${RESOURCES[k].icon} ${n}`;       // в рюкзаке; когда полон — число красное
      el.title = `${n}/${cap}`;
      el.classList.toggle('full', n >= cap);
    }

    this.foodEl.textContent = `🍎 ${inventory.foodTotal()}`;
    this.foodEl.title = `${inventory.foodTotal()}/${inventory.foodCap()}`;
    this.foodEl.classList.toggle('full', inventory.foodTotal() >= inventory.foodCap());
    this.$('pet').classList.toggle('hidden', !pet);
    document.body.classList.toggle('has-pet', !!pet);
    if (pet) {
      this.$('pet-name').textContent = `${pet.hunger >= 1 ? '😟 ' : ''}${pet.displayName} · ${t('level')} ${pet.level}${petCount > 1 ? ` +${petCount - 1}` : ''}`;
      for (const c of ['follow', 'stay', 'defend', 'attack']) this.$('pc-' + c).classList.toggle('on', pet.command === c);
      this.$('pet-cd').style.width = `${Math.max(0, Math.min(1, pet.abilityReady)) * 100}%`;
      this.$('btn-ability').title = t('ability.' + pet.def.ability.id);
    }
  }

  // Панель существ: список приручённых и команды
  showPanel(show, collection = [], activeIds = [], limit = 1) {
    this.panelOpen = show;
    this.$('creatures-panel').classList.toggle('hidden', !show);
    if (show) this.renderPanel(collection, activeIds, limit);
  }

  renderPanel(collection, activeIds, limit = 1) {
    this.$('cr-title').textContent = `${t('creatures')} · ${t('beastsNear')} ${activeIds.length}/${limit}`;
    const list = this.$('cr-list');
    list.textContent = '';
    if (!collection.length) {
      const e = document.createElement('div');
      e.className = 'cr-empty';
      e.textContent = t('noCreatures');
      list.appendChild(e);
    }
    for (const r of collection) {
      const row = document.createElement('div');
      row.className = 'cr-row';
      const info = document.createElement('div');
      const def = CREATURES[r.id];
      info.textContent = beastTitle(def, r.level);
      const small = document.createElement('small');
      small.textContent = `${t('level')} ${r.level} · ${activeIds.includes(r.id) ? t('active') : t('guarding')} · ${r.fed === false ? '😟 ' + t('beast.statusHungry') : '😋 ' + t('beast.statusFed')}`;
      info.appendChild(small);
      const btn = document.createElement('button');
      const isActive = activeIds.includes(r.id);
      btn.textContent = isActive ? t('toGuard') : t('summon');
      btn.onclick = () => this.onSummon(r.id);
      // Отпустить зверя на свободу (спрашиваем подтверждение)
      const free = document.createElement('button');
      free.textContent = '🕊';
      free.title = t('release');
      free.className = 'cr-release';
      free.onclick = () => { if (confirm(`${t('releaseConfirm')} ${info.firstChild.textContent}?`)) this.onRelease(r.id); };
      row.append(info, btn, free);
      list.appendChild(row);
    }
    const cmds = this.$('cr-cmds');
    cmds.textContent = '';
    for (const c of ['follow', 'stay', 'defend', 'attack']) this.$('pc-' + c).title = t('cmd.' + c);
    for (const c of COMMANDS) {
      const b = document.createElement('button');
      b.textContent = t('cmd.' + c);
      b.onclick = () => this.press('cmd-' + c);
      cmds.appendChild(b);
    }
  }
}
