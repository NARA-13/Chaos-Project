import { CANVAS_W, ARENA_H } from './config.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export class AttackController {
  constructor(battle) {
    this.battle = battle;
    this.active = false;
    this.patternId = 'spade_volleys';
    this.elapsed = 0;
    this.duration = 9.0;

    // Battle Box (interpolated smoothly)
    this.box = { x: 244, y: 98, w: 152, h: 152 };
    this.targetBox = { x: 244, y: 98, w: 152, h: 152 };

    // SOUL state
    this.soul = {
      x: 320,
      y: 174,
      r: 5,
      grazeR: 22,
      invuln: 0,
      grazeFlash: 0,
      speed: 185,
    };

    // Active projectiles & visual objects
    this.bullets = [];
    this.beams = [];
    this.warnings = [];
    this.clones = []; // teleporting Jevil clones
    this.state = {};
    this.stats = { grazesThisTurn: 0, hitsThisTurn: 0 };
  }

  start(patternId) {
    const mode = this.battle.modeCfg;
    this.active = true;
    this.patternId = patternId;
    this.elapsed = 0;
    this.bullets = [];
    this.beams = [];
    this.warnings = [];
    this.clones = [];
    this.state = {
      timer: 0,
      step: 0,
      dir: Math.random() < 0.5 ? 1 : -1,
    };
    this.stats = { grazesThisTurn: 0, hitsThisTurn: 0 };

    const isFull = patternId === 'final_chaos' || patternId === 'chaos_true_neo_final';
    if (isFull) {
      this.targetBox = { x: 46, y: 24, w: 548, h: 282 };
      this.box = { ...this.targetBox };
    } else {
      this.targetBox = { x: 244, y: 98, w: 152, h: 152 };
      this.box = { x: 244, y: 98, w: 152, h: 152 };
    }

    this.soul.x = this.targetBox.x + this.targetBox.w / 2;
    this.soul.y = this.targetBox.y + this.targetBox.h / 2;
    this.soul.invuln = 0;
    this.soul.grazeFlash = 0;
    this.soul.speed = patternId === 'ring_around_2' || patternId === 'chaos_double_ring' ? 215 : 185;

    // Pattern durations (seconds)
    const durations = {
      spade_volleys: 8.5,
      ring_around: 8.8,
      heart_bombs: 9.0,
      devilsknife_1: 8.8,
      carousel_1: 9.2,
      club_bombs: 9.0,
      rising_diamonds: 8.5,
      ring_around_2: 9.5,
      carousel_2: 9.5,
      spade_bombs: 9.0,
      three_club: 9.2,
      devilsknife_2: 9.6,
      diamond_toss: 8.8,
      chaos_bomb: 10.0,
      tired_fakeout: 7.4,
      final_chaos: 12.2,
      chaos_double_ring: 9.6,
      chaos_cross_scythes: 10.2,
      chaos_stampede: 9.8,
      chaos_suit_storm: 10.0,
      chaos_true_neo_final: 13.4,
    };
    this.duration = durations[patternId] || 9.0;

    // Pattern-specific initialization
    if (patternId === 'devilsknife_1' || patternId === 'devilsknife_2' || patternId === 'chaos_cross_scythes') {
      this._initOrbitScythes(mode);
    } else if (patternId === 'ring_around' || patternId === 'ring_around_2') {
      this._spawnSpadeRing(10, 118, this.state.dir);
    } else if (patternId === 'chaos_double_ring') {
      this._spawnSpadeRing(10, 134, 1, 'outer');
      this._spawnSpadeRing(8, 98, -1, 'inner');
    } else if (patternId === 'final_chaos' || patternId === 'chaos_true_neo_final') {
      this.battle.audio.playVoice('byebye');
      this.battle.audio.playSfx('rumble', { volume: 0.7 });
      this.battle.triggerShake(8, 0.5);
    }
  }

  _initOrbitScythes(mode) {
    const cx = this.targetBox.x + this.targetBox.w / 2;
    const cy = this.targetBox.y + this.targetBox.h / 2;
    for (let i = 0; i < 4; i++) {
      this.bullets.push({
        type: 'orbit_scythe',
        sprite: 'scythe_spin',
        angle: (i * Math.PI) / 2,
        cx,
        cy,
        x: cx,
        y: cy,
        r: 13,
        scale: 1.05,
        spin: 0,
        spinSpeed: 8.5 * mode.speedMult,
        orbitSpeed: 1.95 * mode.speedMult,
        grazed: false,
        grazeCd: 0,
        persistent: true,
        damageAll: false,
      });
    }
    this.state.redSide = Math.random() < 0.5 ? 'top' : 'bottom';
    this.state.redTimer = 1.6;
    this.state.redCount = 0;
  }

  _spawnSpadeRing(count, radius, dir, tag = 'ring') {
    const cx = this.targetBox.x + this.targetBox.w / 2;
    const cy = this.targetBox.y + this.targetBox.h / 2;
    for (let i = 0; i < count; i++) {
      const baseAngle = (i / count) * Math.PI * 2;
      this.bullets.push({
        type: 'ring_spade',
        tag,
        sprite: 'bullet_spade',
        cx,
        cy,
        ringIndex: i,
        ringCount: count,
        ringRadius: radius,
        angle: baseAngle,
        dir,
        launched: false,
        x: cx + Math.cos(baseAngle) * radius,
        y: cy + Math.sin(baseAngle) * radius,
        vx: 0,
        vy: 0,
        r: 7,
        scale: 0.85,
        rot: baseAngle + Math.PI,
        alpha: 0.55,
        grazed: false,
        grazeCd: 0,
      });
    }
    this.state[`ringIdx_${tag}`] = 0;
    this.state[`ringCd_${tag}`] = 0.45;
  }

  update(dt, input) {
    if (!this.active) return;
    const mode = this.battle.modeCfg;
    this.elapsed += dt;

    // 1. Move SOUL cleanly inside Battle Box
    let mx = 0;
    let my = 0;
    if (input.held('left')) mx -= 1;
    if (input.held('right')) mx += 1;
    if (input.held('up')) my -= 1;
    if (input.held('down')) my += 1;
    if (mx !== 0 && my !== 0) {
      const inv = 1 / Math.SQRT2;
      mx *= inv;
      my *= inv;
    }

    const slow = this.battle.settings.focusSlow && input.held('cancel');
    const spd = slow ? 92 : this.soul.speed;
    this.soul.x += mx * spd * dt;
    this.soul.y += my * spd * dt;

    const pad = 11;
    this.soul.x = clamp(this.soul.x, this.box.x + pad, this.box.x + this.box.w - pad);
    this.soul.y = clamp(this.soul.y, this.box.y + pad, this.box.y + this.box.h - pad);

    if (this.soul.invuln > 0) this.soul.invuln = Math.max(0, this.soul.invuln - dt);
    if (this.soul.grazeFlash > 0) this.soul.grazeFlash = Math.max(0, this.soul.grazeFlash - dt * 3.5);

    // 2. Run active pattern spawner
    this._updatePattern(dt, mode);

    // 3. Update teleport clones
    for (let i = this.clones.length - 1; i >= 0; i--) {
      const c = this.clones[i];
      c.life -= dt;
      c.frameTimer += dt;
      if (c.life <= 0) this.clones.splice(i, 1);
    }

    // 4. Update warnings
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      w.life -= dt;
      if (w.life <= 0) {
        if (w.onFinish) w.onFinish();
        this.warnings.splice(i, 1);
      }
    }

    // 5. Update vertical light beams (Final Chaos)
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i];
      bm.life -= dt;
      if (bm.life > bm.activeUntil && this.soul.invuln <= 0) {
        if (Math.abs(this.soul.x - bm.x) < bm.halfW * 0.72) {
          this._hitSoul(bm.damageAll, bm.dmgMult || 1.15);
        }
      }
      if (bm.life <= 0) this.beams.splice(i, 1);
    }

    // 6. Update bullets + check graze & hit
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.age = (b.age || 0) + dt;
      if (b.grazeCd > 0) b.grazeCd -= dt;

      const alive = this._stepBullet(b, dt, mode);
      if (!alive) {
        this.bullets.splice(i, 1);
        continue;
      }

      if (b.noHit || (b.type === 'ring_spade' && !b.launched)) continue;
      if (b.type === 'carousel' && b.depthAlpha !== undefined && b.depthAlpha < 0.35) continue;

      const d = dist(this.soul.x, this.soul.y, b.x, b.y);
      const hitDist = this.soul.r + b.r;
      const grazeDist = this.soul.grazeR + b.r;

      if (d < hitDist) {
        if (this.soul.invuln <= 0) {
          this._hitSoul(b.damageAll, b.dmgMult || 1.0);
          if (!b.persistent) {
            this.bullets.splice(i, 1);
            continue;
          }
        }
      } else if (d < grazeDist && b.grazeCd <= 0) {
        const tpGain = b.highTp ? 3.8 : b.grazed ? 0.45 : 1.9;
        b.grazed = true;
        b.grazeCd = 0.28;
        this.soul.grazeFlash = 1.0;
        this.stats.grazesThisTurn++;
        this.battle.addTp(tpGain);
        this.battle.totalGrazes++;
        this.battle.audio.playSfx('graze', { volume: 0.65, minGapMs: 55 });
        // Authentic Deltarune graze slightly accelerates remaining attack time
        this.elapsed += 0.03;
      }
    }

    // 7. End attack when duration complete
    if (this.elapsed >= this.duration) {
      this.active = false;
      this.bullets = [];
      this.beams = [];
      this.warnings = [];
      this.clones = [];
      this.battle.onBulletPhaseEnd();
    }
  }

  _hitSoul(damageAll = false, dmgMult = 1.0) {
    this.stats.hitsThisTurn++;
    const iframes = this.battle.pirouetteLowIframes ? 0.4 : 1.0;
    this.soul.invuln = iframes;
    this.battle.applyBulletDamage(damageAll, dmgMult);
  }

  _stepBullet(b, dt, mode) {
    if (b.type === 'linear') {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.spinSpeed) b.rot = (b.rot || 0) + b.spinSpeed * dt;
      if (b.accel) {
        b.vx *= 1 + b.accel * dt;
        b.vy *= 1 + b.accel * dt;
      }
      return b.x > -90 && b.x < CANVAS_W + 90 && b.y > -100 && b.y < ARENA_H + 120;
    }

    if (b.type === 'bomb') {
      b.y += b.vy * dt;
      b.flashTimer = (b.flashTimer || 0) + dt * 10;
      if (b.y >= b.targetY) {
        this._detonateBomb(b, mode);
        return false;
      }
      return true;
    }

    if (b.type === 'heart_squad') {
      b.cx += b.vx * dt;
      b.cy += b.vy * dt;
      b.orbitAngle += b.orbitSpeed * dt;
      b.x = b.cx + Math.cos(b.orbitAngle) * b.orbitR;
      b.y = b.cy + Math.sin(b.orbitAngle) * b.orbitR;
      return b.cx > -120 && b.cx < CANVAS_W + 120 && b.cy > -120 && b.cy < ARENA_H + 120;
    }

    if (b.type === 'orbit_scythe') {
      b.angle += b.orbitSpeed * dt;
      b.spin += b.spinSpeed * dt;
      const osc = Math.sin(this.elapsed * 2.15 * mode.speedMult);
      const radius = 58 + osc * 34;
      b.x = b.cx + Math.cos(b.angle) * radius;
      b.y = b.cy + Math.sin(b.angle) * radius;
      b.rot = b.spin;
      return true;
    }

    if (b.type === 'ring_spade') {
      if (!b.launched) {
        b.angle += b.dir * 0.55 * mode.speedMult * dt;
        b.x = b.cx + Math.cos(b.angle) * b.ringRadius;
        b.y = b.cy + Math.sin(b.angle) * b.ringRadius;
        b.rot = b.angle + Math.PI;
        return true;
      } else {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        return b.x > -80 && b.x < CANVAS_W + 80 && b.y > -80 && b.y < ARENA_H + 80;
      }
    }

    if (b.type === 'carousel') {
      b.x += b.vx * dt;
      const t = this.elapsed;
      const skew = b.useSkew ? Math.sin(t * 0.9) * ((b.x - 320) * 0.12) : 0;
      b.y = b.baseY + Math.sin(t * b.bobFreq + b.bobPhase) * b.bobAmp + skew;
      // 3D cylinder illusion: fade & squash near outer edges
      const rel = Math.abs(b.x - 320) / 170;
      b.depthAlpha = clamp(1.15 - rel * 0.85, 0.15, 1.0);
      b.scaleX = clamp(1.18 - rel * 0.4, 0.55, 1.15) * (b.vx < 0 ? -1 : 1);
      return b.x > 80 && b.x < 560;
    }

    if (b.type === 'club_turret') {
      b.fireTimer -= dt;
      if (b.fireTimer <= 0 && b.burstsLeft > 0) {
        b.burstsLeft--;
        b.fireTimer = 0.34 / mode.speedMult;
        const ang = Math.atan2(this.soul.y - b.y, this.soul.x - b.x);
        const spread = 0.26;
        const spd = 165 * mode.speedMult;
        for (let k = -1; k <= 1; k++) {
          this.bullets.push({
            type: 'linear',
            sprite: 'bullet_orbs',
            frame: 1,
            x: b.x,
            y: b.y,
            vx: Math.cos(ang + k * spread) * spd,
            vy: Math.sin(ang + k * spread) * spd,
            r: 5,
            scale: 0.72,
            grazed: false,
            grazeCd: 0,
          });
        }
        this.battle.audio.playSfx('noise', { volume: 0.35, minGapMs: 70 });
      }
      if (b.burstsLeft <= 0 && b.fireTimer < -0.25) return false;
      return true;
    }

    if (b.type === 'giant_knife') {
      b.x += (b.vx || 0) * dt;
      b.y += b.vy * dt;
      b.vy += (b.gravity || 0) * dt;
      if (b.isFinalColossus) {
        // Halts safely just above bottom floor and ends attack dramatically!
        if (b.y >= this.box.y + this.box.h - 78) {
          b.y = this.box.y + this.box.h - 78;
          b.vy = 0;
          if (!b.shook) {
            b.shook = true;
            this.battle.triggerShake(14, 0.65);
            this.battle.audio.playSfx('badexplosion', { volume: 0.9 });
          }
        }
        return true;
      }
      if (b.y >= this.box.y + this.box.h - 24) {
        // Explode into white light pillar!
        this.battle.audio.playSfx('scytheburst', { volume: 0.65, minGapMs: 70 });
        this.battle.triggerShake(5, 0.16);
        this.beams.push({
          x: b.x,
          halfW: b.beamHalfW || 26,
          life: 0.42,
          maxLife: 0.42,
          activeUntil: 0.22,
          damageAll: true,
          dmgMult: 1.05,
        });
        return false;
      }
      return true;
    }

    return true;
  }

  _detonateBomb(bomb, mode) {
    this.battle.audio.playSfx('bomb', { volume: 0.7, minGapMs: 60 });
    this.battle.triggerShake(3.5, 0.12);
    const spd = 155 * mode.speedMult;
    const angToSoul = Math.atan2(this.soul.y - bomb.y, this.soul.x - bomb.x);

    if (bomb.suit === 'heart') {
      // 4 hearts orbiting a moving square center
      const vx = Math.cos(angToSoul) * (105 * mode.speedMult);
      const vy = Math.sin(angToSoul) * (105 * mode.speedMult);
      const orbitDir = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < 4; i++) {
        this.bullets.push({
          type: 'heart_squad',
          sprite: 'bullet_heart',
          cx: bomb.x,
          cy: bomb.y,
          x: bomb.x,
          y: bomb.y,
          vx,
          vy,
          orbitAngle: (i * Math.PI) / 2,
          orbitSpeed: orbitDir * 3.1 * mode.speedMult,
          orbitR: 22,
          r: 6,
          scale: 1.0,
          grazed: false,
          grazeCd: 0,
        });
      }
    } else if (bomb.suit === 'club') {
      // 3-way aimed spread
      const spread = 0.24;
      for (let k = -1; k <= 1; k++) {
        this.bullets.push({
          type: 'linear',
          sprite: 'bullet_orbs',
          frame: 0,
          x: bomb.x,
          y: bomb.y,
          vx: Math.cos(angToSoul + k * spread) * (spd * 1.15),
          vy: Math.sin(angToSoul + k * spread) * (spd * 1.15),
          r: 6,
          scale: 0.85,
          grazed: false,
          grazeCd: 0,
        });
      }
    } else if (bomb.suit === 'spade') {
      // 10-way radial spade burst
      const count = 10;
      const offset = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const a = offset + (i / count) * Math.PI * 2;
        this.bullets.push({
          type: 'linear',
          sprite: 'bullet_spade',
          x: bomb.x,
          y: bomb.y,
          vx: Math.cos(a) * (spd * 0.96),
          vy: Math.sin(a) * (spd * 0.96),
          r: 6,
          scale: 0.72,
          rot: a,
          grazed: false,
          grazeCd: 0,
        });
      }
    } else if (bomb.suit === 'diamond') {
      // 3 aimed diamonds with staggered speeds forming a tight line
      for (let k = 0; k < 3; k++) {
        const s = (195 - k * 34) * mode.speedMult;
        this.bullets.push({
          type: 'linear',
          sprite: 'bullet_diamond_v',
          x: bomb.x,
          y: bomb.y,
          vx: Math.cos(angToSoul) * s,
          vy: Math.sin(angToSoul) * s,
          r: 6,
          scale: 0.72,
          rot: angToSoul + Math.PI / 2,
          grazed: false,
          grazeCd: 0,
        });
      }
    }
  }

  _spawnBomb(suit, mode) {
    const suitIdx = { club: 0, diamond: 1, heart: 2, spade: 3 }[suit] ?? 0;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x =
      side < 0
        ? this.box.x - 16 - Math.random() * 58
        : this.box.x + this.box.w + 16 + Math.random() * 58;
    const targetY = this.box.y + 18 + Math.random() * (this.box.h - 36);
    this.battle.audio.playSfx('bombfall', { volume: 0.5, minGapMs: 80 });
    this.bullets.push({
      type: 'bomb',
      suit,
      suitIdx,
      sprite: 'bombs',
      x,
      y: -16,
      vy: 245 * mode.speedMult,
      targetY,
      r: 8,
      scale: 1.15,
      noHit: true,
      grazed: false,
      grazeCd: 0,
    });
  }

  _updatePattern(dt, mode) {
    const p = this.patternId;
    const sm = mode.spawnMult;
    const vm = mode.speedMult;
    const st = this.state;

    // 1. PHASE 1 #1: Five-Spade Volleys
    if (p === 'spade_volleys') {
      st.timer -= dt;
      if (st.timer <= 0 && this.elapsed < this.duration - 0.8) {
        st.timer = 1.05 / sm;
        const left = st.step % 2 === 0;
        st.step++;
        const jx = left ? this.box.x - 42 - Math.random() * 44 : this.box.x + this.box.w + 42 + Math.random() * 44;
        const jy = this.box.y + 18 + Math.random() * (this.box.h - 36);
        this.clones.push({ x: jx, y: jy, life: 0.72, maxLife: 0.72, frameTimer: 0, flipX: left });
        this.battle.audio.playVoice('oh');
        const baseAng = Math.atan2(this.soul.y - jy, this.soul.x - jx);
        const spd = 178 * vm;
        for (let k = -2; k <= 2; k++) {
          const a = baseAng + k * 0.21;
          this.bullets.push({
            type: 'linear',
            sprite: 'bullet_spade',
            x: jx,
            y: jy,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            r: 6,
            scale: 0.72,
            rot: a,
            grazed: false,
            grazeCd: 0,
          });
        }
      }
    }

    // 2. PHASE 1 #2 & PHASE 2 #4: Ring-Around Spade Spiral
    else if (p === 'ring_around' || p === 'ring_around_2') {
      const faster = p === 'ring_around_2';
      st.ringCd_ring -= dt;
      if (faster && Math.random() < dt * 0.28) {
        st.dir *= -1;
        for (const b of this.bullets) {
          if (b.type === 'ring_spade' && !b.launched) b.dir = st.dir;
        }
      }
      if (st.ringCd_ring <= 0 && this.elapsed < this.duration - 0.8) {
        st.ringCd_ring = (faster ? 0.22 : 0.29) / sm;
        const unlaunched = this.bullets.filter((b) => b.type === 'ring_spade' && !b.launched);
        if (unlaunched.length === 0) {
          if (faster && Math.random() < 0.5) st.dir *= -1;
          this._spawnSpadeRing(10, 120, st.dir, 'ring');
        } else {
          const pick = unlaunched[0];
          pick.launched = true;
          pick.alpha = 1.0;
          const a = Math.atan2(pick.cy - pick.y, pick.cx - pick.x);
          const spd = (faster ? 205 : 172) * vm;
          pick.vx = Math.cos(a) * spd;
          pick.vy = Math.sin(a) * spd;
          pick.rot = a;
          this.battle.audio.playSfx('smallswing', { volume: 0.28, minGapMs: 90 });
        }
      }
    }

    // 3. PHASE 1 #3: Heart Bombs
    else if (p === 'heart_bombs') {
      st.timer -= dt;
      if (st.timer <= 0 && this.elapsed < this.duration - 1.1) {
        st.timer = 0.95 / sm;
        this._spawnBomb('heart', mode);
      }
    }

    // 4. PHASE 1 #4 & PHASE 3 #4: Devilsknife Orbiting Scythes (+ Red Scythe in Phase 3)
    else if (p === 'devilsknife_1' || p === 'devilsknife_2') {
      if (p === 'devilsknife_2') {
        st.redTimer -= dt;
        if (st.redTimer <= 0 && st.redCount < 4) {
          st.redCount++;
          st.redTimer = 2.05 / sm;
          const isTop = st.redSide === 'top';
          st.redSide = isTop ? 'bottom' : 'top';
          const y = isTop ? this.box.y + 34 : this.box.y + this.box.h - 34;
          const fromLeft = st.redCount % 2 === 1;
          this.battle.audio.playSfx('scytheburst', { volume: 0.72 });
          this.bullets.push({
            type: 'linear',
            sprite: 'scythe_spin',
            tint: '#ff2244',
            x: fromLeft ? this.box.x - 90 : this.box.x + this.box.w + 90,
            y,
            vx: (fromLeft ? 1 : -1) * 265 * vm,
            vy: 0,
            r: 20,
            scale: 1.48,
            rot: 0,
            spinSpeed: 12,
            persistent: true,
            dmgMult: 1.25,
            grazed: false,
            grazeCd: 0,
          });
        }
      }
    }

    // 5. PHASE 2 #1 & PHASE 3 #1: Carousel Horses / Horses & Ducks
    else if (p === 'carousel_1' || p === 'carousel_2') {
      st.timer -= dt;
      if (st.timer <= 0 && this.elapsed < this.duration - 1.2) {
        st.timer = 0.68 / sm;
        const isPhase3 = p === 'carousel_2';
        const rows = [this.box.y + 26, this.box.y + 76, this.box.y + 126];
        const useDuck = isPhase3 && st.step % 2 === 1;
        st.step++;
        for (let r = 0; r < rows.length; r++) {
          let sprite = 'carousel_horse';
          if (useDuck) {
            sprite = Math.random() < 0.14 ? 'carousel_duck_everyman' : 'carousel_duck';
          }
          this.bullets.push({
            type: 'carousel',
            sprite,
            x: 110,
            y: rows[r],
            baseY: rows[r],
            vx: 138 * vm,
            bobAmp: 22,
            bobFreq: 2.3 * vm,
            bobPhase: useDuck ? Math.PI : 0,
            useSkew: !isPhase3,
            r: 13,
            scale: 1.08,
            scaleX: 1.08,
            depthAlpha: 0.3,
            persistent: true,
            grazed: false,
            grazeCd: 0,
          });
        }
      }
    }

    // 6. PHASE 2 #2: Club Bombs
    else if (p === 'club_bombs') {
      st.timer -= dt;
      if (st.timer <= 0 && this.elapsed < this.duration - 1.0) {
        st.timer = 0.85 / sm;
        this._spawnBomb('club', mode);
      }
    }

    // 7. PHASE 2 #3 & PHASE 4 #3: Rising Diamonds (normal fast vs tired fakeout)
    else if (p === 'rising_diamonds' || p === 'tired_fakeout') {
      const fake = p === 'tired_fakeout';
      st.timer -= dt;
      if (st.timer <= 0 && this.elapsed < this.duration - 0.7) {
        st.timer = fake ? 0.42 : 0.17 / sm;
        const x = this.box.x + 12 + Math.random() * (this.box.w - 24);
        this.bullets.push({
          type: 'linear',
          sprite: 'bullet_diamond_v',
          x,
          y: this.box.y + this.box.h + 44,
          vx: (Math.random() - 0.5) * (fake ? 12 : 24),
          vy: -(fake ? 112 : 238 * vm),
          r: 6,
          scale: 0.78,
          highTp: fake,
          grazed: false,
          grazeCd: 0,
        });
      }
    }

    // 8. PHASE 3 #2: Spade Bombs
    else if (p === 'spade_bombs') {
      st.timer -= dt;
      if (st.timer <= 0 && this.elapsed < this.duration - 1.0) {
        st.timer = 0.92 / sm;
        this._spawnBomb('spade', mode);
      }
    }

    // 9. PHASE 3 #3: Three-Club Spreads
    else if (p === 'three_club') {
      st.timer -= dt;
      if (st.timer <= 0 && this.elapsed < this.duration - 1.3) {
        st.timer = 1.05 / sm;
        const edge = st.step % 4;
        st.step++;
        let x, y;
        if (edge === 0) { x = this.box.x - 26; y = this.box.y + 20 + Math.random() * (this.box.h - 40); }
        else if (edge === 1) { x = this.box.x + this.box.w + 26; y = this.box.y + 20 + Math.random() * (this.box.h - 40); }
        else if (edge === 2) { x = this.box.x + 20 + Math.random() * (this.box.w - 40); y = this.box.y - 26; }
        else { x = this.box.x + 20 + Math.random() * (this.box.w - 40); y = this.box.y + this.box.h + 26; }

        this.bullets.push({
          type: 'club_turret',
          sprite: st.step % 2 === 0 ? 'bullet_club_w' : 'bullet_club_b',
          x,
          y,
          r: 10,
          scale: 0.95,
          burstsLeft: 3,
          fireTimer: 0.25,
          noHit: true,
          grazed: false,
          grazeCd: 0,
        });
      }
    }

    // 10. PHASE 4 #1: Rapid Teleport Diamond Tossing
    else if (p === 'diamond_toss') {
      st.timer -= dt;
      if (st.timer <= 0 && this.elapsed < this.duration - 0.7) {
        st.timer = 0.42 / sm;
        const left = st.step % 2 === 0;
        st.step++;
        const jx = left ? this.box.x - 42 - Math.random() * 44 : this.box.x + this.box.w + 42 + Math.random() * 44;
        const jy = this.box.y + 12 + Math.random() * (this.box.h - 24);
        this.clones.push({ x: jx, y: jy, life: 0.45, maxLife: 0.45, frameTimer: 0, flipX: left });
        if (st.step % 2 === 0) this.battle.audio.playVoice('oh');
        const ang = Math.atan2(this.soul.y - jy, this.soul.x - jx);
        const spd = 250 * vm;
        this.bullets.push({
          type: 'linear',
          sprite: 'bullet_diamond_v',
          x: jx,
          y: jy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          r: 7,
          scale: 0.85,
          rot: ang + Math.PI / 2,
          grazed: false,
          grazeCd: 0,
        });
      }
    }

    // 11. PHASE 4 #2: CHAOS BOMB (All 4 suit bombs!)
    else if (p === 'chaos_bomb') {
      st.timer -= dt;
      if (st.timer <= 0 && this.elapsed < this.duration - 1.1) {
        st.timer = 0.74 / sm;
        const suits = ['heart', 'club', 'spade', 'diamond'];
        const suit = suits[Math.floor(Math.random() * suits.length)];
        this._spawnBomb(suit, mode);
      }
    }

    // 12. PHASE 4 #4: FINAL CHAOS!
    else if (p === 'final_chaos') {
      const t = this.elapsed;
      // Phase A (0..6.2s): Random giant Devilsknives falling from sky
      if (t < 6.2) {
        st.timer -= dt;
        if (st.timer <= 0) {
          st.timer = 0.44 / sm;
          const x = this.box.x + 36 + Math.random() * (this.box.w - 72);
          this._spawnGiantKnife(x, -60, 0, 275 * vm, 1.35, 28);
        }
      }
      // Phase B (6.4..9.4s): Converging edges -> center pattern
      else if (t < 9.5) {
        if (st.step === 0 && t >= 6.5) {
          st.step = 1;
          this._spawnGiantKnife(this.box.x + 56, -70, 0, 310 * vm, 1.45, 34);
          this._spawnGiantKnife(this.box.x + this.box.w - 56, -70, 0, 310 * vm, 1.45, 34);
        } else if (st.step === 1 && t >= 7.25) {
          st.step = 2;
          this._spawnGiantKnife(this.box.x + 148, -70, 0, 310 * vm, 1.45, 34);
          this._spawnGiantKnife(this.box.x + this.box.w - 148, -70, 0, 310 * vm, 1.45, 34);
        } else if (st.step === 2 && t >= 8.0) {
          st.step = 3;
          this._spawnGiantKnife(320, -80, 0, 330 * vm, 1.65, 42);
        } else if (st.step === 3 && t >= 8.8) {
          st.step = 4;
          this._spawnGiantKnife(this.box.x + 95, -70, 0, 315 * vm, 1.45, 34);
          this._spawnGiantKnife(this.box.x + this.box.w - 95, -70, 0, 315 * vm, 1.45, 34);
        }
      }
      // Phase C (9.8s): Colossal Final Devilsknife descending from sky!
      else if (!st.colossusSpawned && t >= 9.75) {
        st.colossusSpawned = true;
        this.battle.audio.playVoice('neo_chaos');
        this.battle.audio.playSfx('rumble', { volume: 0.9 });
        this.bullets.push({
          type: 'giant_knife',
          isFinalColossus: true,
          sprite: 'scythe_giant',
          x: 320,
          y: -140,
          vx: 0,
          vy: 260,
          r: 72,
          scale: 3.4,
          rot: Math.PI / 2,
          persistent: true,
          damageAll: true,
          dmgMult: 1.35,
          grazed: false,
          grazeCd: 0,
        });
      }
    }

    // ================ CHAOS MODE EXCLUSIVE ATTACKS ================

    // C1. Double Ring-Around Counter-Spiral
    else if (p === 'chaos_double_ring') {
      for (const tag of ['outer', 'inner']) {
        st[`ringCd_${tag}`] -= dt;
        if (st[`ringCd_${tag}`] <= 0 && this.elapsed < this.duration - 0.8) {
          st[`ringCd_${tag}`] = tag === 'outer' ? 0.24 : 0.30;
          const un = this.bullets.filter((b) => b.type === 'ring_spade' && b.tag === tag && !b.launched);
          if (un.length === 0) {
            this._spawnSpadeRing(tag === 'outer' ? 10 : 8, tag === 'outer' ? 134 : 98, tag === 'outer' ? 1 : -1, tag);
          } else {
            const pick = un[0];
            pick.launched = true;
            pick.alpha = 1.0;
            const a = Math.atan2(pick.cy - pick.y, pick.cx - pick.x);
            const spd = (tag === 'outer' ? 210 : 185) * vm;
            pick.vx = Math.cos(a) * spd;
            pick.vy = Math.sin(a) * spd;
            pick.rot = a;
            this.battle.audio.playSfx('smallswing', { volume: 0.25, minGapMs: 85 });
          }
        }
      }
    }

    // C2. Chaos Crossfire Scythes (Orbiting + Telegraphed Horizontal & Vertical Red Scythes)
    else if (p === 'chaos_cross_scythes') {
      st.redTimer -= dt;
      if (st.redTimer <= 0 && this.elapsed < this.duration - 1.2) {
        st.redTimer = 1.38;
        st.redCount++;
        const vertical = st.redCount % 2 === 0;
        if (vertical) {
          const tx = clamp(this.soul.x, this.box.x + 28, this.box.x + this.box.w - 28);
          this.warnings.push({
            x1: tx, y1: this.box.y, x2: tx, y2: this.box.y + this.box.h,
            life: 0.42, maxLife: 0.42,
            onFinish: () => {
              this.battle.audio.playSfx('scytheburst', { volume: 0.72 });
              this.bullets.push({
                type: 'linear',
                sprite: 'scythe_spin',
                tint: '#ff2244',
                x: tx, y: this.box.y - 75,
                vx: 0, vy: 325 * vm,
                r: 18, scale: 1.38, rot: 0, spinSpeed: 14,
                persistent: true, dmgMult: 1.2, grazed: false, grazeCd: 0,
              });
            },
          });
        } else {
          const ty = clamp(this.soul.y, this.box.y + 28, this.box.y + this.box.h - 28);
          const fromLeft = Math.random() < 0.5;
          this.warnings.push({
            x1: this.box.x, y1: ty, x2: this.box.x + this.box.w, y2: ty,
            life: 0.42, maxLife: 0.42,
            onFinish: () => {
              this.battle.audio.playSfx('scytheburst', { volume: 0.72 });
              this.bullets.push({
                type: 'linear',
                sprite: 'scythe_spin',
                tint: '#ff2244',
                x: fromLeft ? this.box.x - 75 : this.box.x + this.box.w + 75, y: ty,
                vx: (fromLeft ? 1 : -1) * 325 * vm, vy: 0,
                r: 18, scale: 1.38, rot: 0, spinSpeed: 14,
                persistent: true, dmgMult: 1.2, grazed: false, grazeCd: 0,
              });
            },
          });
        }
      }
    }

    // C3. Hyper Carousel Stampede (4-row opposing directions + crimson ducks)
    else if (p === 'chaos_stampede') {
      st.timer -= dt;
      if (st.timer <= 0 && this.elapsed < this.duration - 1.1) {
        st.timer = 0.58;
        st.step++;
        const rows = [this.box.y + 20, this.box.y + 56, this.box.y + 94, this.box.y + 132];
        for (let r = 0; r < rows.length; r++) {
          const rev = r % 2 === 1;
          const isCrimson = (st.step + r) % 3 === 0;
          this.bullets.push({
            type: 'carousel',
            sprite: isCrimson ? 'carousel_duck_everyman' : rev ? 'carousel_duck' : 'carousel_horse',
            tint: isCrimson ? '#ff4477' : null,
            x: rev ? 530 : 110,
            y: rows[r],
            baseY: rows[r],
            vx: (rev ? -1 : 1) * (isCrimson ? 165 : 142) * vm,
            bobAmp: 14,
            bobFreq: 2.9 * vm,
            bobPhase: r * 1.3,
            useSkew: false,
            r: 12,
            scale: 0.96,
            scaleX: rev ? -0.96 : 0.96,
            depthAlpha: 0.3,
            persistent: true,
            grazed: false,
            grazeCd: 0,
          });
        }
      }
    }

    // C4. Suit Storm Barrage (Clubs + Rising Diamonds + Heart Bombs combined!)
    else if (p === 'chaos_suit_storm') {
      st.timer -= dt;
      st.subTimer = (st.subTimer || 0) - dt;
      if (st.timer <= 0 && this.elapsed < this.duration - 1.2) {
        st.timer = 1.05;
        st.step++;
        this._spawnBomb(st.step % 2 === 0 ? 'heart' : 'spade', mode);
        // Corner club turret
        const tx = st.step % 2 === 0 ? this.box.x - 24 : this.box.x + this.box.w + 24;
        const ty = this.box.y + 28 + Math.random() * (this.box.h - 56);
        this.bullets.push({
          type: 'club_turret',
          sprite: 'bullet_club_w',
          x: tx, y: ty, r: 10, scale: 0.9, burstsLeft: 2, fireTimer: 0.25, noHit: true, grazed: false, grazeCd: 0,
        });
      }
      if (st.subTimer <= 0 && this.elapsed < this.duration - 0.8) {
        st.subTimer = 0.34;
        const x = this.box.x + 14 + Math.random() * (this.box.w - 28);
        this.bullets.push({
          type: 'linear',
          sprite: 'bullet_diamond_v',
          x, y: this.box.y + this.box.h + 40,
          vx: 0, vy: -225 * vm, r: 6, scale: 0.76, grazed: false, grazeCd: 0,
        });
      }
    }

    // C5. TRUE NEO FINAL CHAOS!
    else if (p === 'chaos_true_neo_final') {
      const t = this.elapsed;
      if (t < 6.8) {
        st.timer -= dt;
        if (st.timer <= 0) {
          st.timer = 0.33;
          const x = this.box.x + 34 + Math.random() * (this.box.w - 68);
          const vx = (Math.random() - 0.5) * 95;
          this._spawnGiantKnife(x, -64, vx, 315 * vm, 1.38, 28, Math.random() < 0.35 ? '#ff3366' : null);
        }
      } else if (t < 10.6) {
        if (st.step === 0 && t >= 7.0) {
          st.step = 1;
          for (const ox of [65, 220, 420, 575]) {
            this._spawnGiantKnife(ox, -70, 0, 330 * vm, 1.4, 30, '#ff3366');
          }
        } else if (st.step === 1 && t >= 8.0) {
          st.step = 2;
          for (const ox of [140, 320, 500]) {
            this._spawnGiantKnife(ox, -70, 0, 345 * vm, 1.5, 34, null);
          }
        } else if (st.step === 2 && t >= 9.0) {
          st.step = 3;
          this._spawnGiantKnife(this.box.x + 60, -70, 80, 330 * vm, 1.5, 34, '#ff3366');
          this._spawnGiantKnife(this.box.x + this.box.w - 60, -70, -80, 330 * vm, 1.5, 34, '#ff3366');
        }
      } else if (!st.colossusSpawned && t >= 10.8) {
        st.colossusSpawned = true;
        this.battle.audio.playVoice('neo_chaos');
        this.battle.audio.playSfx('rumble', { volume: 0.95 });
        this.bullets.push({
          type: 'giant_knife',
          isFinalColossus: true,
          sprite: 'scythe_giant',
          tint: '#ff3366',
          x: 320,
          y: -150,
          vx: 0,
          vy: 280,
          r: 78,
          scale: 3.6,
          rot: Math.PI / 2,
          persistent: true,
          damageAll: true,
          dmgMult: 1.45,
          grazed: false,
          grazeCd: 0,
        });
      }
    }
  }

  _spawnGiantKnife(x, y, vx, vy, scale, beamHalfW, tint = null) {
    this.bullets.push({
      type: 'giant_knife',
      sprite: 'scythe_giant',
      tint,
      x,
      y,
      vx,
      vy,
      gravity: 140,
      r: 22 * scale * 0.65,
      scale,
      beamHalfW,
      rot: Math.PI / 2 - Math.atan2(vx, vy) * 0.5,
      persistent: true,
      damageAll: true,
      dmgMult: 1.15,
      grazed: false,
      grazeCd: 0,
    });
  }

  draw(ctx, assets, settings) {
    if (!this.active) return;

    // 1. Battle Box Interior + Crisp Green Border (Deltarune Signature!)
    const { x, y, w, h } = this.box;
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.strokeStyle = this.battle.modeCfg.id === 'chaos' && (this.patternId.startsWith('chaos_') || this.patternId === 'final_chaos')
      ? '#00e866'
      : '#00c800';
    ctx.lineWidth = 4;
    ctx.strokeRect(Math.round(x) - 2, Math.round(y) - 2, Math.round(w) + 4, Math.round(h) + 4);
    ctx.restore();

    // 2. Teleporting Jevil Clones
    for (const c of this.clones) {
      const f = Math.floor(c.frameTimer * 10) % 4;
      const alpha = clamp(c.life / 0.25, 0, 1);
      assets.draw(ctx, 'jevil_teleport', f, c.x, c.y, { scale: 2, flipX: c.flipX, alpha });
    }

    // 3. Telegraph warning beams (Chaos Crossfire Scythes)
    for (const wn of this.warnings) {
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(wn.life * 28));
      ctx.save();
      ctx.strokeStyle = `rgba(255, 50, 90, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(wn.x1, wn.y1);
      ctx.lineTo(wn.x2, wn.y2);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Vertical Light Pillars (Final Chaos)
    for (const bm of this.beams) {
      const ratio = clamp(bm.life / bm.maxLife, 0, 1);
      const halfW = bm.halfW * (0.4 + 0.6 * ratio);
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${ratio * 0.92})`;
      ctx.fillRect(Math.round(bm.x - halfW), Math.round(y), Math.round(halfW * 2), Math.round(h));
      ctx.fillStyle = `rgba(180, 230, 255, ${ratio * 0.45})`;
      ctx.fillRect(Math.round(bm.x - halfW * 1.45), Math.round(y), Math.round(halfW * 2.9), Math.round(h));
      ctx.restore();
    }

    // 5. Graze Ring around SOUL (Authentic Deltarune white heart-outline graze aura!)
    const showGraze = this.soul.grazeFlash > 0.05;
    if (showGraze) {
      ctx.save();
      ctx.translate(Math.round(this.soul.x), Math.round(this.soul.y));
      ctx.strokeStyle = `rgba(255, 255, 255, ${this.soul.grazeFlash * 0.95})`;
      ctx.lineWidth = 2;
      // Pixelated heart-shaped outer ring matching image-5.png!
      ctx.beginPath();
      const s = 1.15;
      ctx.moveTo(0, -14 * s);
      ctx.lineTo(10 * s, -22 * s);
      ctx.lineTo(22 * s, -12 * s);
      ctx.lineTo(22 * s, 4 * s);
      ctx.lineTo(0, 24 * s);
      ctx.lineTo(-22 * s, 4 * s);
      ctx.lineTo(-22 * s, -12 * s);
      ctx.lineTo(-10 * s, -22 * s);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // 6. Red SOUL Sprite
    const blinkHide = this.soul.invuln > 0 && Math.floor(this.soul.invuln * 18) % 2 === 0;
    if (!blinkHide) {
      assets.draw(ctx, 'soul_red', 0, this.soul.x, this.soul.y, { scale: 1 });
    }

    // Optional hitbox visualization from Settings
    if (settings.showHitbox) {
      ctx.save();
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.soul.x, this.soul.y, this.soul.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,0,0.45)';
      ctx.beginPath();
      ctx.arc(this.soul.x, this.soul.y, this.soul.grazeR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 7. Bullets!
    for (const b of this.bullets) {
      let frame = b.frame || 0;
      if (b.type === 'bomb') {
        const light = Math.floor(b.flashTimer || 0) % 2 === 1;
        frame = b.suitIdx + (light ? 4 : 0);
      }
      const alpha = b.depthAlpha !== undefined ? b.depthAlpha : b.alpha !== undefined ? b.alpha : 1;
      const sx = b.scaleX !== undefined ? Math.abs(b.scaleX) : b.scale || 1;
      const sy = b.scale || 1;
      const flipX = b.scaleX !== undefined && b.scaleX < 0;
      assets.draw(ctx, b.sprite, frame, b.x, b.y, {
        scaleX: sx,
        scaleY: sy,
        flipX,
        rotation: b.rot || 0,
        alpha,
        tint: b.tint || null,
      });

      if (settings.showHitbox && !b.noHit) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}
