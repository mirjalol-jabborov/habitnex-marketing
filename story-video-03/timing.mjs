// Local timing for the story's narration. Finds the real pauses in the take, cuts it into its
// sentences there, and sets them out along the film with room between them for the picture.
// Nothing is sped up, slowed or re-recorded. Writes:
//   out/story3-narration-spaced.wav  the sentences in their film positions (mono)
//   out/story3.json                  when each caption's words start, for the film to follow
//
//   node timing.mjs                          from the take
//   node timing.mjs --draft --name story3-draft   an estimate from the word count, before any take exists
//   --target 48 sets the length aimed for; --hold 15=2.0,9=0.9 fixes the pause after a sentence
//   (by the number of its first line) for the picture to use.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DIRECTION, PHRASES, SENTENCE, TEXT } from "./script.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ffmpeg = createRequire(path.join(here, "../product-video/package.json"))("ffmpeg-static");
const RATE = 48000;
const LEAD = 0.35;                 // picture before the first word
// Silence after each sentence but the last, before it is scaled to bring the film to the target length.
const GAPS = [0.45, 0.6, 0.35, 0.7, 0.7, 0.8, 0.6, 0.6, 0.5, 2.0, 0.4, 0.7, 0.45];
const TAIL = 1.0;
const flag = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const draft = process.argv.includes("--draft");
const take = flag("--take", "story3-take-charlie-v4"), name = flag("--name", "story3"), target = Number(flag("--target", 48));
const held = Object.fromEntries(flag("--hold", "").split(",").filter(Boolean).map((pair) => pair.split("=").map(Number)));
mkdirSync(path.join(here, "out"), { recursive: true });

let source, last, samples = null, pauses = [], first = 0, slide = 0, voice = "estimate", model = "none";
if (draft) {
  // No take yet: about 2.9 words a second, a third of a second between sentences.
  let at = 0.2;
  source = PHRASES.map((text, i) => {
    const pause = SENTENCE.includes(i) && i > 0 ? { start: at, end: at + 0.35 } : null;
    if (pause) at = pause.end;
    const entry = { at, how: "estimate", pause };
    at += text.split(/\s+/).length / 2.9 + (/[,:]$/.test(text) ? 0.12 : 0);
    return entry;
  });
  last = at;
} else {
  const guide = JSON.parse(readFileSync(path.join(here, "out", `${take}.timings.json`), "utf8"));
  if (TEXT !== guide.text) throw new Error("The captions don't match the recorded script.");
  voice = guide.voice; model = guide.model;
  const raw = spawnSync(ffmpeg, ["-v", "error", "-i", path.join(here, "out", `${take}.mp3`), "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 28 }).stdout;
  samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const levels = [];
  for (let i = 0; i + 480 <= samples.length; i += 480) { let sum = 0; for (let j = 0; j < 480; j += 1) sum += samples[i + j] ** 2; levels.push(Math.sqrt(sum / 480)); }
  const floor = Math.max(...levels) * 0.03;
  let start = null;
  levels.forEach((level, i) => {
    if (level < floor && start === null) start = i;
    if ((level >= floor || i === levels.length - 1) && start !== null) { if (i - start >= 8) pauses.push({ start: start / 100, end: i / 100 }); start = null; }
  });
  first = levels.findIndex((level) => level >= floor) / 100;
  last = (levels.length - [...levels].reverse().findIndex((level) => level >= floor)) / 100;

  // Where the service says each line starts (after the delivery note), slid to fit the real pauses.
  let offset = DIRECTION.length;
  const guides = PHRASES.map((text) => { const at = guide.start[offset]; offset += text.length + 1; return at; });
  const long = pauses.filter((p) => p.end - p.start >= 0.2 && p.start > first);
  const nearestEnd = (time, list) => list.reduce((best, p) => (Math.abs(p.end - time) < Math.abs(best.end - time) ? p : best));
  let lowest = Infinity;
  for (let s = -0.8; s <= 0.8; s += 0.01) {
    const cost = SENTENCE.slice(1).reduce((sum, i) => sum + Math.abs(nearestEnd(guides[i] + s, long).end - guides[i] - s), 0);
    if (cost < lowest) { lowest = cost; slide = s; }
  }
  source = PHRASES.map((text, i) => {
    const expected = guides[i] + slide;
    if (i === 0) return { at: Math.abs(first - expected) < 0.5 ? first : nearestEnd(expected, pauses).end, how: "first sound" };
    if (SENTENCE.includes(i)) { const pause = nearestEnd(expected, long); return { at: pause.end, how: "after a pause", pause, miss: Math.abs(pause.end - expected) }; }
    const near = pauses.filter((p) => Math.abs(p.end - expected) <= 0.25);
    return near.length ? { at: nearestEnd(expected, near).end, how: "after a short pause" } : { at: expected, how: "from the service's timing" };
  });
  // Two sentences must never be cut at the same pause, and each cut should sit near where the service expects it.
  const cuts = SENTENCE.slice(1).map((i) => source[i].at);
  if (new Set(cuts).size !== cuts.length || cuts.some((at, k) => k && at <= cuts[k - 1])) throw new Error("Two sentences landed on the same pause; the take needs a look before it is cut.");
  SENTENCE.slice(1).forEach((i) => { if (source[i].miss > 0.4) console.warn(`check: “${PHRASES[i]}” is cut ${source[i].miss.toFixed(2)}s from where the service expects it`); });
}

// Each sentence: from just before its first sound to just after its last, then set out with gaps.
const segments = SENTENCE.map((phrase, k) => {
  const from = source[phrase].at - 0.03;
  const to = (k + 1 < SENTENCE.length ? source[SENTENCE[k + 1]].pause.start : last) + 0.1;
  return { phrase, from, to };
});
const gapList = GAPS.map((gap, k) => ({ gap, first: SENTENCE[k] }));
// Stretch or shrink the pauses (within reason) so the film comes out at about the target length.
const spoken = segments.reduce((sum, segment) => sum + (segment.to - segment.from) - 0.1, 0);
const fixed = gapList.filter((g) => held[g.first] != null).reduce((a, g) => a + held[g.first], 0);
const stretch = Math.max(0.7, Math.min(1.7, (target - LEAD - TAIL - spoken - fixed) / gapList.filter((g) => held[g.first] == null).reduce((a, g) => a + g.gap, 0)));
const gapsUsed = gapList.map((g) => held[g.first] ?? g.gap * stretch);
let cursor = LEAD;
segments.forEach((segment, k) => { segment.film = cursor; segment.filmEnd = cursor + (segment.to - segment.from) - 0.1; cursor = segment.filmEnd + (gapsUsed[k] ?? 0); });
const speechEnd = segments.at(-1).filmEnd;
if (samples) {
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
}

const segmentOf = (i) => [...segments].reverse().find((s) => s.phrase <= i);
const p = PHRASES.map((text, i) => Number((segmentOf(i).film + 0.03 + source[i].at - source[segmentOf(i).phrase].at).toFixed(2)));
const ends = PHRASES.map((text, i) => Number(segmentOf(i).filmEnd.toFixed(2))); // when the sentence each line belongs to finishes
const result = { voice, model, draft, lead: LEAD, tail: TAIL, gaps: gapsUsed.map((g) => Number(g.toFixed(2))), p, ends, segmentEnds: segments.map((s) => Number(s.filmEnd.toFixed(2))), speechEnd: Number(speechEnd.toFixed(2)), phrases: PHRASES };
writeFileSync(path.join(here, "out", `${name}.json`), JSON.stringify(result, null, 2) + "\n");
if (!draft) {
  console.log(`take: speech ${first.toFixed(2)}–${last.toFixed(2)}s (${(last - first).toFixed(2)}s), service timings off by ${slide.toFixed(2)}s`);
  console.log("pauses in the take:", pauses.map((q) => `${q.start.toFixed(2)}-${q.end.toFixed(2)}`).join("  "));
}
PHRASES.forEach((text, i) => console.log(`take ${source[i].at.toFixed(2).padStart(5)}  film ${p[i].toFixed(2).padStart(5)}  ${source[i].how.padEnd(25)} ${text}`));
console.log(`speech ends in the film at ${speechEnd.toFixed(2)}s (pauses scaled ×${stretch.toFixed(2)}; spoken ${spoken.toFixed(2)}s)`);
