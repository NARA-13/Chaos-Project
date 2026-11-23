import {
  CANVAS_W,
  CANVAS_H,
  MODE_CONFIG,
  DEFAULT_KEYBINDS,
  DEFAULT_SETTINGS,
  CREDITS_DATA,
  loadSettings,
  saveSettings,
  loadRecords,
  formatKeyName,
} from './config.js';
import { AssetManager } from './assets.js';
import { AudioManager } from './audio.js';
import { InputManager } from './input.js';
import { CarouselBackground } from './background.js';
import { BattleScene } from './battle.js';

class ChaosProjectApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.stageShell = document.getElementById('stage-shell');
    this.crtOverlay = document.getElementById('crt-overlay');
    this.topControls = document.getElementById('top-controls');
    this.overlayBackdrop = document.getElementById('overlay-backdrop');
    this.overlayPanel = document.getElementById('overlay-panel');
    this.audioToast = document.getElementById('audio-toast');

    this.settings = loadSettings();
    this.assets = new AssetManager();
    this.audio = new AudioManager(this.settings);
    this.input = new InputManager(this.settings);
    this.bg = new CarouselBackground();

    this.screen = 'LOADING'; // 'LOADING' | 'MENU' | 'BATTLE'
    this.modal = null; // null | 'MODE' | 'SETTINGS' | 'CREDITS' | 'PAUSE'
    this.settingsTab = 'audio';
    this.paused = false;

    this.menuCursor = 0;
    this.menuOptions = ['PLAY', 'SETTINGS', 'CREDITS'];
    this.menuTime = 0;
    this.floatingSuits = [
      { key: 'bullet_spade', a: 0.0, r: 210, yOff: -35, spd: 0.45 },
      { key: 'bullet_heart', a: 1.57, r: 225, yOff: 15, spd: 0.45 },
      { key: 'bullet_diamond_v', a: 3.14, r: 210, yOff: -20, spd: 0.45 },
      { key: 'bullet_club_w', a: 4.71, r: 225, yOff: 25, spd: 0.45 },
    ];

    this.battle = null;
    this.loadProgress = 0;
    this.fps = 60;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.lastTime = performance.now();

    this._bindChromeEvents();
    this._applyDisplaySettings();
    this._boot();
  }

  _bindChromeEvents() {
    const unlockOnce = () => {
      if (!this.audio.unlocked) {
        this.audio.unlock();
        this.audioToast.classList.add('hidden');
        if (this.screen === 'MENU') {
          this.audio.playMusic('menu');
        }
      }
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);

    document.getElementById('btn-pause').addEventListener('click', () => {
      if (this.screen === 'BATTLE') {
        if (this.modal === 'PAUSE') this._closeModal();
        else this._openModal('PAUSE');
      }
    });

    document.getElementById('btn-mute').addEventListener('click', (e) => {
      const muted = this.audio.toggleMute();
      e.target.textContent = muted ? 'AUDIO: OFF' : 'AUDIO: ON';
    });

    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        this.stageShell.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });

    // Mouse support on Main Menu canvas items
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.screen !== 'MENU' || this.modal) return;
      const pos = this._canvasCoords(e);
      const hit = this._menuHitTest(pos.x, pos.y);
      if (hit !== -1 && hit !== this.menuCursor) {
        this.menuCursor = hit;
        this.audio.playSfx('menumove');
      }
    });

    this.canvas.addEventListener('click', (e) => {
      this.canvas.focus();
      if (this.screen !== 'MENU' || this.modal) return;
      const pos = this._canvasCoords(e);
      const hit = this._menuHitTest(pos.x, pos.y);
      if (hit !== -1) {
        this.menuCursor = hit;
        this._activateMenuOption(hit);
      }
    });

    // Global Escape handler for closing modals
    window.addEventListener('keydown', (e) => {
      if (this.input.rebindCallback) return;
      if (e.code === 'Escape') {
        if (this.modal) {
          e.preventDefault();
          this._closeModal();
        } else if (this.screen === 'BATTLE' && this.battle && this.battle.state !== 'GAME_OVER' && this.battle.state !== 'VICTORY_SCREEN') {
          e.preventDefault();
          this._openModal('PAUSE');
        }
      }
    });
  }

  _canvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  }

  _menuHitTest(x, y) {
    for (let i = 0; i < this.menuOptions.length; i++) {
      const oy = 304 + i * 44;
      if (x >= 200 && x <= 440 && y >= oy - 22 && y <= oy + 14) {
        return i;
      }
    }
    return -1;
  }

  _applyDisplaySettings() {
    this.stageShell.classList.remove('scale-fit', 'scale-1x', 'scale-2x');
    this.stageShell.classList.add(`scale-${this.settings.screenScale || 'fit'}`);
    this.crtOverlay.classList.toggle('hidden', !this.settings.crtScanlines);
    this.audio.updateVolumes();
  }

  async _boot() {
    this._loop(performance.now());
    await this.assets.loadAll((loaded, total) => {
      this.loadProgress = total > 0 ? loaded / total : 1;
    });
    this.screen = 'MENU';
    this.topControls.classList.remove('hidden');
    this.audioToast.classList.remove('hidden');
    this.audio.playMusic('menu');
    if (this.audio.unlocked) this.audioToast.classList.add('hidden');
    this.canvas.focus();
  }

  _startBattle(modeId) {
    this._closeModal();
    this.audio.unlock();
    this.audioToast.classList.add('hidden');
    this.screen = 'BATTLE';
    this.paused = false;
    this.input.clearAll();
    this.battle = new BattleScene({
      modeId,
      assets: this.assets,
      audio: this.audio,
      settings: this.settings,
      background: this.bg,
      onExitToMenu: (action, restartMode) => {
        if (action === 'restart') {
          this._startBattle(restartMode || modeId);
        } else {
          this._returnToMenu();
        }
      },
    });
    this.canvas.focus();
  }

  _returnToMenu() {
    this._closeModal();
    this.battle = null;
    this.screen = 'MENU';
    this.paused = false;
    this.audio.playMusic('menu', true);
    this.input.clearAll();
    this.canvas.focus();
  }

  _activateMenuOption(idx) {
    this.audio.playSfx('select');
    if (idx === 0) this._openModal('MODE');
    else if (idx === 1) this._openModal('SETTINGS');
    else if (idx === 2) this._openModal('CREDITS');
  }

  // ==================== MODAL UI (MODE SELECT / SETTINGS / CREDITS / PAUSE) ====================
  _openModal(type) {
    this.modal = type;
    this.input.enabled = false;
    if (this.screen === 'BATTLE') {
      this.paused = true;
      if (type === 'PAUSE') this.audio.pauseMusic();
    }
    this.overlayBackdrop.classList.remove('hidden');
    this.overlayPanel.classList.remove('chaos-border');
    this._renderModal();
  }

  _closeModal() {
    this.input.cancelRebind();
    const wasPause = this.modal === 'PAUSE';
    const backToPause = this.screen === 'BATTLE' && this.modal === 'SETTINGS';
    if (backToPause) {
      this.modal = 'PAUSE';
      this._renderModal();
      return;
    }

    this.modal = null;
    this.overlayBackdrop.classList.add('hidden');
    this.input.enabled = true;
    this.input.clearAll();
    if (this.screen === 'BATTLE' && this.paused) {
      this.paused = false;
      if (wasPause) this.audio.resumeMusic();
    }
    this.canvas.focus();
  }

  _renderModal() {
    const panel = this.overlayPanel;
    if (this.modal === 'MODE') {
      const records = loadRecords();
      const fmtRec = (r) =>
        r ? `BEST: ${r.turns} Turns (${Math.floor(r.timeSec / 60)}:${String(r.timeSec % 60).padStart(2, '0')}) • ${r.outcome.toUpperCase()}` : 'NOT YET CLEARED';

      panel.innerHTML = `
        <div class="modal-header">
          <h2 class="modal-title">SELECT GAME MODE</h2>
          <button class="modal-close" id="m-close">BACK (ESC)</button>
        </div>
        <div class="modal-body">
          <div class="mode-grid">
            <div class="mode-card" id="pick-normal">
              <div>
                <div class="mode-name" style="color:#66d9ff">NORMAL MODE</div>
                <div style="font-size:15px;color:#99a8d8">Original Deltarune Chapter 1</div>
                <ul class="mode-stats">
                  <li>• Jevil HP: 3,500 (AT 10 / DF 5)</li>
                  <li>• Pacify at 9 Tiredness</li>
                  <li>• All 16 Original Patterns</li>
                  <li>• BGM: THE WORLD REVOLVING</li>
                </ul>
              </div>
              <div>
                <div class="mode-record">${fmtRec(records.normal)}</div>
                <button class="dr-btn primary" style="width:100%;margin-top:8px">PLAY NORMAL</button>
              </div>
            </div>

            <div class="mode-card chaos-card" id="pick-chaos">
              <div>
                <div class="mode-name" style="color:#ff4c7e">CHAOS MODE</div>
                <div style="font-size:15px;color:#e090aa">True &amp; Neo Chaos Challenge</div>
                <ul class="mode-stats">
                  <li>• Jevil HP: 5,250 (AT 13 / DF 6)</li>
                  <li>• Higher Damage &amp; 1.24× Speed</li>
                  <li>• +5 Exclusive Chaos Patterns</li>
                  <li>• BGM: WORLD REVOLVING Remix</li>
                </ul>
              </div>
              <div>
                <div class="mode-record" style="color:#ff99bb">${fmtRec(records.chaos)}</div>
                <button class="dr-btn chaos" style="width:100%;margin-top:8px">PLAY CHAOS</button>
              </div>
            </div>
          </div>
        </div>
      `;
      panel.querySelector('#m-close').onclick = () => { this.audio.playSfx('menumove'); this._closeModal(); };
      panel.querySelector('#pick-normal').onclick = () => { this.audio.playSfx('select'); this._startBattle('normal'); };
      panel.querySelector('#pick-chaos').onclick = () => { this.audio.playSfx('orchhit'); this._startBattle('chaos'); };
      return;
    }

    if (this.modal === 'SETTINGS') {
      panel.innerHTML = `
        <div class="modal-header">
          <h2 class="modal-title">SETTINGS</h2>
          <button class="modal-close" id="m-close">DONE (ESC)</button>
        </div>
        <div class="modal-tabs">
          <button class="modal-tab ${this.settingsTab === 'audio' ? 'active' : ''}" data-tab="audio">AUDIO</button>
          <button class="modal-tab ${this.settingsTab === 'controls' ? 'active' : ''}" data-tab="controls">CONTROLS</button>
          <button class="modal-tab ${this.settingsTab === 'display' ? 'active' : ''}" data-tab="display">DISPLAY</button>
          <button class="modal-tab ${this.settingsTab === 'gameplay' ? 'active' : ''}" data-tab="gameplay">GAMEPLAY</button>
        </div>
        <div class="modal-body" id="settings-content"></div>
      `;
      panel.querySelector('#m-close').onclick = () => { this.audio.playSfx('menumove'); this._closeModal(); };
      panel.querySelectorAll('.modal-tab').forEach((btn) => {
        btn.onclick = () => {
          this.audio.playSfx('menumove');
          this.settingsTab = btn.dataset.tab;
          this._renderModal();
        };
      });
      this._renderSettingsTab(panel.querySelector('#settings-content'));
      return;
    }

    if (this.modal === 'CREDITS') {
      const sectionsHtml = CREDITS_DATA.map(
        (sec) => `
        <div class="credits-section">
          <h3>${sec.title}</h3>
          ${sec.lines.map((l) => `<p>${l}</p>`).join('')}
        </div>
      `
      ).join('');
      panel.innerHTML = `
        <div class="modal-header">
          <h2 class="modal-title">CREDITS &amp; ATTRIBUTIONS</h2>
          <button class="modal-close" id="m-close">BACK (ESC)</button>
        </div>
        <div class="modal-body">${sectionsHtml}</div>
      `;
      panel.querySelector('#m-close').onclick = () => { this.audio.playSfx('menumove'); this._closeModal(); };
      return;
    }

    if (this.modal === 'PAUSE') {
      const modeName = this.battle?.modeCfg.name || 'BATTLE';
      if (this.battle?.modeCfg.id === 'chaos') panel.classList.add('chaos-border');
      panel.innerHTML = `
        <div class="modal-header">
          <h2 class="modal-title">PAUSED — ${modeName}</h2>
          <button class="modal-close" id="m-close">RESUME (ESC)</button>
        </div>
        <div class="modal-body">
          <div class="pause-stack">
            <button class="dr-btn primary" id="p-resume">▶ RESUME BATTLE</button>
            <button class="dr-btn" id="p-restart">↻ RESTART BATTLE</button>
            <button class="dr-btn" id="p-settings">⚙ SETTINGS</button>
            <button class="dr-btn chaos" id="p-menu">✕ RETURN TO MAIN MENU</button>
          </div>
        </div>
      `;
      panel.querySelector('#m-close').onclick = () => { this.audio.playSfx('menumove'); this._closeModal(); };
      panel.querySelector('#p-resume').onclick = () => { this.audio.playSfx('select'); this._closeModal(); };
      panel.querySelector('#p-restart').onclick = () => { this.audio.playSfx('select'); this._startBattle(this.battle.modeCfg.id); };
      panel.querySelector('#p-settings').onclick = () => { this.audio.playSfx('select'); this.modal = 'SETTINGS'; this._renderModal(); };
      panel.querySelector('#p-menu').onclick = () => { this.audio.playSfx('select'); this._returnToMenu(); };
    }
  }

  _renderSettingsTab(container) {
    const s = this.settings;

    if (this.settingsTab === 'audio') {
      container.innerHTML = `
        <div class="setting-row">
          <div><span class="setting-label">Master Volume</span></div>
          <div class="setting-ctrl">
            <input type="range" class="dr-slider" id="s-master" min="0" max="100" value="${Math.round(s.masterVolume * 100)}" />
            <span id="v-master" style="width:42px;text-align:right">${Math.round(s.masterVolume * 100)}%</span>
          </div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Music Volume</span></div>
          <div class="setting-ctrl">
            <input type="range" class="dr-slider" id="s-music" min="0" max="100" value="${Math.round(s.musicVolume * 100)}" />
            <span id="v-music" style="width:42px;text-align:right">${Math.round(s.musicVolume * 100)}%</span>
          </div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">SFX Volume</span></div>
          <div class="setting-ctrl">
            <input type="range" class="dr-slider" id="s-sfx" min="0" max="100" value="${Math.round(s.sfxVolume * 100)}" />
            <span id="v-sfx" style="width:42px;text-align:right">${Math.round(s.sfxVolume * 100)}%</span>
          </div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Jevil Voice Clips</span><span class="setting-sub">"CHAOS, CHAOS!", "I CAN DO ANYTHING!"</span></div>
          <div class="setting-ctrl">
            <button class="dr-btn ${s.voiceClips ? 'active-toggle' : ''}" id="s-voice">${s.voiceClips ? 'ON' : 'OFF'}</button>
          </div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Test Sound</span></div>
          <div class="setting-ctrl">
            <button class="dr-btn" id="s-test-sfx">PLAY VOICE</button>
          </div>
        </div>
      `;

      const bindRange = (id, vid, prop) => {
        const el = container.querySelector(`#${id}`);
        const vl = container.querySelector(`#${vid}`);
        el.oninput = () => {
          s[prop] = Number(el.value) / 100;
          vl.textContent = `${el.value}%`;
          this.audio.updateVolumes();
          saveSettings(s);
        };
      };
      bindRange('s-master', 'v-master', 'masterVolume');
      bindRange('s-music', 'v-music', 'musicVolume');
      bindRange('s-sfx', 'v-sfx', 'sfxVolume');

      container.querySelector('#s-voice').onclick = () => {
        s.voiceClips = !s.voiceClips;
        saveSettings(s);
        this.audio.playSfx('select');
        this._renderSettingsTab(container);
      };
      container.querySelector('#s-test-sfx').onclick = () => {
        this.audio.playVoice('chaos');
      };
      return;
    }

    if (this.settingsTab === 'controls') {
      const actions = [
        ['up', 'Move Up'],
        ['down', 'Move Down'],
        ['left', 'Move Left'],
        ['right', 'Move Right'],
        ['confirm', 'Confirm / Attack'],
        ['cancel', 'Cancel / Slow SOUL'],
        ['menu', 'Pause / Menu'],
      ];
      container.innerHTML =
        actions
          .map(
            ([act, label]) => `
          <div class="setting-row">
            <div><span class="setting-label">${label}</span><span class="setting-sub">${s.keybinds[act].map(formatKeyName).join(' / ')}</span></div>
            <div class="setting-ctrl">
              <button class="dr-btn" data-rebind="${act}">REBIND PRIMARY</button>
            </div>
          </div>
        `
          )
          .join('') +
        `<div class="setting-row">
          <div><span class="setting-label">Reset Keybinds</span><span class="setting-sub">Restore Arrows/WASD + Z/X/C</span></div>
          <div class="setting-ctrl"><button class="dr-btn chaos" id="s-reset-keys">RESET DEFAULTS</button></div>
        </div>`;

      container.querySelectorAll('[data-rebind]').forEach((btn) => {
        btn.onclick = () => {
          const act = btn.dataset.rebind;
          btn.textContent = 'PRESS ANY KEY...';
          btn.classList.add('rebinding');
          this.input.startRebind((code) => {
            const list = s.keybinds[act].filter((c) => c !== code);
            list.unshift(code);
            s.keybinds[act] = list.slice(0, 3);
            saveSettings(s);
            this.audio.playSfx('select');
            this._renderSettingsTab(container);
          });
        };
      });
      container.querySelector('#s-reset-keys').onclick = () => {
        s.keybinds = JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
        saveSettings(s);
        this.audio.playSfx('select');
        this._renderSettingsTab(container);
      };
      return;
    }

    if (this.settingsTab === 'display') {
      const scales = ['fit', '1x', '2x'];
      const shakes = ['full', 'reduced', 'off'];
      const spins = ['normal', 'reduced', 'static'];
      container.innerHTML = `
        <div class="setting-row">
          <div><span class="setting-label">Screen Scale</span><span class="setting-sub">Pixel-sharp nearest-neighbor scaling</span></div>
          <div class="setting-ctrl"><button class="dr-btn" id="s-scale">${s.screenScale.toUpperCase()}</button></div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">CRT Scanlines</span><span class="setting-sub">Subtle retro scanline vignette</span></div>
          <div class="setting-ctrl"><button class="dr-btn ${s.crtScanlines ? 'active-toggle' : ''}" id="s-crt">${s.crtScanlines ? 'ON' : 'OFF'}</button></div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Screen Shake</span></div>
          <div class="setting-ctrl"><button class="dr-btn" id="s-shake">${s.screenShake.toUpperCase()}</button></div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Carousel BG Spin</span><span class="setting-sub">Reduce or pause for motion comfort</span></div>
          <div class="setting-ctrl"><button class="dr-btn" id="s-spin">${s.bgSpin.toUpperCase()}</button></div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Show FPS Counter</span></div>
          <div class="setting-ctrl"><button class="dr-btn ${s.showFps ? 'active-toggle' : ''}" id="s-fps">${s.showFps ? 'ON' : 'OFF'}</button></div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Show SOUL &amp; Bullet Hitboxes</span></div>
          <div class="setting-ctrl"><button class="dr-btn ${s.showHitbox ? 'active-toggle' : ''}" id="s-hit">${s.showHitbox ? 'ON' : 'OFF'}</button></div>
        </div>
      `;

      const cycle = (id, prop, list) => {
        container.querySelector(`#${id}`).onclick = () => {
          s[prop] = list[(list.indexOf(s[prop]) + 1) % list.length];
          saveSettings(s);
          this._applyDisplaySettings();
          this.audio.playSfx('select');
          this._renderSettingsTab(container);
        };
      };
      const toggle = (id, prop) => {
        container.querySelector(`#${id}`).onclick = () => {
          s[prop] = !s[prop];
          saveSettings(s);
          this._applyDisplaySettings();
          this.audio.playSfx('select');
          this._renderSettingsTab(container);
        };
      };
      cycle('s-scale', 'screenScale', scales);
      toggle('s-crt', 'crtScanlines');
      cycle('s-shake', 'screenShake', shakes);
      cycle('s-spin', 'bgSpin', spins);
      toggle('s-fps', 'showFps');
      toggle('s-hit', 'showHitbox');
      return;
    }

    if (this.settingsTab === 'gameplay') {
      container.innerHTML = `
        <div class="setting-row">
          <div><span class="setting-label">Skip Pre-Battle Intro</span><span class="setting-sub">Jump straight into Turn 1</span></div>
          <div class="setting-ctrl"><button class="dr-btn ${s.skipIntro ? 'active-toggle' : ''}" id="s-intro">${s.skipIntro ? 'ON' : 'OFF'}</button></div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Precision Slow Focus</span><span class="setting-sub">Hold Cancel/Shift to move SOUL slowly</span></div>
          <div class="setting-ctrl"><button class="dr-btn ${s.focusSlow ? 'active-toggle' : ''}" id="s-focus">${s.focusSlow ? 'ON' : 'OFF'}</button></div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Show Jevil Exact HP &amp; Tired Bar</span><span class="setting-sub">Top HUD bar for practice/speedruns</span></div>
          <div class="setting-ctrl"><button class="dr-btn ${s.showBossStats ? 'active-toggle' : ''}" id="s-bossbar">${s.showBossStats ? 'ON' : 'OFF'}</button></div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Floating Damage Numbers</span></div>
          <div class="setting-ctrl"><button class="dr-btn ${s.showDamageNumbers ? 'active-toggle' : ''}" id="s-dmg">${s.showDamageNumbers ? 'ON' : 'OFF'}</button></div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Reset All Settings</span></div>
          <div class="setting-ctrl"><button class="dr-btn chaos" id="s-reset-all">RESET ALL</button></div>
        </div>
      `;
      const toggle = (id, prop) => {
        container.querySelector(`#${id}`).onclick = () => {
          s[prop] = !s[prop];
          saveSettings(s);
          this.audio.playSfx('select');
          this._renderSettingsTab(container);
        };
      };
      toggle('s-intro', 'skipIntro');
      toggle('s-focus', 'focusSlow');
      toggle('s-bossbar', 'showBossStats');
      toggle('s-dmg', 'showDamageNumbers');
      container.querySelector('#s-reset-all').onclick = () => {
        Object.assign(this.settings, structuredClone(DEFAULT_SETTINGS));
        saveSettings(this.settings);
        this._applyDisplaySettings();
        this.audio.playSfx('select');
        this._renderSettingsTab(container);
      };
    }
  }

  // ==================== MAIN GAME LOOP ====================
  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.input.update();

    if (this.screen === 'MENU') {
      this._updateMenu(dt);
      this._drawMenu();
    } else if (this.screen === 'BATTLE' && this.battle) {
      if (!this.paused) {
        if (this.input.pressed('menu') && this.battle.state !== 'GAME_OVER' && this.battle.state !== 'VICTORY_SCREEN') {
          this._openModal('PAUSE');
        } else {
          this.battle.update(dt, this.input);
        }
      }
      this.battle.draw(this.ctx);
    } else {
      this._drawLoading();
    }

    if (this.settings.showFps) {
      this.ctx.save();
      this.ctx.font = '10px "DRSilk", monospace';
      this.ctx.fillStyle = '#00ff88';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`FPS: ${this.fps}`, 8, CANVAS_H - 8);
      this.ctx.restore();
    }
  }

  _updateMenu(dt) {
    this.menuTime += dt;
    this.bg.update(dt, 0.42, this.settings.bgSpin);
    for (const s of this.floatingSuits) {
      s.a += s.spd * dt;
    }

    if (this.modal) return;
    if (this.input.pressed('up')) {
      this.menuCursor = (this.menuCursor + this.menuOptions.length - 1) % this.menuOptions.length;
      this.audio.playSfx('menumove');
    } else if (this.input.pressed('down')) {
      this.menuCursor = (this.menuCursor + 1) % this.menuOptions.length;
      this.audio.playSfx('menumove');
    } else if (this.input.pressed('confirm')) {
      this._activateMenuOption(this.menuCursor);
    }
  }

  _drawLoading() {
    const ctx = this.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    ctx.font = '18px "DRPixel", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('CHAOS PROJECT', CANVAS_W / 2, 200);
    ctx.font = '12px "DRSilk", monospace';
    ctx.fillStyle = '#9999cc';
    ctx.fillText('LOADING OFFICIAL DELTARUNE ASSETS...', CANVAS_W / 2, 232);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(170, 252, 300, 16);
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(174, 256, Math.round(292 * this.loadProgress), 8);
  }

  _drawMenu() {
    const ctx = this.ctx;
    // Slow revolving circus backdrop
    this.bg.draw(ctx, this.assets, MODE_CONFIG.normal, { fullHeight: true, bulletDim: 0.45 });

    // Subtle floating card suits orbiting behind title
    for (const s of this.floatingSuits) {
      const sx = CANVAS_W / 2 + Math.cos(s.a) * s.r;
      const sy = 150 + Math.sin(s.a * 1.4) * 28 + s.yOff;
      this.assets.draw(ctx, s.key, 0, sx, sy, { scale: 0.85, alpha: 0.25, rotation: s.a * 0.4 });
    }

    // Jevil's official prison door sprite centered subtly behind dancing Jevil!
    const doorFrame = Math.floor(this.menuTime * 0.8) % 3;
    this.assets.draw(ctx, 'jevil_door', doorFrame, CANVAS_W / 2, 250, { scale: 1.55, anchor: 'bottom', alpha: 0.35 });

    // Dancing Jevil in center stage!
    const jf = Math.floor(this.menuTime * 7) % 8;
    const jBob = Math.sin(this.menuTime * 4) * 4;
    this.assets.draw(ctx, 'jevil_front', jf, CANVAS_W / 2, 246 + jBob, { scale: 2.2, anchor: 'bottom' });

    // Title Banner
    ctx.save();
    ctx.textAlign = 'center';

    // Glow shadow
    ctx.font = 'bold 30px "DRPixel", monospace';
    ctx.fillStyle = '#331188';
    ctx.fillText('CHAOS PROJECT', CANVAS_W / 2 + 3, 76 + 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('CHAOS PROJECT', CANVAS_W / 2, 76);

    ctx.font = '11px "DRSilk", monospace';
    ctx.fillStyle = '#88b4ff';
    ctx.fillText('DELTARUNE  •  THE ORIGINAL JEVIL BOSS FIGHT', CANVAS_W / 2, 102);

    // Classic Deltarune Menu Box
    const bx = 180;
    const by = 266;
    const bw = 280;
    const bh = 160;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.90)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(bx, by, bw, bh);

    for (let i = 0; i < this.menuOptions.length; i++) {
      const oy = 306 + i * 44;
      const sel = i === this.menuCursor;
      if (sel) {
        this.assets.draw(ctx, 'soul_red', 0, bx + 54, oy - 7, { scale: 1.0 });
      }
      ctx.font = '16px "DRPixel", monospace';
      ctx.fillStyle = sel ? '#ffff00' : '#ffffff';
      ctx.fillText(this.menuOptions[i], CANVAS_W / 2 + 10, oy);
    }

    // Bottom control hints
    ctx.font = '16px "DRMono", monospace';
    ctx.fillStyle = '#8a8ab8';
    ctx.fillText('ARROWS / WASD: Move   •   Z / ENTER: Confirm   •   X / SHIFT: Cancel / Slow   •   ESC: Pause', CANVAS_W / 2, 460);
    ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ChaosProjectApp();
});
