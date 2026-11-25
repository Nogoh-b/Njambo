"""
Studio Audio Pack Builder pour NJAMBO.

1. Intègre DIRECTEMENT les 14 sons de référence fournis par l'utilisateur
   (qualité studio intacte, encodage MP3 192 kbps haute fidélité).
2. Complète UNIQUEMENT les emplacements manquants (musique de table, chrono,
   couronne, jackpot roue, et les 11 sons de cartes pouvoir) dans la MÊME
   direction sonore exacte :
     - Tonalité harmonisée : Do Majeur 9 / La Mineur 9 (Dm9 - G13 - Cmaj9 - Am9)
     - Tempo de référence  : 96 BPM (boucle 8 mesures = 20,00 s exactes)
     - Timbre signature    : Fender Rhodes Mark I velouté, cloches/célesta
       cristallines, foley cartes/pièces ultra-sec, percussions organiques
       propres et réverbération stéréo soyeuse — zéro souffle, zéro bip MIDI.
"""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, sosfiltfilt

ROOT = Path(__file__).resolve().parent.parent
OUT_ROOT = ROOT / "public" / "assets" / "njambo" / "audio"
REF_DIR = Path(
    r"C:\Users\k1000\.gemini\antigravity\brain\a369a51c-7d69-4666-a9b5-af827e851c43\.user_uploaded"
)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100


# ═══════════════════════ UTILITAIRES DSP STUDIO ═══════════════════════

def load_ref(idx: int) -> np.ndarray:
    """Charge un fichier de référence utilisateur en float32 stéréo 44,1 kHz."""
    path = REF_DIR / f"uploaded_media_{idx}_1795579961111.wav"
    sr, data = wavfile.read(str(path))
    assert sr == SR, f"Unexpected SR {sr}"
    arr = data.astype(np.float32) / 32768.0
    if arr.ndim == 1:
        arr = np.stack([arr, arr], axis=1)
    return arr


def encode_mp3(audio: np.ndarray, out_rel: str, bitrate: str = "192k", normalize_peak_db: float | None = None) -> Path:
    out_path = OUT_ROOT / out_rel
    out_path.parent.mkdir(parents=True, exist_ok=True)
    x = np.nan_to_num(np.asarray(audio, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    x = x - np.mean(x, axis=0, keepdims=True)
    if normalize_peak_db is not None:
        peak = float(np.max(np.abs(x)))
        if peak > 1e-6:
            target = 10.0 ** (normalize_peak_db / 20.0)
            x = x * (target / peak)
    # Soft clip de sécurité transparent
    x = np.clip(x, -0.98, 0.98)
    pcm = (x * 32767.0).astype(np.int16)
    tmp_wav = out_path.with_suffix(".tmp.wav")
    wavfile.write(str(tmp_wav), SR, pcm)
    try:
        subprocess.run(
            [
                FFMPEG, "-y", "-v", "error",
                "-i", str(tmp_wav),
                "-ar", str(SR), "-ac", "2",
                "-codec:a", "libmp3lame", "-b:a", bitrate,
                str(out_path),
            ],
            check=True,
        )
    finally:
        tmp_wav.unlink(missing_ok=True)
    return out_path


def copy_ref_to_mp3(idx: int, out_rel: str, bitrate: str = "192k") -> Path:
    """Encode directement un WAV utilisateur en MP3 haute fidélité SANS altérer son mix."""
    src = REF_DIR / f"uploaded_media_{idx}_1795579961111.wav"
    out_path = OUT_ROOT / out_rel
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            FFMPEG, "-y", "-v", "error",
            "-i", str(src),
            "-ar", str(SR),
            "-codec:a", "libmp3lame", "-b:a", bitrate,
            str(out_path),
        ],
        check=True,
    )
    return out_path


def midi_to_hz(m: float) -> float:
    return 440.0 * (2.0 ** ((m - 69.0) / 12.0))


def lp(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    cutoff = max(30.0, min(cutoff, SR * 0.45))
    sos = butter(order, cutoff, btype="lowpass", fs=SR, output="sos")
    return sosfilt(sos, x, axis=0).astype(np.float32)


def hp(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    cutoff = max(20.0, min(cutoff, SR * 0.45))
    sos = butter(order, cutoff, btype="highpass", fs=SR, output="sos")
    return sosfilt(sos, x, axis=0).astype(np.float32)


def bp(x: np.ndarray, low: float, high: float, order: int = 2) -> np.ndarray:
    low = max(25.0, min(low, SR * 0.44))
    high = max(low + 20.0, min(high, SR * 0.46))
    sos = butter(order, [low, high], btype="bandpass", fs=SR, output="sos")
    return sosfilt(sos, x, axis=0).astype(np.float32)


def stereo_pan(mono: np.ndarray, pan: float = 0.0) -> np.ndarray:
    """Panoramique constant-power (-1 gauche .. +1 droite)."""
    angle = (max(-1.0, min(1.0, pan)) + 1.0) * math.pi * 0.25
    return np.stack([mono * math.cos(angle), mono * math.sin(angle)], axis=1).astype(np.float32)


def add_at(buf: np.ndarray, sig: np.ndarray, start_s: float, gain: float = 1.0) -> None:
    if sig.ndim == 1:
        sig = np.stack([sig, sig], axis=1)
    idx = int(round(start_s * SR))
    if idx >= len(buf) or idx + len(sig) <= 0:
        return
    src_start = max(0, -idx)
    dst_start = max(0, idx)
    n = min(len(sig) - src_start, len(buf) - dst_start)
    if n > 0:
        buf[dst_start : dst_start + n] += sig[src_start : src_start + n] * gain


def pitch_shift_resample(sig: np.ndarray, ratio: float) -> np.ndarray:
    """Variation de vitesse/pitch propre par interpolation cubique/linéaire."""
    n_out = max(16, int(round(len(sig) / ratio)))
    xp = np.arange(len(sig), dtype=np.float32)
    x_new = np.linspace(0, len(sig) - 1, n_out, dtype=np.float32)
    if sig.ndim == 1:
        return np.interp(x_new, xp, sig).astype(np.float32)
    return np.stack([np.interp(x_new, xp, sig[:, c]) for c in range(sig.shape[1])], axis=1).astype(np.float32)


def studio_reverb(sig: np.ndarray, decay_s: float = 0.9, mix: float = 0.24, damping_hz: float = 5200.0) -> np.ndarray:
    """Réverbération stéréo soyeuse par convolution avec une IR synthétique exponentielle sans coloration métallique."""
    n_ir = int(decay_s * SR)
    rng = np.random.default_rng(1337)
    t = np.arange(n_ir, dtype=np.float32) / SR
    # Montée ultra-douce (pre-delay 12 ms + diffusion) puis décroissance exponentielle lisse
    env = (1.0 - np.exp(-t / 0.018)) * np.exp(-t * (6.2 / max(0.15, decay_s)))
    ir_l = rng.standard_normal(n_ir).astype(np.float32) * env
    ir_r = rng.standard_normal(n_ir).astype(np.float32) * env
    # Filtrage doux de l'IR pour un son velouté chaleureux (style studio Lexicon/Valhalla)
    ir = np.stack([ir_l, ir_r], axis=1)
    ir = lp(hp(ir, 140.0, 2), damping_hz, 2)
    # Normaliser l'énergie de l'IR
    ir /= max(1e-6, math.sqrt(float(np.sum(ir[:, 0] ** 2))))

    # Convolution rapide via FFT
    n_fft = 1 << (len(sig) + n_ir - 1).bit_length()
    wet = np.zeros((len(sig), 2), dtype=np.float32)
    for c in range(2):
        conv = np.fft.irfft(np.fft.rfft(sig[:, c], n_fft) * np.fft.rfft(ir[:, c], n_fft), n_fft)
        wet[:, c] = conv[: len(sig)]
    return (sig * (1.0 - mix * 0.35) + wet * mix).astype(np.float32)


def soft_master(sig: np.ndarray, target_rms_db: float = -15.0, ceiling_db: float = -1.3, fade_out_s: float = 0.06) -> np.ndarray:
    """Mastering final chaud et propre : passe-haut 32 Hz, normalisation RMS active, limiteur doux."""
    x = hp(sig - np.mean(sig, axis=0, keepdims=True), 32.0, 2)
    mono_sq = np.mean(x * x, axis=1)
    active = mono_sq[mono_sq > float(np.max(mono_sq)) * 0.015]
    rms = math.sqrt(float(np.mean(active))) if active.size else math.sqrt(float(np.mean(mono_sq)) + 1e-12)
    target_rms = 10.0 ** (target_rms_db / 20.0)
    gain = min(target_rms / max(rms, 1e-5), 14.0)
    x = x * gain
    # Saturation analogique douce (tanh légère) + plafond strict
    ceiling = 10.0 ** (ceiling_db / 20.0)
    x = np.tanh(x * 1.06) / math.tanh(1.06)
    peak = float(np.max(np.abs(x)))
    if peak > ceiling:
        x = x * (ceiling / peak)
    # Micro fade-in 2 ms + fade-out cosinus
    fi = min(int(0.002 * SR), len(x) // 8)
    if fi > 1:
        x[:fi] *= np.linspace(0.0, 1.0, fi, dtype=np.float32)[:, None]
    fo = min(int(fade_out_s * SR), len(x) // 3)
    if fo > 1:
        t = np.linspace(0.0, math.pi / 2.0, fo, dtype=np.float32)[:, None]
        x[-fo:] *= np.cos(t)
    return x.astype(np.float32)


# ═══════════════════════ INSTRUMENTS STUDIO (MÊME ADN QUE LA RÉFÉRENCE) ═══════════════════════

def synth_rhodes_note(midi: float, dur_s: float, vel: float = 0.8, pan: float = 0.0, trem_hz: float = 0.0) -> np.ndarray:
    """Fender Rhodes Mark I velouté : attaque 'tine' FM douce + corps chaud + harmoniques organiques."""
    n = int(dur_s * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f0 = midi_to_hz(midi)

    # Enveloppe principale (attaque 3 ms, sustain doux, release propre)
    att = 1.0 - np.exp(-t / 0.0035)
    body_env = att * np.exp(-t / max(0.35, dur_s * 0.58))
    # Enveloppe du tine métallique caractéristique du Rhodes (très court, brillant selon vélocité)
    tine_env = (1.0 - np.exp(-t / 0.0015)) * np.exp(-t / 0.095) * (0.28 + 0.55 * vel)
    # Légère modulation FM (ratio 1:1 et 1:7 pour le 'bark' + 'bell' Rhodes)
    mod1 = np.sin(2.0 * math.pi * f0 * t) * (0.55 * vel * np.exp(-t / 0.14))
    mod_tine = np.sin(2.0 * math.pi * (f0 * 7.0) * t) * (0.18 * tine_env)

    # Corps chaud (fondamentale + 2e + 3e harmoniques douces)
    fund = np.sin(2.0 * math.pi * f0 * t + mod1 + mod_tine)
    h2 = 0.22 * np.sin(2.0 * math.pi * f0 * 2.0 * t) * np.exp(-t / 0.28)
    h3 = 0.08 * np.sin(2.0 * math.pi * f0 * 3.0 * t) * np.exp(-t / 0.16)
    # 'Tine' cristallin au moment du marteau
    tine_bell = 0.11 * tine_env * np.sin(2.0 * math.pi * (f0 * 4.0) * t)

    mono = (fund + h2 + h3 + tine_bell) * body_env * vel
    # Filtre chaud de cabinet Rhodes
    mono = lp(mono, min(4800.0, 1400.0 + f0 * 4.2), 2)
    # Fin sans clic
    rel = min(int(0.05 * SR), n // 3)
    if rel > 1:
        mono[-rel:] *= np.cos(np.linspace(0, math.pi / 2, rel, dtype=np.float32))

    st = stereo_pan(mono, pan)
    if trem_hz > 0:
        # Autopan stéréo classique Rhodes Suitcase
        lfo = 0.5 + 0.5 * np.sin(2.0 * math.pi * trem_hz * t)
        st[:, 0] *= 0.82 + 0.18 * lfo
        st[:, 1] *= 0.82 + 0.18 * (1.0 - lfo)
    return st


def synth_crystal_bell(midi: float, dur_s: float, vel: float = 0.75, pan: float = 0.0) -> np.ndarray:
    """Cloche / célesta cristalline mobile-game (exacte famille des #06 et #10)."""
    n = int(dur_s * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f0 = midi_to_hz(midi)
    att = 1.0 - np.exp(-t / 0.002)
    # Partiels brillants légèrement inharmoniques (verre / célesta / cloche dorée)
    partials = [
        (1.0, 1.00, dur_s * 0.50),
        (2.0, 0.36, dur_s * 0.32),
        (3.003, 0.16, dur_s * 0.20),
        (4.01, 0.08, dur_s * 0.12),
        (5.42, 0.035, dur_s * 0.07),
    ]
    mono = np.zeros(n, dtype=np.float32)
    for ratio, amp, dec in partials:
        if f0 * ratio < SR * 0.44:
            mono += amp * np.sin(2.0 * math.pi * f0 * ratio * t) * np.exp(-t / max(0.025, dec))
    mono *= att * vel
    rel = min(int(0.04 * SR), n // 3)
    if rel > 1:
        mono[-rel:] *= np.cos(np.linspace(0, math.pi / 2, rel, dtype=np.float32))
    return stereo_pan(mono, pan)


def synth_warm_marimba(midi: float, dur_s: float, vel: float = 0.8, pan: float = 0.0) -> np.ndarray:
    """Marimba / balafon boisé chaud et moderne (partiels 1 : 4 : 10 + impact feutre)."""
    n = int(dur_s * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f0 = midi_to_hz(midi)
    att = 1.0 - np.exp(-t / 0.0018)
    y = (
        1.0 * np.sin(2.0 * math.pi * f0 * t) * np.exp(-t / max(0.08, dur_s * 0.42))
        + 0.26 * np.sin(2.0 * math.pi * (f0 * 3.98) * t) * np.exp(-t / 0.055)
        + 0.07 * np.sin(2.0 * math.pi * (f0 * 9.8) * t) * np.exp(-t / 0.018)
    )
    # Impact doux du maillet en bois/caoutchouc
    rng = np.random.default_rng(int(midi * 100))
    mallet = bp(rng.standard_normal(n).astype(np.float32), 700, 2600, 2) * np.exp(-t / 0.006) * 0.22
    mono = (y + mallet) * att * vel
    return stereo_pan(mono, pan)


def synth_sub_bass(midi: float, dur_s: float, vel: float = 0.75) -> np.ndarray:
    """Basse ronde Neo-Soul / Lo-Fi chaleureuse (comme #13)."""
    n = int(dur_s * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f0 = midi_to_hz(midi)
    env = (1.0 - np.exp(-t / 0.010)) * np.exp(-t / max(0.25, dur_s * 0.78))
    y = (
        1.0 * np.sin(2.0 * math.pi * f0 * t)
        + 0.30 * np.sin(2.0 * math.pi * f0 * 2.0 * t) * np.exp(-t / 0.35)
        + 0.08 * np.sin(2.0 * math.pi * f0 * 3.0 * t) * np.exp(-t / 0.15)
    ) * env * vel
    rel = min(int(0.03 * SR), n // 4)
    if rel > 1:
        y[-rel:] *= np.cos(np.linspace(0, math.pi / 2, rel, dtype=np.float32))
    return stereo_pan(lp(y, 420.0, 2), 0.0)


def synth_lofi_kick(vel: float = 0.85) -> np.ndarray:
    """Grosse caisse ronde feutrée style Neo-Soul Lounge."""
    n = int(0.24 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    freq = 50.0 + 95.0 * np.exp(-t / 0.024)
    phase = 2.0 * math.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * np.exp(-t / 0.095) * (1.0 - np.exp(-t / 0.0015))
    click = np.sin(2.0 * math.pi * 165.0 * t) * np.exp(-t / 0.007) * 0.30
    return stereo_pan(lp((body + click) * vel, 1800.0, 2), 0.0)


def synth_rimshot(vel: float = 0.65, pan: float = 0.08) -> np.ndarray:
    """Rimshot / cross-stick boisé sec style Neo-Soul / Afro-Lounge."""
    n = int(0.14 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(77)
    wood = (
        0.75 * np.sin(2.0 * math.pi * 430.0 * t) * np.exp(-t / 0.016)
        + 0.55 * np.sin(2.0 * math.pi * 1180.0 * t) * np.exp(-t / 0.012)
        + 0.35 * np.sin(2.0 * math.pi * 2450.0 * t) * np.exp(-t / 0.007)
    )
    snap = bp(rng.standard_normal(n).astype(np.float32), 1400, 6200, 2) * np.exp(-t / 0.018) * 0.65
    return stereo_pan((wood + snap) * vel, pan)


def synth_shaker(vel: float = 0.25, pan: float = -0.18, seed: int = 11) -> np.ndarray:
    """Shaker léger et soyeux."""
    n = int(0.09 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(seed)
    env = (1.0 - np.exp(-t / 0.008)) * np.exp(-t / 0.022)
    noise = bp(rng.standard_normal(n).astype(np.float32), 4800, 11500, 2) * env * vel
    return stereo_pan(noise, pan)


def synth_djembe_hit(pitch_hz: float = 95.0, slap: bool = False, vel: float = 0.9, pan: float = 0.0, seed: int = 3) -> np.ndarray:
    """Frappe organique de djembé (basse ronde ou claqué vif, 100 % propre sans bruit de fond)."""
    n = int(0.55 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(seed)
    # Descente rapide de hauteur de la peau tendue
    f_env = pitch_hz * (1.0 + (0.85 if slap else 0.55) * np.exp(-t / 0.022))
    phase = 2.0 * math.pi * np.cumsum(f_env) / SR
    # Modes de membrane circulaire (1.0, 1.59, 2.14)
    skin = (
        1.0 * np.sin(phase) * np.exp(-t / (0.14 if slap else 0.22))
        + 0.42 * np.sin(phase * 1.59) * np.exp(-t / 0.075)
        + 0.20 * np.sin(phase * 2.14) * np.exp(-t / 0.045)
    )
    # Résonance du fût en bois
    shell = 0.25 * np.sin(2.0 * math.pi * (pitch_hz * 2.8) * t) * np.exp(-t / 0.05)
    # Claqué de la paume sur la peau
    palm_band = (900, 4800) if slap else (280, 1800)
    palm_amp = 0.72 if slap else 0.32
    palm = bp(rng.standard_normal(n).astype(np.float32), palm_band[0], palm_band[1], 2) * np.exp(-t / 0.011) * palm_amp
    mono = (skin + shell + palm) * (1.0 - np.exp(-t / 0.0012)) * vel
    return stereo_pan(mono, pan)


# ═══════════════════════ GÉNÉRATEURS DES ASSETS MANQUANTS ═══════════════════════

def build_table_music() -> np.ndarray:
    """
    Boucle 20,00 s exactes (8 mesures à 96 BPM) — MÊME clé (Cmaj9 / Am9) et MÊME
    timbre Fender Rhodes velouté que salon-royal.mp3 (#13), mais groove de table
    plus posé, concentré et subtilement rythmé Afro-Lounge (balafon doux + rimshot).
    """
    bpm = 96.0
    beat = 60.0 / bpm       # 0.625 s
    bar = beat * 4.0        # 2.500 s
    total_s = bar * 8.0     # 20.000 s exactes !
    # On génère 22 s puis on replie les 2 s de queue sur le début -> boucle 100 % sans couture !
    pad_s = 2.5
    buf = np.zeros((int((total_s + pad_s) * SR), 2), dtype=np.float32)

    # Progression 8 mesures en Do Majeur / La Mineur 9 (harmonie sœur de #13) :
    # Am9 | Dm9 | G13 | Cmaj9 | Fmaj9 | Dm9 | Em7 | G9sus4
    chords = [
        (45, [57, 60, 64, 67, 71]),  # Am9  (A2 + A3 C4 E4 G4 B4)
        (38, [53, 57, 60, 64, 69]),  # Dm9  (D2 + F3 A3 C4 E4 A4)
        (43, [53, 57, 59, 64, 67]),  # G13  (G2 + F3 A3 B3 E4 G4)
        (48, [55, 59, 62, 64, 67]),  # Cmaj9(C3 + G3 B3 D4 E4 G4)
        (41, [53, 57, 60, 64, 67]),  # Fmaj9(F2 + F3 A3 C4 E4 G4)
        (38, [53, 57, 60, 64, 67]),  # Dm11 (D2 + F3 A3 C4 E4 G4)
        (40, [55, 59, 62, 64, 67]),  # Em7  (E2 + G3 B3 D4 E4 G4)
        (43, [53, 57, 60, 62, 67]),  # G11  (G2 + F3 A3 C4 D4 G4)
    ]

    # Motif doux de balafon/Rhodes aigu (notes pentatoniques Do Maj) pour donner le côté "Table Mboa"
    melody_bars = [
        [(0.5, 76, 0.34), (1.5, 79, 0.30), (2.75, 76, 0.28), (3.5, 74, 0.26)],
        [(0.0, 72, 0.32), (1.5, 74, 0.30), (2.5, 76, 0.34), (3.5, 72, 0.25)],
        [(0.5, 74, 0.32), (1.75, 79, 0.34), (3.0, 76, 0.30)],
        [(0.0, 79, 0.36), (1.5, 76, 0.30), (2.5, 74, 0.28), (3.25, 72, 0.26)],
        [(0.5, 76, 0.33), (1.5, 81, 0.32), (2.75, 79, 0.30), (3.5, 76, 0.26)],
        [(0.0, 74, 0.32), (1.25, 76, 0.30), (2.5, 72, 0.30), (3.5, 69, 0.26)],
        [(0.5, 71, 0.30), (1.5, 74, 0.32), (2.75, 76, 0.34)],
        [(0.0, 74, 0.32), (1.5, 72, 0.30), (2.5, 74, 0.28), (3.5, 76, 0.25)],
    ]

    for b_idx, (bass_m, voicing) in enumerate(chords):
        t0 = b_idx * bar
        # Rhodes : accord posé sur le 1er temps + légère reprise syncopée au 2.5e temps
        for k, note in enumerate(voicing):
            pan = -0.35 + (k / max(1, len(voicing) - 1)) * 0.70
            # Léger strum humain (12 ms entre notes)
            add_at(buf, synth_rhodes_note(note, beat * 2.6, vel=0.22, pan=pan, trem_hz=2.4), t0 + k * 0.013)
            add_at(buf, synth_rhodes_note(note, beat * 1.6, vel=0.14, pan=-pan * 0.6, trem_hz=2.4), t0 + beat * 2.5 + k * 0.010)

        # Basse ronde veloutée (1 + 2.5 + légère note de passage au 3.75)
        add_at(buf, synth_sub_bass(bass_m, beat * 2.3, vel=0.56), t0)
        add_at(buf, synth_sub_bass(bass_m, beat * 1.3, vel=0.44), t0 + beat * 2.5)
        if b_idx % 2 == 1:
            add_at(buf, synth_sub_bass(bass_m + 7, beat * 0.45, vel=0.30), t0 + beat * 3.5)

        # Groove percussif feutré Neo-Soul / Afro-Lounge
        add_at(buf, synth_lofi_kick(0.55), t0)
        add_at(buf, synth_lofi_kick(0.42), t0 + beat * 2.5)
        if b_idx % 2 == 1:
            add_at(buf, synth_lofi_kick(0.32), t0 + beat * 1.75)
        add_at(buf, synth_rimshot(0.34, pan=0.10), t0 + beat * 1.0)
        add_at(buf, synth_rimshot(0.38, pan=0.12), t0 + beat * 3.0)
        # Micro-ghost djembe chaleureux (signature Mboa discrète)
        add_at(buf, synth_djembe_hit(115.0, slap=False, vel=0.18, pan=-0.22, seed=b_idx + 10), t0 + beat * 1.5)
        add_at(buf, synth_djembe_hit(142.0, slap=True, vel=0.14, pan=0.24, seed=b_idx + 20), t0 + beat * 3.5)

        # Shakers doux en croches légèrement swinguées
        for step in range(8):
            swing = 0.018 if step % 2 == 1 else 0.0
            v = 0.14 if step % 2 == 0 else 0.09
            add_at(buf, synth_shaker(v, pan=-0.16 if step % 2 == 0 else 0.16, seed=b_idx * 10 + step), t0 + step * (beat * 0.5) + swing)

        # Touches boisées de marimba/balafon chaleureux
        for m_beat, m_note, m_vel in melody_bars[b_idx]:
            pan = -0.25 if (int(m_beat * 2) % 2 == 0) else 0.25
            add_at(buf, synth_warm_marimba(m_note, 0.55, vel=m_vel, pan=pan), t0 + m_beat * beat)

    # Réverbération salon veloutée
    buf = studio_reverb(buf, decay_s=1.1, mix=0.22, damping_hz=4200.0)

    # Repli de la queue sur le début -> boucle mathématiquement sans couture (20,000 s exactes)
    n_loop = int(round(total_s * SR))
    loop = buf[:n_loop].copy()
    tail = buf[n_loop:]
    loop[: len(tail)] += tail

    # Mastering calibré exactement comme #13 (-16.0 dB RMS, -1.4 dB Peak)
    x = hp(loop - np.mean(loop, axis=0, keepdims=True), 34.0, 2)
    rms = math.sqrt(float(np.mean(x * x)) + 1e-12)
    x = x * ((10.0 ** (-16.0 / 20.0)) / rms)
    x = np.tanh(x * 1.03) / math.tanh(1.03)
    peak = float(np.max(np.abs(x)))
    ceiling = 10.0 ** (-1.4 / 20.0)
    if peak > ceiling:
        x = x * (ceiling / peak)
    return x.astype(np.float32)


def build_timer_tick() -> np.ndarray:
    """Tic chrono en bois/clave net et élégant (0.16 s, sans agressivité)."""
    n = int(0.16 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    # Clave boisée accordée en Sol (G6 / D7) + petit corps grave
    y = (
        0.95 * np.sin(2.0 * math.pi * 1568.0 * t) * np.exp(-t / 0.018)
        + 0.45 * np.sin(2.0 * math.pi * 3136.0 * t) * np.exp(-t / 0.008)
        + 0.30 * np.sin(2.0 * math.pi * 784.0 * t) * np.exp(-t / 0.025)
    ) * (1.0 - np.exp(-t / 0.0008))
    rng = np.random.default_rng(42)
    click = bp(rng.standard_normal(n).astype(np.float32), 1800, 5500, 2) * np.exp(-t / 0.004) * 0.35
    st = stereo_pan(y + click, 0.0)
    st = studio_reverb(st, decay_s=0.14, mix=0.10, damping_hz=5000.0)
    return soft_master(st, target_rms_db=-16.5, ceiling_db=-2.0, fade_out_s=0.025)


def build_crown(coin_ref: np.ndarray) -> np.ndarray:
    """Couronne royale : cloche dorée + accord Rhodes Cmaj9 + scintillement subtil."""
    buf = np.zeros((int(1.25 * SR), 2), dtype=np.float32)
    # Accord chaleureux Rhodes Cmaj9 (doux en fond)
    for k, m in enumerate([60, 67, 71, 74]):
        add_at(buf, synth_rhodes_note(m, 1.05, vel=0.28, pan=-0.25 + k * 0.16), 0.02 + k * 0.022)
    # Double cloche dorée montante (G5 → C6 → E6)
    add_at(buf, synth_crystal_bell(79, 0.85, vel=0.55, pan=-0.18), 0.0)
    add_at(buf, synth_crystal_bell(84, 1.05, vel=0.68, pan=0.15), 0.09)
    add_at(buf, synth_crystal_bell(88, 0.95, vel=0.45, pan=0.0), 0.18)
    # Légère étincelle métallique tirée de la pièce utilisateur (#04)
    add_at(buf, pitch_shift_resample(coin_ref, 1.18), 0.10, gain=0.22)
    buf = studio_reverb(buf, decay_s=0.75, mix=0.26, damping_hz=6800.0)
    return soft_master(buf, target_rms_db=-14.5, ceiling_db=-1.5, fade_out_s=0.18)


def build_wheel_win(coin_cascade_ref: np.ndarray) -> np.ndarray:
    """Jackpot de la roue : arpège cristallin joyeux + Rhodes Cmaj9 + scintillement de pièces."""
    buf = np.zeros((int(1.75 * SR), 2), dtype=np.float32)
    # Arpège montant pétillant (C5 E5 G5 B5 D6 E6 G6)
    arp = [72, 76, 79, 83, 86, 88, 91]
    for i, m in enumerate(arp):
        pan = -0.4 + (i / (len(arp) - 1)) * 0.8
        add_at(buf, synth_crystal_bell(m, 0.75, vel=0.46 + i * 0.03, pan=pan), i * 0.065)
        if i % 2 == 0:
            add_at(buf, synth_warm_marimba(m - 12, 0.45, vel=0.35, pan=-pan * 0.5), i * 0.065)
    # Accord final Rhodes brillant Cmaj9
    for k, m in enumerate([60, 64, 67, 71, 74]):
        add_at(buf, synth_rhodes_note(m, 1.25, vel=0.34, pan=-0.3 + k * 0.15), 0.36 + k * 0.015)
    # Pluie de pièces utilisateur (#05) qui couronne le lot
    add_at(buf, coin_cascade_ref, 0.42, gain=0.52)
    add_at(buf, pitch_shift_resample(coin_cascade_ref, 1.12), 0.62, gain=0.35)
    buf = studio_reverb(buf, decay_s=0.85, mix=0.25, damping_hz=7200.0)
    return soft_master(buf, target_rms_db=-14.0, ceiling_db=-1.4, fade_out_s=0.24)


# ═══════════════════════ LES 11 SONS DE CARTES POUVOIR (STUDIO PRO) ═══════════════════════

def build_power_pouvoir() -> np.ndarray:
    """Pouvoir royal par défaut : montée chaleureuse Cmaj9 Rhodes + harpe cristalline + sub bloom."""
    buf = np.zeros((int(1.45 * SR), 2), dtype=np.float32)
    # Doux bloom sub
    add_at(buf, synth_sub_bass(48, 0.65, vel=0.55), 0.0)
    # Arpège lumineux Cmaj9
    notes = [67, 71, 72, 74, 76, 79, 83, 84]
    for i, m in enumerate(notes):
        pan = -0.45 + (i / (len(notes) - 1)) * 0.9
        add_at(buf, synth_crystal_bell(m, 0.72, vel=0.38 + i * 0.025, pan=pan), 0.02 + i * 0.048)
    for k, m in enumerate([60, 64, 67, 71, 74]):
        add_at(buf, synth_rhodes_note(m, 1.15, vel=0.32, pan=-0.3 + k * 0.15), 0.14 + k * 0.018)
    buf = studio_reverb(buf, decay_s=0.85, mix=0.28, damping_hz=7000.0)
    return soft_master(buf, target_rms_db=-14.0, ceiling_db=-1.3, fade_out_s=0.22)


def build_power_tambour() -> np.ndarray:
    """Tambour d'Appel : 3 frappes de djembé organiques et profondes + léger accent boisé."""
    buf = np.zeros((int(1.40 * SR), 2), dtype=np.float32)
    add_at(buf, synth_djembe_hit(92.0, slap=False, vel=0.95, pan=-0.18, seed=1), 0.00)
    add_at(buf, synth_djembe_hit(118.0, slap=True, vel=0.88, pan=0.18, seed=2), 0.22)
    add_at(buf, synth_djembe_hit(84.0, slap=False, vel=1.00, pan=0.00, seed=3), 0.44)
    add_at(buf, synth_djembe_hit(148.0, slap=True, vel=0.72, pan=-0.10, seed=4), 0.56)
    # Accord court balafon/marimba en écho noble sur le dernier coup
    add_at(buf, synth_warm_marimba(67, 0.55, vel=0.40, pan=-0.25), 0.44)
    add_at(buf, synth_warm_marimba(72, 0.65, vel=0.45, pan=0.25), 0.48)
    buf = studio_reverb(buf, decay_s=0.55, mix=0.20, damping_hz=4500.0)
    return soft_master(buf, target_rms_db=-13.5, ceiling_db=-1.3, fade_out_s=0.16)


def build_power_eclair() -> np.ndarray:
    """Éclair du Mfoundi : arc électrique chirurgical + impact tonnerre propre (style mobile AAA)."""
    n = int(1.50 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(2026)
    buf = np.zeros((n, 2), dtype=np.float32)

    # 1. Charge montante ultra-rapide (0 -> 0.08 s)
    t_ch = np.arange(int(0.11 * SR), dtype=np.float32) / SR
    f_ch = 260.0 * (2.0 ** (t_ch * 28.0))
    charge = np.sin(2.0 * math.pi * np.cumsum(f_ch) / SR) * (t_ch / 0.11) * np.exp(-np.maximum(0, t_ch - 0.085) / 0.01)
    add_at(buf, stereo_pan(charge * 0.45, 0.0), 0.0)

    # 2. Claquement électrique stéréo + crépitements précis (micro-bursts filtrés)
    for idx, (ts, pan, dur, lo, hi, amp) in enumerate([
        (0.08, 0.0, 0.14, 1800, 9800, 0.95),
        (0.11, -0.55, 0.10, 2600, 12000, 0.65),
        (0.15, 0.55, 0.12, 2200, 11000, 0.70),
        (0.24, -0.35, 0.09, 3000, 11500, 0.45),
        (0.35, 0.40, 0.08, 3200, 12000, 0.35),
        (0.49, -0.20, 0.07, 3500, 11000, 0.25),
    ]):
        m_n = int(dur * SR)
        mt = np.arange(m_n, dtype=np.float32) / SR
        noise = rng.standard_normal(m_n).astype(np.float32)
        # Modulation crépitante haute fréquence (arcade électrique propre)
        crackle = bp(noise, lo, hi, 2) * (0.5 + 0.5 * np.abs(np.sin(2.0 * math.pi * (45 + idx * 17) * mt)))
        crackle *= (1.0 - np.exp(-mt / 0.0015)) * np.exp(-mt / (dur * 0.35))
        add_at(buf, stereo_pan(crackle * amp, pan), ts)

    # 3. Impact de tonnerre sub-basse serré (zéro boue)
    n_th = int(1.20 * SR)
    tt = np.arange(n_th, dtype=np.float32) / SR
    sub_f = 42.0 + 110.0 * np.exp(-tt / 0.035)
    sub = np.sin(2.0 * math.pi * np.cumsum(sub_f) / SR) * np.exp(-tt / 0.28) * 0.85
    rumble = lp(hp(rng.standard_normal(n_th).astype(np.float32), 45.0, 2), 260.0, 2) * np.exp(-tt / 0.36) * 0.65
    add_at(buf, stereo_pan(sub + rumble, 0.0), 0.085)

    # 4. Étincelle cristalline électrique en harmonique (G6 + D7)
    add_at(buf, synth_crystal_bell(91, 0.55, vel=0.28, pan=-0.3), 0.09)
    add_at(buf, synth_crystal_bell(98, 0.45, vel=0.22, pan=0.35), 0.14)

    buf = studio_reverb(buf, decay_s=0.65, mix=0.22, damping_hz=6000.0)
    return soft_master(buf, target_rms_db=-13.5, ceiling_db=-1.2, fade_out_s=0.22)


def build_power_vent(card_refs: list[np.ndarray]) -> np.ndarray:
    """Vent du Nord : souffle stéréo soyeux gauche->droite + bruissement des vraies cartes utilisateur."""
    n = int(1.50 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(303)
    buf = np.zeros((n, 2), dtype=np.float32)

    # Souffle d'air balayé en fréquence par tranches douces (whoosh cinématique propre)
    white = rng.standard_normal(n).astype(np.float32)
    low_air = bp(white, 220, 750, 2)
    mid_air = bp(white, 650, 2200, 2)
    hi_air = bp(white, 1900, 5600, 2)
    env_whoosh = np.maximum(0.0, np.sin(math.pi * np.clip(t / 1.35, 0.0, 1.0))) ** 1.4
    # Balayage spectral + panoramique L -> R
    w_low = env_whoosh * np.exp(-((t - 0.35) ** 2) / 0.14)
    w_mid = env_whoosh * np.exp(-((t - 0.58) ** 2) / 0.15)
    w_hi = env_whoosh * np.exp(-((t - 0.78) ** 2) / 0.16)
    air_mono = low_air * w_low * 0.75 + mid_air * w_mid * 0.85 + hi_air * w_hi * 0.55
    pan_curve = np.linspace(-0.75, 0.75, n, dtype=np.float32)
    ang = (pan_curve + 1.0) * math.pi * 0.25
    buf[:, 0] += air_mono * np.cos(ang)
    buf[:, 1] += air_mono * np.sin(ang)

    # Bruissement de 4 cartes qui s'envolent (utilisant les vrais samples cartes de l'utilisateur !)
    for i, (ts, ratio, pan, g) in enumerate([
        (0.18, 1.08, -0.45, 0.55),
        (0.30, 1.15, -0.15, 0.62),
        (0.42, 0.96, 0.20, 0.58),
        (0.56, 1.22, 0.50, 0.45),
    ]):
        c = pitch_shift_resample(card_refs[i % len(card_refs)], ratio)
        mono_c = c.mean(axis=1)
        add_at(buf, stereo_pan(mono_c, pan), ts, gain=g)

    # Touche aérienne cristalline (E6 → B6)
    add_at(buf, synth_crystal_bell(88, 0.75, vel=0.22, pan=-0.25), 0.32)
    add_at(buf, synth_crystal_bell(95, 0.75, vel=0.20, pan=0.35), 0.46)

    buf = studio_reverb(buf, decay_s=0.70, mix=0.24, damping_hz=6200.0)
    return soft_master(buf, target_rms_db=-14.0, ceiling_db=-1.4, fade_out_s=0.24)


def build_power_givre() -> np.ndarray:
    """Éclat cristallin / Pluie d'Étoiles : cascade de cloches de verre scintillantes."""
    buf = np.zeros((int(1.45 * SR), 2), dtype=np.float32)
    # Notes scintillantes aiguës en Do Lydien/Maj9 (G6 B6 D7 E7 G7 A7 B7)
    sparkles = [
        (0.00, 88, 0.42, -0.55),
        (0.05, 91, 0.46, 0.40),
        (0.11, 95, 0.50, -0.35),
        (0.16, 98, 0.45, 0.55),
        (0.23, 96, 0.48, -0.15),
        (0.30, 100, 0.42, 0.30),
        (0.38, 103, 0.38, -0.40),
        (0.47, 98, 0.34, 0.20),
        (0.56, 103, 0.30, 0.00),
    ]
    for ts, m, vel, pan in sparkles:
        add_at(buf, synth_crystal_bell(m, 0.78, vel=vel, pan=pan), ts)
    # Lit vaporeux cristallin (E5 + B5 Rhodes doux)
    add_at(buf, synth_rhodes_note(76, 1.1, vel=0.22, pan=-0.3), 0.04)
    add_at(buf, synth_rhodes_note(83, 1.1, vel=0.20, pan=0.3), 0.08)
    buf = studio_reverb(buf, decay_s=0.95, mix=0.32, damping_hz=8500.0)
    return soft_master(buf, target_rms_db=-14.5, ceiling_db=-1.5, fade_out_s=0.24)


def build_power_gong() -> np.ndarray:
    """Bouclier du Village / Totem : gong cérémoniel en bronze profond + aura protectrice."""
    n = int(1.90 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    buf = np.zeros((n, 2), dtype=np.float32)

    # Synthèse modale de vrai gong en bronze (fondamentale C2 65.4Hz + modes riches légèrement battants)
    f0 = midi_to_hz(48)  # C3 (130.8 Hz) + sous-octave C2 (65.4 Hz)
    modes = [
        (0.50, 0.65, 1.55, 0.0),
        (1.00, 0.90, 1.45, -0.15),
        (1.006, 0.55, 1.35, 0.15),  # battement stéréo chaleureux !
        (1.498, 0.50, 1.10, -0.30),
        (2.02, 0.34, 0.85, 0.30),
        (2.76, 0.24, 0.62, -0.45),
        (3.41, 0.18, 0.45, 0.45),
        (4.28, 0.12, 0.32, -0.20),
        (5.55, 0.07, 0.22, 0.25),
    ]
    # Légère montée de brillance ('shimmer bloom' typique des gongs en bronze)
    bloom = 0.65 + 0.35 * (1.0 - np.exp(-t / 0.12))
    att = 1.0 - np.exp(-t / 0.005)
    for ratio, amp, dec, pan in modes:
        freq = f0 * ratio
        # Micro-glissement de pitch à l'impact
        inst_f = freq * (1.0 - 0.012 * np.exp(-t / 0.06))
        ph = 2.0 * math.pi * np.cumsum(inst_f) / SR
        comp = np.sin(ph) * np.exp(-t / dec) * att * (bloom if ratio > 1.8 else 1.0) * amp
        buf += stereo_pan(comp, pan)

    # Impact feutré du gros maillet sur le bronze
    rng = np.random.default_rng(606)
    mallet = lp(rng.standard_normal(int(0.08 * SR)).astype(np.float32), 950, 2) * np.exp(-np.arange(int(0.08 * SR)) / (0.014 * SR))
    add_at(buf, stereo_pan(mallet * 0.75, 0.0), 0.0)

    # Halo protecteur majeur très subtil (G4 + D5)
    add_at(buf, synth_rhodes_note(67, 1.3, vel=0.18, pan=-0.25), 0.08)
    add_at(buf, synth_rhodes_note(74, 1.3, vel=0.16, pan=0.25), 0.12)

    buf = studio_reverb(buf, decay_s=1.05, mix=0.26, damping_hz=5800.0)
    return soft_master(buf, target_rms_db=-13.8, ceiling_db=-1.3, fade_out_s=0.32)


def build_power_pieces(coin_single: np.ndarray, coin_cascade: np.ndarray) -> np.ndarray:
    """Cauris Chanceux / Bénédiction : pluie luxueuse construite à partir des VRAIES pièces utilisateur."""
    buf = np.zeros((int(1.40 * SR), 2), dtype=np.float32)
    # Cascade stéréo riche utilisant les samples #04 et #05 de l'utilisateur
    add_at(buf, stereo_pan(coin_cascade.mean(axis=1), -0.35), 0.00, gain=0.85)
    add_at(buf, stereo_pan(pitch_shift_resample(coin_single.mean(axis=1), 1.08), 0.42), 0.12, gain=0.72)
    add_at(buf, stereo_pan(pitch_shift_resample(coin_cascade.mean(axis=1), 0.94), 0.25), 0.22, gain=0.80)
    add_at(buf, stereo_pan(pitch_shift_resample(coin_single.mean(axis=1), 1.18), -0.45), 0.38, gain=0.65)
    add_at(buf, stereo_pan(pitch_shift_resample(coin_cascade.mean(axis=1), 1.10), 0.00), 0.48, gain=0.68)
    # Scintillement doré final (G5 → C6 → E6)
    add_at(buf, synth_crystal_bell(79, 0.55, vel=0.32, pan=-0.25), 0.28)
    add_at(buf, synth_crystal_bell(84, 0.65, vel=0.38, pan=0.25), 0.38)
    add_at(buf, synth_crystal_bell(88, 0.70, vel=0.34, pan=0.00), 0.48)
    buf = studio_reverb(buf, decay_s=0.60, mix=0.20, damping_hz=7500.0)
    return soft_master(buf, target_rms_db=-13.5, ceiling_db=-1.3, fade_out_s=0.20)


def build_power_magie() -> np.ndarray:
    """Œil du Sorcier / Marché de Nuit / Pacte : sortilège mystique soyeux (harpe + Rhodes + souffle)."""
    buf = np.zeros((int(1.55 * SR), 2), dtype=np.float32)
    # Montée magique inversée douce (0 -> 0.30 s)
    n_sw = int(0.36 * SR)
    tsw = np.arange(n_sw, dtype=np.float32) / SR
    rng = np.random.default_rng(808)
    swell = bp(rng.standard_normal(n_sw).astype(np.float32), 1200, 4800, 2) * ((tsw / 0.36) ** 2.2) * np.exp(-np.maximum(0, tsw - 0.30) / 0.03)
    add_at(buf, stereo_pan(swell * 0.42, 0.0), 0.0)

    # Glissando mystique Am9/Lydien (A4 B4 C5 E5 G5 A5 B5 D6 E6)
    gliss = [69, 71, 72, 76, 79, 81, 83, 86, 88]
    for i, m in enumerate(gliss):
        pan = -0.55 + (i / (len(gliss) - 1)) * 1.1
        add_at(buf, synth_crystal_bell(m, 0.85, vel=0.36 + i * 0.025, pan=pan), 0.14 + i * 0.058)
    # Accord mystique soyeux Am9 au Rhodes
    for k, m in enumerate([57, 64, 67, 71, 74]):
        add_at(buf, synth_rhodes_note(m, 1.20, vel=0.26, pan=-0.3 + k * 0.15, trem_hz=4.2), 0.20 + k * 0.02)

    buf = studio_reverb(buf, decay_s=1.05, mix=0.34, damping_hz=7200.0)
    return soft_master(buf, target_rms_db=-14.0, ceiling_db=-1.4, fade_out_s=0.26)


def build_power_alarme() -> np.ndarray:
    """Cri du Chef / Filet : appel cuivré chaud et noble + double frappe percussive tendue."""
    buf = np.zeros((int(1.35 * SR), 2), dtype=np.float32)

    def synth_warm_horn(midi: float, dur_s: float, vel: float = 0.75, pan: float = 0.0) -> np.ndarray:
        n = int(dur_s * SR)
        t = np.arange(n, dtype=np.float32) / SR
        f0 = midi_to_hz(midi)
        # Légère attaque cuivrée + vibrato organique
        vib = 1.0 + 0.004 * np.sin(2.0 * math.pi * 5.2 * t) * (1.0 - np.exp(-t / 0.15))
        f_inst = f0 * vib * (1.0 - 0.02 * np.exp(-t / 0.025))
        ph = 2.0 * math.pi * np.cumsum(f_inst) / SR
        # Harmoniques riches de cor en laiton (filtrées chaleureusement)
        y = (
            1.00 * np.sin(ph)
            + 0.72 * np.sin(2.0 * ph)
            + 0.45 * np.sin(3.0 * ph)
            + 0.25 * np.sin(4.0 * ph)
            + 0.14 * np.sin(5.0 * ph)
        )
        env = (1.0 - np.exp(-t / 0.035)) * np.exp(-np.maximum(0, t - dur_s * 0.55) / (dur_s * 0.28))
        y = lp(y * env * vel, 2200.0, 2)
        return stereo_pan(y, pan)

    # Double frappe de tambour d'alerte
    add_at(buf, synth_djembe_hit(105.0, slap=True, vel=0.85, pan=-0.22, seed=51), 0.00)
    add_at(buf, synth_djembe_hit(130.0, slap=True, vel=0.90, pan=0.22, seed=52), 0.14)
    # Appel noble de cor (G4 -> C5, quarte héroïque)
    add_at(buf, synth_warm_horn(67, 0.36, vel=0.55, pan=-0.12), 0.06)
    add_at(buf, synth_warm_horn(72, 0.82, vel=0.65, pan=0.12), 0.28)
    add_at(buf, synth_warm_horn(60, 0.80, vel=0.35, pan=0.00), 0.28)

    buf = studio_reverb(buf, decay_s=0.68, mix=0.25, damping_hz=4800.0)
    return soft_master(buf, target_rms_db=-13.5, ceiling_db=-1.3, fade_out_s=0.20)


def build_power_sceau() -> np.ndarray:
    """Sceau d'Entrave : impact lourd de sceau bois/pierre + cliquetis métallique de verrou."""
    buf = np.zeros((int(1.20 * SR), 2), dtype=np.float32)
    rng = np.random.default_rng(909)

    # 1. Impact massif et sec du tampon/sceau (0.00 s)
    n_imp = int(0.45 * SR)
    ti = np.arange(n_imp, dtype=np.float32) / SR
    f_imp = 48.0 + 130.0 * np.exp(-ti / 0.018)
    thud = np.sin(2.0 * math.pi * np.cumsum(f_imp) / SR) * np.exp(-ti / 0.13) * 0.95
    wood_hit = bp(rng.standard_normal(n_imp).astype(np.float32), 280, 1400, 2) * np.exp(-ti / 0.018) * 0.75
    add_at(buf, stereo_pan(thud + wood_hit, 0.0), 0.0)

    # 2. Verrouillage métallique net en deux temps (clac-clic à 0.14 s et 0.24 s)
    for ts, f1, f2, pan in [(0.14, 1420.0, 2890.0, -0.18), (0.24, 1980.0, 3920.0, 0.18)]:
        nm = int(0.22 * SR)
        tm = np.arange(nm, dtype=np.float32) / SR
        latch = (
            0.70 * np.sin(2.0 * math.pi * f1 * tm) * np.exp(-tm / 0.022)
            + 0.45 * np.sin(2.0 * math.pi * f2 * tm) * np.exp(-tm / 0.014)
            + bp(rng.standard_normal(nm).astype(np.float32), 2200, 7200, 2) * np.exp(-tm / 0.008) * 0.45
        )
        add_at(buf, stereo_pan(latch * 0.72, pan), ts)

    # 3. Résonance grave solennelle (Am)
    add_at(buf, synth_rhodes_note(45, 0.85, vel=0.38, pan=-0.15), 0.02)
    add_at(buf, synth_rhodes_note(52, 0.85, vel=0.30, pan=0.15), 0.04)

    buf = studio_reverb(buf, decay_s=0.50, mix=0.18, damping_hz=4500.0)
    return soft_master(buf, target_rms_db=-13.5, ceiling_db=-1.2, fade_out_s=0.16)


def build_power_souffle() -> np.ndarray:
    """Sable du Temps : écoulement fin de sablier + cadence temporelle descendante éthérée."""
    n = int(1.55 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(1010)
    buf = np.zeros((n, 2), dtype=np.float32)

    # Sable fin stéréo qui s'écoule (bruit haute fréquence granulé propre)
    sand_raw = bp(rng.standard_normal(n).astype(np.float32), 3400, 9600, 2)
    grain = 0.65 + 0.35 * np.sin(2.0 * math.pi * 24.0 * t)
    sand_env = (1.0 - np.exp(-t / 0.14)) * np.exp(-np.maximum(0, t - 0.55) / 0.38)
    sand_l = sand_raw * grain * sand_env * 0.36
    sand_r = bp(rng.standard_normal(n).astype(np.float32), 3600, 9800, 2) * grain * sand_env * 0.36
    buf += np.stack([sand_l, sand_r], axis=1)

    # Descente temporelle douce (cloches + Rhodes : E6 -> D6 -> B5 -> A5 -> G5)
    desc = [(0.04, 88, -0.35), (0.20, 86, 0.30), (0.36, 83, -0.25), (0.54, 81, 0.25), (0.74, 79, 0.0)]
    for ts, m, pan in desc:
        add_at(buf, synth_crystal_bell(m, 0.72, vel=0.34, pan=pan), ts)
    # Accord éthéré descendant Dm9 -> Am9
    for k, m in enumerate([62, 65, 69, 72]):
        add_at(buf, synth_rhodes_note(m, 0.75, vel=0.22, pan=-0.25 + k * 0.15), 0.06 + k * 0.015)
    for k, m in enumerate([57, 60, 64, 67]):
        add_at(buf, synth_rhodes_note(m, 0.95, vel=0.24, pan=-0.25 + k * 0.15), 0.52 + k * 0.018)

    buf = studio_reverb(buf, decay_s=0.95, mix=0.30, damping_hz=6800.0)
    return soft_master(buf, target_rms_db=-14.2, ceiling_db=-1.4, fade_out_s=0.25)


def main() -> int:
    print("=== 1. Intégration directe des 14 sons de référence utilisateur ===")
    user_map = [
        (0, "sfx/card-play.mp3"),
        (1, "sfx/card-play-2.mp3"),
        (8, "sfx/card-play-3.mp3"),
        (2, "sfx/deal-sweep.mp3"),
        (3, "sfx/ui-click.mp3"),
        (4, "sfx/coin-single.mp3"),
        (5, "sfx/coin.mp3"),
        (6, "sfx/turn-start.mp3"),
        (7, "sfx/wheel-tick.mp3"),
        (9, "sfx/round-start.mp3"),
        (10, "sfx/dominance.mp3"),
        (11, "sfx/lose.mp3"),
        (12, "sfx/win.mp3"),
        (13, "music/salon-royal.mp3"),
    ]
    for idx, rel in user_map:
        out = copy_ref_to_mp3(idx, rel, bitrate="192k")
        print(f"  [REF #{idx:02d}] -> {out.relative_to(ROOT)} ({out.stat().st_size / 1024:.1f} Ko)")

    # Charge les samples de référence utilisés comme couches foley cohérentes
    card_refs = [load_ref(0), load_ref(1), load_ref(8)]
    coin_single = load_ref(4)
    coin_cascade = load_ref(5)

    print("\n=== 2. Génération studio des sons manquants (même ADN sonore 96 BPM Cmaj9/Am9) ===")
    missing: list[tuple[str, np.ndarray, str]] = [
        ("music/table-mboa.mp3", build_table_music(), "160k"),
        ("sfx/timer-tick.mp3", build_timer_tick(), "160k"),
        ("sfx/crown.mp3", build_crown(coin_single), "160k"),
        ("sfx/wheel-win.mp3", build_wheel_win(coin_cascade), "160k"),
        ("powers/pouvoir.mp3", build_power_pouvoir(), "160k"),
        ("powers/tambour.mp3", build_power_tambour(), "160k"),
        ("powers/eclair.mp3", build_power_eclair(), "160k"),
        ("powers/vent.mp3", build_power_vent(card_refs), "160k"),
        ("powers/givre.mp3", build_power_givre(), "160k"),
        ("powers/gong.mp3", build_power_gong(), "160k"),
        ("powers/pieces.mp3", build_power_pieces(coin_single, coin_cascade), "160k"),
        ("powers/magie.mp3", build_power_magie(), "160k"),
        ("powers/alarme.mp3", build_power_alarme(), "160k"),
        ("powers/sceau.mp3", build_power_sceau(), "160k"),
        ("powers/souffle.mp3", build_power_souffle(), "160k"),
    ]
    for rel, audio, br in missing:
        out = encode_mp3(audio, rel, bitrate=br)
        print(f"  [STUDIO]   -> {out.relative_to(ROOT)} ({out.stat().st_size / 1024:.1f} Ko)")

    print(f"\nTerminé : {len(user_map)} sons utilisateur + {len(missing)} sons complémentaires = {len(user_map) + len(missing)} fichiers prêts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
