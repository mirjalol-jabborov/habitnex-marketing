// Compares when each line is heard in the finished film with when its caption appears.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const here = path.dirname(fileURLToPath(import.meta.url));
const ffmpeg = createRequire(path.join(here, "../product-video/package.json"))("ffmpeg-static");
// node check-sync.mjs [film] [timing json]
const film = path.resolve(here, process.argv[2] ?? "out/habitnex-review-01-voiced.mp4");
const info = spawnSync(ffmpeg, ["-hide_banner", "-i", film]).stderr.toString();
console.log(info.split("\n").filter((l) => /Duration|Stream/.test(l)).map((l) => l.trim().slice(0, 110)).join("\n"));
const raw = spawnSync(ffmpeg, ["-v", "error", "-i", film, "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "-"], { maxBuffer: 1 << 28 }).stdout;
const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const levels = [];
for (let i = 0; i + 480 <= x.length; i += 480) { let s = 0; for (let j = 0; j < 480; j += 1) s += x[i + j] ** 2; levels.push(Math.sqrt(s / 480)); }
const peak = Math.max(...levels), floor = peak * 0.03;
// Moments where speech starts after at least 80 ms of quiet.
const onsets = [];
let quiet = 99;
levels.forEach((level, i) => { if (level < floor) quiet += 1; else { if (quiet >= 8) onsets.push(i / 100); quiet = 0; } });
const lastSound = (levels.length - [...levels].reverse().findIndex((l) => l >= floor)) / 100;
const narration = JSON.parse(readFileSync(path.resolve(here, process.argv[3] ?? "out/narration.json"), "utf8"));
const lead = narration.lead ?? 0.4;
const p = narration.phrases.map((ph) => ph.start + lead);
const end = p[6] - 0.3;
const shown = [...p.slice(0, 6).map((at) => at - 0.05), end];
console.log(`last sound at ${lastSound.toFixed(2)}s; waitlist card from ${end.toFixed(2)}s`);
console.log("line                                   heard   shown   caption leads by");
narration.phrases.forEach((ph, i) => {
  const heard = onsets.reduce((best, o) => (Math.abs(o - p[i]) < Math.abs(best - p[i]) ? o : best));
  console.log(ph.text.slice(0, 36).padEnd(38), heard.toFixed(2).padStart(5), shown[i].toFixed(2).padStart(7), `${(heard - shown[i]).toFixed(2)}s`.padStart(9), i === 6 ? " (end card)" : "");
});
