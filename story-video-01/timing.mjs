// Local timing for the story's narration. Finds the real pauses in the take, cuts it into its
// five sentences there, and sets them out along the film with room between them for the
// picture. Nothing is sped up, slowed or re-recorded. Writes:
//   out/story-narration-spaced.wav   the sentences in their film positions (mono)
//   out/story.json                   when each caption's words start, for the film to follow
// For another take: node timing.mjs --take story-take-charlie-v4 --name story-charlie
//   → out/story-charlie-narration-spaced.wav and out/story-charlie.json
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const ffmpeg = createRequire(path.join(here, "../product-video/package.json"))("ffmpeg-static");
const RATE = 48000;
const LEAD = 0.35;                 // picture before the first word
const GAPS = [1.0, 2.0, 1.0, 1.0]; // silence after sentences 1–4: the reaction beat gets the long one
const TAIL = 1.0;
const flag = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const take = flag("--take", "story-take-sarah-v4"), name = flag("--name", "story");
const guide = JSON.parse(readFileSync(path.join(here, "out", `${take}.timings.json`), "utf8"));
// Caption lines, and which of them begin a sentence.
const PHRASES = ["He cancelled on himself.", "Again.", "His gym bag was packed,", "but one meeting ran late.", "So he tried Habitnex", "and asked the coach for a different time.", "He could check the suggestion", "before changing his plan.", "Join the waitlist at Habitnex dot io."];
const SENTENCE = [0, 2, 4, 6, 8];
if (PHRASES.join(" ") !== guide.text) throw new Error("The captions don't match the recorded script.");

const raw = spawnSync(ffmpeg, ["-v", "error", "-i", path.join(here, "out", `${take}.mp3`), "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 28 }).stdout;
const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const levels = [];
for (let i = 0; i + 480 <= samples.length; i += 480) { let sum = 0; for (let j = 0; j < 480; j += 1) sum += samples[i + j] ** 2; levels.push(Math.sqrt(sum / 480)); }
const floor = Math.max(...levels) * 0.03;
const pauses = [];
let start = null;
levels.forEach((level, i) => {
  if (level < floor && start === null) start = i;
  if ((level >= floor || i === levels.length - 1) && start !== null) { if (i - start >= 8) pauses.push({ start: start / 100, end: i / 100 }); start = null; }
});
const first = levels.findIndex((level) => level >= floor) / 100;
const last = (levels.length - [...levels].reverse().findIndex((level) => level >= floor)) / 100;

// Where the service says each line starts (after the delivery note), slid to fit the real pauses.
let offset = guide.direction.length;
const guides = PHRASES.map((text) => { const at = guide.start[offset]; offset += text.length + 1; return at; });
const long = pauses.filter((p) => p.end - p.start >= 0.2 && p.start > first);
const nearestEnd = (time, list) => list.reduce((best, p) => (Math.abs(p.end - time) < Math.abs(best.end - time) ? p : best));
let slide = 0, lowest = Infinity;
for (let s = -0.8; s <= 0.8; s += 0.01) {
  const cost = SENTENCE.slice(1).reduce((sum, i) => sum + Math.abs(nearestEnd(guides[i] + s, long).end - guides[i] - s), 0);
  if (cost < lowest) { lowest = cost; slide = s; }
}
const source = PHRASES.map((text, i) => {
  const expected = guides[i] + slide;
  if (i === 0) return { at: Math.abs(first - expected) < 0.5 ? first : nearestEnd(expected, pauses).end, how: "first sound" };
  if (SENTENCE.includes(i)) { const pause = nearestEnd(expected, long); return { at: pause.end, how: "after a pause", pause }; }
  const near = pauses.filter((p) => Math.abs(p.end - expected) <= 0.25);
  return near.length ? { at: nearestEnd(expected, near).end, how: "after a short pause" } : { at: expected, how: "from the service's timing" };
});

// Each sentence: from just before its first sound to just after its last, then set out with gaps.
const segments = SENTENCE.map((phrase, k) => {
  const from = source[phrase].at - 0.03;
  const to = (k + 1 < SENTENCE.length ? source[SENTENCE[k + 1]].pause.start : last) + 0.1;
  return { phrase, from, to };
});
let cursor = LEAD;
segments.forEach((segment, k) => { segment.film = cursor; segment.filmEnd = cursor + (segment.to - segment.from) - 0.1; cursor = segment.filmEnd + (GAPS[k] ?? 0); });
const speechEnd = segments.at(-1).filmEnd;
const track = new Float32Array(Math.ceil((speechEnd + 0.4) * RATE));
for (const segment of segments) {
  const a = Math.round(segment.from * RATE), n = Math.round((segment.to - segment.from) * RATE), at = Math.round(segment.film * RATE), fade = Math.round(0.008 * RATE);
  for (let i = 0; i < n && a + i < samples.length; i += 1) track[at + i] += samples[a + i] * Math.min(1, i / fade, (n - 1 - i) / fade);
}
const data = Buffer.alloc(track.length * 2);
for (let i = 0; i < track.length; i += 1) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, track[i])) * 32767), i * 2);
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(data.length, 40);
writeFileSync(path.join(here, "out", `${name}-narration-spaced.wav`), Buffer.concat([header, data]));

const p = PHRASES.map((text, i) => { const segment = [...segments].reverse().find((s) => s.phrase <= i); return Number((segment.film + 0.03 + source[i].at - source[segment.phrase].at).toFixed(2)); });
const result = { voice: guide.voice, model: guide.model, lead: LEAD, tail: TAIL, gaps: GAPS, p, segmentEnds: segments.map((s) => Number(s.filmEnd.toFixed(2))), speechEnd: Number(speechEnd.toFixed(2)), phrases: PHRASES };
writeFileSync(path.join(here, "out", `${name}.json`), JSON.stringify(result, null, 2) + "\n");
console.log(`take: speech ${first.toFixed(2)}–${last.toFixed(2)}s (${(last - first).toFixed(2)}s), service timings off by ${slide.toFixed(2)}s`);
console.log("pauses in the take:", pauses.map((q) => `${q.start.toFixed(2)}-${q.end.toFixed(2)}`).join("  "));
PHRASES.forEach((text, i) => console.log(`take ${source[i].at.toFixed(2).padStart(5)}  film ${p[i].toFixed(2).padStart(5)}  ${source[i].how.padEnd(25)} ${text}`));
console.log(`speech ends in the film at ${speechEnd.toFixed(2)}s`);
