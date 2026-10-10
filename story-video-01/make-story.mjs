// Builds the story draft from story.html: the illustrated scenes and real captures, the
// narration as laid out by timing.mjs, a quiet synthesized backing bed that ducks under the
// voice, and the checks (sync, mix, decoded frames, blank frames). Makes no network requests.
//
//   node make-story.mjs                 → out/habitnex-story-01.mp4 and its audio and sheets
//   node make-story.mjs --stills 0 2.3  → still frames at those seconds → out/stills/
//   node make-story.mjs --timing story-charlie --suffix charlie --bed electronic
//                                       → the same film timed to another take (see timing.mjs), with the
//                                         fuller backing track, as out/habitnex-story-01-charlie.mp4 …
import { spawnSync } from "node:child_process";
import http from "node:http";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../product-video/package.json")); // reuse its installed tools
const puppeteer = require("puppeteer-core");
const ffmpeg = require("ffmpeg-static");
const out = path.join(here, "out");
const option = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const timing = option("--timing", "story"), suffix = option("--suffix", ""), bed = option("--bed", "soft");
const tag = suffix ? `-${suffix}` : "";
const RATE = 48000, FPS = 30;
const run = (args, options = {}) => { const r = spawnSync(ffmpeg, args, { maxBuffer: 1 << 29, ...options }); if (r.status !== 0) throw new Error(r.stderr.toString().slice(-1500)); return r; };
const db = (x) => 20 * Math.log10(x);
const rms = (x, keep = () => true) => { let sum = 0, n = 0; for (let i = 0; i < x.length; i += 1) if (keep(i)) { sum += x[i] * x[i]; n += 1; } return Math.sqrt(sum / Math.max(1, n)); };

// ---------- The page ----------
const root = path.resolve(here, "..");
const types = { ".html": "text/html", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const server = http.createServer((request, response) => {
  try {
    const data = readFileSync(path.join(root, decodeURIComponent(new URL(request.url, "http://x").pathname)));
    response.writeHead(200, { "content-type": types[path.extname(request.url.split("?")[0])] ?? "application/octet-stream" });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
const page = await browser.newPage();
page.on("pageerror", (error) => console.error("page error:", error.message));
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${server.address().port}/story-video-01/story.html?timing=${timing}`);
await page.waitForFunction("window.READY === true", { timeout: 30000 });
const T = await page.evaluate("window.TIMES");
const finish = async () => { await browser.close(); server.close(); process.exit(0); };

if (process.argv.includes("--stills")) {
  const dir = path.join(out, "stills");
  mkdirSync(dir, { recursive: true });
  for (const t of process.argv.slice(process.argv.indexOf("--stills") + 1).map(Number)) {
    await page.evaluate((time) => window.seek(time), t);
    await page.screenshot({ path: path.join(dir, `t${t.toFixed(2).padStart(5, "0")}.png`) });
  }
  console.log(`duration ${T.duration}s; cuts at ${T.cuts.map((c) => c.toFixed(2)).join(", ")}`);
  await finish();
}

// ---------- Sound ----------
const length = Math.round(T.duration * RATE);
// The narration: the take's sentences where timing.mjs placed them. Speed and pitch are untouched.
const spaced = readFileSync(path.join(out, `${timing}-narration-spaced.wav`));
const voice = new Float32Array(length);
for (let i = 0, at = spaced.indexOf("data", 12) + 8; i < length && at + 1 < spaced.length; i += 1, at += 2) voice[i] = spaced.readInt16LE(at) / 32768;

/** An original backing bed, made here from sine waves: soft pad chords, a low root and light plucks at 96 BPM. */
function backing(seconds, endCard) {
  const left = new Float32Array(length), right = new Float32Array(length);
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const add = (at, dur, render, gain, pan = 0) => {
    const start = Math.round(at * RATE), l = Math.cos(((pan + 1) * Math.PI) / 4), r = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < dur * RATE && start + i < length; i += 1) { const s = render(i / RATE) * gain; left[start + i] += s * l; right[start + i] += s * r; }
  };
  const beat = 0.625, bar = 4 * beat;
  const chords = [ // A minor 7, F major 7, C, G: each for one bar
    { bass: 45, notes: [57, 60, 64, 67] }, { bass: 41, notes: [57, 60, 64, 65] }, { bass: 48, notes: [55, 60, 64, 67] }, { bass: 43, notes: [55, 59, 62, 67] },
  ];
  for (let index = 0; index * bar < seconds; index += 1) {
    const at = index * bar, chord = chords[index % 4], hold = bar + 1.3;
    const shape = (t) => Math.min(1, t / 1.0) * Math.min(1, Math.max(0, (hold - t) / 1.3));
    chord.notes.forEach((midi, n) => {
      for (const detune of [-0.07, 0.07]) {
        const f = hz(midi + detune);
        // A soft pad: a few harmonics that fall away quickly, breathing slowly.
        add(at, hold, (t) => (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) + 0.12 * Math.sin(6 * Math.PI * f * t)) * shape(t) * (1 + 0.15 * Math.sin(2 * Math.PI * 0.17 * t + n)), 0.05, detune > 0 ? 0.55 : -0.55);
      }
    });
    const root = hz(chord.bass);
    add(at, hold, (t) => (Math.sin(2 * Math.PI * root * t) + 0.25 * Math.sin(4 * Math.PI * root * t)) * shape(t), 0.11);
    // Light plucks up and down the chord, an octave above; they thin out under the end card.
    [0, 2, 1, 3, 2, 1, 3, 2].forEach((degree, step) => {
      const time = at + step * (beat / 2);
      if (time > endCard && step % 4) return;
      const f = hz(chord.notes[degree] + 12);
      add(time, 0.5, (t) => (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 30)) * Math.exp(-t * 11) * Math.min(1, t / 0.004), step % 4 ? 0.03 : 0.045, step % 2 ? 0.4 : -0.4);
    });
  }
  // A soft low thump on the first frame and as the waitlist card lands.
  for (const at of [0, endCard]) add(at, 0.7, (t) => Math.sin(2 * Math.PI * (52 * t + 3 * (1 - Math.exp(-t * 30)))) * Math.exp(-t * 7) * Math.min(1, t / 0.003), 0.3);
  // A little room: two feedback delays per side.
  for (const [channel, sizes] of [[left, [1557, 2311]], [right, [1617, 2399]]]) {
    const wet = new Float32Array(length);
    for (const size of sizes) { const buffer = new Float32Array(size); let k = 0; for (let i = 0; i < length; i += 1) { const d = buffer[k]; buffer[k] = channel[i] + d * 0.72; wet[i] += d * 0.3; k = (k + 1) % size; } }
    for (let i = 0; i < length; i += 1) channel[i] += wet[i] * 0.45;
  }
  return [left, right];
}
const [bedLeft, bedRight] = bed === "electronic" ? electronic(T) : backing(T.duration, T.end);

/**
 * A fuller original backing track, also made here from scratch: a light electronic groove at
 * 100 BPM. Kick, clap and hats; a restrained bass; electric-piano chords off the beat; a
 * plucked line with an echo; a quiet pad and a little air. The pad and bass dip with each
 * kick. The drums and bass drop out for the story's low point and come back as he picks up
 * his phone.
 */
function electronic(T) {
  const seconds = T.duration;
  const bus = () => [new Float32Array(length), new Float32Array(length)];
  const drums = bus(), tonal = bus(), pluck = bus();
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const add = (target, at, dur, render, gain, pan = 0) => {
    const start = Math.round(at * RATE), l = Math.cos(((pan + 1) * Math.PI) / 4), r = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < dur * RATE && start + i < length; i += 1) { if (start + i < 0) continue; const s = render(i / RATE) * gain; target[0][start + i] += s * l; target[1][start + i] += s * r; }
  };
  let seed = 7;
  const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const beat = 0.6, step = beat / 4, bar = 4 * beat;
  const chords = [ // A minor 7, F major 7, C, G: a bar each
    { bass: 45, notes: [57, 60, 64, 67] }, { bass: 41, notes: [57, 60, 64, 65] }, { bass: 48, notes: [55, 60, 64, 67] }, { bass: 43, notes: [55, 59, 62, 67] },
  ];
  // Where the groove plays: not during the low point (the facepalm), and it thins out once the voice is done.
  const groove = (time) => (time >= T.s5 - 0.05 && time < T.s6 - 0.1 ? 0 : 1);
  const kicks = [];
  for (let n = 0; n * step < seconds; n += 1) {
    const time = n * step, s = n % 16, chord = chords[Math.floor(n / 16) % 4], on = groove(time), late = time > T.end + 1.2;
    const swing = s % 2 ? 0.018 : 0;
    if (on && s % 4 === 0 && !(late && s % 8)) {
      kicks.push(time);
      add(drums, time, 0.3, (t) => Math.sin(2 * Math.PI * (46 * t + (64 / 38) * (1 - Math.exp(-38 * t)))) * Math.exp(-t * 11) * Math.min(1, t / 0.002), 0.5);
      add(drums, time, 0.006, (t) => noise() * (1 - t / 0.006), 0.08);
    }
    if (on && (s === 4 || s === 12) && !late) { // a soft clap: two quick bursts of band-passed noise
      let low = 0, band = 0;
      add(drums, time, 0.16, (t) => { const f = 2 * Math.sin((Math.PI * 1700) / RATE), high = noise() - low - 0.8 * band; band += f * high; low += f * band; return band * (t < 0.012 ? 0.7 : Math.exp(-(t - 0.012) * 34)); }, 0.11, 0.1);
    }
    if (on && !late) { // hats: the off-beat open a touch, the sixteenths barely there
      let previous = 0, before = 0;
      const level = s % 4 === 2 ? 0.05 : s % 2 ? 0.014 : 0.022, decayRate = s % 4 === 2 ? 55 : 110;
      add(drums, time + swing, 0.07, (t) => { const x = noise(), high = x - previous; previous = x; const higher = high - before; before = high; return higher * Math.exp(-t * decayRate); }, level, s % 2 ? 0.35 : -0.25);
    }
    const bassNote = { 0: [0, 0.34], 6: [0, 0.16], 10: [12, 0.16], 14: [7, 0.16] }[s];
    if (on && bassNote && !late) {
      const f = hz(chord.bass + bassNote[0]);
      add(tonal, time, bassNote[1] + 0.1, (t) => Math.tanh(1.6 * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t))) * Math.min(1, t / 0.006) * Math.min(1, Math.max(0, (bassNote[1] + 0.08 - t) / 0.08)), 0.2);
    }
    if (s === 3 || s === 11) { // electric-piano chord, off the beat
      chord.notes.slice(0, 3).forEach((midi, i) => {
        const f = hz(midi);
        add(tonal, time + swing + i * 0.006, 0.9, (t) => Math.sin(2 * Math.PI * f * t + 1.5 * Math.exp(-t * 7) * Math.sin(2 * Math.PI * f * t)) * Math.exp(-t * 4.2) * Math.min(1, t / 0.004), on ? 0.07 : 0.04, (i - 1) * 0.5);
      });
    }
    if (s % 2 === 0 && !late) { // the plucked line, an octave up
      const f = hz(chord.notes[[0, 2, 1, 3, 2, 3, 1, 2][s / 2]] + 12);
      add(pluck, time, 0.35, (t) => (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 40)) * Math.exp(-t * 16) * Math.min(1, t / 0.003), s % 8 === 0 ? 0.05 : 0.032, s % 4 ? 0.3 : -0.3);
    }
    if (s === 0) { // the pad: one soft chord a bar
      const hold = bar + 1.0;
      chord.notes.forEach((midi, i) => { for (const detune of [-0.06, 0.06]) { const f = hz(midi + detune); add(tonal, time, hold, (t) => (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * Math.min(1, t / 0.8) * Math.min(1, Math.max(0, (hold - t) / 1.0)) * (1 + 0.12 * Math.sin(2 * Math.PI * 0.19 * t + i)), 0.026, detune > 0 ? 0.6 : -0.6); } });
    }
  }
  // A short rise of filtered noise into the two turns of the story: the phone, and the waitlist card.
  for (const at of [T.s6 - 0.1, T.end]) {
    let low = 0, band = 0;
    add(tonal, at - 0.7, 0.7, (t) => { const x = t / 0.7, f = 2 * Math.sin((Math.PI * (600 + 5200 * x * x)) / RATE), high = noise() - low - 0.7 * band; band += f * high; low += f * band; return band * x * x; }, 0.05);
  }
  // Air: a whisper of high noise, moving slowly.
  { let previous = 0; add(tonal, 0, seconds, (t) => { const x = noise(), high = x - previous; previous = x; return high * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.11 * t)); }, 0.004); }
  // The echo on the plucked line: three sixteenths later, bouncing from side to side.
  const delay = Math.round(step * 3 * RATE);
  for (let i = delay; i < length; i += 1) { pluck[0][i] += pluck[1][i - delay] * 0.38; pluck[1][i] += pluck[0][i - delay] * 0.38; }
  // The pad, chords and bass dip with each kick, as on a dance record, only gently.
  const pump = new Float32Array(length).fill(1);
  for (const time of kicks) { const start = Math.round(time * RATE); for (let i = 0; i < 0.3 * RATE && start + i < length; i += 1) pump[start + i] = Math.min(pump[start + i], 1 - 0.35 * Math.exp(-(i / RATE) * 12)); }
  const left = new Float32Array(length), right = new Float32Array(length);
  for (let i = 0; i < length; i += 1) { left[i] = drums[0][i] + (tonal[0][i] + pluck[0][i]) * pump[i]; right[i] = drums[1][i] + (tonal[1][i] + pluck[1][i]) * pump[i]; }
  // A little room around everything but the lowest notes, then gentle saturation to round the peaks.
  for (const [channel, dry, sizes] of [[left, [tonal[0], pluck[0]], [1557, 2311]], [right, [tonal[1], pluck[1]], [1617, 2399]]]) {
    const wet = new Float32Array(length);
    for (const size of sizes) { const buffer = new Float32Array(size); let k = 0; for (let i = 0; i < length; i += 1) { const d = buffer[k]; buffer[k] = (dry[0][i] + dry[1][i] * 1.5) * 0.5 + d * 0.7; wet[i] += d * 0.3; k = (k + 1) % size; } }
    for (let i = 0; i < length; i += 1) channel[i] = Math.tanh((channel[i] + wet[i] * 0.4) * 1.1);
  }
  return [left, right];
}

// How much is being said at each moment: quick to rise, a third of a second to fall.
const talking = new Float32Array(length);
const rise = Math.exp(-1 / (0.02 * RATE)), fall = Math.exp(-1 / (0.35 * RATE));
let envelope = 0;
for (let i = 0; i < length; i += 1) { const level = Math.abs(voice[i]); envelope = level > envelope ? level + (envelope - level) * rise : envelope * fall; talking[i] = Math.min(1, envelope / 0.04); }
const speaking = (i) => talking[i] > 0.5;
const voiceLevel = rms(voice, speaking);
// The bed is set 13 dB under the voice and ducks a further 6 dB while someone is speaking. The
// pauses between lines are shorter than the duck's release, so it only comes up at the two ends.
const bedScale = (voiceLevel * 10 ** (-13 / 20)) / Math.sqrt((rms(bedLeft) ** 2 + rms(bedRight) ** 2) / 2);
const mixLeft = new Float32Array(length), mixRight = new Float32Array(length), bedOnly = new Float32Array(length);
for (let i = 0; i < length; i += 1) {
  const time = i / RATE;
  const gain = bedScale * (1 - 0.5 * talking[i]) * Math.min(1, time / 0.03) * Math.min(1, Math.max(0, (T.duration - time) / 1.4));
  mixLeft[i] = voice[i] + bedLeft[i] * gain;
  mixRight[i] = voice[i] + bedRight[i] * gain;
  bedOnly[i] = (bedLeft[i] + bedRight[i]) * 0.5 * gain;
}
function wav(file, channels) {
  const frames = channels[0].length, data = Buffer.alloc(frames * channels.length * 2);
  for (let i = 0; i < frames; i += 1) channels.forEach((c, n) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, c[i])) * 32767), (i * channels.length + n) * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels.length, 22); header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * channels.length * 2, 28); header.writeUInt16LE(channels.length * 2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([header, data]));
}
const loudness = (file) => { const log = run(["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr.toString(); const tail = log.slice(log.lastIndexOf("Summary:")); return { lufs: Number(tail.match(/I:\s+(-?[\d.]+) LUFS/)[1]), peak: Number(tail.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]) }; };

const narrationFile = path.join(out, `habitnex-story-01${tag}-narration.wav`);
wav(narrationFile, [voice, voice]); // the narration as it sits in the film: no speed, pitch or level change
const rawMix = path.join(out, `story-mix-raw${tag}.wav`), mixFile = path.join(out, `habitnex-story-01${tag}-mix.wav`);
wav(rawMix, [mixLeft, mixRight]);
// Bring the whole mix to about -16 LUFS, with a limiter holding the peaks under -1.5 dBFS.
const lift = Math.min(10, -16 - loudness(rawMix).lufs); // a quietly recorded take needs more; the limiter catches the peaks
run(["-y", "-v", "error", "-i", rawMix, "-af", `volume=${lift.toFixed(2)}dB,alimiter=limit=0.82:level=false:attack=3:release=60`, "-ar", String(RATE), "-c:a", "pcm_s16le", mixFile]);
rmSync(rawMix);

// ---------- Picture ----------
const frames = path.join(out, "frames");
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const total = Math.round(T.duration * FPS);
for (let frame = 0; frame < total; frame += 1) {
  await page.evaluate((time) => window.seek(time), frame / FPS);
  await page.screenshot({ path: path.join(frames, `${String(frame).padStart(5, "0")}.png`), optimizeForSpeed: true });
}
const film = path.join(out, `habitnex-story-01${tag}.mp4`);
run(["-y", "-v", "error", "-framerate", String(FPS), "-i", path.join(frames, "%05d.png"), "-i", mixFile,
  "-vf", "scale=1080:1920:out_color_matrix=bt709:out_range=tv,format=yuv420p", "-r", String(FPS),
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
  "-c:a", "aac", "-b:a", "192k", "-ar", String(RATE), "-ac", "2", "-t", String(T.duration), "-movflags", "+faststart", film]);
rmSync(frames, { recursive: true, force: true });

// ---------- Decoded frames: an even contact sheet, and both sides of every cut and caption change ----------
run(["-y", "-v", "error", "-i", film, "-vf", `fps=1/${(T.duration / 21).toFixed(3)},scale=270:480,tile=7x3`, "-frames:v", "1", path.join(out, `contact-sheet-story${tag}.png`)]);
// Either side of every cut, plus the first frame, the address appearing and the last frame.
const moments = [0, 0.45, ...T.cuts.flatMap((cut) => [cut - 0.07, cut + 0.1, cut + 0.5]), T.urlClear, T.duration - 0.1].slice(0, 30);
const hand = path.join(out, "hand");
mkdirSync(hand, { recursive: true });
moments.forEach((t, i) => run(["-y", "-v", "error", "-ss", t.toFixed(3), "-i", film, "-frames:v", "1", "-vf", `scale=216:384,drawtext=text='${t.toFixed(2)}':x=6:y=h-22:fontsize=18:fontcolor=yellow:font=Menlo`, path.join(hand, `${String(i + 1).padStart(2, "0")}.png`)]));
run(["-y", "-v", "error", "-framerate", "1", "-i", path.join(hand, "%02d.png"), "-vf", "tile=10x3", "-frames:v", "1", path.join(out, `transitions-story${tag}.png`)]);
rmSync(hand, { recursive: true, force: true });

// ---------- Checks ----------
const info = run(["-hide_banner", "-i", film, "-f", "null", "-"]).stderr.toString();
console.log(info.split("\n").filter((l) => /Duration|Stream #/.test(l)).map((l) => l.trim().slice(0, 104)).join("\n"));
// Sync: when each line starts in the narration track against when its caption appears.
const onsets = [];
let quiet = 99;
for (let i = 0; i + 480 <= length; i += 480) { const level = rms(voice.subarray(i, i + 480)); if (level < 0.004) quiet += 1; else { if (quiet >= 8) onsets.push(i / RATE); quiet = 0; } }
const shown = [0, ...T.captions.slice(1).map(([from]) => from), T.end];
const lines = ["He cancelled on himself.", "Again.", "His gym bag was packed,", "but one meeting ran late.", "So he tried Habitnex", "and asked the coach for a different time.", "He could check the suggestion", "before changing his plan.", "Join the waitlist… (end card)"];
console.log("line                                       heard  shown  picture leads by");
// A line that starts mid-sentence with no pause before it has no onset to measure: it follows the service's timings.
lines.forEach((text, i) => { if (!onsets.some((o) => Math.abs(o - T.p[i]) <= 0.12)) { console.log(text.padEnd(42), "    –", shown[i].toFixed(2).padStart(6), `   (expected at ${T.p[i].toFixed(2)}, from the service's timings)`); return; } const heard = onsets.reduce((best, o) => (Math.abs(o - T.p[i]) < Math.abs(best - T.p[i]) ? o : best)); console.log(text.padEnd(42), heard.toFixed(2).padStart(5), shown[i].toFixed(2).padStart(6), `${(heard - shown[i]).toFixed(2)}s`.padStart(8), ""); });
// Is the narration in the finished film where the narration track says it is?
const decode = (file) => { const raw = run(["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "-"]).stdout; return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4); };
const a = decode(film), b = decode(narrationFile);
let bestLag = 0, bestScore = -Infinity;
for (let lag = -400; lag <= 400; lag += 1) { let score = 0; for (let i = 8000; i < Math.min(a.length, b.length) - 8000; i += 3) score += a[i + lag] * b[i]; if (score > bestScore) { bestScore = score; bestLag = lag; } }
console.log(`narration in the film is offset ${(bestLag / 8).toFixed(1)} ms from the narration track`);
let lastWord = 0;
for (let i = 0; i + 480 <= length; i += 480) if (rms(voice.subarray(i, i + 480)) >= 0.004) lastWord = (i + 480) / RATE;
console.log(`speech ends ${lastWord.toFixed(2)}s; waitlist card from ${T.end.toFixed(2)}s; habitnex.io fully shown ${T.urlClear.toFixed(2)}–${T.duration.toFixed(2)}s (${(T.duration - T.urlClear).toFixed(2)}s)`);
const bedUnder = rms(bedOnly, speaking), bedAfter = rms(bedOnly, (i) => i > (lastWord + 0.3) * RATE && i < (T.duration - 0.4) * RATE);
console.log(`mix: voice ${db(voiceLevel).toFixed(1)} dBFS RMS while speaking; backing ${(db(voiceLevel) - db(bedUnder)).toFixed(1)} dB under it during speech, ${(db(voiceLevel) - db(bedAfter)).toFixed(1)} dB under once the voice has finished`);
// Blank frames: every tenth of a second, how much the picture varies; a flat frame would be near zero.
const gray = run(["-v", "error", "-i", film, "-vf", "fps=10,scale=54:96,format=gray", "-f", "rawvideo", "-"]).stdout;
let flattest = Infinity, flatAt = 0;
for (let f = 0; (f + 1) * 5184 <= gray.length; f += 1) { let sum = 0, sq = 0; for (let i = 0; i < 5184; i += 1) { const v = gray[f * 5184 + i]; sum += v; sq += v * v; } const spread = Math.sqrt(sq / 5184 - (sum / 5184) ** 2); if (spread < flattest) { flattest = spread; flatAt = f / 10; } }
console.log(`blank-frame check: the flattest of ${Math.floor(gray.length / 5184)} sampled frames is at ${flatAt.toFixed(1)}s (spread ${flattest.toFixed(1)} of 255; a blank frame would be about 0)`);
const final = loudness(film), alone = loudness(narrationFile);
console.log(`film audio ${final.lufs} LUFS, true peak ${final.peak} dBFS (lifted ${lift.toFixed(1)} dB); narration track alone ${alone.lufs} LUFS, peak ${alone.peak} dBFS`);
console.log(`wrote ${film}`);
await finish();
