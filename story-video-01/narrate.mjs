// Records the story's narration: ONE request to ElevenLabs (Sarah, eleven_v4), asked for a
// conversational, energetic read. No fallback model and no retries: if the request fails it
// says so and stops. It will not record again while the take's file exists.
//   node narrate.mjs                                  Sarah → out/story-take-sarah-v4.mp3
//   node narrate.mjs --voice Charlie --name story-take-charlie-v4 --direction "[natural, conversational, lively]"
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const flag = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const name = flag("--name", "story-take-sarah-v4"), who = flag("--voice", "Sarah");
const audio = path.join(here, "out", `${name}.mp3`);
if (existsSync(audio)) { console.log("A take already exists; not recording another."); process.exit(0); }
const key = readFileSync(path.join(here, "../product-video/.env"), "utf8").match(/^ELEVENLABS_API_KEY=(.+)$/m)[1].trim();
const direction = flag("--direction", "[conversational, energetic]") + " "; // a delivery note the model follows without saying it
const text = "He cancelled on himself. Again. His gym bag was packed, but one meeting ran late. So he tried Habitnex and asked the coach for a different time. He could check the suggestion before changing his plan. Join the waitlist at Habitnex dot io.";

const voices = await (await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } })).json();
const sarah = voices.voices?.find((v) => v.name.startsWith(who)); // the voice to use (Sarah unless --voice says otherwise)
if (!sarah) { console.error(`${who} isn't in this account's voices; stopping.`); process.exit(1); }
const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${sarah.voice_id}/with-timestamps?output_format=mp3_44100_128`, {
  method: "POST",
  headers: { "xi-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({ text: direction + text, model_id: "eleven_v4", voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } }),
});
if (!response.ok) { console.error(`ElevenLabs refused the take (${response.status}): ${(await response.text()).slice(0, 240)}`); process.exit(1); }
const result = await response.json();
writeFileSync(audio, Buffer.from(result.audio_base64, "base64"));
writeFileSync(path.join(here, "out", `${name}.timings.json`), JSON.stringify({ text, direction, voice: sarah.name, model: "eleven_v4", start: result.alignment?.character_start_times_seconds, end: result.alignment?.character_end_times_seconds }));
console.log(`one take recorded: ${sarah.name}, eleven_v4, ${text.length} characters of script, ${result.alignment?.character_end_times_seconds.at(-1).toFixed(2)}s by the service's timings`);
