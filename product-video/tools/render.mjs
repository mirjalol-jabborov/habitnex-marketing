// Renders the film to an MP4: steps headless Chrome through every frame, synthesizes the
// soundtrack from the film's cue list, and encodes both with ffmpeg.
//
//   node tools/render.mjs [--lang en] [--fps 60] [--blur 8] [--out out/habitnex-en.mp4] [--no-voice] [--no-music] [--no-audio] [--workers 6]
//
// If voice/<lang>/manifest.json exists (see tools/voice.mjs) the voiceover is mixed in and the
// film makes room for it; --no-voice renders the shorter, unspoken cut.
//
// Motion blur is real: each frame is `--blur` captures spread over half the frame's time
// (a 180° shutter), averaged together. `--blur 1` turns it off and renders four times faster.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { writeSoundtrack } from "./audio.mjs";
import { openFilm, ROOT } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const lang = flag("--lang", "en");
const fps = Number(flag("--fps", 60));
const workers = Number(flag("--workers", 6));
const samples = Math.max(1, Number(flag("--blur", 8)));
const withVoice = !args.includes("--no-voice");
const out = path.resolve(ROOT, flag("--out", `out/habitnex-${lang}.mp4`));
const frames = path.join(ROOT, "out", `frames-${lang}`);

const run = (bin, argv) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, argv, { stdio: ["ignore", "ignore", "pipe"] });
    let log = "";
    child.stderr.on("data", (chunk) => (log += chunk));
    child.on("close", (code) => (code === 0 ? resolve(log) : reject(new Error(log.slice(-2000)))));
  });

await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });
await mkdir(path.dirname(out), { recursive: true });

// Frames: each worker is its own page and takes every Nth frame.
const started = Date.now();
const films = await Promise.all(Array.from({ length: workers }, () => openFilm({ lang, voice: withVoice })));
const { duration, cues, spoken, music } = films[0];
const total = Math.round(duration * fps) * samples;
let finished = 0;
await Promise.all(
  films.map(async (film, worker) => {
    for (let capture = worker; capture < total; capture += workers) {
      const frame = Math.floor(capture / samples);
      const time = (frame + (0.5 * (capture % samples)) / samples) / fps;
      await film.page.evaluate((seconds) => window.seek(seconds), time);
      await film.page.screenshot({ path: path.join(frames, `${String(capture).padStart(6, "0")}.jpg`), type: "jpeg", quality: 96, optimizeForSpeed: true });
      finished += 1;
      if (finished % 1000 === 0) console.log(`  ${finished}/${total} captures`);
    }
    await film.close();
  })
);
console.log(`${total} captures in ${((Date.now() - started) / 1000).toFixed(0)}s`);

// Sound
const audio = path.join(ROOT, "out", `soundtrack-${lang}.wav`);
const withAudio = !args.includes("--no-audio");
if (withAudio) {
  const voice = spoken.map((line) => ({ at: line.at, file: path.join(ROOT, "voice", lang, line.file) }));
  // The recorded track, unless --synth-music asks for the synthesized one.
  const trackFile = path.join(ROOT, "music", "music.json");
  if (existsSync(trackFile) && !args.includes("--synth-music")) {
    const track = JSON.parse(await readFile(trackFile, "utf8"));
    music.track = { ...track, path: path.join(ROOT, "music", track.file) };
  }
  const levels = await writeSoundtrack(audio, { cues, duration, music, voice, withMusic: !args.includes("--no-music") });
  console.log(`soundtrack: ${voice.length} spoken lines, peak ${levels.peakDb} dBFS, RMS ${levels.rmsDb} dBFS`);
}

// Encode: H.264 high profile, BT.709, AAC. Plays on TikTok, Reels and the App Store.
await run(ffmpegPath, [
  "-y", "-framerate", String(fps * samples), "-i", path.join(frames, "%06d.jpg"),
  ...(withAudio ? ["-i", audio] : []),
  "-vf", `${samples > 1 ? `tmix=frames=${samples},select='not(mod(n-${samples - 1}\\,${samples}))',setpts=N/(${fps}*TB),` : ""}scale=1080:1920:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
  "-r", String(fps),
  "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-profile:v", "high", "-bf", "2", "-g", String(fps * 2),
  "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
  ...(withAudio ? ["-c:a", "aac", "-b:a", "256k", "-ar", "48000"] : []),
  "-t", String(duration), "-movflags", "+faststart", out,
]);
if (!args.includes("--keep-frames")) await rm(frames, { recursive: true, force: true });
console.log(`wrote ${out}`);
process.exit(0);
