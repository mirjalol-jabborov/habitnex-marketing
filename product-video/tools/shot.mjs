// Still frames for checking the film: node tools/shot.mjs 0 4.5 12.3 [--lang en] [--out preview]
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { openFilm, ROOT } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const times = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")).map(Number);
const out = path.join(ROOT, flag("--out", "preview"));
await mkdir(out, { recursive: true });
const film = await openFilm({ lang: flag("--lang", "en"), scale: Number(flag("--scale", 0.5)) });
for (const t of times) {
  await film.page.evaluate((time) => window.seek(time), t);
  await film.page.screenshot({ path: path.join(out, `t${t.toFixed(2).padStart(5, "0")}.png`) });
}
console.log(`duration ${film.duration}s, wrote ${times.length} frames to ${out}`);
await film.close();
