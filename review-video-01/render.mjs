// Renders review draft 01: 1080 × 1920, 30 fps, silent, with an empty stereo audio track so a
// voiceover can be dropped in later without re-encoding the picture.
//   node render.mjs                     → out/habitnex-review-01-silent.mp4 and out/contact-sheet.png
//   node render.mjs --voiced            → out/habitnex-review-01-voiced.mp4 and out/contact-sheet-voiced.png,
//                                         timed to out/narration-sarah-v4.mp3 (run timing.mjs first)
//   node render.mjs --voiced --timing out/narration-final.json --audio out/narration-sarah-v4-tempo085.wav --suffix voiced-final
//                                       → the same, from a processed copy of the take, under another name
//   node render.mjs [--voiced] 3.2 12.8 → still frames at those seconds → out/stills/
import { spawnSync } from "node:child_process";
import http from "node:http";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../product-video/package.json")); // reuse its installed tools
const puppeteer = require("puppeteer-core");
const ffmpeg = require("ffmpeg-static");
const root = path.resolve(here, ".."); // serves this folder and product-video/assets
const types = { ".html": "text/html", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const voiced = process.argv.includes("--voiced");
const option = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const timing = option("--timing", null), narrationFile = option("--audio", "out/narration-sarah-v4.mp3"), suffix = option("--suffix", voiced ? "voiced" : "silent");
const server = http.createServer((request, response) => {
  try {
    const file = path.join(root, decodeURIComponent(new URL(request.url, "http://x").pathname));
    const data = readFileSync(file);
    response.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
const page = await browser.newPage();
page.on("pageerror", (error) => console.error("page error:", error.message));
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${server.address().port}/review-video-01/index.html${voiced ? `?voice=1${timing ? `&timing=${timing}` : ""}` : ""}`);
await page.waitForFunction("window.READY === true", { timeout: 30000 });
const duration = await page.evaluate("window.DURATION");
const fps = 30;
const out = path.join(here, "out");
const lead = await page.evaluate("window.LEAD");
const stills = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !["--timing", "--audio", "--suffix"].includes(all[i - 1])).map(Number);

if (stills.length) {
  mkdirSync(path.join(out, "stills"), { recursive: true });
  for (const t of stills) {
    await page.evaluate((time) => window.seek(time), t);
    await page.screenshot({ path: path.join(out, "stills", `t${t.toFixed(2).padStart(5, "0")}.png`) });
  }
  console.log(`wrote ${stills.length} stills`);
} else {
  const frames = path.join(out, "frames");
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const total = Math.round(duration * fps);
  for (let frame = 0; frame < total; frame += 1) {
    await page.evaluate((time) => window.seek(time), frame / fps);
    await page.screenshot({ path: path.join(frames, `${String(frame).padStart(5, "0")}.png`), optimizeForSpeed: true });
  }
  const film = path.join(out, `habitnex-review-01-${suffix}.mp4`);
  const sheet = path.join(out, suffix === "silent" ? "contact-sheet.png" : `contact-sheet-${suffix}.png`);
  const run = (args) => { const r = spawnSync(ffmpeg, args); if (r.status !== 0) throw new Error(r.stderr.toString().slice(-1500)); };
  // Sound: the narration, starting `lead` seconds in and padded with silence to the end; or an empty track.
  const sound = voiced
    ? ["-i", path.resolve(here, narrationFile), "-af", `adelay=${Math.round(lead * 1000)}:all=1,apad`]
    : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
  run(["-y", "-framerate", String(fps), "-i", path.join(frames, "%05d.png"), ...sound,
    "-vf", "scale=1080:1920:out_color_matrix=bt709:out_range=tv,format=yuv420p", "-r", String(fps),
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", voiced ? "192k" : "128k", "-ar", "48000", "-ac", "2", "-t", String(duration), "-movflags", "+faststart", film]);
  run(["-y", "-i", film, "-vf", `fps=1/${(duration / 14).toFixed(3)},scale=270:480,tile=7x2`, "-frames:v", "1", sheet]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`wrote ${film} (${total} frames, ${duration}s) and ${path.basename(sheet)}`);
}
await browser.close();
server.close();
process.exit(0);
