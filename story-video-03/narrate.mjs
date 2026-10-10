// Records the story's narration: ONE request to ElevenLabs (Charlie, eleven_v4), asked for a
// natural, lively read at normal speed. No fallback model and no retries: if the request fails
// it says so and stops. It will not record again while the take's file exists.
//   node narrate.mjs --dry   checks everything short of the request (no audio, no credits)
//   node narrate.mjs         Charlie → out/story3-take-charlie-v4.mp3
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DIRECTION, TEXT } from "./script.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MODEL = "eleven_v4", who = "Charlie", name = "story3-take-charlie-v4";
const audio = path.join(here, "out", `${name}.mp3`);
mkdirSync(path.join(here, "out"), { recursive: true });
if (existsSync(audio)) { console.log("A take already exists; not recording another."); process.exit(0); }
const key = readFileSync(path.join(here, "../product-video/.env"), "utf8").match(/^ELEVENLABS_API_KEY=(.+)$/m)[1].trim();
const body = JSON.stringify({ text: DIRECTION + TEXT, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } });
if (process.argv.includes("--dry")) {
  console.log(`dry run: would ask for ${who}, ${MODEL}, ${TEXT.length} characters of script (${(DIRECTION + TEXT).length} with the delivery note), ${TEXT.split(/\s+/).length} words. Nothing sent.`);
  process.exit(0);
}

const voices = await (await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } })).json();
const voice = voices.voices?.find((v) => v.name.startsWith(who));
if (!voice) { console.error(`${who} isn't in this account's voices; stopping.`); process.exit(1); }
const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voice_id}/with-timestamps?output_format=mp3_44100_128`, {
  method: "POST",
  headers: { "xi-api-key": key, "content-type": "application/json" },
  body,
});
if (!response.ok) { console.error(`ElevenLabs refused the take (${response.status}): ${(await response.text()).slice(0, 240)}`); process.exit(1); }
const result = await response.json();
writeFileSync(audio, Buffer.from(result.audio_base64, "base64")); // the take is on disk before anything else can go wrong
const cost = response.headers.get("character-cost") ?? response.headers.get("x-character-count");
writeFileSync(path.join(here, "out", `${name}.timings.json`), JSON.stringify({ text: TEXT, direction: DIRECTION, voice: voice.name, model: MODEL, cost, start: result.alignment?.character_start_times_seconds, end: result.alignment?.character_end_times_seconds }));
console.log(`one take recorded: ${voice.name}, requested model ${MODEL} (accepted, no fallback in this script), ${TEXT.length} characters of script, ${result.alignment?.character_end_times_seconds?.at(-1)?.toFixed(2)}s by the service's timings${cost ? `, ${cost} credits charged` : ""}`);
