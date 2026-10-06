// Records the narration. The whole script is spoken in ONE take, so it has the flow of a
// person talking; the take is then cut into its lines (voice/<lang>/<line>.wav) with a
// manifest of each line's length and word timings. The film reads the manifest, places each
// line on the picture and makes room for what is said.
//
// The cuts are made in the pauses that can be heard in the recording. ElevenLabs' own
// timings say roughly where each line is, but they can be a few tenths of a second out, which
// is enough to cut a word in half.
//
//   node tools/voice.mjs [--lang en] [--voice Sarah] [--force]
//   node tools/voice.mjs --recut                           # cut the current take again, no new recording
//   node tools/voice.mjs --use Chris                       # switch to a take already in takes/ (an audition)
//   node tools/voice.mjs --audition Sarah,Chris,Jessica   # full takes to listen to, nothing else changes
//   node tools/voice.mjs --provider say                    # macOS voice, for testing the timing only
//
// The ElevenLabs key comes from the environment or a .env file here (ELEVENLABS_API_KEY=…).
// An unchanged script with the same voice is not recorded again.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { ROOT } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const lang = flag("--lang", "en");
const force = args.includes("--force");
const RATE = 48000;
const API = "https://api.elevenlabs.io/v1";

async function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return null;
  return (await readFile(file, "utf8")).match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? null;
}

const run = (bin, argv) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, argv, { stdio: ["ignore", "ignore", "pipe"] });
    let log = "";
    child.stderr.on("data", (chunk) => (log += chunk));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(log.slice(-1500)))));
  });

/** Any audio file → 48 kHz mono samples. */
async function decode(file) {
  const raw = file + ".raw";
  await run(ffmpegPath, ["-y", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", raw]);
  const buffer = await readFile(raw);
  await rm(raw);
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4).slice();
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Samples between two times, with a few milliseconds of fade at each end so the cut can't click. */
function cut(samples, from, to) {
  const piece = samples.slice(Math.max(0, Math.round(from * RATE)), Math.min(samples.length, Math.round(to * RATE)));
  const fade = Math.min(Math.round(0.008 * RATE), piece.length >> 1);
  for (let i = 0; i < fade; i += 1) { piece[i] *= i / fade; piece[piece.length - 1 - i] *= i / fade; }
  return piece;
}

async function eleven(key, pathname, body) {
  const response = await fetch(API + pathname, {
    method: body ? "POST" : "GET",
    headers: { "xi-api-key": key, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

/** How loud the recording is in each hundredth of a second. */
function loudness(samples) {
  const size = RATE / 100, levels = [];
  for (let i = 0; i + size <= samples.length; i += size) {
    let sum = 0;
    for (let j = 0; j < size; j += 1) sum += samples[i + j] ** 2;
    levels.push(Math.sqrt(sum / size));
  }
  return levels;
}

/** The pauses in a recording: stretches of at least a tenth of a second with nothing said. Times in seconds. */
function pauses(samples) {
  const levels = loudness(samples);
  const floor = Math.max(...levels) * 0.03;
  const found = [];
  let start = null;
  levels.forEach((level, i) => {
    if (level < floor && start === null) start = i;
    if ((level >= floor || i === levels.length - 1) && start !== null) {
      if (i - start >= 10) found.push({ start: start / 100, end: i / 100 });
      start = null;
    }
  });
  return found;
}

/**
 * Where to cut the take between each pair of lines. `guides` are the service's timings for
 * the gaps; each cut goes to the middle of the real pause nearest its guide, after sliding
 * all the guides by whatever amount lines them up best with the pauses.
 */
function findCuts(samples, guides) {
  // A pause between two lines is at least a fifth of a second; shorter ones are inside a word ("Stric-t").
  const gaps = pauses(samples).filter((gap) => gap.end - gap.start >= 0.2 && gap.start > 0.05 && gap.end < samples.length / RATE - 0.05);
  const middle = (gap) => (gap.start + gap.end) / 2;
  const nearest = (time) => gaps.reduce((best, gap) => (Math.abs(middle(gap) - time) < Math.abs(middle(best) - time) ? gap : best));
  if (gaps.length < guides.length) throw new Error(`Found ${gaps.length} pauses in the take but the script has ${guides.length + 1} lines; record it again (--force).`);
  let slide = 0, lowest = Infinity;
  for (let offset = -0.8; offset <= 0.8; offset += 0.01) {
    const cost = guides.reduce((sum, guide) => sum + Math.abs(middle(nearest(guide + offset)) - guide - offset), 0);
    if (cost < lowest) { lowest = cost; slide = offset; }
  }
  const chosen = guides.map((guide) => nearest(guide + slide));
  if (chosen.some((gap, i) => i > 0 && gap.start <= chosen[i - 1].start)) throw new Error("Two lines of the take run together with no pause between them; record it again (--force).");
  return { cuts: chosen.map(middle), slide };
}

/** The spoken part of a piece: silence trimmed, a breath left at each end. Returns samples and the time trimmed off the front. */
function trimmed(samples, from, to) {
  const levels = loudness(samples.subarray(Math.round(from * RATE), Math.round(to * RATE)));
  const floor = Math.max(...levels) * 0.04;
  const first = levels.findIndex((level) => level >= floor);
  const last = levels.length - 1 - [...levels].reverse().findIndex((level) => level >= floor);
  const start = Math.max(from, from + first / 100 - 0.03);
  const end = Math.min(to, from + (last + 1) / 100 + 0.14);
  return { samples: cut(samples, start, end), start };
}

/** One take of `text`: the audio file, and when each character is spoken. */
async function record(key, { text, voiceId, voice, model, settings, file }) {
  const result = await eleven(key, `/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, { text, model_id: model, voice_settings: settings });
  await writeFile(file, Buffer.from(result.audio_base64, "base64"));
  if (!result.alignment) throw new Error("ElevenLabs returned no timings for this take, so it can't be cut into lines.");
  const characters = { start: result.alignment.character_start_times_seconds, end: result.alignment.character_end_times_seconds };
  await writeFile(file.replace(/\.mp3$/, ".json"), JSON.stringify({ text, voice, model, ...characters }));
  return characters;
}

// ---------- Script and casting ----------
const strings = JSON.parse(await readFile(path.join(ROOT, "strings", `${lang}.json`), "utf8"));
const config = JSON.parse(await readFile(path.join(ROOT, "voice.config.json"), "utf8"));
const script = strings.voiceover.narration; // [[id, text], …]
// A delivery note in square brackets goes in front; the model follows it without saying it.
const direction = config.narrator.direction ? `${config.narrator.direction} ` : "";
const take = direction + script.map(([, text]) => text).join(" ");
const key = await apiKey();
const provider = flag("--provider", key ? "elevenlabs" : null);
if (!provider) {
  console.error("No ELEVENLABS_API_KEY found (environment or .env). Add one, or run with --provider say to test the timing with a macOS voice.");
  process.exit(1);
}
const out = path.join(ROOT, "voice", lang);
await mkdir(path.join(out, "takes"), { recursive: true });
const manifestFile = path.join(out, "manifest.json");

/** Records the take with the first of `names` the account may use. Returns the voice, model and timings. */
async function recordWith(names, file) {
  const voices = (await eleven(key, "/voices")).voices;
  let lastError;
  for (const wanted of names) {
    const match = voices.find((v) => v.voice_id === wanted || v.name.toLowerCase().startsWith(wanted.toLowerCase()));
    if (!match) continue;
    for (const model of [flag("--model", config.model), config.fallbackModel]) {
      try {
        const characters = await record(key, { text: take, voiceId: match.voice_id, voice: match.name, model, settings: config.narrator.settings, file });
        return { voice: match.name, model, characters };
      } catch (error) {
        lastError = error;
        console.warn(`  ${match.name} with ${model}: ${error.message.slice(0, 140)}`);
        if (/401|402|403/.test(error.message) && /voice|library|subscription|plan/i.test(error.message)) break; // this voice isn't allowed; try the next one
      }
    }
  }
  throw lastError ?? new Error(`None of ${names.join(", ")} is in this ElevenLabs account.`);
}

// Audition: full takes to listen to, and nothing else.
if (args.includes("--audition")) {
  for (const name of flag("--audition", "").split(",")) {
    const file = path.join(out, "takes", `${name.trim()}.mp3`);
    const { voice, model } = await recordWith([name.trim()], file);
    console.log(`voice/${lang}/takes/${name.trim()}.mp3  (${voice}, ${model})`);
  }
  process.exit(0);
}

const names = args.includes("--voice") ? [flag("--voice")] : config.narrator.voiceId ? [config.narrator.voiceId] : config.narrator.names;
const hash = createHash("sha1").update(JSON.stringify([provider, config.model, names, config.narrator.settings, take])).digest("hex").slice(0, 12);
const previous = existsSync(manifestFile) ? JSON.parse(await readFile(manifestFile, "utf8")) : null;
const use = flag("--use", null);
if (use) {
  // Make an earlier take the current one, then cut it.
  for (const ext of ["mp3", "json"]) await writeFile(path.join(out, "takes", `current.${ext}`), await readFile(path.join(out, "takes", `${use}.${ext}`)));
}
const recut = args.includes("--recut") || Boolean(use);
if (!force && !recut && previous?.hash === hash) {
  console.log(`voice/${lang}/ is up to date (${previous.voice}, ${previous.model}). Use --force for a new take.`);
  process.exit(0);
}

const manifest = { provider, hash, lines: {} };
const lines = [];

if (provider === "say") {
  // No timings from macOS, so each line is its own clip. Good enough to test with; it sounds robotic.
  Object.assign(manifest, { voice: config.narrator.say, model: "say" });
  for (const [id, text] of script) {
    const file = path.join(out, `${id}.aiff`);
    await run("say", ["-v", config.narrator.say, "-r", String(config.narrator.sayRate), "-o", file, text]);
    const samples = await decode(file);
    await rm(file);
    let first = 0, last = samples.length - 1;
    while (first < last && Math.abs(samples[first]) < 0.012) first += 1;
    while (last > first && Math.abs(samples[last]) < 0.012) last -= 1;
    lines.push({ id, text, samples: cut(samples, first / RATE - 0.02, last / RATE + 0.1), characters: null, offset: 0, from: 0 });
  }
} else {
  const file = path.join(out, "takes", "current.mp3");
  let voice, model, characters;
  if (recut) {
    const saved = JSON.parse(await readFile(file.replace(/\.mp3$/, ".json"), "utf8"));
    if (saved.text !== take) throw new Error("The script has changed since the current take was recorded; record it again instead of --recut.");
    ({ voice, model } = saved.voice ? saved : previous);
    characters = saved;
  } else {
    ({ voice, model, characters } = await recordWith(names, file));
  }
  Object.assign(manifest, { voice, model });
  const samples = await decode(file);
  // Where the service says each line is, then the real cuts, in the pauses nearest to those.
  let offset = direction.length;
  const spans = script.map(([id, text]) => {
    const span = { id, text, offset, start: characters.start[offset], end: characters.end[offset + text.length - 1] };
    offset += text.length + 1;
    return span;
  });
  const { cuts, slide } = findCuts(samples, spans.slice(1).map((span, i) => (spans[i].end + span.start) / 2));
  spans.forEach((span, i) => {
    const piece = trimmed(samples, i ? cuts[i - 1] : 0, cuts[i] ?? samples.length / RATE);
    // Words keep their spacing from the service's timings, starting where the speech really starts.
    lines.push({ ...span, samples: piece.samples, characters, from: span.start - 0.03 });
  });
  console.log(`one take: ${(samples.length / RATE).toFixed(1)}s, ${voice}, ${model}, timings off by ${Math.abs(slide).toFixed(2)}s  → voice/${lang}/takes/current.mp3`);
}

for (const line of lines) {
  await writeFile(path.join(out, `${line.id}.wav`), wav(line.samples));
  const duration = line.samples.length / RATE;
  let at = 0;
  const words = line.text.split(" ").map((word) => {
    const first = at, last = at + word.length - 1;
    at += word.length + 1;
    const start = line.characters ? line.characters.start[line.offset + first] - line.from : (duration * first) / line.text.length;
    const end = line.characters ? line.characters.end[line.offset + last] - line.from : (duration * (last + 1)) / line.text.length;
    return { word, start: Number(Math.max(0, start).toFixed(3)), end: Number(end.toFixed(3)) };
  });
  manifest.lines[line.id] = { file: `${line.id}.wav`, text: line.text, duration: Number(duration.toFixed(3)), words };
  console.log(`  ${line.id.padEnd(10)} ${duration.toFixed(2)}s  ${line.text}`);
}
await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
