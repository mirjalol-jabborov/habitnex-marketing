// Renders the App Store screenshots: every .frame in frames.html becomes out/<lang>/<id>.png,
// 1320 × 2868, and all of them side by side become out/<lang>/overview.png, to look at together.
// Then the two creative assets in placements.html: out/<lang>/header.png (3840 × 1646) and
// out/<lang>/search-results.png (3840 × 2560), and each with Apple's safe area drawn on it in
// out/<lang>/guides/, to check that the words sit inside it.
//
//   node tools/render.mjs            English
//   node tools/render.mjs --lang ja  another language, once captures/ja/ and its words exist
//   node tools/render.mjs --lang ja --also 1206x2622
//                                    the same frames again at another App Store size (here the 6.3-inch
//                                    iPhone), in out/<lang>/1206x2622/. The two sizes have the same shape
//                                    to within a pixel, so the big ones are scaled down, not drawn again.
//
// It uses the Chrome and the puppeteer-core that the product video already has.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const require = createRequire(path.join(root, "../product-video/package.json"));
const puppeteer = require("puppeteer-core");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const lang = process.argv.includes("--lang") ? process.argv[process.argv.indexOf("--lang") + 1] : "en";
const out = path.join(root, "out", lang);
fs.mkdirSync(out, { recursive: true });
const also = process.argv.includes("--also") ? process.argv[process.argv.indexOf("--also") + 1] : null;
if (also && !/^\d+x\d+$/.test(also)) throw new Error("--also takes a size like 1206x2622");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 2948, deviceScaleFactor: 1 });
  await page.goto(`${pathToFileURL(path.join(root, "frames.html"))}?lang=${lang}`, { waitUntil: "networkidle0" });
  // The page swaps in the language's captures and words and fits the headlines; wait for all of it.
  await page.waitForFunction('document.documentElement.dataset.ready === "yes"');
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  const frames = await page.$$(".frame");
  const ffmpeg = also ? require("ffmpeg-static") : null;
  if (also) fs.mkdirSync(path.join(out, also), { recursive: true });
  for (const frame of frames) {
    const id = await frame.evaluate((el) => el.id);
    await frame.screenshot({ path: path.join(out, `${id}.png`) });
    console.log(`out/${lang}/${id}.png`);
    if (also) {
      const small = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", path.join(out, `${id}.png`), "-vf", `scale=${also.replace("x", ":")}:flags=lanczos`, path.join(out, also, `${id}.png`)]);
      if (small.status !== 0) throw new Error(small.stderr.toString());
      console.log(`out/${lang}/${also}/${id}.png`);
    }
  }
  // All of them next to each other, as the App Store shows them, at a third of the size.
  const width = await page.evaluate(() => document.body.scrollWidth);
  await page.setViewport({ width, height: 2948, deviceScaleFactor: 1 / 3 });
  await page.screenshot({ path: path.join(out, "overview.png") });
  console.log(`out/${lang}/overview.png`);

  // The product page header and the search results image.
  fs.mkdirSync(path.join(out, "guides"), { recursive: true });
  for (const guides of [false, true]) {
    await page.setViewport({ width: 3920, height: 2700, deviceScaleFactor: 1 });
    await page.goto(`${pathToFileURL(path.join(root, "placements.html"))}?lang=${lang}${guides ? "&guides=1" : ""}`, { waitUntil: "networkidle0" });
    await page.waitForFunction('document.documentElement.dataset.ready === "yes"');
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
    for (const asset of await page.$$(".asset")) {
      const id = await asset.evaluate((el) => el.id), file = path.join(out, guides ? "guides" : "", `${id}.png`);
      await asset.screenshot({ path: file });
      console.log(path.relative(root, file));
    }
  }
} finally {
  await browser.close();
}
