// Builds revision 2 of the review draft from rev2.html: the original narration take at its
// natural speed, a quiet synthesized backing bed that ducks under the voice, the picture, and
// the checks (sync, mix, decoded frames). Makes no network requests.
//
//   node make-rev2.mjs                 → out/habitnex-review-01-rev2.mp4 and its audio and sheets
//   node make-rev2.mjs --stills 0 2.3  → still frames at those seconds → out/stills-rev2/
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
await page.goto(`http://127.0.0.1:${server.address().port}/review-video-01/rev2.html`);
await page.waitForFunction("window.READY === true", { timeout: 30000 });
const T = await page.evaluate("window.TIMES");
const finish = async () => { await browser.close(); server.close(); process.exit(0); };

if (process.argv.includes("--stills")) {
  const dir = path.join(out, "stills-rev2");
  mkdirSync(dir, { recursive: true });
  for (const t of process.argv.slice(process.argv.indexOf("--stills") + 1).map(Number)) {
    await page.evaluate((time) => window.seek(time), t);
    await page.screenshot({ path: path.join(dir, `t${t.toFixed(2).padStart(5, "0")}.png`) });
  }
  console.log(`duration ${T.duration}s; cuts at ${T.toChat.toFixed(2)}, ${T.closeUp.toFixed(2)}, ${T.sheet.toFixed(2)}, ${T.end.toFixed(2)}`);
  await finish();
}

// ---------- Sound ----------
const length = Math.round(T.duration * RATE);
// The narration: the original take, untouched, placed `lead` seconds in.
const take = run(["-v", "error", "-i", path.join(out, "narration-sarah-v4.mp3"), "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"]).stdout;
const takeSamples = new Float32Array(take.buffer, take.byteOffset, take.length / 4);
const voice = new Float32Array(length);
const offset = Math.round(T.lead * RATE);
for (let i = 0; i < takeSamples.length && offset + i < length; i += 1) voice[offset + i] = takeSamples[i];

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
const [bedLeft, bedRight] = backing(T.duration, T.end);

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

const narrationFile = path.join(out, "habitnex-review-01-rev2-narration-natural.wav");
wav(narrationFile, [voice, voice]); // the take as recorded: no speed, pitch or level change, only placed in time
const rawMix = path.join(out, "rev2-mix-raw.wav"), mixFile = path.join(out, "habitnex-review-01-rev2-mix.wav");
wav(rawMix, [mixLeft, mixRight]);
// Bring the whole mix to about -16 LUFS, with a limiter holding the peaks under -1.5 dBFS.
const lift = Math.min(6, -16 - loudness(rawMix).lufs);
run(["-y", "-v", "error", "-i", rawMix, "-af", `volume=${lift.toFixed(2)}dB,alimiter=limit=0.82:level=false:attack=3:release=60`, "-ar", String(RATE), "-c:a", "pcm_s16le", mixFile]);
rmSync(rawMix);

// ---------- Picture ----------
const frames = path.join(out, "frames-rev2");
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const total = Math.round(T.duration * FPS);
for (let frame = 0; frame < total; frame += 1) {
  await page.evaluate((time) => window.seek(time), frame / FPS);
  await page.screenshot({ path: path.join(frames, `${String(frame).padStart(5, "0")}.png`), optimizeForSpeed: true });
}
const film = path.join(out, "habitnex-review-01-rev2.mp4");
run(["-y", "-v", "error", "-framerate", String(FPS), "-i", path.join(frames, "%05d.png"), "-i", mixFile,
  "-vf", "scale=1080:1920:out_color_matrix=bt709:out_range=tv,format=yuv420p", "-r", String(FPS),
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
  "-c:a", "aac", "-b:a", "192k", "-ar", String(RATE), "-ac", "2", "-t", String(T.duration), "-movflags", "+faststart", film]);
rmSync(frames, { recursive: true, force: true });

// ---------- Decoded frames: an even contact sheet, and both sides of every cut and caption change ----------
run(["-y", "-v", "error", "-i", film, "-vf", `fps=1/${(T.duration / 14).toFixed(3)},scale=270:480,tile=7x2`, "-frames:v", "1", path.join(out, "contact-sheet-rev2.png")]);
const moments = [0, 0.5, T.p[1] - 0.15, T.p[1] + 0.4, T.toChat - 0.05, T.toChat + 0.17, T.toChat + 0.45, T.closeUp - 0.05, T.closeUp + 0.4, T.bubbles + 0.4, T.change + 0.5, T.previewButton + 0.35, T.sheet + 0.05, T.sheet + 0.2, T.sheet + 0.6, T.apply + 0.6, T.end - 0.2, T.end + 0.1, T.urlClear, T.duration - 0.1];
const hand = path.join(out, "hand-rev2");
mkdirSync(hand, { recursive: true });
moments.forEach((t, i) => run(["-y", "-v", "error", "-ss", t.toFixed(3), "-i", film, "-frames:v", "1", "-vf", `scale=216:384,drawtext=text='${t.toFixed(2)}':x=6:y=h-22:fontsize=18:fontcolor=yellow:font=Menlo`, path.join(hand, `${String(i + 1).padStart(2, "0")}.png`)]));
run(["-y", "-v", "error", "-framerate", "1", "-i", path.join(hand, "%02d.png"), "-vf", "tile=10x2", "-frames:v", "1", path.join(out, "handoffs-rev2.png")]);
rmSync(hand, { recursive: true, force: true });

// ---------- Checks ----------
const info = run(["-hide_banner", "-i", film, "-f", "null", "-"]).stderr.toString();
console.log(info.split("\n").filter((l) => /Duration|Stream #/.test(l)).map((l) => l.trim().slice(0, 104)).join("\n"));
// Sync: when each line starts in the narration track against when its caption appears.
const onsets = [];
let quiet = 99;
for (let i = 0; i + 480 <= length; i += 480) { const level = rms(voice.subarray(i, i + 480)); if (level < 0.004) quiet += 1; else { if (quiet >= 8) onsets.push(i / RATE); quiet = 0; } }
const shown = [0, ...T.captions.slice(1).map(([from]) => from), T.end];
const lines = ["Your meeting ran late.", "Does your workout disappear?", "I’m building Habitnex…", "Talk to the coach,", "review the suggested change,", "then apply it when it works for you.", "Join the waitlist… (end card)"];
console.log("line                                  heard  shown  picture leads by");
lines.forEach((text, i) => { const heard = onsets.reduce((best, o) => (Math.abs(o - T.p[i]) < Math.abs(best - T.p[i]) ? o : best)); console.log(text.padEnd(37), heard.toFixed(2).padStart(5), shown[i].toFixed(2).padStart(6), `${(heard - shown[i]).toFixed(2)}s`.padStart(8)); });
// Is the narration in the finished film where the narration track says it is?
const decode = (file) => { const raw = run(["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "-"]).stdout; return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4); };
const a = decode(film), b = decode(narrationFile);
let bestLag = 0, bestScore = -Infinity;
for (let lag = -400; lag <= 400; lag += 1) { let score = 0; for (let i = 8000; i < Math.min(a.length, b.length) - 8000; i += 3) score += a[i + lag] * b[i]; if (score > bestScore) { bestScore = score; bestLag = lag; } }
console.log(`narration in the film is offset ${(bestLag / 8).toFixed(1)} ms from the narration track`);
let lastWord = 0;
for (let i = 0; i + 480 <= length; i += 480) if (rms(voice.subarray(i, i + 480)) >= 0.004) lastWord = (i + 480) / RATE;
console.log(`speech ends ${lastWord.toFixed(2)}s; waitlist card from ${T.end.toFixed(2)}s; habitnex.io fully shown ${T.urlClear.toFixed(2)}–${T.duration.toFixed(2)}s (${(T.duration - T.urlClear).toFixed(2)}s)`);
const bedUnder = rms(bedOnly, speaking), bedAfter = rms(bedOnly, (i) => i > (lastWord + 0.5) * RATE && i < (T.duration - 0.6) * RATE);
console.log(`mix: voice ${db(voiceLevel).toFixed(1)} dBFS RMS while speaking; backing ${(db(voiceLevel) - db(bedUnder)).toFixed(1)} dB under it during speech, ${(db(voiceLevel) - db(bedAfter)).toFixed(1)} dB under once the voice has finished`);
const final = loudness(film), alone = loudness(narrationFile);
console.log(`film audio ${final.lufs} LUFS, true peak ${final.peak} dBFS (lifted ${lift.toFixed(1)} dB); narration track alone ${alone.lufs} LUFS, peak ${alone.peak} dBFS`);
console.log(`wrote ${film}`);
await finish();
