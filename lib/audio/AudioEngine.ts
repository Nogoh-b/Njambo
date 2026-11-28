"use client";

/* ═══════════════ Moteur Audio Pro NJAMBO (WebAudio API) ═══════════════
   Architecture de mixage studio conçue pour le web et mobile :
     [SFX Voices] ──► (gain + pan) ──► sfxBus ────────────────────┐
                                                                  ├──► masterBus ──► DynamicsCompressor ──► destination
     [Music A/B]  ──► (fade gain)  ──► musicDuck ──► musicBus ────┘

   Fonctionnalités :
   - Bus séparés Musique / Effets sonores avec volumes fluides sans clic.
   - Compresseur / limiteur doux sur le bus Master : son clair, fort et audible
     sans jamais saturer quand plusieurs effets se superposent.
   - Lecteur musical en boucle sample-accurate (zéro trou entre deux boucles)
     avec crossfade fluide lors des changements de scène (Salon ↔ Table).
   - Ducking musical automatique lors des fanfares, victoires et cartes pouvoir.
   - Anti-robotique sur les SFX : variation subtile de pitch (pitchJitter),
     anti-spam (minGapMs), plafond de polyphonie et zéro latence après préchargement.
   - Gestion propre du cycle de vie mobile : déverrouillage au premier geste et
     mise en pause douce quand l'onglet passe en arrière-plan. */

export type AudioBus = "sfx" | "music";

export interface SfxPlayOptions {
  /** URL du fichier audio (MP3 / OGG / WAV / M4A). */
  url: string;
  /** Variantes aléatoires (évite de rejouer deux fois de suite la même variante). */
  pool?: readonly string[];
  /** Volume relatif (0..1.5, défaut 1). */
  volume?: number;
  /** Variation aléatoire de hauteur ±pitchJitter (ex. 0.045 = ±4,5 %). */
  pitchJitter?: number;
  /** Panoramique stéréo (-1 gauche .. +1 droite, défaut 0). */
  pan?: number;
  /** Intervalle minimal entre deux déclenchements identiques (ms). */
  minGapMs?: number;
  /** Nombre max d'instances simultanées pour cette URL (défaut 5). */
  maxPolyphony?: number;
  /** Si > 0, abaisse temporairement la musique pendant cette durée (ms). */
  duckMusicMs?: number;
  /** Facteur de gain de la musique pendant le ducking (défaut 0.36 ≈ -9 dB). */
  duckDepth?: number;
  /** Délai max acceptable si le fichier n'était pas encore en cache (ms, défaut 450). */
  maxLoadDelayMs?: number;
}

export interface MusicPlayOptions {
  /** Volume propre à la piste (0..1, défaut 0.8). */
  volume?: number;
  /** Durée du fondu enchaîné (crossfade) en ms (défaut 1200). */
  crossfadeMs?: number;
}

interface ActiveMusicTrack {
  url: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  baseVolume: number;
}

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const DEFAULT_DUCK_DEPTH = 0.36;
const MIN_GAIN = 0.0001;

class NjamboAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicDuck: GainNode | null = null;

  private sfxMuted = false;
  private musicMuted = false;
  private sfxVolume = 0.9;
  private musicVolume = 0.55;
  private pageHidden = false;
  private unlocked = false;
  private lifecycleBound = false;

  /** Cache mémoire des buffers décodés (promesses dédoublonnées). */
  private decodedCache = new Map<string, AudioBuffer>();
  private loadingCache = new Map<string, Promise<AudioBuffer | null>>();
  private rawBytesCache = new Map<string, Promise<ArrayBuffer | null>>();

  /** Suivi anti-spam, polyphonie et dernière variante jouée par clé. */
  private lastPlayedAt = new Map<string, number>();
  private lastPoolIndex = new Map<string, number>();
  private activeVoices = new Map<string, ActiveVoice[]>();

  /** Musique souhaitée et piste actuellement en lecture. */
  private desiredMusic: { url: string; options: Required<MusicPlayOptions> } | null = null;
  private activeMusic: ActiveMusicTrack | null = null;
  private musicStartToken = 0;

  /** Ducking temporaire de la musique. */
  private duckReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  private duckUntilMs = 0;

  /** Initialise les écouteurs globaux (déverrouillage + mise en veille onglet). */
  bindLifecycle(): void {
    if (this.lifecycleBound || typeof window === "undefined") return;
    this.lifecycleBound = true;

    const tryUnlock = () => {
      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state === "running") {
        this.onUnlocked();
        return;
      }
      void ctx.resume().then(() => {
        if (ctx.state === "running") this.onUnlocked();
      }).catch(() => {});
    };

    const events = ["pointerdown", "touchstart", "keydown"] as const;
    const handler = () => {
      tryUnlock();
      if (this.unlocked) {
        for (const ev of events) window.removeEventListener(ev, handler);
      }
    };
    for (const ev of events) {
      window.addEventListener(ev, handler, { passive: true });
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        this.handleVisibilityChange(document.hidden);
      });
    }
  }

  private onUnlocked(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    // Si une musique était demandée avant le premier geste, on la lance en douceur.
    if (this.desiredMusic && !this.musicMuted && !this.pageHidden) {
      void this.syncMusicPlayback(700);
    }
  }

  private handleVisibilityChange(hidden: boolean): void {
    this.pageHidden = hidden;
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      if (hidden) {
        master.gain.setTargetAtTime(MIN_GAIN, now, 0.06);
        setTimeout(() => {
          if (this.pageHidden && this.ctx?.state === "running") {
            void this.ctx.suspend().catch(() => {});
          }
        }, 240);
      } else {
        if (this.unlocked && ctx.state === "suspended") {
          void ctx.resume().catch(() => {});
        }
        master.gain.setTargetAtTime(1, now, 0.12);
        if (this.desiredMusic && !this.musicMuted && !this.activeMusic) {
          void this.syncMusicPlayback(600);
        }
      }
    } catch {
      // Ignorer les transitions d'état navigateur
    }
  }

  /** Crée ou renvoie l'AudioContext + graphe de mixage complet. */
  ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        const ctx = new Ctor();
        const master = ctx.createGain();
        const sfxBus = ctx.createGain();
        const musicBus = ctx.createGain();
        const musicDuck = ctx.createGain();

        master.gain.value = this.pageHidden ? MIN_GAIN : 1;
        sfxBus.gain.value = this.sfxMuted ? 0 : this.sfxVolume;
        musicBus.gain.value = this.musicMuted ? 0 : this.musicVolume;
        musicDuck.gain.value = 1;

        sfxBus.connect(master);
        musicDuck.connect(musicBus);
        musicBus.connect(master);

        // Compresseur / limiteur doux sur le Master : son fort, clair, zéro saturation.
        if (typeof ctx.createDynamicsCompressor === "function") {
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -14;
          comp.knee.value = 18;
          comp.ratio.value = 4;
          comp.attack.value = 0.003;
          comp.release.value = 0.16;
          master.connect(comp);
          comp.connect(ctx.destination);
          this.compressor = comp;
        } else {
          master.connect(ctx.destination);
        }

        this.ctx = ctx;
        this.masterGain = master;
        this.sfxBus = sfxBus;
        this.musicBus = musicBus;
        this.musicDuck = musicDuck;
        if (ctx.state === "running") this.unlocked = true;
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended" && !this.pageHidden) {
      void this.ctx.resume().then(() => {
        if (this.ctx?.state === "running") this.onUnlocked();
      }).catch(() => {});
    }
    return this.ctx;
  }

  getSfxOutput(): { ctx: AudioContext; bus: GainNode } | null {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxBus) return null;
    return { ctx, bus: this.sfxBus };
  }

  getMusicOutput(): { ctx: AudioContext; bus: GainNode } | null {
    const ctx = this.ensureContext();
    if (!ctx || !this.musicDuck) return null;
    return { ctx, bus: this.musicDuck };
  }

  isMuted(bus: AudioBus): boolean {
    return bus === "sfx" ? this.sfxMuted : this.musicMuted;
  }

  getVolume(bus: AudioBus): number {
    return bus === "sfx" ? this.sfxVolume : this.musicVolume;
  }

  setMuted(bus: AudioBus, muted: boolean): void {
    if (bus === "sfx") {
      this.sfxMuted = muted;
      this.applyBusGain(this.sfxBus, muted ? 0 : this.sfxVolume, 0.02);
    } else {
      const wasMuted = this.musicMuted;
      this.musicMuted = muted;
      this.applyBusGain(this.musicBus, muted ? 0 : this.musicVolume, 0.08);
      if (muted && this.activeMusic) {
        this.fadeOutAndStopTrack(this.activeMusic, 320);
        this.activeMusic = null;
      } else if (!muted && wasMuted && this.desiredMusic && !this.pageHidden) {
        void this.syncMusicPlayback(500);
      }
    }
  }

  setVolume(bus: AudioBus, volume: number): void {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
    if (bus === "sfx") {
      this.sfxVolume = clamped;
      if (!this.sfxMuted) this.applyBusGain(this.sfxBus, clamped, 0.025);
    } else {
      this.musicVolume = clamped;
      if (!this.musicMuted) this.applyBusGain(this.musicBus, clamped, 0.04);
    }
  }

  private applyBusGain(node: GainNode | null, target: number, timeConstant: number): void {
    if (!node || !this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(Math.max(0, target), now, timeConstant);
    } catch {
      node.gain.value = Math.max(0, target);
    }
  }

  /* ── Chargement & décodage des fichiers audio ── */

  private fetchBytes(url: string): Promise<ArrayBuffer | null> {
    let pending = this.rawBytesCache.get(url);
    if (!pending) {
      const isLocal = url.startsWith("/");
      pending = fetch(url, isLocal ? { credentials: "same-origin" } : { mode: "cors", credentials: "omit" })
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .catch(() => null);
      this.rawBytesCache.set(url, pending);
      void pending.then((buf) => {
        if (!buf) this.rawBytesCache.delete(url);
      });
    }
    return pending;
  }

  async preloadSample(url: string): Promise<boolean> {
    if (typeof window === "undefined" || !url) return false;
    if (this.decodedCache.has(url)) return true;

    let pending = this.loadingCache.get(url);
    if (!pending) {
      pending = (async () => {
        const bytes = await this.fetchBytes(url);
        if (!bytes) return null;
        const ctx = this.ensureContext();
        if (!ctx) return null;
        try {
          // Copie du buffer : decodeAudioData détache l'ArrayBuffer fourni.
          const decoded = await ctx.decodeAudioData(bytes.slice(0));
          this.decodedCache.set(url, decoded);
          // Libère la copie brute une fois décodée en RAM.
          this.rawBytesCache.delete(url);
          return decoded;
        } catch {
          return null;
        }
      })();
      this.loadingCache.set(url, pending);
      void pending.then((buf) => {
        if (!buf) this.loadingCache.delete(url);
      });
    }
    return Boolean(await pending);
  }

  /* ── Ducking musical ── */

  duckMusic(durationMs: number, depth = DEFAULT_DUCK_DEPTH): void {
    if (durationMs <= 0 || this.musicMuted || !this.ctx || !this.musicDuck) return;
    const now = this.ctx.currentTime;
    const targetDepth = Math.max(0.15, Math.min(1, depth));
    try {
      this.musicDuck.gain.cancelScheduledValues(now);
      this.musicDuck.gain.setTargetAtTime(targetDepth, now, 0.045);
    } catch {
      this.musicDuck.gain.value = targetDepth;
    }

    const releaseAt = Date.now() + durationMs;
    if (releaseAt > this.duckUntilMs) this.duckUntilMs = releaseAt;
    if (this.duckReleaseTimer) clearTimeout(this.duckReleaseTimer);
    this.duckReleaseTimer = setTimeout(() => {
      this.duckReleaseTimer = null;
      this.duckUntilMs = 0;
      if (!this.ctx || !this.musicDuck) return;
      const t = this.ctx.currentTime;
      try {
        this.musicDuck.gain.cancelScheduledValues(t);
        this.musicDuck.gain.setTargetAtTime(1, t, 0.24);
      } catch {
        this.musicDuck.gain.value = 1;
      }
    }, Math.max(60, this.duckUntilMs - Date.now()));
  }

  /* ── Lecture d'effets sonores (SFX) ── */

  playSfx(options: SfxPlayOptions): Promise<boolean> {
    if (typeof window === "undefined" || this.sfxMuted || this.pageHidden || !options.url) {
      return Promise.resolve(false);
    }

    const rateKey = options.url;
    const nowMs = performance.now();
    const minGap = options.minGapMs ?? 0;
    if (minGap > 0) {
      const prev = this.lastPlayedAt.get(rateKey) ?? 0;
      if (nowMs - prev < minGap) return Promise.resolve(false);
    }
    this.lastPlayedAt.set(rateKey, nowMs);

    let chosenUrl = options.url;
    if (options.pool && options.pool.length > 1) {
      const lastIdx = this.lastPoolIndex.get(rateKey) ?? -1;
      let nextIdx = Math.floor(Math.random() * options.pool.length);
      if (nextIdx === lastIdx) nextIdx = (nextIdx + 1) % options.pool.length;
      this.lastPoolIndex.set(rateKey, nextIdx);
      chosenUrl = options.pool[nextIdx]!;
    }
    const resolvedOptions: SfxPlayOptions = chosenUrl === options.url ? options : { ...options, url: chosenUrl };

    const cached = this.decodedCache.get(chosenUrl);
    if (cached) {
      return Promise.resolve(this.triggerBuffer(cached, resolvedOptions));
    }

    const requestedAt = nowMs;
    const maxDelay = options.maxLoadDelayMs ?? 450;
    return this.preloadSample(chosenUrl).then((ok) => {
      if (!ok || this.sfxMuted || this.pageHidden) return false;
      if (performance.now() - requestedAt > maxDelay) return false;
      const buffer = this.decodedCache.get(chosenUrl);
      if (!buffer) return false;
      return this.triggerBuffer(buffer, resolvedOptions);
    });
  }

  private triggerBuffer(buffer: AudioBuffer, options: SfxPlayOptions): boolean {
    const out = this.getSfxOutput();
    if (!out) return false;
    const { ctx, bus } = out;

    const maxPoly = options.maxPolyphony ?? 5;
    const list = this.activeVoices.get(options.url) ?? [];
    while (list.length >= maxPoly) {
      const oldest = list.shift();
      if (oldest) this.stopVoiceSoftly(oldest, ctx);
    }

    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const jitter = options.pitchJitter ?? 0;
      if (jitter > 0) {
        source.playbackRate.value = Math.max(0.5, 1 + (Math.random() * 2 - 1) * jitter);
      }

      const gain = ctx.createGain();
      const vol = Math.max(0, Math.min(1.5, options.volume ?? 1));
      gain.gain.value = vol;

      source.connect(gain);
      const pan = options.pan ?? 0;
      if (pan !== 0 && typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        gain.connect(panner);
        panner.connect(bus);
      } else {
        gain.connect(bus);
      }

      const voice: ActiveVoice = { source, gain };
      list.push(voice);
      this.activeVoices.set(options.url, list);

      source.onended = () => {
        const current = this.activeVoices.get(options.url);
        if (!current) return;
        const idx = current.indexOf(voice);
        if (idx >= 0) current.splice(idx, 1);
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          // Déjà déconnecté
        }
      };

      if (options.duckMusicMs && options.duckMusicMs > 0) {
        this.duckMusic(options.duckMusicMs, options.duckDepth ?? DEFAULT_DUCK_DEPTH);
      }

      source.start(0);
      return true;
    } catch {
      return false;
    }
  }

  private stopVoiceSoftly(voice: ActiveVoice, ctx: AudioContext): void {
    try {
      const now = ctx.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(MIN_GAIN, now, 0.015);
      voice.source.stop(now + 0.06);
    } catch {
      // Déjà arrêté
    }
  }

  /* ── Lecteur de musique en boucle avec crossfade ── */

  playMusic(url: string, options: MusicPlayOptions = {}): void {
    if (typeof window === "undefined" || !url) return;
    const resolved: Required<MusicPlayOptions> = {
      volume: Math.max(0, Math.min(1.5, options.volume ?? 0.8)),
      crossfadeMs: Math.max(150, options.crossfadeMs ?? 1200),
    };
    const sameTrack = this.desiredMusic?.url === url;
    this.desiredMusic = { url, options: resolved };

    // Précharge toujours la piste pour une transition instantanée dès que possible.
    void this.preloadSample(url);

    if (this.musicMuted || this.pageHidden) return;
    if (sameTrack && this.activeMusic?.url === url) {
      if (Math.abs(this.activeMusic.baseVolume - resolved.volume) > 0.001) {
        this.activeMusic.baseVolume = resolved.volume;
        this.applyBusGain(this.activeMusic.gain, Math.max(MIN_GAIN, resolved.volume), 0.12);
      }
      return;
    }
    void this.syncMusicPlayback(resolved.crossfadeMs);
  }

  stopMusic(fadeMs = 450): void {
    this.desiredMusic = null;
    this.musicStartToken += 1;
    if (this.activeMusic) {
      this.fadeOutAndStopTrack(this.activeMusic, fadeMs);
      this.activeMusic = null;
    }
  }

  private async syncMusicPlayback(fadeMs: number): Promise<void> {
    const wanted = this.desiredMusic;
    if (!wanted || this.musicMuted || this.pageHidden) return;

    const token = ++this.musicStartToken;
    const ok = await this.preloadSample(wanted.url);
    if (!ok || token !== this.musicStartToken || this.musicMuted || this.pageHidden) return;
    if (this.desiredMusic?.url !== wanted.url) return;

    const out = this.getMusicOutput();
    const buffer = this.decodedCache.get(wanted.url);
    if (!out || !buffer) return;
    const { ctx, bus } = out;

    // Si le navigateur n'a pas encore autorisé l'audio, on attend le premier geste (onUnlocked relancera).
    if (ctx.state === "suspended" && !this.unlocked) return;

    if (this.activeMusic?.url === wanted.url) return;

    const previous = this.activeMusic;
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const fadeSec = Math.max(0.15, fadeMs / 1000);
      gain.gain.setValueAtTime(MIN_GAIN, now);
      gain.gain.linearRampToValueAtTime(wanted.options.volume, now + fadeSec);

      source.connect(gain);
      gain.connect(bus);
      source.start(0);

      this.activeMusic = { url: wanted.url, source, gain, baseVolume: wanted.options.volume };
      if (previous) {
        this.fadeOutAndStopTrack(previous, fadeMs * 0.9);
      }
    } catch {
      // Contexte non encore déverrouillé
    }
  }

  private fadeOutAndStopTrack(track: ActiveMusicTrack, fadeMs: number): void {
    const ctx = this.ctx;
    if (!ctx) {
      try { track.source.stop(); } catch { /* noop */ }
      return;
    }
    try {
      const now = ctx.currentTime;
      const fadeSec = Math.max(0.08, fadeMs / 1000);
      track.gain.gain.cancelScheduledValues(now);
      track.gain.gain.setValueAtTime(Math.max(MIN_GAIN, track.gain.gain.value), now);
      track.gain.gain.linearRampToValueAtTime(MIN_GAIN, now + fadeSec);
      track.source.stop(now + fadeSec + 0.04);
      track.source.onended = () => {
        try {
          track.source.disconnect();
          track.gain.disconnect();
        } catch {
          // Déjà déconnecté
        }
      };
    } catch {
      // Déjà arrêté
    }
  }
}

export const audioEngine = new NjamboAudioEngine();
