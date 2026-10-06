// Shared by the preview and render scripts: a static file server for this folder and a
// headless Chrome page with the film loaded.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function serve() {
  const server = http.createServer(async (request, response) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(request.url, "http://x").pathname).replace(/^\/$/, "/index.html"));
    try {
      const data = await readFile(file);
      response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      response.end(data);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => { server.closeAllConnections(); server.close(); } };
}

export async function openFilm({ lang = "en", scale = 1, voice = true } = {}) {
  const site = await serve();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none"] });
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error("page error:", error.message));
  page.on("console", (message) => { if (message.type() === "error") console.error("console:", message.text()); });
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: scale });
  await page.goto(`${site.url}/?lang=${lang}${voice ? "" : "&voice=off"}`);
  await page.waitForFunction("window.READY === true", { timeout: 30000 });
  const duration = await page.evaluate("window.DURATION");
  const cues = await page.evaluate("window.CUES");
  const spoken = await page.evaluate("window.VOICE");
  const music = await page.evaluate("window.MUSIC");
  return { page, duration, cues, spoken, music, close: async () => { await browser.close(); site.close(); } };
}
