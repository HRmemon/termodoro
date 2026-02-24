import { spawn, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type SoundEvent = 'work-end' | 'break-end' | 'reminder';
export type SoundChoice = 'none' | 'bell' | 'tone-high' | 'tone-low' | 'tone-gentle' | 'kitchen-alarm' | 'phone-ringing' | 'system-complete' | 'system-alarm' | 'custom';

export interface SoundConfig {
  'work-end': SoundChoice;
  'break-end': SoundChoice;
  'reminder': SoundChoice;
  alarmDuration: number; // seconds — sound loops until this duration
  volume: number;        // 0–100 percent
  customPaths: Partial<Record<SoundEvent, string>>;
}

export const DEFAULT_SOUND_CONFIG: SoundConfig = {
  'work-end': 'tone-high',
  'break-end': 'tone-gentle',
  'reminder': 'system-alarm',
  alarmDuration: 5,
  volume: 80,
  customPaths: {},
};

export const SOUND_LABELS: Record<SoundChoice, string> = {
  'none': 'None',
  'bell': 'Terminal Bell',
  'tone-high': 'High Tone',
  'tone-low': 'Low Tone',
  'tone-gentle': 'Gentle Chime',
  'kitchen-alarm': 'Kitchen Alarm',
  'phone-ringing': 'Phone Ringing',
  'system-complete': 'System Complete',
  'system-alarm': 'System Alarm',
  'custom': 'Custom File',
};

export const ALL_SOUND_CHOICES: SoundChoice[] = ['none', 'bell', 'tone-high', 'tone-low', 'tone-gentle', 'kitchen-alarm', 'phone-ringing', 'system-complete', 'system-alarm', 'custom'];

const CACHE_DIR = path.join(os.tmpdir(), 'pomodorocli-sounds');

/** Generate a simple WAV tone as a Buffer */
function generateWav(frequencyHz: number, durationMs: number, volume = 0.5, fadeMs = 50): Buffer {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const fadeSamples = Math.floor(sampleRate * fadeMs / 1000);

  // PCM 16-bit mono
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);

  // WAV header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // chunk size
  buf.writeUInt16LE(1, 20);  // PCM
  buf.writeUInt16LE(1, 22);  // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);  // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = Math.sin(2 * Math.PI * frequencyHz * t) * volume;

    // Fade in
    if (i < fadeSamples) {
      sample *= i / fadeSamples;
    }
    // Fade out
    if (i > numSamples - fadeSamples) {
      sample *= (numSamples - i) / fadeSamples;
    }

    const val = Math.max(-1, Math.min(1, sample));
    buf.writeInt16LE(Math.floor(val * 32767), 44 + i * 2);
  }

  return buf;
}

/** Generate a gentle two-tone chime */
function generateChime(): Buffer {
  const sampleRate = 22050;
  const durationMs = 600;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const fadeSamples = Math.floor(sampleRate * 80 / 1000);
  const volume = 0.35;

  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  const halfSamples = Math.floor(numSamples / 2);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // First half: C5 (523Hz), second half: E5 (659Hz)
    const freq = i < halfSamples ? 523 : 659;
    let sample = Math.sin(2 * Math.PI * freq * t) * volume;

    // Per-note fade
    const noteIdx = i < halfSamples ? i : i - halfSamples;
    const noteLen = i < halfSamples ? halfSamples : numSamples - halfSamples;
    if (noteIdx < fadeSamples) sample *= noteIdx / fadeSamples;
    if (noteIdx > noteLen - fadeSamples) sample *= (noteLen - noteIdx) / fadeSamples;

    buf.writeInt16LE(Math.floor(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }

  return buf;
}

/** Generate a kitchen timer alarm: rapid metallic ring-ring-ring pattern */
function generateKitchenAlarm(): Buffer {
  const sampleRate = 22050;
  const durationMs = 1800;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const volume = 0.45;

  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);

  // WAV header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  // 6 rapid rings: ~150ms on, ~150ms off
  const ringMs = 150;
  const gapMs = 150;
  const cycleMs = ringMs + gapMs;
  const fadeSamples = Math.floor(sampleRate * 10 / 1000); // 10ms fade

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const msPos = (t * 1000) % cycleMs;
    const inRing = msPos < ringMs;

    let sample = 0;
    if (inRing) {
      // Metallic bell: mix of high frequencies with slight inharmonicity
      sample = (
        Math.sin(2 * Math.PI * 2200 * t) * 0.4 +
        Math.sin(2 * Math.PI * 3300 * t) * 0.3 +
        Math.sin(2 * Math.PI * 4700 * t) * 0.2 +
        Math.sin(2 * Math.PI * 5900 * t) * 0.1
      ) * volume;

      // Per-ring envelope
      const ringSample = Math.floor(msPos * sampleRate / 1000);
      const ringTotal = Math.floor(ringMs * sampleRate / 1000);
      if (ringSample < fadeSamples) sample *= ringSample / fadeSamples;
      if (ringSample > ringTotal - fadeSamples) sample *= (ringTotal - ringSample) / fadeSamples;
    }

    // Overall fade out over last 300ms
    const remainingMs = durationMs - t * 1000;
    if (remainingMs < 300) sample *= remainingMs / 300;

    buf.writeInt16LE(Math.floor(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }

  return buf;
}

const TONE_GENERATORS: Record<string, () => Buffer> = {
  'tone-high': () => generateWav(880, 400, 0.5),
  'tone-low': () => generateWav(440, 500, 0.5),
  'tone-gentle': () => generateChime(),
  'kitchen-alarm': () => generateKitchenAlarm(),
};

// Resolve project root from this file: dist/lib/sounds.js -> project root
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

const BUNDLED_SOUND_PATHS: Record<string, string> = {
  'phone-ringing': path.join(PROJECT_ROOT, 'sounds', 'phone_ringing.mp3'),
};

const SYSTEM_SOUND_PATHS: Record<string, string[]> = {
  'system-complete': [
    '/usr/share/sounds/freedesktop/stereo/complete.oga',
    '/usr/share/sounds/ocean/stereo/dialog-information.oga',
  ],
  'system-alarm': [
    '/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga',
    '/usr/share/sounds/ocean/stereo/dialog-warning.oga',
  ],
};

function findPlayer(): string | null {
  const players = ['paplay', 'pw-play', 'aplay', 'ffplay', 'mpv'];
  for (const p of players) {
    try {
      const result = execFileSync('which', [p], { stdio: 'pipe' });
      if (result.toString().trim()) return p;
    } catch {
      continue;
    }
  }
  return null;
}

let cachedPlayer: string | null | undefined;
function getPlayer(): string | null {
  if (cachedPlayer === undefined) {
    cachedPlayer = findPlayer();
  }
  return cachedPlayer;
}

function ensureCacheDir(): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function getToneFilePath(name: string): string {
  ensureCacheDir();
  const filePath = path.join(CACHE_DIR, `${name}.wav`);
  if (!fs.existsSync(filePath)) {
    const gen = TONE_GENERATORS[name];
    if (gen) {
      fs.writeFileSync(filePath, gen());
    }
  }
  return filePath;
}

function findSystemSound(choice: string): string | null {
  const paths = SYSTEM_SOUND_PATHS[choice];
  if (!paths) return null;
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Play a sound file for a given duration (seconds) at a given volume (0-100).
 * Uses player-native looping where supported, otherwise respawns.
 * Kills the player process after durationSec.
 */
function playFile(filePath: string, durationSec: number, volumePercent = 80): void {
  const player = getPlayer();
  if (!player) return;

  const args: string[] = [];
  if (player === 'mpv') {
    args.push('--no-video', '--really-quiet', '--loop-file=inf', `--volume=${volumePercent}`, filePath);
  } else if (player === 'ffplay') {
    // ffplay volume: 0-100 maps to SDL volume
    args.push('-nodisp', '-autoexit', '-loglevel', 'quiet', '-loop', '0', '-t', String(durationSec), '-volume', String(volumePercent), filePath);
  } else if (player === 'paplay') {
    // paplay uses 0-65536 scale (100% = 65536)
    const paVol = Math.round((volumePercent / 100) * 65536);
    args.push(`--volume=${paVol}`, filePath);
  } else {
    // pw-play, aplay — no volume flag; just play
    args.push(filePath);
  }

  try {
    const child = spawn(player, args, { stdio: 'ignore', detached: true });
    child.unref();

    if (player === 'ffplay') {
      // ffplay handles its own duration via -t, no kill needed
      return;
    }

    // Kill after durationSec
    const killTimer = setTimeout(() => {
      try { child.kill(); } catch { /* already exited */ }
    }, durationSec * 1000);
    killTimer.unref();

    // For players without native loop: respawn on exit until duration expires
    if (player !== 'mpv' && player !== 'ffplay') {
      const startTime = Date.now();
      const respawn = () => {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= durationSec) return;
        try {
          const next = spawn(player, args, { stdio: 'ignore', detached: true });
          next.unref();
          next.on('exit', respawn);
          // Also kill this child when overall duration expires
          const remaining = durationSec - elapsed;
          const t = setTimeout(() => {
            try { next.kill(); } catch { /* already exited */ }
          }, remaining * 1000);
          t.unref();
        } catch { /* done */ }
      };
      child.on('exit', respawn);
    }
  } catch {
    // Silently fail
  }
}

/** Resolve a SoundChoice to a file path, or null for bell/none */
function resolveSound(choice: SoundChoice, customPath?: string): string | null {
  if (choice === 'none' || choice === 'bell') return null;

  if (choice === 'custom' && customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  if (choice in TONE_GENERATORS) {
    return getToneFilePath(choice);
  }

  const bundledPath = BUNDLED_SOUND_PATHS[choice];
  if (bundledPath && fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  return findSystemSound(choice);
}

export function playSound(choice: SoundChoice, durationSec: number, volumePercent = 80, customPath?: string): void {
  if (choice === 'none') return;

  if (choice === 'bell') {
    process.stdout.write('\x07');
    return;
  }

  const filePath = resolveSound(choice, customPath);
  if (filePath) {
    playFile(filePath, durationSec, volumePercent);
  } else {
    // Fallback to bell
    process.stdout.write('\x07');
  }
}

export function playSoundForEvent(event: SoundEvent, soundConfig: SoundConfig): void {
  const choice = soundConfig[event];
  const customPath = soundConfig.customPaths[event];
  playSound(choice, soundConfig.alarmDuration, soundConfig.volume, customPath);
}

/** Preview a sound choice — plays once (short, not looped) */
export function previewSound(choice: SoundChoice, volumePercent = 80, customPath?: string): void {
  playSound(choice, 2, volumePercent, customPath);
}
