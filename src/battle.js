import {
  CANVAS_W,
  CANVAS_H,
  ARENA_H,
  UI_TOP,
  MODE_CONFIG,
  createInitialParty,
  createInitialInventory,
  saveRecord,
} from './config.js';
import {
  PRE_BATTLE_DIALOGUE,
  NEUTRAL_FLAVOR,
  NEUTRAL_JEVIL_QUOTES,
  CHAOS_JEVIL_QUOTES,
  PHASE_QUOTES,
  VICTORY_PACIFY_DIALOGUE,
  VICTORY_FIGHT_DIALOGUE,
  PIROUETTE_DESCRIPTIONS,
} from './dialogue.js';
import { AttackController } from './attacks.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export class BattleScene {
  constructor({ modeId, assets, audio, settings, background, onExitToMenu }) {
    this.modeCfg = MODE_CONFIG[modeId] || MODE_CONFIG.normal;
    this.assets = assets;
    this.audio = audio;
    this.settings = settings;
    this.bg = background;
    this.onExitToMenu = onExitToMenu;

    this.party = createInitialParty();
    this.inventory = createInitialInventory();
    this.tp = 0; // 0..100
    this.turnNumber = 1;
    this.battleTime = 0;
    this.totalDamageTaken = 0;
    this.totalGrazes = 0;

    // Jevil state
    this.jevil = {
      hp: this.modeCfg.jevilMaxHp,
      maxHp: this.modeCfg.jevilMaxHp,
      at: this.modeCfg.jevilAT,
      df: this.modeCfg.jevilDF,
      tiredness: 0,
      phase: 1,
      phaseStep: 0,
      usedPatterns: new Set(),
      x: 505,
      y: 186,
      baseX: 505,
      baseY: 186,
      animTimer: 0,
      hurtTimer: 0,
      hurtHeadOffset: 0,
      afterimages: [],
      isTiredPose: false,
      defeated: false,
      pacified: false,
      visible: true,
    };

    // Temporary per-turn modifiers
    this.turnAtMult = 1.0;
    this.pirouetteLowIframes = false;
    this.nextFlavorOverride = null;

    // Battle state machine
    this.state = this.settings.skipIntro ? 'MENU_SELECT' : 'INTRO_DIALOGUE';
    this.introIndex = 0;
    this.victoryLines = [];
    this.victoryIndex = 0;
    this.victoryOutcome = null; // 'fight' | 'pacify'

    // Dialogue typewriter
    this.dialogText = '';
    this.dialogShown = 0;
    this.dialogSpeaker = 'narrator';
    this.dialogTimer = 0;
    this.currentFlavor = 'LET THE GAMES BEGIN!';

    // Menu selection state
    this.activeCharIdx = 0;
    this.menuLevel = 'ACTION'; // 'ACTION' | 'TARGET_ENEMY' | 'ACT' | 'MAGIC' | 'ITEM' | 'TARGET_ALLY' | 'SPARE'
    this.actionCursor = [0, 0, 0];
    this.subCursor = 0;
    this.pendingAction = null;
    this.reservedTp = [0, 0, 0];
    this.reservedItems = [null, null, null];

    // Attack timing minigame state
    this.attackLanes = [];
    this.attackTimer = 0;

    // Sequential player actions queue
    this.actionQueue = [];
    this.currentAction = null;
    this.actionWaitConfirm = false;

    // Boss dialogue bubble state
    this.bossBubbleText = '';
    this.bossBubbleShown = 0;
    this.bossBubbleTimer = 0;
    this.upcomingPattern = 'spade_volleys';

    // Bullet controller
    this.attacks = new AttackController(this);

    // Visual effects & floating numbers & useless bird
    this.fxList = [];
    this.floatTexts = [];
    this.uselessBird = null;
    this.rudeBuster = null;
    this.shakeTime = 0;
    this.shakeMag = 0;

    // Game Over shatter state
    this.gameOverTimer = 0;
    this.gameOverStage = 0;
    this.soulShards = [];
    this.gameOverCursor = 0;
    this.victoryCursor = 0;

    // Start!
    this.audio.playSfx('battleenter', { volume: 0.75 });
    if (this.state === 'INTRO_DIALOGUE') {
      this._loadIntroLine(0);
    } else {
      this._startMusic();
      this._beginMenuTurn();
    }
  }

  _startMusic() {
    this.audio.playMusic(this.modeCfg.musicKey, true);
  }

  triggerShake(mag, duration) {
    if (this.settings.screenShake === 'off') return;
    const mult = this.settings.screenShake === 'reduced' ? 0.4 : 1.0;
    this.shakeMag = Math.max(this.shakeMag, mag * mult);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  addTp(amount) {
    this.tp = clamp(this.tp + amount, 0, 100);
  }

  getAvailableTp() {
    const used = this.reservedTp.reduce((a, b) => a + b, 0);
    return Math.max(0, this.tp - used);
  }

  isJevilPacifiable() {
    if (this.jevil.tiredness >= this.modeCfg.tiredThreshold) return true;
    if (this.jevil.phase >= 5) {
      const neededTurn = Math.max(1, this.modeCfg.phase5TurnPacify - Math.floor(this.jevil.tiredness));
      if (this.turnNumber >= neededTurn) return true;
    }
    return false;
  }

  _loadIntroLine(idx) {
    if (idx >= PRE_BATTLE_DIALOGUE.length) {
      this.state = 'MENU_SELECT';
      this._startMusic();
      this._beginMenuTurn();
      return;
    }
    this.introIndex = idx;
    const line = PRE_BATTLE_DIALOGUE[idx];
    this.dialogSpeaker = line.speaker;
    this.dialogText = line.text;
    this.dialogShown = 0;
    this.dialogTimer = 0;
    if (line.voice) this.audio.playVoice(line.voice);
  }

  _beginMenuTurn() {
    this.state = 'MENU_SELECT';
    this.menuLevel = 'ACTION';
    this.subCursor = 0;
    this.pendingAction = null;
    this.reservedTp = [0, 0, 0];
    this.reservedItems = [null, null, null];
    this.jevil.isTiredPose = false;

    for (const p of this.party) {
      p.queuedAction = null;
      p.defending = false;
      p.anim = p.hp > 0 ? 'idle' : 'downed';
    }

    // Flavor text selection
    if (this.turnNumber === 1) {
      this.currentFlavor = 'LET THE GAMES BEGIN!';
    } else if (this.nextFlavorOverride) {
      this.currentFlavor = this.nextFlavorOverride;
      this.nextFlavorOverride = null;
    } else if (this.isJevilPacifiable()) {
      this.currentFlavor = 'Jevil is truly exhausted!';
    } else if (this.jevil.phase >= 5) {
      this.currentFlavor = "Jevil's pulling out all the stops!";
    } else {
      this.currentFlavor = NEUTRAL_FLAVOR[Math.floor(Math.random() * NEUTRAL_FLAVOR.length)];
    }

    this.dialogText = '* ' + this.currentFlavor;
    this.dialogShown = 0;
    this.dialogSpeaker = 'narrator';

    // Focus first living party member
    this.activeCharIdx = this._nextLivingChar(-1);
    if (this.activeCharIdx === -1) {
      this._triggerGameOver();
    }
  }

  _nextLivingChar(fromIdx) {
    for (let i = fromIdx + 1; i < this.party.length; i++) {
      if (this.party[i].hp > 0) return i;
    }
    return -1;
  }

  _prevLivingChar(fromIdx) {
    for (let i = fromIdx - 1; i >= 0; i--) {
      if (this.party[i].hp > 0) return i;
    }
    return -1;
  }

  update(dt, input) {
    // Background speed scales with Jevil's phase & mode
    const phaseSpin = 0.85 + this.jevil.phase * 0.28 + (this.modeCfg.id === 'chaos' ? 0.35 : 0);
    const spinMult = this.jevil.defeated || this.state === 'GAME_OVER' ? 0.1 : phaseSpin;
    this.bg.update(dt, spinMult, this.settings.bgSpin);

    if (this.state !== 'VICTORY_SCREEN' && this.state !== 'GAME_OVER' && this.state !== 'INTRO_DIALOGUE') {
      this.battleTime += dt;
    }

    // Screen shake decay
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      if (this.shakeTime === 0) this.shakeMag = 0;
    }

    // Update character animations
    for (const p of this.party) {
      if (p.hurtTimer > 0) p.hurtTimer = Math.max(0, p.hurtTimer - dt);
      p.animTimer += dt;
      if (p.hp <= 0) {
        p.anim = 'downed';
      } else if (p.anim === 'hurt' && p.hurtTimer <= 0) {
        p.anim = p.defending ? 'defend' : 'idle';
      }
    }

    // Update Jevil animation & Phase 5 motion blur
    this._updateJevilAnim(dt);

    // Update FX & floating text & useless bird
    this._updateEffects(dt);

    // State Machine
    if (this.state === 'INTRO_DIALOGUE') {
      this._updateIntro(dt, input);
    } else if (this.state === 'MENU_SELECT') {
      this._updateMenuSelect(dt, input);
    } else if (this.state === 'ATTACK_TIMING') {
      this._updateAttackTiming(dt, input);
    } else if (this.state === 'PLAYER_ACTIONS') {
      this._updatePlayerActions(dt, input);
    } else if (this.state === 'BOSS_DIALOGUE') {
      this._updateBossDialogue(dt, input);
    } else if (this.state === 'BULLET_PHASE') {
      this.attacks.update(dt, input);
    } else if (this.state === 'VICTORY_CUTSCENE') {
      this._updateVictoryCutscene(dt, input);
    } else if (this.state === 'VICTORY_SCREEN') {
      this._updateVictoryScreen(input);
    } else if (this.state === 'GAME_OVER') {
      this._updateGameOver(dt, input);
    }
  }

  _updateJevilAnim(dt) {
    const j = this.jevil;
    j.animTimer += dt;
    if (j.hurtTimer > 0) {
      j.hurtTimer = Math.max(0, j.hurtTimer - dt);
      j.hurtHeadOffset = Math.sin(j.hurtTimer * 42) * 14 * (j.hurtTimer / 0.55);
    }

    // Jevil motion (normal bouncing vs Phase 5 frantic motion blur!)
    if (j.defeated) {
      j.x = j.baseX;
      j.y = j.baseY;
      j.afterimages = [];
    } else if (j.phase >= 5 || this.modeCfg.id === 'chaos') {
      const mult = j.phase >= 5 ? 1.0 : 0.45;
      const spd = j.phase >= 5 ? 9.5 : 5.2;
      j.x = j.baseX + Math.sin(j.animTimer * spd) * (24 * mult);
      j.y = j.baseY + Math.cos(j.animTimer * spd * 1.35) * (16 * mult);
      if (j.phase >= 5 || this.modeCfg.id === 'chaos') {
        j.afterimages.push({ x: j.x, y: j.y, f: Math.floor(j.animTimer * 12) % 8, alpha: 0.52 });
        if (j.afterimages.length > 7) j.afterimages.shift();
        for (const a of j.afterimages) a.alpha *= 0.84;
      }
    } else {
      j.x = j.baseX + Math.sin(j.animTimer * 3.1) * 5;
      j.y = j.baseY + Math.sin(j.animTimer * 6.2) * 4;
      j.afterimages = [];
    }
  }

  _updateEffects(dt) {
    for (let i = this.fxList.length - 1; i >= 0; i--) {
      const fx = this.fxList[i];
      fx.timer += dt;
      if (fx.expand) fx.scale = (fx.scale || 1) + fx.expand * dt;
      if (fx.fade) fx.alpha = Math.max(0, 1 - fx.timer / fx.duration);
      if (fx.timer >= fx.duration) this.fxList.splice(i, 1);
    }

    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const ft = this.floatTexts[i];
      ft.timer += dt;
      ft.y += ft.vy * dt;
      ft.vy += 120 * dt;
      if (ft.y > ft.baseY) {
        ft.y = ft.baseY;
        ft.vy *= -0.35;
      }
      if (ft.timer >= ft.duration) this.floatTexts.splice(i, 1);
    }

    if (this.uselessBird) {
      this.uselessBird.x += 235 * dt;
      this.uselessBird.y += Math.sin(this.uselessBird.t * 14) * 45 * dt;
      this.uselessBird.t += dt;
      if (this.uselessBird.x > CANVAS_W + 60) this.uselessBird = null;
    }
  }

  _advanceTypewriter(dt, speaker = 'narrator') {
    if (this.dialogShown < this.dialogText.length) {
      this.dialogTimer += dt * 42;
      const next = Math.min(this.dialogText.length, Math.floor(this.dialogTimer));
      if (next > this.dialogShown) {
        const ch = this.dialogText[next - 1];
        if (ch && ch !== ' ' && ch !== '\n' && ch !== '*') {
          const sfxMap = { jevil: 'txtjok', susie: 'txtsus', ralsei: 'txtral', narrator: 'text' };
          this.audio.playSfx(sfxMap[speaker] || 'text', { volume: 0.45, minGapMs: 42 });
        }
        this.dialogShown = next;
      }
    }
  }

  _updateIntro(dt, input) {
    this._advanceTypewriter(dt, this.dialogSpeaker);
    if (input.pressed('cancel')) {
      this.dialogShown = this.dialogText.length;
    }
    if (input.pressed('confirm')) {
      if (this.dialogShown < this.dialogText.length) {
        this.dialogShown = this.dialogText.length;
      } else {
        this.audio.playSfx('select', { volume: 0.5 });
        this._loadIntroLine(this.introIndex + 1);
      }
    }
  }

  _updateMenuSelect(dt, input) {
    this._advanceTypewriter(dt, 'narrator');
    const char = this.party[this.activeCharIdx];
    if (!char) return;

    // 1. Top-level Action Icons (FIGHT, ACT/MAGIC, ITEM, SPARE, DEFEND)
    if (this.menuLevel === 'ACTION') {
      if (input.pressed('left')) {
        this.actionCursor[this.activeCharIdx] = (this.actionCursor[this.activeCharIdx] + 4) % 5;
        this.audio.playSfx('menumove');
      } else if (input.pressed('right')) {
        this.actionCursor[this.activeCharIdx] = (this.actionCursor[this.activeCharIdx] + 1) % 5;
        this.audio.playSfx('menumove');
      } else if (input.pressed('cancel')) {
        const prevIdx = this._prevLivingChar(this.activeCharIdx);
        if (prevIdx !== -1) {
          this.audio.playSfx('menumove');
          // Undo previous character's queued action cleanly
          const prev = this.party[prevIdx];
          if (prev.queuedAction?.type === 'defend') {
            this.tp = Math.max(0, this.tp - 16);
          }
          prev.queuedAction = null;
          prev.defending = false;
          prev.anim = 'idle';
          this.reservedTp[prevIdx] = 0;
          this.reservedItems[prevIdx] = null;
          this.activeCharIdx = prevIdx;
        }
      } else if (input.pressed('confirm')) {
        const act = char.actions[this.actionCursor[this.activeCharIdx]];
        if (act === 'fight') {
          this.audio.playSfx('select');
          this.menuLevel = 'TARGET_ENEMY';
          this.pendingAction = { type: 'fight' };
        } else if (act === 'act') {
          this.audio.playSfx('select');
          this.menuLevel = 'ACT';
          this.subCursor = 0;
        } else if (act === 'magic') {
          this.audio.playSfx('select');
          this.menuLevel = 'MAGIC';
          this.subCursor = 0;
        } else if (act === 'item') {
          const avail = this._getAvailableItems();
          if (avail.length === 0) {
            this.audio.playSfx('cantselect');
          } else {
            this.audio.playSfx('select');
            this.menuLevel = 'ITEM';
            this.subCursor = 0;
          }
        } else if (act === 'spare') {
          this.audio.playSfx('select');
          this.menuLevel = 'SPARE';
        } else if (act === 'defend') {
          this.audio.playSfx('select');
          char.defending = true;
          char.anim = 'defend';
          this.addTp(16); // Immediate Deltarune +16% TP on Defend!
          this._commitCharAction({ type: 'defend' });
        }
      }
      return;
    }

    // 2. Target Enemy (for FIGHT or SPARE)
    if (this.menuLevel === 'TARGET_ENEMY' || this.menuLevel === 'SPARE') {
      if (input.pressed('cancel')) {
        this.audio.playSfx('menumove');
        this.menuLevel = 'ACTION';
      } else if (input.pressed('confirm')) {
        this.audio.playSfx('select');
        const type = this.menuLevel === 'SPARE' ? 'spare' : 'fight';
        char.anim = type === 'fight' ? 'prepare' : 'idle';
        this._commitCharAction({ type });
      }
      return;
    }

    // 3. Kris ACT Menu (Check, Pirouette, Hypnosis)
    if (this.menuLevel === 'ACT') {
      const acts = this._getKrisActs();
      if (input.pressed('up') || input.pressed('left')) {
        this.subCursor = (this.subCursor + acts.length - 1) % acts.length;
        this.audio.playSfx('menumove');
      } else if (input.pressed('down') || input.pressed('right')) {
        this.subCursor = (this.subCursor + 1) % acts.length;
        this.audio.playSfx('menumove');
      } else if (input.pressed('cancel')) {
        this.audio.playSfx('menumove');
        this.menuLevel = 'ACTION';
      } else if (input.pressed('confirm')) {
        const chosen = acts[this.subCursor];
        if (!chosen.enabled) {
          this.audio.playSfx('cantselect');
          return;
        }
        this.audio.playSfx('select');
        this.reservedTp[this.activeCharIdx] = chosen.tp;
        if (chosen.id === 'hypnosis') {
          // Hypnosis uses ALL 3 party members' turns!
          for (let i = 0; i < this.party.length; i++) {
            this.party[i].queuedAction = i === 0 ? { type: 'act', actId: 'hypnosis', tp: 50 } : { type: 'hypnosis_assist' };
          }
          this._startTurnExecution();
        } else {
          this._commitCharAction({ type: 'act', actId: chosen.id, tp: chosen.tp });
        }
      }
      return;
    }

    // 4. Susie / Ralsei MAGIC Menu
    if (this.menuLevel === 'MAGIC') {
      const spells = this._getCharSpells(char.id);
      if (input.pressed('up') || input.pressed('down')) {
        this.subCursor = (this.subCursor + 1) % spells.length;
        this.audio.playSfx('menumove');
      } else if (input.pressed('cancel')) {
        this.audio.playSfx('menumove');
        this.menuLevel = 'ACTION';
      } else if (input.pressed('confirm')) {
        const sp = spells[this.subCursor];
        if (this.getAvailableTp() < sp.tp) {
          this.audio.playSfx('cantselect');
          return;
        }
        this.audio.playSfx('select');
        if (sp.target === 'ally') {
          this.pendingAction = { type: 'magic', spellId: sp.id, tp: sp.tp };
          this.menuLevel = 'TARGET_ALLY';
          this.subCursor = this._lowestHpAllyIndex();
        } else {
          this.reservedTp[this.activeCharIdx] = sp.tp;
          char.anim = 'spellready';
          this._commitCharAction({ type: 'magic', spellId: sp.id, tp: sp.tp });
        }
      }
      return;
    }

    // 5. ITEM Menu (2-column authentic Deltarune item grid)
    if (this.menuLevel === 'ITEM') {
      const avail = this._getAvailableItems();
      if (avail.length === 0) {
        this.menuLevel = 'ACTION';
        return;
      }
      this.subCursor = clamp(this.subCursor, 0, avail.length - 1);
      if (input.pressed('left') && this.subCursor % 2 === 1) {
        this.subCursor--;
        this.audio.playSfx('menumove');
      } else if (input.pressed('right') && this.subCursor % 2 === 0 && this.subCursor + 1 < avail.length) {
        this.subCursor++;
        this.audio.playSfx('menumove');
      } else if (input.pressed('up') && this.subCursor >= 2) {
        this.subCursor -= 2;
        this.audio.playSfx('menumove');
      } else if (input.pressed('down') && this.subCursor + 2 < avail.length) {
        this.subCursor += 2;
        this.audio.playSfx('menumove');
      } else if (input.pressed('cancel')) {
        this.audio.playSfx('menumove');
        this.menuLevel = 'ACTION';
      } else if (input.pressed('confirm')) {
        const item = avail[this.subCursor];
        this.audio.playSfx('select');
        if (item.target === 'all') {
          this.reservedItems[this.activeCharIdx] = item.id;
          this._commitCharAction({ type: 'item', itemId: item.id, targetIdx: -1 });
        } else {
          this.pendingAction = { type: 'item', itemId: item.id };
          this.menuLevel = 'TARGET_ALLY';
          this.subCursor = item.revive ? this._downedOrLowestAllyIndex() : this._lowestHpAllyIndex();
        }
      }
      return;
    }

    // 6. Target Ally (for Heal Prayer or Single-Target Item)
    if (this.menuLevel === 'TARGET_ALLY') {
      if (input.pressed('up')) {
        this.subCursor = (this.subCursor + 2) % 3;
        this.audio.playSfx('menumove');
      } else if (input.pressed('down')) {
        this.subCursor = (this.subCursor + 1) % 3;
        this.audio.playSfx('menumove');
      } else if (input.pressed('cancel')) {
        this.audio.playSfx('menumove');
        this.menuLevel = this.pendingAction.type === 'item' ? 'ITEM' : 'MAGIC';
        this.subCursor = 0;
      } else if (input.pressed('confirm')) {
        this.audio.playSfx('select');
        const act = { ...this.pendingAction, targetIdx: this.subCursor };
        if (act.type === 'magic') {
          this.reservedTp[this.activeCharIdx] = act.tp;
          char.anim = 'spellready';
        } else if (act.type === 'item') {
          this.reservedItems[this.activeCharIdx] = act.itemId;
        }
        this._commitCharAction(act);
      }
    }
  }

  _getKrisActs() {
    const tp = this.getAvailableTp();
    const allAlive = this.party.every((p) => p.hp > 0);
    return [
      { id: 'check', name: 'Check', tp: 0, desc: 'Check enemy\nstats & info', enabled: true },
      { id: 'pirouette', name: 'Pirouette', tp: 20, desc: '20% TP\nTires Jevil + ???', enabled: tp >= 20 },
      {
        id: 'hypnosis',
        name: 'Hypnosis',
        tp: 50,
        desc: allAlive ? '50% TP (All 3)\nTires & Weakens!' : '50% TP\nNeeds all 3!',
        enabled: tp >= 50 && allAlive,
      },
    ];
  }

  _getCharSpells(charId) {
    if (charId === 'susie') {
      return [
        { id: 'rude_buster', name: 'Rude Buster', tp: 50, target: 'enemy', desc: '50% TP\nRude damage!\nPress Z to boost' },
      ];
    }
    return [
      {
        id: 'pacify',
        name: 'Pacify',
        tp: 16,
        target: 'enemy',
        desc: this.isJevilPacifiable() ? '16% TP\nJevil is TIRED!\nSPARE HIM NOW!' : '16% TP\nSpares a TIRED\nenemy',
      },
      { id: 'heal_prayer', name: 'Heal Prayer', tp: 32, target: 'ally', desc: '32% TP\nHeals an ally\n~45 HP' },
    ];
  }

  _getAvailableItems() {
    const reservedSet = new Set(this.reservedItems.filter(Boolean));
    return this.inventory.filter((it) => !reservedSet.has(it.id));
  }

  _lowestHpAllyIndex() {
    let best = 0;
    let bestRatio = 999;
    for (let i = 0; i < this.party.length; i++) {
      const r = this.party[i].hp / this.party[i].maxHp;
      if (r < bestRatio) {
        bestRatio = r;
        best = i;
      }
    }
    return best;
  }

  _downedOrLowestAllyIndex() {
    for (let i = 0; i < this.party.length; i++) {
      if (this.party[i].hp <= 0) return i;
    }
    return this._lowestHpAllyIndex();
  }

  _commitCharAction(actionObj) {
    this.party[this.activeCharIdx].queuedAction = actionObj;
    this.menuLevel = 'ACTION';
    this.pendingAction = null;
    const nextIdx = this._nextLivingChar(this.activeCharIdx);
    if (nextIdx === -1) {
      this._startTurnExecution();
    } else {
      this.activeCharIdx = nextIdx;
    }
  }

  _startTurnExecution() {
    // Reset per-turn modifiers before applying player ACTs
    this.turnAtMult = 1.0;
    this.pirouetteLowIframes = false;

    // Deduct reserved TP now
    const tpCost = this.reservedTp.reduce((a, b) => a + b, 0);
    this.tp = Math.max(0, this.tp - tpCost);
    this.reservedTp = [0, 0, 0];
    this.reservedItems = [null, null, null];

    // Separate FIGHT actions (which run together in the iconic Deltarune timing minigame!) from other actions
    const fighters = [];
    this.actionQueue = [];

    for (let i = 0; i < this.party.length; i++) {
      const p = this.party[i];
      if (!p.queuedAction) continue;
      if (p.queuedAction.type === 'fight') {
        fighters.push(i);
      } else if (p.queuedAction.type !== 'defend' && p.queuedAction.type !== 'hypnosis_assist') {
        this.actionQueue.push({ charIdx: i, ...p.queuedAction });
      }
    }

    if (fighters.length > 0) {
      this.state = 'ATTACK_TIMING';
      this.attackTimer = 0;
      const targetX = 112;
      this.attackLanes = fighters.map((charIdx, idx) => ({
        charIdx,
        y: UI_TOP + 68 + idx * 30,
        targetX,
        cursorX: 520 + idx * (72 + Math.random() * 44),
        speed: 350 + (this.modeCfg.id === 'chaos' ? 35 : 0),
        resolved: false,
        hitQuality: 0, // 0 miss, 1..1.5 hit
        flash: 0,
      }));
    } else {
      this._beginPlayerActions();
    }
  }

  _updateAttackTiming(dt, input) {
    this.attackTimer += dt;
    let allResolved = true;

    // Find leftmost unresolved lane for Confirm press
    let earliest = null;
    for (const lane of this.attackLanes) {
      if (lane.flash > 0) lane.flash = Math.max(0, lane.flash - dt * 4);
      if (!lane.resolved) {
        allResolved = false;
        lane.cursorX -= lane.speed * dt;
        if (!earliest || lane.cursorX < earliest.cursorX) {
          earliest = lane;
        }
        if (lane.cursorX < lane.targetX - 36) {
          lane.resolved = true;
          lane.hitQuality = 0;
          this._executeFightHit(lane);
        }
      }
    }

    if (input.pressed('confirm') && earliest) {
      const distPx = Math.abs(earliest.cursorX - earliest.targetX);
      earliest.resolved = true;
      earliest.flash = 1.0;
      if (distPx <= 10) {
        earliest.hitQuality = 1.5; // Bullseye CRITICAL!
        this.addTp(5);
      } else if (distPx <= 28) {
        earliest.hitQuality = 1.15;
        this.addTp(3);
      } else if (distPx <= 60) {
        earliest.hitQuality = 0.72;
        this.addTp(2);
      } else {
        earliest.hitQuality = 0.35;
      }
      this._executeFightHit(earliest);
    }

    if (allResolved && this.attackTimer > 0.55) {
      const anyFlashing = this.attackLanes.some((l) => l.flash > 0.05);
      if (!anyFlashing) {
        if (this.jevil.hp <= 0) {
          this._triggerVictory('fight');
          return;
        }
        this._beginPlayerActions();
      }
    }
  }

  _executeFightHit(lane) {
    const p = this.party[lane.charIdx];
    p.anim = 'attack';
    p.animTimer = 0;

    if (lane.hitQuality <= 0) {
      this.audio.playSfx('smallswing', { volume: 0.6 });
      this._spawnFloatText('MISS', this.jevil.x, this.jevil.y - 36, '#aaaaaa');
      return;
    }

    const isCrit = lane.hitQuality >= 1.45;
    const baseDmg = Math.max(10, Math.round(p.at * 11 - this.jevil.df * 3));
    const dmg = Math.max(12, Math.round(baseDmg * lane.hitQuality));

    this.jevil.hp = Math.max(0, this.jevil.hp - dmg);
    this.jevil.hurtTimer = 0.55;
    this.triggerShake(isCrit ? 7 : 4, 0.16);

    if (isCrit) {
      this.audio.playSfx('criticalswing', { volume: 0.85 });
    } else {
      this.audio.playSfx(p.id === 'susie' ? 'heavyswing' : 'swing', { volume: 0.8 });
    }
    this.audio.playSfx('damage', { volume: 0.75 });
    this.audio.playSfx('ehurt', { volume: 0.65 });

    const fxKey = p.id === 'kris' ? 'fx_cut' : p.id === 'susie' ? 'fx_mash' : 'fx_slap';
    this.fxList.push({ sprite: fxKey, x: this.jevil.x, y: this.jevil.y - 26, timer: 0, duration: 0.34, scale: 2.2 });
    if (isCrit) {
      this.fxList.push({ sprite: 'fx_hit', x: this.jevil.x, y: this.jevil.y - 26, timer: 0, duration: 0.35, scale: 2.4 });
    }
    this._spawnFloatText(String(dmg), this.jevil.x + (Math.random() - 0.5) * 28, this.jevil.y - 44, isCrit ? '#ffff00' : p.color);
  }

  _beginPlayerActions() {
    this.state = 'PLAYER_ACTIONS';
    this.currentAction = null;
    this._nextPlayerAction();
  }

  _nextPlayerAction() {
    if (this.jevil.hp <= 0) {
      this._triggerVictory('fight');
      return;
    }
    if (this.jevil.pacified) {
      this._triggerVictory('pacify');
      return;
    }
    if (this.actionQueue.length === 0) {
      this._beginBossDialogue();
      return;
    }

    const act = this.actionQueue.shift();
    const p = this.party[act.charIdx];
    this.currentAction = { ...act, timer: 0, done: false };
    this.actionWaitConfirm = false;

    // Dispatch action logic
    if (act.type === 'act') {
      if (act.actId === 'check') {
        p.anim = 'act';
        p.animTimer = 0;
        this._setActionText(
          `* JEVIL - AT ${Math.round(this.jevil.at)} DF ${Math.round(this.jevil.df)}\n* There is no strategy to defeat the enemy. Good luck!`
        );
        this.actionWaitConfirm = true;
      } else if (act.actId === 'pirouette') {
        p.anim = 'pirouette';
        p.animTimer = 0;
        this.audio.playSfx('pirouette', { volume: 0.9 });
        this.fxList.push({ sprite: 'fx_pirouette', x: p.x, y: p.y - 6, timer: 0, duration: 0.65, scale: 2.2 });
        this.jevil.tiredness += 0.5;

        const rotIdx = (this.turnNumber - 1) % 9;
        const extraText = this._applyPirouetteEffect(rotIdx);
        const tiredNote = this.isJevilPacifiable() ? '\n* Jevil is looking exhausted!' : '';
        this._setActionText(`* Kris spun around! Jevil got slightly more TIRED, and...!\n* ${extraText}${tiredNote}`);
        this.actionWaitConfirm = true;
      } else if (act.actId === 'hypnosis') {
        for (const m of this.party) {
          m.anim = m.id === 'ralsei' ? 'sing' : 'act';
          m.animTimer = 0;
        }
        this.audio.playSfx('hypnosis', { volume: 0.9 });
        this.fxList.push({ sprite: 'fx_hypno', x: this.jevil.x, y: this.jevil.y - 26, timer: 0, duration: 0.75, scale: 1.2, expand: 3.5, fade: true });
        this.jevil.tiredness += 1.0;
        if (this.jevil.at > this.modeCfg.jevilAT) {
          this.jevil.at = Math.max(this.modeCfg.jevilAT, this.jevil.at - 0.5);
        }
        this.turnAtMult *= 0.7; // Weakens Jevil's next attack by 30%!
        const statusLine = this.isJevilPacifiable() ? "Jevil's looking exhausted!" : 'Jevil became more TIRED!';
        this._setActionText(`* Kris, Susie, and Ralsei acted in sync!\n* ${statusLine} Jevil's next attack weakened!`);
        this.actionWaitConfirm = true;
      }
    } else if (act.type === 'magic') {
      p.anim = 'spell';
      p.animTimer = 0;
      if (act.spellId === 'rude_buster') {
        this.audio.playSfx('rudebuster_swing', { volume: 0.9 });
        this._setActionText('* Susie cast RUDE BUSTER! (Press Z on impact!)');
        this.rudeBuster = {
          x: p.x + 28,
          y: p.y - 26,
          tx: this.jevil.x,
          ty: this.jevil.y - 26,
          t: 0,
          dur: 0.55,
          boosted: false,
          hit: false,
        };
      } else if (act.spellId === 'heal_prayer') {
        this.audio.playSfx('power', { volume: 0.85 });
        const target = this.party[act.targetIdx];
        const healAmt = Math.round(p.mg * 5); // 45 HP
        this._healPartyMember(target, healAmt);
        this._setActionText(`* Ralsei cast HEAL PRAYER!\n* ${target.name} recovered ${healAmt} HP!`);
        this.actionWaitConfirm = true;
      } else if (act.spellId === 'pacify') {
        this.audio.playSfx('spellcast', { volume: 0.8 });
        if (this.isJevilPacifiable()) {
          this.audio.playSfx('pacify', { volume: 0.95 });
          this.audio.playSfx('spare', { volume: 0.85 });
          this.fxList.push({ sprite: 'fx_hypno', x: this.jevil.x, y: this.jevil.y - 26, timer: 0, duration: 0.9, scale: 1.0, expand: 4.0, fade: true, tint: '#44aaff' });
          this.fxList.push({ sprite: 'fx_spare', x: this.jevil.x, y: this.jevil.y - 26, timer: 0, duration: 0.85, scale: 2.6 });
          this.jevil.pacified = true;
          this._setActionText('* Ralsei cast PACIFY!\n* Jevil fell into a deep, chaotic slumber!');
          this.actionWaitConfirm = true;
        } else {
          this._setActionText("* Ralsei cast PACIFY!\n* ...But Jevil wasn't TIRED enough yet!");
          this.actionWaitConfirm = true;
        }
      }
    } else if (act.type === 'item') {
      p.anim = p.id === 'ralsei' ? 'spell' : 'item';
      p.animTimer = 0;
      const idx = this.inventory.findIndex((it) => it.id === act.itemId);
      const item = idx >= 0 ? this.inventory.splice(idx, 1)[0] : null;
      if (item) {
        this.audio.playSfx('swallow', { volume: 0.85 });
        this.audio.playSfx('power', { volume: 0.7 });
        if (item.target === 'all') {
          for (const m of this.party) {
            this._healPartyMember(m, item.heal);
          }
          this._setActionText(`* ${p.name} used the ${item.name}!\n* Everyone recovered ${item.heal} HP!`);
        } else {
          const target = this.party[act.targetIdx];
          if (item.revive) {
            if (target.hp <= 0) {
              target.hp = target.maxHp;
              target.anim = 'idle';
              this.audio.playSfx('revival', { volume: 0.85 });
              this._spawnHealFx(target, 'MAX');
              this._setActionText(`* ${p.name} used the ReviveMint on ${target.name}!\n* ${target.name} was revived to MAX HP!`);
            } else {
              const amt = Math.round(target.maxHp * 0.5);
              this._healPartyMember(target, amt);
              this._setActionText(`* ${p.name} used the ReviveMint on ${target.name}!\n* ${target.name} recovered ${amt} HP!`);
            }
          } else {
            const amt = item.healByChar ? item.healByChar[target.id] : item.heal;
            this._healPartyMember(target, amt);
            this._setActionText(`* ${p.name} used the ${item.name} on ${target.name}!\n* ${target.name} recovered ${amt} HP!`);
          }
        }
      }
      this.actionWaitConfirm = true;
    } else if (act.type === 'spare') {
      p.anim = 'act';
      p.animTimer = 0;
      if (this.isJevilPacifiable()) {
        this._setActionText("* Jevil's name is BLUE! Use Ralsei's PACIFY spell to spare him!");
      } else {
        this._setActionText("* Jevil refused to be SPARED! Tire him out with ACTs first!");
      }
      this.actionWaitConfirm = true;
    }
  }

  _applyPirouetteEffect(rotIdx) {
    // 100% Authentic 9-Turn Pirouette Rotation from Deltarune Chapter 1!
    if (rotIdx === 0) {
      this.audio.playSfx('awkward', { volume: 0.75 });
    } else if (rotIdx === 1) {
      this.jevil.df = Math.max(-16, this.jevil.df - 4);
      this.audio.playSfx('boost', { volume: 0.8 });
    } else if (rotIdx === 2) {
      this.pirouetteLowIframes = true;
      this.audio.playSfx('awkward', { volume: 0.85 });
    } else if (rotIdx === 3) {
      this.turnAtMult *= 0.7;
      this.audio.playSfx('bell', { volume: 0.85 });
    } else if (rotIdx === 4) {
      this.audio.playSfx('birdtweet', { volume: 0.9 });
      this.uselessBird = { x: -24, y: 120, t: 0 };
    } else if (rotIdx === 5) {
      const living = this.party.filter((m) => m.hp > 0);
      const target = living[Math.floor(Math.random() * living.length)] || this.party[0];
      const heal = 25 + Math.floor(Math.random() * 31);
      this._healPartyMember(target, heal);
      this.audio.playSfx('power', { volume: 0.8 });
    } else if (rotIdx === 6) {
      // Turn 7: Authentic HP bar shuffle + negative HP split revive!
      this.audio.playSfx('shineselect', { volume: 0.85 });
      const dir = Math.random() < 0.5 ? 1 : 2;
      const snap = this.party.map((m) => ({ hp: m.hp, maxHp: m.maxHp, barColor: m.barColor }));
      for (let i = 0; i < 3; i++) {
        const src = snap[(i + dir) % 3];
        this.party[i].hp = src.hp;
        this.party[i].maxHp = src.maxHp;
        this.party[i].barColor = src.barColor;
      }
      // Split any negative HP across party & revive to 1 HP
      let negTotal = 0;
      for (const m of this.party) {
        if (m.hp <= 0) {
          negTotal += m.hp;
          m.hp = 1;
          m.anim = 'idle';
        }
      }
      if (negTotal < 0) {
        const share = Math.round(negTotal / 3);
        for (const m of this.party) {
          m.hp = Math.max(1, m.hp + share);
        }
      }
    } else if (rotIdx === 7) {
      this.turnAtMult *= 1.25;
      this.audio.playSfx('tensionhorn', { volume: 0.85 });
    } else if (rotIdx === 8) {
      this.audio.playSfx('applause', { volume: 0.85 });
      this.audio.playSfx('power', { volume: 0.85 });
      for (const m of this.party) {
        const heal = 36 + Math.floor(Math.random() * 15);
        this._healPartyMember(m, heal);
      }
    }
    return PIROUETTE_DESCRIPTIONS[rotIdx];
  }

  _healPartyMember(member, amount) {
    if (member.hp <= 0) {
      member.hp = Math.min(member.maxHp, Math.max(1, Math.round(amount * 0.6)));
      member.anim = 'idle';
    } else {
      member.hp = Math.min(member.maxHp, member.hp + amount);
    }
    this._spawnHealFx(member, `+${amount}`);
  }

  _spawnHealFx(member, label) {
    this.fxList.push({ sprite: 'fx_heal', x: member.x, y: member.y - 26, timer: 0, duration: 0.45, scale: 2.2 });
    this._spawnFloatText(label, member.x, member.y - 44, '#44ff66');
  }

  _spawnFloatText(text, x, y, color) {
    if (!this.settings.showDamageNumbers && /^\d+$/.test(text)) return;
    this.floatTexts.push({ text, x, y, baseY: y, vy: -95, color, timer: 0, duration: 0.95 });
  }

  _setActionText(str) {
    this.dialogText = str;
    this.dialogShown = 0;
    this.dialogTimer = 0;
    this.dialogSpeaker = 'narrator';
  }

  _updatePlayerActions(dt, input) {
    this._advanceTypewriter(dt, 'narrator');
    if (!this.currentAction) return;
    this.currentAction.timer += dt;

    // Handle Rude Buster projectile animation + Z-boost timing!
    if (this.rudeBuster) {
      const rb = this.rudeBuster;
      rb.t += dt;
      if (input.pressed('confirm') && !rb.boosted && rb.t > rb.dur * 0.45 && rb.t < rb.dur) {
        rb.boosted = true;
        this.audio.playSfx('shineselect', { volume: 0.8 });
      }
      if (rb.t >= rb.dur && !rb.hit) {
        rb.hit = true;
        const susie = this.party[1];
        const base = Math.max(40, Math.round(11 * susie.at + 5 * susie.mg - 3 * this.jevil.df));
        const dmg = base + (rb.boosted ? 35 : 0);
        this.jevil.hp = Math.max(0, this.jevil.hp - dmg);
        this.jevil.hurtTimer = 0.6;
        this.triggerShake(rb.boosted ? 9 : 6, 0.2);
        this.audio.playSfx('rudebuster_hit', { volume: 0.9 });
        this.fxList.push({ sprite: 'fx_mash', x: this.jevil.x, y: this.jevil.y - 26, timer: 0, duration: 0.42, scale: 2.8 });
        this._spawnFloatText(String(dmg), this.jevil.x, this.jevil.y - 44, rb.boosted ? '#ffff00' : '#ff44ff');
        this.rudeBuster = null;
        this._setActionText(
          rb.boosted
            ? `* RUDE BUSTER hit for ${dmg} BOOSTED damage!`
            : `* RUDE BUSTER hit for ${dmg} damage!`
        );
        this.actionWaitConfirm = true;
      }
      return;
    }

    if (this.actionWaitConfirm) {
      if (input.pressed('cancel')) {
        this.dialogShown = this.dialogText.length;
      }
      if (input.pressed('confirm')) {
        if (this.dialogShown < this.dialogText.length) {
          this.dialogShown = this.dialogText.length;
        } else {
          this._nextPlayerAction();
        }
      }
    }
  }

  _checkPhaseAdvance() {
    const j = this.jevil;
    const hpRatio = j.hp / j.maxHp;
    const tScale = this.modeCfg.tiredThreshold / 9;

    // Authentic 15% HP skip directly to Phase 4 Fakeout!
    if (hpRatio <= 0.15 && j.phase < 4) {
      j.phase = 4;
      j.phaseStep = 2; // skip straight to tired_fakeout -> final_chaos!
      this.nextFlavorOverride = 'Something terrible is coming...!';
      return;
    }

    if (j.phase === 1 && (hpRatio <= 0.8 || j.tiredness >= 2 * tScale)) {
      j.phase = 2;
      j.phaseStep = 0;
    }
    if (j.phase === 2 && (hpRatio <= 0.6 || j.tiredness >= 4 * tScale)) {
      j.phase = 3;
      j.phaseStep = 0;
    }
    if (j.phase === 3 && (hpRatio <= 0.4 || j.tiredness >= 6 * tScale)) {
      j.phase = 4;
      j.phaseStep = 0;
    }
  }

  _selectNextAttackPattern() {
    this._checkPhaseAdvance();
    const j = this.jevil;
    const isChaos = this.modeCfg.id === 'chaos';

    const phaseTables = isChaos
      ? {
          1: ['spade_volleys', 'ring_around', 'heart_bombs', 'devilsknife_1'],
          2: ['carousel_1', 'club_bombs', 'chaos_double_ring', 'rising_diamonds'],
          3: ['chaos_stampede', 'spade_bombs', 'three_club', 'chaos_cross_scythes'],
          4: ['diamond_toss', 'chaos_suit_storm', 'tired_fakeout', 'chaos_true_neo_final'],
        }
      : {
          1: ['spade_volleys', 'ring_around', 'heart_bombs', 'devilsknife_1'],
          2: ['carousel_1', 'club_bombs', 'rising_diamonds', 'ring_around_2'],
          3: ['carousel_2', 'spade_bombs', 'three_club', 'devilsknife_2'],
          4: ['diamond_toss', 'chaos_bomb', 'tired_fakeout', 'final_chaos'],
        };

    if (j.phase <= 4) {
      const list = phaseTables[j.phase];
      let chosen;
      if (j.phaseStep < list.length) {
        chosen = list[j.phaseStep];
        j.phaseStep++;
        if (j.phase === 4 && j.phaseStep >= list.length) {
          // Next turn enters Phase 5 automatically after Final Chaos!
          j.enterPhase5After = true;
        }
      } else {
        chosen = list[Math.floor(Math.random() * list.length)];
      }

      // Flavor cues for Chaos Bomb & Final Chaos
      if (j.phase === 4 && chosen === 'diamond_toss') {
        this.nextFlavorOverride = 'CHAOS BOMB was prepared FOR YOU.';
      } else if (chosen === 'tired_fakeout') {
        this.nextFlavorOverride = 'Something terrible is coming...!';
        j.isTiredPose = true;
      }
      return chosen;
    }

    // Phase 5: AT +0.5/turn (up to base+3), DF -3/turn (down to -10), Chaos Bomb 3x weight!
    j.at = Math.min(this.modeCfg.jevilAT + 3, j.at + 0.5);
    if (j.df > -10) j.df = Math.max(-10, j.df - 3);

    const pool = isChaos
      ? [
          'chaos_bomb', 'chaos_bomb', 'chaos_bomb',
          'chaos_double_ring', 'chaos_cross_scythes', 'chaos_stampede', 'chaos_suit_storm',
          'devilsknife_2', 'diamond_toss', 'three_club', 'spade_bombs',
        ]
      : [
          'chaos_bomb', 'chaos_bomb', 'chaos_bomb',
          'spade_volleys', 'ring_around_2', 'heart_bombs', 'devilsknife_2',
          'carousel_2', 'club_bombs', 'spade_bombs', 'three_club', 'diamond_toss',
        ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _beginBossDialogue() {
    this.state = 'BOSS_DIALOGUE';
    this.upcomingPattern = this._selectNextAttackPattern();

    const firstTime = !this.jevil.usedPatterns.has(this.upcomingPattern);
    this.jevil.usedPatterns.add(this.upcomingPattern);

    const spec = PHASE_QUOTES[this.upcomingPattern];
    if (firstTime && spec) {
      this.bossBubbleText = spec.text;
      if (spec.voice) this.audio.playVoice(spec.voice);
    } else {
      const pool = this.modeCfg.id === 'chaos' ? [...NEUTRAL_JEVIL_QUOTES, ...CHAOS_JEVIL_QUOTES] : NEUTRAL_JEVIL_QUOTES;
      this.bossBubbleText = pool[Math.floor(Math.random() * pool.length)];
      const randVoices = ['chaos', 'anything', 'laugh0', 'laugh1', 'ha0', 'ha1'];
      this.audio.playVoice(randVoices[Math.floor(Math.random() * randVoices.length)]);
    }
    this.bossBubbleShown = 0;
    this.bossBubbleTimer = 0;
  }

  _updateBossDialogue(dt, input) {
    this.bossBubbleTimer += dt;
    const chars = Math.min(this.bossBubbleText.length, Math.floor(this.bossBubbleTimer * 36));
    if (chars > this.bossBubbleShown) {
      const ch = this.bossBubbleText[chars - 1];
      if (ch && ch !== ' ' && ch !== '\n') {
        this.audio.playSfx('txtjok', { volume: 0.45, minGapMs: 42 });
      }
      this.bossBubbleShown = chars;
    }

    // Auto-advance after short pause or immediately on Confirm
    const doneTyping = this.bossBubbleShown >= this.bossBubbleText.length;
    if ((doneTyping && this.bossBubbleTimer > 1.75) || (input.pressed('confirm') && this.bossBubbleTimer > 0.25)) {
      this.state = 'BULLET_PHASE';
      this.attacks.start(this.upcomingPattern);
    }
  }

  applyBulletDamage(damageAll = false, dmgMult = 1.0) {
    const living = this.party.filter((m) => m.hp > 0);
    if (living.length === 0) return;

    const targets = damageAll ? living : [living[Math.floor(Math.random() * living.length)]];
    this.audio.playSfx('hurt', { volume: 0.85 });
    this.triggerShake(damageAll ? 8 : 5, 0.22);

    for (const target of targets) {
      let raw = this.jevil.at * 5 * this.turnAtMult * dmgMult - target.df * 3.8;
      if (this.modeCfg.id === 'chaos') raw *= 1.05;
      if (target.defending) raw *= 0.5;
      const dmg = Math.max(4, Math.round(raw));

      target.hp -= dmg;
      this.totalDamageTaken += dmg;
      target.hurtTimer = 0.55;
      target.anim = 'hurt';

      if (target.hp <= 0) {
        const minNeg = -Math.floor(target.maxHp / 2);
        target.hp = Math.max(minNeg, Math.min(-1, target.hp));
        target.anim = 'downed';
        this._spawnFloatText('DOWN', target.x + 18, target.y - 24, '#ff2222');
      } else {
        this._spawnFloatText(String(dmg), target.x + 18, target.y - 24, '#ffffff');
      }
    }

    if (this.party.every((m) => m.hp <= 0)) {
      this.attacks.active = false;
      this._triggerGameOver();
    }
  }

  onBulletPhaseEnd() {
    // Check if Phase 5 begins after Final Chaos
    if (this.jevil.enterPhase5After) {
      this.jevil.enterPhase5After = false;
      this.jevil.phase = 5;
      this.jevil.phaseStep = 0;
    }

    // Authentic Deltarune downed-member passive HP recovery each turn!
    for (const m of this.party) {
      if (m.hp <= 0) {
        const rec = Math.max(1, Math.ceil(m.maxHp / 8));
        m.hp += rec;
        if (m.hp >= 0) {
          m.hp = Math.max(1, Math.ceil(m.maxHp / 8));
          m.anim = 'idle';
          this._spawnFloatText(`+${m.hp}`, m.x, m.y - 36, '#44ff66');
        }
      }
    }

    this.turnNumber++;
    this._beginMenuTurn();
  }

  _triggerVictory(outcome) {
    this.victoryOutcome = outcome;
    this.jevil.defeated = true;
    this.state = 'VICTORY_CUTSCENE';
    this.audio.stopMusic();
    this.audio.playSfx('won', { volume: 0.85 });

    // Restore original HP bars at battle end (authentic Deltarune Turn 7 Pirouette rule)
    for (const p of this.party) {
      p.maxHp = p.baseMaxHp;
      p.barColor = p.color;
      p.hp = clamp(p.hp, 1, p.maxHp);
      p.anim = 'victory';
      p.animTimer = 0;
    }

    this.victoryLines = outcome === 'pacify' ? VICTORY_PACIFY_DIALOGUE : VICTORY_FIGHT_DIALOGUE;
    this.victoryIndex = 0;
    this._loadVictoryLine(0);

    // Save record
    saveRecord(this.modeCfg.id, {
      turns: this.turnNumber,
      timeSec: Math.round(this.battleTime),
      outcome,
      damageTaken: this.totalDamageTaken,
      grazes: this.totalGrazes,
      clears: 1,
    });
  }

  _loadVictoryLine(idx) {
    if (idx >= this.victoryLines.length) {
      this.state = 'VICTORY_SCREEN';
      this.victoryCursor = 0;
      this.jevil.visible = false;
      this.audio.playMusic('menu', true);
      return;
    }
    this.victoryIndex = idx;
    const line = this.victoryLines[idx];
    this.dialogSpeaker = line.speaker;
    this.dialogText = line.text;
    this.dialogShown = 0;
    this.dialogTimer = 0;
    if (line.voice) this.audio.playVoice(line.voice);
    if (idx === this.victoryLines.length - 1) {
      this.audio.playSfx('great_shine', { volume: 0.85 });
      this.jevil.visible = false;
    }
  }

  _updateVictoryCutscene(dt, input) {
    this._advanceTypewriter(dt, this.dialogSpeaker);
    if (input.pressed('cancel')) this.dialogShown = this.dialogText.length;
    if (input.pressed('confirm')) {
      if (this.dialogShown < this.dialogText.length) {
        this.dialogShown = this.dialogText.length;
      } else {
        this.audio.playSfx('select', { volume: 0.45 });
        this._loadVictoryLine(this.victoryIndex + 1);
      }
    }
  }

  _updateVictoryScreen(input) {
    if (input.pressed('up') || input.pressed('left')) {
      this.victoryCursor = (this.victoryCursor + 1) % 2;
      this.audio.playSfx('menumove');
    } else if (input.pressed('down') || input.pressed('right')) {
      this.victoryCursor = (this.victoryCursor + 1) % 2;
      this.audio.playSfx('menumove');
    } else if (input.pressed('confirm')) {
      this.audio.playSfx('select');
      if (this.victoryCursor === 0) {
        this.onExitToMenu('restart', this.modeCfg.id);
      } else {
        this.onExitToMenu('menu');
      }
    }
  }

  _triggerGameOver() {
    this.state = 'GAME_OVER';
    this.audio.stopMusic();
    this.gameOverTimer = 0;
    this.gameOverStage = 0;
    this.gameOverCursor = 0;
    this.soulShards = [];
    this.audio.playSfx('break1', { volume: 0.9 });
  }

  _updateGameOver(dt, input) {
    this.gameOverTimer += dt;
    if (this.gameOverStage === 0 && this.gameOverTimer >= 0.75) {
      this.gameOverStage = 1;
      this.audio.playSfx('break2', { volume: 0.9 });
      const sx = this.attacks.soul.x || 320;
      const sy = this.attacks.soul.y || 210;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
        const spd = 85 + Math.random() * 110;
        this.soulShards.push({ x: sx, y: sy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 65, rot: 0, vr: (Math.random() - 0.5) * 10 });
      }
    }

    for (const sh of this.soulShards) {
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.vy += 260 * dt;
      sh.rot += sh.vr * dt;
    }

    if (this.gameOverTimer > 1.55) {
      if (input.pressed('left') || input.pressed('right') || input.pressed('up') || input.pressed('down')) {
        this.gameOverCursor = (this.gameOverCursor + 1) % 2;
        this.audio.playSfx('menumove');
      } else if (input.pressed('confirm')) {
        this.audio.playSfx('select');
        if (this.gameOverCursor === 0) {
          this.onExitToMenu('restart', this.modeCfg.id);
        } else {
          this.onExitToMenu('menu');
        }
      }
    }
  }

  // ==================== RENDERING ====================
  draw(ctx) {
    if (this.state === 'GAME_OVER') {
      this._drawGameOver(ctx);
      return;
    }

    ctx.save();
    if (this.shakeTime > 0 && this.shakeMag > 0) {
      const ox = Math.round((Math.random() - 0.5) * 2 * this.shakeMag);
      const oy = Math.round((Math.random() - 0.5) * 2 * this.shakeMag);
      ctx.translate(ox, oy);
    }

    // 1. Carousel Background
    this.bg.draw(ctx, this.assets, this.modeCfg, {
      bulletDim: this.state === 'BULLET_PHASE' ? 0.36 : 0,
    });

    // 2. Left Slanted TP Meter (Authentic Deltarune!)
    this._drawTpBar(ctx);

    // 3. Party Sprites (dimmed slightly during Final Chaos full-screen)
    const partyAlpha =
      this.state === 'BULLET_PHASE' && (this.attacks.patternId === 'final_chaos' || this.attacks.patternId === 'chaos_true_neo_final')
        ? 0.25
        : this.state === 'BULLET_PHASE'
        ? 0.72
        : 1.0;
    this._drawPartySprites(ctx, partyAlpha);

    // 4. Jevil Sprite (hidden during teleport bullet attacks or after vanishing)
    const hideJevilInAttack =
      this.state === 'BULLET_PHASE' &&
      (this.attacks.patternId === 'spade_volleys' ||
        this.attacks.patternId === 'diamond_toss' ||
        this.attacks.patternId === 'final_chaos' ||
        this.attacks.patternId === 'chaos_true_neo_final');
    if (this.jevil.visible && !hideJevilInAttack) {
      this._drawJevilSprite(ctx);
    }

    // 5. Useless Bird (Pirouette Turn 5!)
    if (this.uselessBird) {
      const bf = Math.floor(this.uselessBird.t * 12) % 3;
      this.assets.draw(ctx, 'useless_bird', bf, this.uselessBird.x, this.uselessBird.y, { scale: 2 });
    }

    // 6. Rude Buster Projectile
    if (this.rudeBuster) {
      const rb = this.rudeBuster;
      const frac = clamp(rb.t / rb.dur, 0, 1);
      const rx = rb.x + (rb.tx - rb.x) * frac;
      const ry = rb.y + (rb.ty - rb.y) * frac;
      const f = Math.floor(rb.t * 18) % 6;
      this.assets.draw(ctx, 'fx_mash', f, rx, ry, {
        scale: rb.boosted ? 2.8 : 2.3,
        tint: rb.boosted ? '#ffff55' : null,
      });
    }

    // 7. Bullet-Hell Layer (Battle Box, SOUL, Bullets, Beams)
    if (this.state === 'BULLET_PHASE') {
      this.attacks.draw(ctx, this.assets, this.settings);
    }

    // 8. Boss Speech Bubble
    if (this.state === 'BOSS_DIALOGUE') {
      this._drawBossSpeechBubble(ctx);
    }

    // 9. Battle Effects & Floating Damage Numbers
    for (const fx of this.fxList) {
      const info = this.assets.getInfo(fx.sprite);
      const frame = info ? Math.min(info.frames - 1, Math.floor((fx.timer / fx.duration) * info.frames)) : 0;
      this.assets.draw(ctx, fx.sprite, frame, fx.x, fx.y, {
        scale: fx.scale || 2,
        alpha: fx.alpha ?? 1,
        tint: fx.tint || null,
      });
    }

    for (const ft of this.floatTexts) {
      ctx.save();
      ctx.font = 'bold 16px "DRPixel", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000000';
      ctx.fillText(ft.text, Math.round(ft.x) + 2, Math.round(ft.y) + 2);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, Math.round(ft.x), Math.round(ft.y));
      ctx.restore();
    }

    // Optional Boss Exact HP & Tiredness Bar (if enabled in Settings or Chaos badge)
    this._drawTopMeta(ctx);

    // 10. Authentic Deltarune Bottom Battle UI Panel (y = 326..480)
    this._drawBattleUI(ctx);

    // 11. Victory Results Overlay on top of arena
    if (this.state === 'VICTORY_SCREEN') {
      this._drawVictoryScreen(ctx);
    }

    ctx.restore();
  }

  _drawTopMeta(ctx) {
    ctx.save();
    if (this.modeCfg.id === 'chaos') {
      ctx.font = '9px "DRPixel", monospace';
      ctx.fillStyle = 'rgba(20, 0, 14, 0.78)';
      ctx.fillRect(10, 8, 114, 20);
      ctx.strokeStyle = '#ff3c6e';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 8, 114, 20);
      ctx.fillStyle = '#ff6690';
      ctx.textAlign = 'left';
      ctx.fillText('CHAOS MODE', 18, 22);
    }

    if (this.settings.showBossStats && !this.jevil.defeated) {
      const bx = 220;
      const by = 8;
      const bw = 200;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(bx, by, bw, 32);
      ctx.strokeStyle = '#6666aa';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, 32);
      // HP bar
      const hpFrac = clamp(this.jevil.hp / this.jevil.maxHp, 0, 1);
      ctx.fillStyle = '#550000';
      ctx.fillRect(bx + 6, by + 6, bw - 12, 7);
      ctx.fillStyle = '#00e000';
      ctx.fillRect(bx + 6, by + 6, Math.round((bw - 12) * hpFrac), 7);
      // Tired bar
      const tFrac = clamp(this.jevil.tiredness / this.modeCfg.tiredThreshold, 0, 1);
      ctx.fillStyle = '#111144';
      ctx.fillRect(bx + 6, by + 16, bw - 12, 5);
      ctx.fillStyle = '#44aaff';
      ctx.fillRect(bx + 6, by + 16, Math.round((bw - 12) * tFrac), 5);

      ctx.font = '8px "DRSilk", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`HP ${this.jevil.hp}/${this.jevil.maxHp}  TIRED ${this.jevil.tiredness.toFixed(1)}/${this.modeCfg.tiredThreshold}`, bx + bw / 2, by + 30);
    }
    ctx.restore();
  }

  _drawTpBar(ctx) {
    const x = 40;
    const y = 44;
    const w = 18;
    const h = 196;
    const pct = Math.floor(this.tp);
    const isMax = pct >= 100;

    // Pending TP preview when hovering ACT or MAGIC
    let previewCost = 0;
    if (this.state === 'MENU_SELECT') {
      if (this.menuLevel === 'ACT') {
        const acts = this._getKrisActs();
        previewCost = acts[this.subCursor]?.tp || 0;
      } else if (this.menuLevel === 'MAGIC') {
        const sp = this._getCharSpells(this.party[this.activeCharIdx].id);
        previewCost = sp[this.subCursor]?.tp || 0;
      }
    }

    ctx.save();
    // Slanted parallelogram mask matching Deltarune TP bar!
    const slant = 12;
    ctx.beginPath();
    ctx.moveTo(x + slant, y);
    ctx.lineTo(x + w + slant, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.save();
    ctx.clip();

    // Red background
    ctx.fillStyle = '#7a0000';
    ctx.fillRect(x, y, w + slant, h);

    // Orange / Gold TP Fill
    const availTp = this.getAvailableTp();
    const fillH = Math.round((availTp / 100) * h);
    ctx.fillStyle = isMax ? '#ffe824' : '#ff9820';
    ctx.fillRect(x, y + h - fillH, w + slant, fillH);

    // White top cap line + pending cost highlight
    if (previewCost > 0 && availTp >= previewCost) {
      const costH = Math.round((previewCost / 100) * h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y + h - fillH, w + slant, costH);
    } else if (fillH > 2 && !isMax) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y + h - fillH, w + slant, 3);
    }
    ctx.restore();

    // Crisp black outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.stroke();

    // TP Text label on left (matching image-1..4!)
    ctx.font = 'bold 14px "DRPixel", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = isMax ? '#ffe824' : '#ffffff';
    ctx.fillText('T', 20, 90);
    ctx.fillText('P', 20, 108);
    if (isMax) {
      ctx.fillStyle = '#ffe824';
      ctx.fillText('M', 20, 134);
      ctx.fillText('A', 20, 150);
      ctx.fillText('X', 20, 166);
    } else {
      ctx.font = 'bold 13px "DRPixel", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(Math.floor(availTp)), 20, 134);
      ctx.fillText('%', 20, 152);
    }
    ctx.restore();
  }

  _drawPartySprites(ctx, alpha = 1) {
    for (const p of this.party) {
      let key = `${p.id}_${p.anim}`;
      if (!this.assets.getInfo(key)) key = `${p.id}_idle`;
      const info = this.assets.getInfo(key);
      let frame = 0;
      if (info) {
        if (p.anim === 'idle' || p.anim === 'pirouette' || p.anim === 'sing' || p.anim === 'spellready') {
          const fps = p.anim === 'pirouette' ? 14 : 6;
          frame = Math.floor(p.animTimer * fps) % info.frames;
        } else if (p.anim === 'defend' || p.anim === 'attack' || p.anim === 'act' || p.anim === 'item' || p.anim === 'spell' || p.anim === 'victory') {
          frame = Math.min(info.frames - 1, Math.floor(p.animTimer * 12));
        } else {
          frame = 0;
        }
      }

      const ox = p.hurtTimer > 0 ? Math.sin(p.hurtTimer * 55) * 4 : 0;
      this.assets.draw(ctx, key, frame, p.x + ox, p.y, { scale: 2, anchor: 'bottom', alpha });
    }
  }

  _drawJevilSprite(ctx) {
    const j = this.jevil;

    // Phase 5 / Chaos Mode motion blur afterimages
    for (const a of j.afterimages) {
      this.assets.draw(ctx, 'jevil_front', a.f, a.x, a.y, {
        scale: 2,
        anchor: 'bottom',
        alpha: a.alpha,
        tint: this.modeCfg.id === 'chaos' ? '#ff3c88' : '#7777ff',
      });
    }

    if (j.hurtTimer > 0) {
      // Official Jevil Hurt animation: body + spring ring + bouncing head!
      this.assets.draw(ctx, 'jevil_hurt_body', 0, j.x, j.y, { scale: 2, anchor: 'bottom' });
      const headF = Math.floor(j.hurtTimer * 20) % 4;
      const hx = j.x + j.hurtHeadOffset * 1.4;
      const hy = j.y - 44 - Math.abs(j.hurtHeadOffset) * 0.5;
      this.assets.draw(ctx, 'jevil_hurt_ring', 0, (j.x + hx) / 2, (j.y - 36 + hy) / 2, { scale: 2 });
      this.assets.draw(ctx, 'jevil_hurt_heads', headF, hx, hy, { scale: 2 });
      return;
    }

    if (j.isTiredPose || j.pacified) {
      const bob = Math.sin(j.animTimer * 4) * 2;
      this.assets.draw(ctx, 'jevil_main', 2, j.x, j.y + bob, {
        scale: 2,
        anchor: 'bottom',
        tint: j.pacified ? '#88bbff' : null,
      });
      return;
    }

    const animKey = this.state === 'BOSS_DIALOGUE' ? 'jevil_teleport' : 'jevil_front';
    const fps = j.phase >= 5 ? 14 : this.state === 'BOSS_DIALOGUE' ? 10 : 8;
    const f = Math.floor(j.animTimer * fps);
    this.assets.draw(ctx, animKey, f, j.x, j.y, { scale: 2, anchor: 'bottom' });
  }

  _drawBossSpeechBubble(ctx) {
    const bx = 352;
    const by = 118;
    this.assets.draw(ctx, 'speech_bubble', 0, bx, by, { scale: 1.05, anchor: 'center' });

    ctx.save();
    ctx.font = 'bold 17px "DRMono", monospace';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    const lines = this.bossBubbleText.slice(0, this.bossBubbleShown).split('\n');
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx - 58, by - 16 + i * 18);
    }
    ctx.restore();
  }

  _drawBattleUI(ctx) {
    // Black lower battle panel + purple top divider line (matching screenshots 1-5!)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, UI_TOP, CANVAS_W, CANVAS_H - UI_TOP);
    ctx.fillStyle = '#332033';
    ctx.fillRect(0, UI_TOP, CANVAS_W, 2);
    ctx.fillRect(0, UI_TOP + 38, CANVAS_W, 2);

    // Draw the 3 Party Member Status Cards
    const slotW = 212;
    for (let i = 0; i < 3; i++) {
      const p = this.party[i];
      const sx = 2 + i * slotW;
      const isActive = this.state === 'MENU_SELECT' && i === this.activeCharIdx;
      const sy = isActive ? UI_TOP - 32 : UI_TOP + 2;
      const sh = isActive ? 70 : 36;

      // Panel background
      ctx.fillStyle = '#000000';
      ctx.fillRect(sx, sy, slotW - 2, sh);

      if (isActive) {
        // Active party card pops UP with character signature border!
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, slotW - 4, sh - 2);
      } else {
        ctx.fillStyle = '#332033';
        ctx.fillRect(sx + slotW - 3, sy, 2, sh);
      }

      // Face portrait (0=down, 1=normal, 2=hurt)
      const faceFrame = p.hp <= 0 ? 0 : p.hurtTimer > 0 ? 2 : 1;
      this.assets.draw(ctx, p.iconKey, faceFrame, sx + 22, sy + 18, { scale: 1 });

      // Character Name
      ctx.font = 'bold 12px "DRSilk", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = p.hp <= 0 ? '#cc2222' : '#ffffff';
      ctx.fillText(p.name, sx + 42, sy + 22);

      // HP Label + Numbers + Bar
      const hpRatio = clamp(p.hp / p.maxHp, 0, 1);
      ctx.font = 'bold 10px "DRSilk", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('HP', sx + 102, sy + 29);

      ctx.font = 'bold 11px "DRSilk", monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = p.hp <= 0 ? '#ff2222' : p.hp <= p.maxHp * 0.25 ? '#ffff00' : '#ffffff';
      ctx.fillText(`${p.hp}/${p.maxHp}`, sx + slotW - 10, sy + 16);

      // HP bar track + fill
      const barX = sx + 122;
      const barY = sy + 21;
      const barW = 78;
      const barH = 9;
      ctx.fillStyle = '#780000';
      ctx.fillRect(barX, barY, barW, barH);
      if (hpRatio > 0) {
        ctx.fillStyle = p.barColor;
        ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);
      }

      // Queued action icon indicator when waiting for other party members
      if (!isActive && p.queuedAction && this.state === 'MENU_SELECT') {
        const qIconMap = { fight: 3, magic: 4, act: 5, item: 6, defend: 7, spare: 10 };
        const qf = qIconMap[p.queuedAction.type];
        if (qf !== undefined) {
          this.assets.draw(ctx, p.iconKey, qf, sx + 96, sy + 16, { scale: 0.72 });
        }
      }

      // 5 Official Action Icons on the active popped-up panel!
      if (isActive) {
        const cur = this.actionCursor[i];
        for (let a = 0; a < 5; a++) {
          const actName = p.actions[a];
          const selected = this.menuLevel === 'ACTION' && a === cur;
          const spriteKey = `btn_${actName}${selected ? '_sel' : ''}`;
          this.assets.draw(ctx, spriteKey, 0, sx + 26 + a * 38, sy + 52, { scale: 1.05 });
        }
      }
    }

    // Bottom Text / Submenu Area (y = 368..480)
    const boxY = UI_TOP + 42;
    if (this.state === 'INTRO_DIALOGUE' || this.state === 'PLAYER_ACTIONS' || this.state === 'VICTORY_CUTSCENE') {
      this._drawDialogueLines(ctx, boxY);
    } else if (this.state === 'ATTACK_TIMING') {
      this._drawAttackTimingUI(ctx);
    } else if (this.state === 'MENU_SELECT') {
      if (this.menuLevel === 'ACTION') {
        this._drawDialogueLines(ctx, boxY);
      } else if (this.menuLevel === 'TARGET_ENEMY' || this.menuLevel === 'SPARE') {
        this._drawEnemyTargetUI(ctx, boxY);
      } else if (this.menuLevel === 'ACT') {
        this._drawListSubmenu(ctx, boxY, this._getKrisActs());
      } else if (this.menuLevel === 'MAGIC') {
        const char = this.party[this.activeCharIdx];
        const spells = this._getCharSpells(char.id).map((s) => ({
          ...s,
          enabled: this.getAvailableTp() >= s.tp,
        }));
        this._drawListSubmenu(ctx, boxY, spells);
      } else if (this.menuLevel === 'ITEM') {
        this._drawItemSubmenu(ctx, boxY);
      } else if (this.menuLevel === 'TARGET_ALLY') {
        this._drawAllyTargetUI(ctx, boxY);
      }
    }
  }

  _drawDialogueLines(ctx, boxY) {
    ctx.save();
    const speakerTag =
      this.state === 'INTRO_DIALOGUE' || this.state === 'VICTORY_CUTSCENE'
        ? this.dialogSpeaker === 'jevil'
          ? '[JEVIL] '
          : this.dialogSpeaker === 'susie'
          ? '[SUSIE] '
          : this.dialogSpeaker === 'ralsei'
          ? '[RALSEI] '
          : ''
        : '';

    const text = this.dialogText.slice(0, this.dialogShown);
    const lines = text.split('\n');
    ctx.font = '25px "DRMono", monospace';
    ctx.textAlign = 'left';

    for (let i = 0; i < lines.length; i++) {
      const prefix = i === 0 ? speakerTag : '';
      ctx.fillStyle =
        this.dialogSpeaker === 'jevil'
          ? '#d8d2ff'
          : this.dialogSpeaker === 'susie'
          ? '#ff99ff'
          : this.dialogSpeaker === 'ralsei'
          ? '#99ffaa'
          : '#ffffff';
      ctx.fillText(prefix + lines[i], 30, boxY + 32 + i * 30);
    }

    // Subtle advance prompt during dialogue
    if (
      (this.state === 'INTRO_DIALOGUE' || this.state === 'VICTORY_CUTSCENE' || (this.state === 'PLAYER_ACTIONS' && this.actionWaitConfirm)) &&
      this.dialogShown >= this.dialogText.length
    ) {
      if (Math.floor(performance.now() / 420) % 2 === 0) {
        ctx.font = '10px "DRSilk", monospace';
        ctx.fillStyle = '#ffff00';
        ctx.textAlign = 'right';
        ctx.fillText('PRESS Z / ENTER ▼', CANVAS_W - 22, CANVAS_H - 12);
      }
    }
    ctx.restore();
  }

  _drawEnemyTargetUI(ctx, boxY) {
    const pacifiable = this.isJevilPacifiable();
    this.assets.draw(ctx, 'soul_red', 0, 44, boxY + 30, { scale: 0.9 });

    ctx.save();
    ctx.font = '26px "DRMono", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = pacifiable ? '#44aaff' : '#ffffff';
    ctx.fillText('Jevil', 68, boxY + 37);

    if (pacifiable) {
      ctx.font = '12px "DRPixel", monospace';
      ctx.fillStyle = '#44aaff';
      ctx.fillText('(TIRED)', 142, boxY + 35);
    }

    // Jevil HP bar
    ctx.font = '11px "DRSilk", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('HP', 330, boxY + 18);
    ctx.fillStyle = '#7a0000';
    ctx.fillRect(330, boxY + 24, 110, 14);
    ctx.fillStyle = '#00e000';
    ctx.fillRect(330, boxY + 24, Math.round(110 * clamp(this.jevil.hp / this.jevil.maxHp, 0, 1)), 14);

    // Mercy / Tiredness bar
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MERCY', 475, boxY + 18);
    ctx.fillStyle = '#7a0000';
    ctx.fillRect(475, boxY + 24, 110, 14);
    ctx.fillStyle = pacifiable ? '#44aaff' : '#ffe033';
    const tFrac = clamp(this.jevil.tiredness / this.modeCfg.tiredThreshold, 0, 1);
    ctx.fillRect(475, boxY + 24, Math.round(110 * tFrac), 14);
    ctx.restore();
  }

  _drawListSubmenu(ctx, boxY, items) {
    ctx.save();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const y = boxY + 28 + i * 28;
      if (i === this.subCursor) {
        this.assets.draw(ctx, 'soul_red', 0, 42, y - 6, { scale: 0.85 });
      }
      ctx.font = '24px "DRMono", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = !it.enabled ? '#666677' : i === this.subCursor ? '#ffff00' : '#ffffff';
      ctx.fillText(it.name, 64, y);
    }

    // Right description pane (authentic Deltarune split)
    ctx.fillStyle = '#332033';
    ctx.fillRect(370, boxY + 4, 2, 102);

    const sel = items[this.subCursor];
    if (sel) {
      ctx.font = '21px "DRMono", monospace';
      ctx.fillStyle = '#b4b4cc';
      const lines = sel.desc.split('\n');
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 388, boxY + 28 + i * 24);
      }
    }
    ctx.restore();
  }

  _drawItemSubmenu(ctx, boxY) {
    const avail = this._getAvailableItems();
    const pageStart = Math.floor(this.subCursor / 6) * 6;
    const visible = avail.slice(pageStart, pageStart + 6);

    ctx.save();
    for (let i = 0; i < visible.length; i++) {
      const globalIdx = pageStart + i;
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col === 0 ? 58 : 228;
      const y = boxY + 28 + row * 28;
      if (globalIdx === this.subCursor) {
        this.assets.draw(ctx, 'soul_red', 0, x - 20, y - 6, { scale: 0.85 });
      }
      ctx.font = '22px "DRMono", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = globalIdx === this.subCursor ? '#ffff00' : '#ffffff';
      ctx.fillText(visible[i].name, x, y);
    }

    ctx.fillStyle = '#332033';
    ctx.fillRect(398, boxY + 4, 2, 102);
    const sel = avail[this.subCursor];
    if (sel) {
      ctx.font = '21px "DRMono", monospace';
      ctx.fillStyle = '#b4b4cc';
      const lines = sel.desc.split('\n');
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 414, boxY + 28 + i * 24);
      }
      ctx.font = '14px "DRMono", monospace';
      ctx.fillStyle = '#777799';
      ctx.fillText(`Items left: ${avail.length}`, 414, boxY + 96);
    }
    ctx.restore();
  }

  _drawAllyTargetUI(ctx, boxY) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const m = this.party[i];
      const y = boxY + 28 + i * 28;
      if (i === this.subCursor) {
        this.assets.draw(ctx, 'soul_red', 0, 44, y - 6, { scale: 0.85 });
      }
      ctx.font = '24px "DRMono", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = i === this.subCursor ? '#ffff00' : m.hp <= 0 ? '#ff4444' : '#ffffff';
      ctx.fillText(m.name, 68, y);

      // Mini HP bar
      ctx.fillStyle = '#7a0000';
      ctx.fillRect(210, y - 14, 140, 12);
      const frac = clamp(m.hp / m.maxHp, 0, 1);
      ctx.fillStyle = m.barColor;
      ctx.fillRect(210, y - 14, Math.round(140 * frac), 12);

      ctx.font = '20px "DRMono", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${m.hp}/${m.maxHp}`, 366, y);
    }
    ctx.restore();
  }

  _drawAttackTimingUI(ctx) {
    ctx.save();
    for (const lane of this.attackLanes) {
      const p = this.party[lane.charIdx];
      const y = lane.y;
      // Lane rail
      ctx.fillStyle = '#18182e';
      ctx.fillRect(68, y - 11, 520, 22);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(68, y - 11, 520, 22);

      // Character icon on left
      this.assets.draw(ctx, p.iconKey, 1, 44, y, { scale: 0.85 });

      // TARGET zone box
      ctx.strokeStyle = lane.flash > 0 ? '#ffff00' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(lane.targetX - 8, y - 11, 16, 22);
      ctx.fillStyle = lane.flash > 0 ? 'rgba(255,255,0,0.4)' : 'rgba(255,255,255,0.16)';
      ctx.fillRect(lane.targetX - 8, y - 11, 16, 22);

      // Sliding attack cursor bar
      if (!lane.resolved || lane.flash > 0) {
        const cx = clamp(lane.cursorX, 68, 584);
        ctx.fillStyle = lane.flash > 0 ? '#ffff00' : '#ffffff';
        ctx.fillRect(Math.round(cx) - 3, y - 13, 6, 26);
      }
    }

    ctx.font = '10px "DRSilk", monospace';
    ctx.fillStyle = '#ffff00';
    ctx.textAlign = 'right';
    ctx.fillText('PRESS Z / ENTER ON TARGET!', CANVAS_W - 18, CANVAS_H - 8);
    ctx.restore();
  }

  _drawVictoryScreen(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const bx = 90;
    const by = 54;
    const bw = 460;
    const bh = 372;
    ctx.fillStyle = '#000000';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = this.modeCfg.id === 'chaos' ? '#ff3c6e' : '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.textAlign = 'center';
    ctx.font = '18px "DRPixel", monospace';
    ctx.fillStyle = '#ffff00';
    ctx.fillText('VICTORY!', CANVAS_W / 2, by + 44);

    ctx.font = '11px "DRSilk", monospace';
    ctx.fillStyle = this.modeCfg.accentColor;
    const reward = this.victoryOutcome === 'pacify' ? 'PACIFIED — OBTAINED JEVILSTAIL' : 'DEFEATED — OBTAINED DEVILSKNIFE';
    ctx.fillText(`${this.modeCfg.name}  •  ${reward}`, CANVAS_W / 2, by + 72);

    // Rank Calculation
    const rank =
      this.totalDamageTaken === 0
        ? 'S+ (NO-HIT!)'
        : this.totalDamageTaken < 160
        ? 'S'
        : this.totalDamageTaken < 360
        ? 'A'
        : this.totalDamageTaken < 650
        ? 'B'
        : 'C';

    const mins = Math.floor(this.battleTime / 60);
    const secs = String(Math.floor(this.battleTime % 60)).padStart(2, '0');

    const rows = [
      ['TURNS SURVIVED', `${this.turnNumber}`],
      ['CLEAR TIME', `${mins}:${secs}`],
      ['DAMAGE TAKEN', `${this.totalDamageTaken}`],
      ['BULLETS GRAZED', `${this.totalGrazes}`],
      ['CHAOS RANK', rank],
    ];

    ctx.font = '24px "DRMono", monospace';
    for (let i = 0; i < rows.length; i++) {
      const ry = by + 124 + i * 32;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#b4b4d8';
      ctx.fillText(rows[i][0], bx + 44, ry);
      ctx.textAlign = 'right';
      ctx.fillStyle = i === 4 ? '#ffff00' : '#ffffff';
      ctx.fillText(rows[i][1], bx + bw - 44, ry);
    }

    // Buttons
    const opts = ['PLAY AGAIN', 'MAIN MENU'];
    for (let i = 0; i < opts.length; i++) {
      const oy = by + 312 + i * 34;
      const sel = i === this.victoryCursor;
      if (sel) this.assets.draw(ctx, 'soul_red', 0, CANVAS_W / 2 - 96, oy - 6, { scale: 0.9 });
      ctx.font = '14px "DRPixel", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = sel ? '#ffff00' : '#ffffff';
      ctx.fillText(opts[i], CANVAS_W / 2, oy);
    }
    ctx.restore();
  }

  _drawGameOver(ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const sx = this.attacks.soul.x || 320;
    const sy = this.attacks.soul.y || 210;

    if (this.gameOverStage === 0) {
      // Cracked Red SOUL shaking before shatter
      const ox = (Math.random() - 0.5) * 4;
      this.assets.draw(ctx, 'soul_red', 0, sx + ox, sy, { scale: 1.2 });
    } else {
      for (const sh of this.soulShards) {
        ctx.save();
        ctx.translate(sh.x, sh.y);
        ctx.rotate(sh.rot);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(-4, -3, 8, 6);
        ctx.restore();
      }
    }

    if (this.gameOverTimer > 1.2) {
      const a = clamp((this.gameOverTimer - 1.2) / 0.6, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '26px "DRPixel", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('GAME OVER', CANVAS_W / 2, 165);

      ctx.font = '22px "DRMono", monospace';
      ctx.fillStyle = '#c8c0ff';
      ctx.fillText('"UEE HEE HEE! WHEN YOUR HP DROPS TO 0, YOU LOSE!"', CANVAS_W / 2, 215);

      const opts = ['TRY AGAIN', 'MAIN MENU'];
      for (let i = 0; i < 2; i++) {
        const ox = CANVAS_W / 2 + (i === 0 ? -115 : 115);
        const oy = 310;
        const sel = i === this.gameOverCursor;
        if (sel) this.assets.draw(ctx, 'soul_red', 0, ox - 74, oy - 6, { scale: 0.9 });
        ctx.font = '13px "DRPixel", monospace';
        ctx.fillStyle = sel ? '#ffff00' : '#ffffff';
        ctx.fillText(opts[i], ox, oy);
      }
      ctx.restore();
    }
  }
}
