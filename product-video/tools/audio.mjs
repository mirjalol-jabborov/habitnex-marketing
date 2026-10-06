// The soundtrack: a recorded music track (music/music.json) fitted to the film's 120 BPM,
// the narration, and sound effects synthesized from the film's cue list (whooshes, impacts,
// taps). Without a music file it falls back to a synthesized track. Writes a 48 kHz stereo WAV.
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";

const RATE = 48000;
const TAU = Math.PI * 2;

/** Deterministic noise, so every render sounds the same. */
function noiseSource(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2147483648 - 1;
  };
}

class Mix {
  constructor(seconds) {
    this.length = Math.ceil(seconds * RATE);
    this.left = new Float32Array(this.length);
    this.right = new Float32Array(this.length);
    this.wet = [new Float32Array(this.length), new Float32Array(this.length)]; // reverb send
  }

  /** Adds a mono sound `render(time) → sample` lasting `seconds` at `at`, with pan (-1…1) and reverb send. */
  add(at, seconds, render, { gain = 1, pan = 0, send = 0 } = {}) {
    const start = Math.round(at * RATE);
    const count = Math.round(seconds * RATE);
    const l = Math.cos(((pan + 1) * Math.PI) / 4), r = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < count; i += 1) {
      const index = start + i;
      if (index < 0 || index >= this.length) continue;
      const sample = render(i / RATE) * gain;
      this.left[index] += sample * l;
      this.right[index] += sample * r;
      if (send) {
        this.wet[0][index] += sample * l * send;
        this.wet[1][index] += sample * r * send;
      }
    }
  }
}

const decay = (time, seconds) => Math.exp((-time * 5) / seconds);
const attack = (time, seconds) => Math.min(1, time / seconds);

// ---------- Sound effects ----------
const fx = {
  /** A soft finger tap: a short pitched "tock" with a tiny click on top. */
  tap(mix, at) {
    const noise = noiseSource(7);
    mix.add(at, 0.09, (t) => Math.sin(TAU * (760 - 2600 * t) * t) * decay(t, 0.05) * attack(t, 0.002), { gain: 0.2, send: 0.15 });
    mix.add(at, 0.012, (t) => noise() * decay(t, 0.006), { gain: 0.05 });
  },
  /** The habit block landing in its slot: a low, rounded thunk and a small tick. */
  snap(mix, at) {
    mix.add(at, 0.22, (t) => Math.sin(TAU * (150 * t - 260 * t * t)) * decay(t, 0.12) * attack(t, 0.003), { gain: 0.4, send: 0.1 });
    mix.add(at, 0.06, (t) => Math.sin(TAU * 1900 * t) * decay(t, 0.02), { gain: 0.07, send: 0.3 });
  },
  /** Notification: two soft bell notes, a fifth apart. */
  notify(mix, at) {
    const bell = (frequency) => (t) => (Math.sin(TAU * frequency * t) + 0.25 * Math.sin(TAU * frequency * 2.01 * t) * decay(t, 0.15)) * decay(t, 0.5) * attack(t, 0.004);
    mix.add(at, 0.9, bell(987.77), { gain: 0.16, send: 0.5, pan: -0.15 });
    mix.add(at + 0.11, 1.0, bell(1479.98), { gain: 0.14, send: 0.5, pan: 0.15 });
  },
  /** Something appearing: a quick upward blip. */
  pop(mix, at) {
    mix.add(at, 0.14, (t) => Math.sin(TAU * (480 * t + 1800 * t * t)) * decay(t, 0.08) * attack(t, 0.004), { gain: 0.13, send: 0.3 });
  },
  /** Habit kept: two rising notes and a soft low bump, like the success haptic. */
  done(mix, at) {
    const note = (frequency) => (t) => (Math.sin(TAU * frequency * t) + 0.2 * Math.sin(TAU * frequency * 2 * t)) * decay(t, 0.55) * attack(t, 0.004);
    mix.add(at, 0.2, (t) => Math.sin(TAU * (110 * t - 150 * t * t)) * decay(t, 0.1), { gain: 0.25 });
    mix.add(at, 0.9, note(1046.5), { gain: 0.16, send: 0.5, pan: -0.1 });
    mix.add(at + 0.1, 1.1, note(1567.98), { gain: 0.16, send: 0.5, pan: 0.1 });
  },
  /** A screen moving: band-passed noise that sweeps up and back, left to right. */
  whoosh(mix, at, { length = 0.6 } = {}) {
    const noise = noiseSource(Math.round(at * 1000) + 3);
    let low = 0, band = 0;
    const count = Math.round(length * RATE);
    const start = Math.round(at * RATE);
    for (let i = 0; i < count; i += 1) {
      const x = i / count;
      const cutoff = 350 + 1700 * Math.sin(Math.PI * x) ** 2;
      const f = 2 * Math.sin((Math.PI * cutoff) / RATE);
      const high = noise() - low - 0.9 * band; // state-variable filter
      band += f * high;
      low += f * band;
      const sample = band * Math.sin(Math.PI * x) ** 2 * 0.055;
      const index = start + i;
      if (index >= mix.length) break;
      const pan = -0.5 + x;
      mix.left[index] += sample * Math.cos(((pan + 1) * Math.PI) / 4);
      mix.right[index] += sample * Math.sin(((pan + 1) * Math.PI) / 4);
    }
  },
  /** One block or pill popping into place: a short blip, higher each time. */
  tick(mix, at, { step = 0 } = {}) {
    const frequency = 880 * 2 ** ((step % 12) / 12);
    mix.add(at, 0.07, (t) => Math.sin(TAU * frequency * t) * decay(t, 0.035) * attack(t, 0.002), { gain: 0.085, send: 0.35, pan: step % 2 ? 0.3 : -0.3 });
  },
  /** Something heavy landing: a low boom with a short thud of noise. */
  impact(mix, at, { size = 1 } = {}) {
    const noise = noiseSource(Math.round(at * 977) + 11);
    let low = 0;
    mix.add(at, 0.7, (t) => Math.sin(TAU * (62 * t - 28 * t * t)) * decay(t, 0.4) * attack(t, 0.003), { gain: 0.42 * size });
    mix.add(at, 0.16, (t) => { low += 0.12 * (noise() - low); return low * decay(t, 0.07); }, { gain: 0.5 * size, send: 0.25 });
  },
  /** Building up to a hit: noise that brightens and swells, then stops dead. */
  riser(mix, at, { length = 0.5 } = {}) {
    const noise = noiseSource(Math.round(at * 613) + 5);
    let low = 0, band = 0;
    mix.add(at, length, (t) => {
      const x = t / length;
      const f = 2 * Math.sin((Math.PI * (500 + 5000 * x * x)) / RATE);
      const high = noise() - low - 0.7 * band;
      band += f * high;
      low += f * band;
      return band * x * x;
    }, { gain: 0.07, send: 0.2 });
  },
  /** A card thrown aside: a short, sharp whoosh. */
  whip(mix, at) {
    const noise = noiseSource(Math.round(at * 331) + 9);
    let low = 0, band = 0;
    mix.add(at, 0.24, (t) => {
      const x = t / 0.24;
      const f = 2 * Math.sin((Math.PI * (900 + 3200 * Math.sin(Math.PI * x))) / RATE);
      const high = noise() - low - 0.8 * band;
      band += f * high;
      low += f * band;
      return band * Math.sin(Math.PI * x) ** 2;
    }, { gain: 0.1, send: 0.2, pan: -0.3 });
  },
  /** The clock running forward: quick light ticks. */
  ticks(mix, at, { length = 1 } = {}) {
    for (let time = 0; time < length; time += 0.075) {
      mix.add(at + time, 0.03, (t) => Math.sin(TAU * 2400 * t) * decay(t, 0.012), { gain: 0.035, send: 0.2, pan: 0.2 });
    }
  },
  /** Numbers counting up: soft ticks that climb in pitch. */
  rise(mix, at, { length = 0.8 } = {}) {
    const steps = 9;
    for (let i = 0; i < steps; i += 1) {
      const frequency = 660 * 2 ** (i / 12);
      // Spaced further apart toward the end, like a count settling.
      mix.add(at + length * (i / steps) ** 1.4, 0.08, (t) => Math.sin(TAU * frequency * t) * decay(t, 0.04) * attack(t, 0.002), { gain: 0.05, send: 0.3 });
    }
  },
};

// ---------- Music ----------
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
/** Two bars (four seconds) each: F maj7, A min7, C maj7, G6. The film ends on C, under the logo. */
const CHORDS = [
  { bass: 41, pad: [53, 57, 60, 64] },
  { bass: 45, pad: [57, 60, 64, 67] },
  { bass: 36, pad: [55, 59, 60, 64] },
  { bass: 43, pad: [55, 59, 62, 64] },
];
const BEAT = 0.5; // 120 BPM
const BAR = 4; // one chord: two bars of four beats
const STEP = BAR / 16; // eighth notes

/**
 * `drums` is the stretch (in seconds) where the beat plays: it comes in when the phone
 * tilts to find the gap and drops out for the logo.
 */
function music(mix, seconds, drums = [4, seconds - 4.8]) {
  const chords = Math.ceil(seconds / BAR);
  for (let index = 0; index < chords; index += 1) {
    const at = index * BAR;
    const last = at + BAR >= seconds - 1;
    const chord = at >= drums[1] ? CHORDS[2] : CHORDS[index % CHORDS.length];
    const hold = BAR + 1.2; // overlaps the next chord, so changes crossfade
    const shape = (t) => Math.min(1, t / 1.0) * Math.min(1, Math.max(0, (hold - t) / 1.2));

    chord.pad.forEach((midi, i) => {
      for (const detune of [-0.06, 0.06]) {
        const f = hz(midi + detune);
        mix.add(at, hold, (t) => (Math.sin(TAU * f * t) + 0.22 * Math.sin(TAU * 2 * f * t) + 0.07 * Math.sin(TAU * 3 * f * t)) * shape(t) * (1 + 0.12 * Math.sin(TAU * 0.21 * t + i)),
          { gain: 0.03, pan: detune > 0 ? 0.6 : -0.6, send: 0.5 });
      }
    });

    // Plucks walk up and down the chord, an octave above the pad.
    const pattern = [0, 2, 3, 2, 1, 2, 3, 2, 0, 2, 3, 1, 2, 3, 2, 1];
    pattern.forEach((degree, step) => {
      const time = at + step * STEP;
      if (last && step > 0) return; // one last note rings under the logo
      const f = hz(chord.pad[degree] + 12);
      const accent = step % 4 === 0 ? 1 : 0.7;
      mix.add(time, 0.6, (t) => (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2 * f * t) * decay(t, 0.08)) * decay(t, 0.26) * attack(t, 0.004),
        { gain: 0.07 * accent, pan: step % 2 ? 0.35 : -0.35, send: 0.6 });
    });

    // Bass: the root on every eighth while the beat plays, a held note otherwise.
    const bass = hz(chord.bass + (chord.bass < 40 ? 12 : 0));
    for (let step = 0; step < 16; step += 1) {
      const time = at + step * STEP;
      if (time < drums[0] || time >= drums[1]) continue;
      mix.add(time, 0.24, (t) => (Math.sin(TAU * bass * t) + 0.5 * Math.sin(TAU * 2 * bass * t) + 0.15 * Math.sin(TAU * 3 * bass * t)) * decay(t, 0.2) * attack(t, 0.005),
        { gain: step % 2 ? 0.075 : 0.105 });
    }
    if (at < drums[0] || at >= drums[1]) {
      mix.add(at, hold, (t) => (Math.sin(TAU * bass * t) + 0.3 * Math.sin(TAU * 2 * bass * t)) * shape(t), { gain: 0.06 });
    }
  }

  // Drums: kick on every beat, a clap on two and four, a hat on the off-beats.
  for (let time = drums[0]; time < drums[1] - 0.01; time += BEAT) {
    const beat = Math.round((time - drums[0]) / BEAT);
    // Pitch falls from about 170 Hz to 48 Hz in the first few hundredths of a second.
    mix.add(time, 0.28, (t) => Math.sin(TAU * (48 * t + 4 * (1 - Math.exp(-t * 32)))) * decay(t, 0.2) * attack(t, 0.002), { gain: 0.3 });
    const hat = noiseSource(beat * 7 + 1);
    let previous = 0;
    mix.add(time + BEAT / 2, 0.05, (t) => { const n = hat(); const high = n - previous; previous = n; return high * decay(t, 0.022); }, { gain: 0.05, pan: 0.25, send: 0.1 });
    if (beat % 2 === 1) {
      const clap = noiseSource(beat * 13 + 3);
      let low = 0, band = 0;
      mix.add(time, 0.2, (t) => {
        const f = 2 * Math.sin((Math.PI * 1500) / RATE);
        const high = clap() - low - 0.9 * band;
        band += f * high;
        low += f * band;
        // Three quick bursts, then a tail: the shape of a clap.
        const bursts = t < 0.03 ? Math.abs(Math.sin(TAU * 50 * t)) : decay(t - 0.03, 0.11);
        return band * bursts;
      }, { gain: 0.075, send: 0.45 });
    }
  }
}

// ---------- Reverb (four combs and two all-passes per side) ----------
function reverb(input, offsets) {
  const out = new Float32Array(input.length);
  for (const size of offsets.combs) {
    const buffer = new Float32Array(size);
    let index = 0, damp = 0;
    for (let i = 0; i < input.length; i += 1) {
      const delayed = buffer[index];
      damp = delayed * 0.6 + damp * 0.4;
      buffer[index] = input[i] + damp * 0.82;
      out[i] += delayed * 0.25;
      index = (index + 1) % size;
    }
  }
  for (const size of offsets.allpasses) {
    const buffer = new Float32Array(size);
    let index = 0;
    for (let i = 0; i < out.length; i += 1) {
      const delayed = buffer[index];
      const sample = out[i];
      buffer[index] = sample + delayed * 0.5;
      out[i] = delayed - sample * 0.5;
      index = (index + 1) % size;
    }
  }
  return out;
}

function wav(left, right) {
  const data = Buffer.alloc(left.length * 4);
  for (let i = 0; i < left.length; i += 1) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * The recorded track, stretched to 120 BPM and placed so its first kick lands at `kickAt`.
 * `track` is music.json's contents plus the folder it is in.
 */
function recorded(mix, seconds, track) {
  const ratio = 120 / track.bpm;
  const start = track.firstKick - track.kickAt * ratio; // where in the file the film begins
  const result = spawnSync(ffmpegPath, ["-v", "error", "-ss", String(Math.max(0, start)), "-i", track.path, "-af", `atempo=${ratio.toFixed(5)}`, "-t", String(seconds + 1), "-ac", "2", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 29 });
  if (result.status !== 0) throw new Error(`Couldn't read ${track.path}: ${result.stderr}`);
  const samples = new Float32Array(result.stdout.buffer, result.stdout.byteOffset, result.stdout.length / 4);
  const lead = Math.round((Math.max(0, -start) / ratio) * RATE); // silence first, if the film starts before the file does
  for (let i = 0; i * 2 + 1 < samples.length && lead + i < mix.length; i += 1) {
    mix.left[lead + i] += samples[i * 2];
    mix.right[lead + i] += samples[i * 2 + 1];
  }
}

/** Pitched blips that suit the synthesized track but clash with a recorded one. */
const SYNTH_ONLY = new Set(["tick", "ticks", "rise", "pop"]);

/** A mono 16-bit WAV (as written by tools/voice.mjs) → samples. */
async function readVoice(file) {
  const buffer = await readFile(file);
  const data = buffer.indexOf("data", 12) + 8;
  const samples = new Float32Array((buffer.length - data) / 2);
  for (let i = 0; i < samples.length; i += 1) samples[i] = buffer.readInt16LE(data + i * 2) / 32768;
  return samples;
}

const rms = (...channels) => Math.sqrt(channels.reduce((sum, c) => sum + c.reduce((a, x) => a + x * x, 0), 0) / channels.reduce((n, c) => n + c.length, 0));

/**
 * Builds the soundtrack and writes it to `file`.
 * `cues` are the sound effects ([{ at, kind, … }]), `voice` the spoken lines ([{ at, file }]).
 * Music and effects drop back under the voice and come up again between lines.
 */
export async function writeSoundtrack(file, { cues, duration, music: musicPlan = {}, voice = [], withMusic = true, withEffects = true }) {
  const bed = new Mix(duration);
  const effects = new Mix(duration);
  const track = musicPlan.track;
  if (withMusic) track ? recorded(bed, duration, track) : music(bed, duration, musicPlan.drums);
  if (withEffects) for (const cue of cues) if (!(track && SYNTH_ONLY.has(cue.kind))) fx[cue.kind]?.(effects, cue.at, cue);
  const length = bed.length;

  const addReverb = (mix, combs) => {
    const wetLeft = reverb(mix.wet[0], { combs: combs.map((c) => c), allpasses: [225, 556] });
    const wetRight = reverb(mix.wet[1], { combs: combs.map((c) => c + 23), allpasses: [248, 579] });
    for (let i = 0; i < length; i += 1) { mix.left[i] += wetLeft[i] * 0.5; mix.right[i] += wetRight[i] * 0.5; }
  };
  if (!track) addReverb(bed, [1557, 1617, 1491, 1422]); // a recorded track already has its own space
  addReverb(effects, [1557, 1617, 1491, 1422]);

  // Voice: every line brought to the same level, in the centre, dry.
  const speech = new Float32Array(length);
  for (const line of voice) {
    const samples = await readVoice(line.file);
    const loud = samples.filter((x) => Math.abs(x) > 0.02);
    const gain = 0.16 / (loud.length ? rms(loud) : 1);
    const start = Math.round(line.at * RATE);
    for (let i = 0; i < samples.length && start + i < length; i += 1) if (start + i >= 0) speech[start + i] += samples[i] * gain;
  }

  // How much is being said at each moment (quick to rise, a third of a second to fall).
  const talking = new Float32Array(length);
  const rise = Math.exp(-1 / (0.02 * RATE)), fall = Math.exp(-1 / (0.3 * RATE));
  let envelope = 0;
  for (let i = 0; i < length; i += 1) {
    const level = Math.abs(speech[i]);
    envelope = level > envelope ? level + (envelope - level) * rise : envelope * fall;
    talking[i] = Math.min(1, envelope / 0.08);
  }

  const left = new Float32Array(length), right = new Float32Array(length);
  const under = voice.length ? 0.112 : 0.141; // about -17 dBFS; 2 dB lower in a film with a voice
  // A recorded track is brought to level on its own, with the effects a fixed amount under it;
  // the synthesized one was written with its effects, so they are levelled together.
  const together = [bed.left, bed.right].map((channel, c) => channel.map((x, i) => x + (c ? effects.right[i] : effects.left[i])));
  const scale = under / ((track ? rms(bed.left, bed.right) : rms(...together)) || 1);
  const effectScale = track ? 0.6 * (under / 0.141) : scale;
  for (let i = 0; i < length; i += 1) {
    const time = i / RATE;
    const fade = Math.min(1, time / (track ? 0.6 : 0.05)) * Math.min(1, Math.max(0, (duration - time) / (track ? 2.2 : 1.4)));
    const bedGain = scale * (1 - 0.6 * talking[i]) * fade;
    const effectGain = effectScale * (1 - 0.35 * talking[i]) * fade;
    left[i] = bed.left[i] * bedGain + effects.left[i] * effectGain + speech[i];
    right[i] = bed.right[i] * bedGain + effects.right[i] * effectGain + speech[i];
  }

  // Hold the peaks under -1.5 dBFS with a limiter (instant attack, 120 ms release).
  const ceiling = 0.84;
  const release = Math.exp(-1 / (0.12 * RATE));
  let peak = 0;
  envelope = 0;
  for (let i = 0; i < length; i += 1) {
    envelope = Math.max(Math.abs(left[i]), Math.abs(right[i]), envelope * release);
    const gain = envelope > ceiling ? ceiling / envelope : 1;
    left[i] *= gain;
    right[i] *= gain;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  await writeFile(file, wav(left, right));
  const db = (x) => (20 * Math.log10(x)).toFixed(1);
  return { peakDb: db(peak), rmsDb: db(rms(left, right)) };
}
