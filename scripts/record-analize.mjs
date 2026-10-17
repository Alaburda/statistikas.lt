// Records the silent /analize demo video with Playwright.
//
//   npm run analize:build && npx serve docs -l 8765   (or any static server on docs/)
//   node scripts/record-analize.mjs [http://localhost:8765/analize/]
//
// Frames come from Chrome's screencast (sharper text than Playwright's
// recordVideo), and ffmpeg-static encodes them into:
//   _analize-src/public/demo/analize.mp4 / .webm / -poster.jpg   (site, ~40 s)
//   _facebook/out/analize-facebook.mp4                            (short cut, private)
// The site files land in analize/demo/ on the next build.

import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_ = process.argv[2] ?? "http://localhost:8765/analize/";
const W = 1280;
const H = 720;
const OUT = "_analize-src/public/demo";
const FB_OUT = "_facebook/out";

const frameDir = mkdtempSync(join(tmpdir(), "analize-frames-"));
const frames = []; // { file, t }

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  acceptDownloads: true,
  locale: "lt-LT",
});
const page = await context.newPage();
// Start with the intro panel open, regardless of what a previous visit stored.
await page.addInitScript(() => {
  try { localStorage.clear(); } catch {}
});
await page.goto(URL_, { waitUntil: "networkidle" });

// ---- A visible cursor: headless recordings show neither the mouse nor native dropdowns
await page.addStyleTag({
  content: `
  #rec-cursor { position: fixed; z-index: 99999; width: 22px; height: 22px; margin: -11px 0 0 -11px;
    border: 3px solid #1C1B19; background: rgba(233,185,58,.85); pointer-events: none;
    transition: left .7s cubic-bezier(.4,0,.2,1), top .7s cubic-bezier(.4,0,.2,1), transform .15s; }
  #rec-cursor.down { transform: scale(.7); }
  #rec-pick { position: fixed; z-index: 99998; background: #fff; border: 2px solid #1C1B19;
    font: 15px "Instrument Sans", sans-serif; box-shadow: 4px 4px 0 #1C1B19; min-width: 260px; }
  #rec-pick div { padding: 7px 12px; }
  #rec-pick div.on { background: #1F45A0; color: #fff; }
  html { scroll-behavior: auto !important; }`,
});
await page.evaluate(() => {
  const c = document.createElement("div");
  c.id = "rec-cursor";
  c.style.left = "640px";
  c.style.top = "420px";
  document.body.appendChild(c);
});

const sleep = (ms) => page.waitForTimeout(ms);

async function moveTo(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.evaluate(([x, y]) => {
    const c = document.getElementById("rec-cursor");
    c.style.left = x + "px";
    c.style.top = y + "px";
  }, [box.x + Math.min(box.width / 2, 120), box.y + box.height / 2]);
  await sleep(800);
}

async function press() {
  await page.evaluate(() => document.getElementById("rec-cursor").classList.add("down"));
  await sleep(160);
  await page.evaluate(() => document.getElementById("rec-cursor").classList.remove("down"));
}

async function click(locator) {
  await moveTo(locator);
  await press();
  await locator.click();
}

// Native <select> popups are not captured, so draw a stand-in list, then pick.
async function choose(select, value) {
  await moveTo(select);
  await press();
  const box = await select.boundingBox();
  const options = await select.evaluate((s) =>
    [...s.options].filter((o) => o.value).map((o) => ({ v: o.value, t: o.textContent }))
  );
  await page.evaluate(([x, y, w, opts]) => {
    const list = document.createElement("div");
    list.id = "rec-pick";
    list.style.left = x + "px";
    list.style.top = y + "px";
    list.style.width = Math.max(w, 260) + "px";
    for (const o of opts) {
      const d = document.createElement("div");
      d.textContent = o.t;
      d.dataset.v = o.v;
      list.appendChild(d);
    }
    document.body.appendChild(list);
  }, [box.x, box.y + box.height + 2, box.width, options.slice(0, 9)]);
  await sleep(450);
  const item = page.locator(`#rec-pick div[data-v="${value}"]`);
  await item.evaluate((d) => d.classList.add("on"));
  await moveTo(item);
  await press();
  await page.evaluate(() => document.getElementById("rec-pick").remove());
  await select.selectOption(value);
  await sleep(500);
}

// Eased scroll, so the result reads as a pan rather than a jump.
async function scrollBy(dy, ms = 1600) {
  await page.evaluate(([dy, ms]) => new Promise((done) => {
    const y0 = window.scrollY;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      window.scrollTo(0, y0 + dy * e);
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }), [dy, ms]);
}

// ---- Screencast capture
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = join(frameDir, `f${String(frames.length).padStart(5, "0")}.jpg`);
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

// Chrome only emits frames when something repaints; a tiny ticking element
// keeps frames coming during still moments so timing stays accurate.
await page.evaluate(() => {
  const tick = document.createElement("div");
  tick.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:.01;z-index:99999";
  document.body.appendChild(tick);
  setInterval(() => { tick.style.background = tick.style.background === "red" ? "blue" : "red"; }, 40);
});

const marks = {}; // named timestamps for cutting the Facebook version
const mark = async (name) => { marks[name] = Date.now() / 1000; };

// ---- The script (~40 s)
await mark("start");
await sleep(2200); // intro panel: what the tool does

// Switch to the wage dataset
await choose(page.locator('select[aria-label="Demonstraciniai duomenys"]'), "cps1985");
await sleep(1600);
await moveTo(page.locator(".dataset-bar"));
await sleep(1200);

// Jump to the end of the analysis list and add a block
const add = page.locator("button.add-chunk");
const addY = await add.evaluate((el) => el.getBoundingClientRect().top);
await scrollBy(addY - 420, 1800);
await sleep(400);
await mark("add");
await click(add);
await sleep(600);

const test = page.locator("select.test-select").last();
await choose(test, "ttest");
const picks = page.locator(".picks").last().locator("label.pick select");
await choose(picks.nth(0), "wage");
await choose(picks.nth(1), "gender");
await sleep(900);

// Pan through assumptions, the result sentence, the table and the plot
const card = page.locator(`[id="${await test.evaluate((s) => s.closest("[id]").id)}"]`);
const cardBox = await card.boundingBox();
await scrollBy(cardBox.y - 90, 1400);
await sleep(1600);
const table = card.locator("table").first();
await scrollBy((await table.boundingBox()).y - 260, 1800);
await sleep(2400);
// End on the plot, centred, so the poster frame shows the payoff
const plot = card.locator(".plot");
const pb = await plot.boundingBox();
await scrollBy(pb.y + pb.height / 2 - H / 2 - 10, 1800);
await sleep(2600);
await mark("result");

// Back to the top and export to Word
await page.evaluate(() => window.scrollTo({ top: 0 }));
await sleep(700);
const download = page.waitForEvent("download");
await click(page.locator("button.primary-btn"));
await download;
await sleep(3400); // the export toast
await mark("end");

await cdp.send("Page.stopScreencast");
await browser.close();

// ---- Encode
if (frames.length < 10) throw new Error(`only ${frames.length} frames captured`);
const t0 = frames[0].t;
let concat = "ffconcat version 1.0\n";
for (let i = 0; i < frames.length; i++) {
  const next = i + 1 < frames.length ? frames[i + 1].t : frames[i].t + 0.04;
  concat += `file '${frames[i].file.replace(/\\/g, "/")}'\nduration ${(next - frames[i].t).toFixed(4)}\n`;
}
concat += `file '${frames.at(-1).file.replace(/\\/g, "/")}'\n`;
const list = join(frameDir, "frames.txt");
writeFileSync(list, concat);

mkdirSync(OUT, { recursive: true });
const ff = (args) => execFileSync(ffmpegPath, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
const input = ["-f", "concat", "-safe", "0", "-i", list];
const vf = "fps=25,format=yuv420p";

ff([...input, "-vf", vf, "-c:v", "libx264", "-preset", "veryslow", "-crf", "30", "-tune", "stillimage",
  "-movflags", "+faststart", "-an", `${OUT}/analize.mp4`]);
ff([...input, "-vf", vf, "-c:v", "libvpx-vp9", "-crf", "42", "-b:v", "0", "-row-mt", "1", "-an",
  `${OUT}/analize.webm`]);
// Poster: the finished result, so the still frame already shows the payoff
const posterAt = Math.max(0, marks.result - t0 - 0.5);
ff(["-ss", posterAt.toFixed(2), "-i", `${OUT}/analize.mp4`, "-frames:v", "1", "-q:v", "4", `${OUT}/analize-poster.jpg`]);

// Facebook cut: from adding the block to the end (16:9; the app is too wide to crop)
if (existsSync("_facebook")) {
  mkdirSync(FB_OUT, { recursive: true });
  const from = Math.max(0, marks.add - t0 - 0.3);
  ff(["-ss", from.toFixed(2), "-i", `${OUT}/analize.mp4`, "-vf", "format=yuv420p",
    "-c:v", "libx264", "-crf", "23", "-movflags", "+faststart", "-an", `${FB_OUT}/analize-facebook.mp4`]);
}

rmSync(frameDir, { recursive: true, force: true });
const kb = (f) => (statSync(f).size / 1024).toFixed(0) + " KB";
console.log(`${frames.length} frames, ${(frames.at(-1).t - t0).toFixed(1)} s`);
for (const f of ["analize.mp4", "analize.webm", "analize-poster.jpg"]) console.log(`${OUT}/${f}: ${kb(`${OUT}/${f}`)}`);
