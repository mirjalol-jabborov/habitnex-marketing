// One clean still of the Today timeline from the existing product video's source (a rebuilt
// screen, not a capture), at the same size as an iPhone 17 Pro screenshot.
import path from "node:path";
import { openFilm } from "../product-video/tools/lib.mjs";
const film = await openFilm({ voice: false });
await film.page.setViewport({ width: 1300, height: 2700, deviceScaleFactor: 1 });
const at = await film.page.evaluate("T.pull + 1.0");
await film.page.evaluate((t) => {
  window.seek(t);
  for (const id of ["#caps", "#type", "#shapes", "#hero", "#intro", "#morph", "#end"]) document.querySelector(id).style.display = "none";
  document.querySelector("#stage").style.cssText = "width:1300px;height:2700px;overflow:visible;background:#000";
  document.querySelector("#world").style.perspective = "none";
  document.querySelector("#cam").style.transform = "none";
}, at);
const clip = await film.page.evaluate(() => { const r = document.querySelector("#screen").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
await film.page.screenshot({ path: path.resolve(process.argv[2]), clip });
console.log("timeline still", Math.round(clip.width), "x", Math.round(clip.height), "at", at.toFixed(2), "s");
await film.close(); process.exit(0);
