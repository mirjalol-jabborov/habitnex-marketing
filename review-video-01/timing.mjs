// Works out when each caption's words are actually said in the narration take, from the
// pauses that can be heard in it. The service's own timings are only a guide: they can be a
// few tenths of a second out. Writes out/narration.json for the film to follow.
//   node timing.mjs                                   the take as recorded
//   node timing.mjs --in out/x.wav --tempo 0.85 --lead 0.7 --tail 1 --out out/y.json
//                                                     a slowed copy: the guide times stretch by the same amount
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const ffmpeg = createRequire(path.join(here, "../product-video/package.json"))("ffmpeg-static");
const RATE = 48000;
const flag = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const take = path.resolve(here, flag("--in", "out/narration-sarah-v4.mp3"));
const tempo = Number(flag("--tempo", 1));
const target = path.resolve(here, flag("--out", "out/narration.json"));
const guide = JSON.parse(readFileSync(path.join(here, "out", "narration-sarah-v4.timings.json"), "utf8"));
const PHRASES = ["Your meeting ran late.", "Does your workout disappear?", "I’m building Habitnex to help habits fit around your calendar.", "Talk to the coach,", "review the suggested change,", "then apply it when it works for you.", "Join the waitlist at Habitnex dot io."];
if (PHRASES.join(" ") !== guide.text) throw new Error("The captions no longer match the recorded script.");

const raw = spawnSync(ffmpeg, ["-v", "error", "-i", take, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 28 }).stdout;
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

// Where the service says each phrase starts, and whether a sentence ends just before it.
let offset = 0;
const guides = PHRASES.map((text, i) => { const at = guide.start[offset] / tempo; offset += text.length + 1; return { text, at, afterSentence: i > 0 && /[.?!]$/.test(PHRASES[i - 1]) }; });
// Slide the guides by whatever lines the sentence starts up best with the ends of real pauses.
const long = pauses.filter((p) => p.end - p.start >= 0.2 && p.start > first);
const nearestEnd = (time, list) => list.reduce((best, p) => (Math.abs(p.end - time) < Math.abs(best.end - time) ? p : best));
let slide = 0, lowest = Infinity;
for (let s = -0.8; s <= 0.8; s += 0.01) {
  const cost = guides.filter((g) => g.afterSentence).reduce((sum, g) => sum + Math.abs(nearestEnd(g.at + s, long).end - g.at - s), 0);
  if (cost < lowest) { lowest = cost; slide = s; }
}
const phrases = guides.map((g, i) => {
  if (i === 0) return { text: g.text, start: first, how: "first sound" };
  const expected = g.at + slide;
  if (g.afterSentence) return { text: g.text, start: nearestEnd(expected, long).end, how: "after a pause" };
  // Mid-sentence (after a comma): a short pause if there is one nearby, else the slid guide.
  const near = pauses.filter((p) => Math.abs(p.end - expected) <= 0.25);
  return near.length ? { text: g.text, start: nearestEnd(expected, near).end, how: "after a short pause" } : { text: g.text, start: expected, how: "from the service's timing" };
});
phrases.forEach((p, i) => (p.start = Number(p.start.toFixed(2))));
const extra = process.argv.includes("--lead") ? { tempo, lead: Number(flag("--lead")), tail: Number(flag("--tail", 0.7)) } : {};
const result = { voice: guide.voice, model: guide.model, ...extra, speechStart: Number(first.toFixed(2)), speechEnd: Number(last.toFixed(2)), guideOffBy: Number(slide.toFixed(2)), phrases };
writeFileSync(target, JSON.stringify(result, null, 2) + "\n");
console.log(`speech ${first.toFixed(2)}–${last.toFixed(2)}s, service timings off by ${slide.toFixed(2)}s`);
console.log("pauses:", pauses.map((p) => `${p.start.toFixed(2)}-${p.end.toFixed(2)}`).join("  "));
for (const p of phrases) console.log(String(p.start.toFixed(2)).padStart(6), p.how.padEnd(26), p.text);
