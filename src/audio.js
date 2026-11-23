const MUSIC_TRACKS = {
  menu: 'assets/audio/the_circus.mp3',
  normal: 'assets/audio/the_world_revolving.mp3',
  chaos: 'assets/audio/the_world_revolving_remix.mp3',
};

const SFX_FILES = {
  menumove: 'assets/sfx/snd_menumove.wav',
  select: 'assets/sfx/snd_select.wav',
  cantselect: 'assets/sfx/snd_cantselect.wav',
  swing: 'assets/sfx/snd_swing.wav',
  heavyswing: 'assets/sfx/snd_heavyswing.wav',
  smallswing: 'assets/sfx/snd_smallswing.wav',
  criticalswing: 'assets/sfx/snd_criticalswing.wav',
  bigcut: 'assets/sfx/snd_bigcut.wav',
  damage: 'assets/sfx/snd_damage.wav',
  ehurt: 'assets/sfx/snd_ehurt1.wav',
  hurt: 'assets/sfx/snd_hurt1.wav',
  hit: 'assets/sfx/snd_hit.wav',
  graze: 'assets/sfx/snd_graze.wav',
  power: 'assets/sfx/snd_power.wav',
  swallow: 'assets/sfx/snd_swallow.wav',
  pirouette: 'assets/sfx/snd_pirouette.wav',
  hypnosis: 'assets/sfx/snd_hypnosis.wav',
  pacify: 'assets/sfx/snd_pacify.wav',
  rudebuster_swing: 'assets/sfx/snd_rudebuster_swing.wav',
  rudebuster_hit: 'assets/sfx/snd_rudebuster_hit.wav',
  bombfall: 'assets/sfx/snd_bombfall.wav',
  bomb: 'assets/sfx/snd_bomb.wav',
  scytheburst: 'assets/sfx/snd_scytheburst.wav',
  badexplosion: 'assets/sfx/snd_badexplosion.wav',
  birdtweet: 'assets/sfx/snd_birdtweet.wav',
  awkward: 'assets/sfx/snd_awkward.wav',
  bell: 'assets/sfx/snd_bell.wav',
  boost: 'assets/sfx/snd_boost.wav',
  applause: 'assets/sfx/snd_applause.wav',
  txtjok: 'assets/sfx/snd_txtjok.wav',
  txtsus: 'assets/sfx/snd_txtsus.wav',
  txtral: 'assets/sfx/snd_txtral.wav',
  text: 'assets/sfx/snd_text.wav',
  break1: 'assets/sfx/snd_break1.wav',
  break2: 'assets/sfx/snd_break2.wav',
  battleenter: 'assets/sfx/snd_battleenter.wav',
  won: 'assets/sfx/snd_won.wav',
  spare: 'assets/sfx/snd_spare.wav',
  screenshake: 'assets/sfx/snd_screenshake.wav',
  rumble: 'assets/sfx/snd_rumble.wav',
  spellcast: 'assets/sfx/snd_spellcast.wav',
  weaponpull: 'assets/sfx/snd_weaponpull.wav',
  tensionhorn: 'assets/sfx/snd_tensionhorn.wav',
  noise: 'assets/sfx/snd_noise.wav',
  shineselect: 'assets/sfx/snd_shineselect.wav',
  orchhit: 'assets/sfx/snd_orchhit.wav',
  dooropen: 'assets/sfx/snd_dooropen.wav',
  revival: 'assets/sfx/snd_revival.ogg',
  great_shine: 'assets/sfx/snd_great_shine.ogg',

  // Jevil Voice Clips
  voice_anything: 'assets/sfx/Jevil_voiceclip_ANYTHING.wav',
  voice_byebye: 'assets/sfx/Jevil_voiceclip_BYE-BYE.wav',
  voice_chaos: 'assets/sfx/Jevil_voiceclip_CHAOS.wav',
  voice_metamorphosis: 'assets/sfx/Jevil_voiceclip_METAMORPHOSIS.wav',
  voice_neo_chaos: 'assets/sfx/Jevil_voiceclip_NEO_CHAOS.wav',
  voice_oh: 'assets/sfx/Jevil_voiceclip_OH.wav',
  voice_laugh0: 'assets/sfx/snd_joker_laugh0.wav',
  voice_laugh1: 'assets/sfx/snd_joker_laugh1.wav',
  voice_ha0: 'assets/sfx/snd_joker_ha0.wav',
  voice_ha1: 'assets/sfx/snd_joker_ha1.wav',
};

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.muted = false;
    this.ctx = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.musicEls = {};
    this.currentTrackKey = null;
    this.pendingTrackKey = null;
    this.unlocked = false;
    this.lastPlayed = new Map();

    // Prepare HTMLAudioElements for seamless streaming/looping MP3 music
    for (const [k, src] of Object.entries(MUSIC_TRACKS)) {
      const el = new Audio(src);
      el.loop = true;
      el.preload = 'auto';
      this.musicEls[k] = el;
    }
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.unlocked = true;
    if (this.pendingTrackKey) {
      const key = this.pendingTrackKey;
      this.pendingTrackKey = null;
      this.playMusic(key, true);
    }
    // Preload core battle SFX lazily once unlocked
    this.preloadCoreSfx();
  }

  async preloadCoreSfx() {
    if (!this.ctx) return;
    const priority = [
      'menumove', 'select', 'cantselect', 'swing', 'damage', 'ehurt', 'hurt',
      'graze', 'power', 'swallow', 'txtjok', 'text', 'txtsus', 'txtral',
      'pirouette', 'hypnosis', 'pacify', 'rudebuster_swing', 'rudebuster_hit',
      'bombfall', 'bomb', 'scytheburst', 'voice_chaos', 'voice_anything',
      'voice_metamorphosis', 'voice_byebye', 'voice_neo_chaos', 'voice_oh',
      'voice_laugh0', 'voice_laugh1', 'voice_ha0', 'voice_ha1',
    ];
    for (const key of priority) {
      this._loadBuffer(key);
    }
  }

  async _loadBuffer(key) {
    if (this.buffers.has(key)) return this.buffers.get(key);
    if (this.loading.has(key)) return this.loading.get(key);
    const url = SFX_FILES[key];
    if (!url || !this.ctx) return null;

    const p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => this.ctx.decodeAudioData(ab))
      .then((buf) => {
        this.buffers.set(key, buf);
        this.loading.delete(key);
        return buf;
      })
      .catch(() => {
        this.loading.delete(key);
        return null;
      });
    this.loading.set(key, p);
    return p;
  }

  updateVolumes() {
    const master = this.muted ? 0 : this.settings.masterVolume;
    const musicVol = Math.max(0, Math.min(1, master * this.settings.musicVolume));
    for (const el of Object.values(this.musicEls)) {
      el.volume = musicVol;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.updateVolumes();
    return this.muted;
  }

  playMusic(key, restart = false) {
    if (!this.musicEls[key]) return;
    if (this.currentTrackKey === key && !restart) {
      const el = this.musicEls[key];
      this.updateVolumes();
      if (el.paused) {
        el.play().catch(() => {
          this.pendingTrackKey = key;
        });
      }
      return;
    }

    this.stopMusic();
    this.currentTrackKey = key;
    const el = this.musicEls[key];
    el.currentTime = 0;
    this.updateVolumes();
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        this.pendingTrackKey = key;
      });
    }
  }

  pauseMusic() {
    if (this.currentTrackKey && this.musicEls[this.currentTrackKey]) {
      this.musicEls[this.currentTrackKey].pause();
    }
  }

  resumeMusic() {
    if (this.currentTrackKey && this.musicEls[this.currentTrackKey]) {
      this.updateVolumes();
      this.musicEls[this.currentTrackKey].play().catch(() => {});
    }
  }

  stopMusic() {
    for (const el of Object.values(this.musicEls)) {
      el.pause();
      el.currentTime = 0;
    }
    this.currentTrackKey = null;
  }

  playSfx(key, opts = {}) {
    if (this.muted) return;
    const master = this.settings.masterVolume;
    const vol = Math.max(0, Math.min(1, master * this.settings.sfxVolume * (opts.volume ?? 1)));
    if (vol <= 0.001) return;

    // Throttle ultra-rapid identical sounds (like graze or text blips)
    const minGap = opts.minGapMs ?? 30;
    const now = performance.now();
    const prev = this.lastPlayed.get(key) || 0;
    if (now - prev < minGap) return;
    this.lastPlayed.set(key, now);

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const playBuf = (buf) => {
      if (!buf || !this.ctx) return;
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        if (opts.rate) src.playbackRate.value = opts.rate;
        const gain = this.ctx.createGain();
        gain.gain.value = vol;
        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(0);
      } catch {}
    };

    const cached = this.buffers.get(key);
    if (cached) {
      playBuf(cached);
    } else {
      this._loadBuffer(key).then((buf) => {
        if (buf) playBuf(buf);
      });
    }
  }

  playVoice(voiceId) {
    if (!this.settings.voiceClips) return;
    const key = `voice_${voiceId}`;
    if (SFX_FILES[key]) {
      this.playSfx(key, { volume: 1.0, minGapMs: 120 });
    }
  }
}
