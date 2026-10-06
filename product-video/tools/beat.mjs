// Measures a track for music/music.json: its exact tempo and when a beat falls.
//   node tools/beat.mjs music/track.mp3 <rough bpm> <second where the kick has come in> <second to stop at>
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
const [file, guess, from, to] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5])];
const RATE = 22050, HOP = 32;
const raw = spawnSync(ffmpegPath, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 29 }).stdout;
const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const frames = Math.floor(x.length / HOP), env = new Float32Array(frames);
let low = 0, low2 = 0;
for (let f = 0; f < frames; f += 1) { let e = 0; for (let i = 0; i < HOP; i += 1) { low += 0.03 * (x[f * HOP + i] - low); low2 += 0.03 * (low - low2); e += low2 * low2; } env[f] = e; }
const fps = RATE / HOP, period = 60 / guess;
// For each expected beat, the moment the kick's energy rises fastest near it.
const onsets = [];
let t = from;
// first: strongest rise in the first beat's window
const riseAt = (centre, half) => { let best = -1, at = centre; for (let f = Math.round((centre - half) * fps); f < (centre + half) * fps; f += 1) { const r = env[f + 4] - env[f - 4]; if (r > best) { best = r; at = f / fps; } } return [at, best]; };
[t] = riseAt(from + period / 2, period / 2);
for (let n = 0; t < to; n += 1) { const [at, strength] = riseAt(t, 0.06); onsets.push([n, at, strength]); t = at + period; }
const strong = onsets.filter(([, , s]) => s > 0);
const N = strong.length, sx = strong.reduce((a, o) => a + o[0], 0), sy = strong.reduce((a, o) => a + o[1], 0), sxx = strong.reduce((a, o) => a + o[0] * o[0], 0), sxy = strong.reduce((a, o) => a + o[0] * o[1], 0);
const beat = (N * sxy - sx * sy) / (N * sxx - sx * sx), first = (sy - beat * sx) / N;
const spread = Math.sqrt(strong.reduce((a, o) => a + (o[1] - (first + beat * o[0])) ** 2, 0) / N);
console.log(JSON.stringify({ file, bpm: Number((60 / beat).toFixed(3)), beat: Number(beat.toFixed(5)), firstBeat: Number(first.toFixed(4)), beats: N, spreadMs: Number((spread * 1000).toFixed(1)) }));
