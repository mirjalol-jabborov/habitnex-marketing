// Habitnex product video. Every frame is a pure function of time: seek(t) lays out the whole
// stage for second t, so the renderer can step through frames (and sub-frames, for motion
// blur) in any order.
//
// The screens are the app's own, rebuilt from the SwiftUI source (sizes, radii, type styles
// and colors from Theme.swift, TodayView, DayTimeline, AdaptSheet, ProgressScreen and
// ReviewView). A 3D camera moves the phone; pieces of the interface lift off the screen or
// leave it entirely. All text comes from strings/<lang>.json.

// ---------- Timing (seconds). The track is 120 BPM: a beat is 0.5 s, a bar 2 s. ----------
let T, TYPE;
/** The voiceover's manifest (voice/<lang>/manifest.json), or null when nothing has been recorded. */
let V = null;
const COACHES = ["strict", "sarcastic", "calm", "friendly"];
/** The opening: the hook line under the logo, before the film pushes through into the day. */
const INTRO = 3.0;

/**
 * The film's timetable. Without a voiceover each coach's card gets a beat and a half; with
 * one, each stays for as long as its line takes to say (rounded up to the beat), and
 * everything after moves later by the same amount.
 */
function makeTimes() {
  const said = (id) => V?.lines[id]?.duration ?? 0;
  const beat = (x, step = 0.25) => Math.ceil(x / step - 1e-6) * step;
  const hero = 7.0, notif = 6.55, front = 5.9;
  const lineEnd = said("voice") ? front + 0.1 + said("voice") : 0; // "Your coach talks your way."
  const voices = [], speak = {};
  let at = hero;
  COACHES.forEach((name) => {
    voices.push([name, at]);
    // The narrator names each coach as its card arrives, once the line before has finished.
    speak[name] = Math.max(at + 0.2, lineEnd + 0.15);
    at += beat(Math.max(1.5, speak[name] - at + said(name) + 0.5));
  });
  const back = beat(at, 0.5); // back on the beat
  const s = back - 14; // how much later (or earlier) the rest of the film runs
  T = {
    total: 37 + s,
    // 1 · The day fills up, then the phone is revealed
    blocks: 0.05, pull: 1.4,
    // 2 · The coach finds the gap
    iso: 2.9, coachIn: 3.15, tapMove: 4.0, coachOut: 4.2, lift: 4.2, travel: [4.35, 4.85], slam: 5.0, front, clock: [6.0, 6.6],
    // 3 · One reminder, four voices
    notif, hero, voices, speak, back,
    // 4 · Answer from the reminder
    expand: 14.5 + s, tapDone: 16.0 + s, collapse: 16.2 + s, toGym: 16.4 + s, done: 16.65 + s,
    // 5 · A week later: the plan adjusts
    exit: 17.7 + s, marks: 18.0 + s, coachB: 18.65 + s, tapSuggest: 19.2 + s, enter: 19.4 + s, sheetUp: 19.55 + s, optionsIn: 20.1 + s, floatOut: 20.25 + s,
    tapOption: 21.5 + s, tapApply: 22.1 + s, sheetDown: 22.35 + s, spin: [22.8 + s, 23.45 + s],
    // 6 · Or just tell the coach
    chat: 23.5 + s, tapChip: 24.05 + s, typing: 24.3 + s, reply: 25.0 + s, tapPause: 26.1 + s, applied: 26.3 + s, spin2: [26.8 + s, 27.45 + s],
    // 7 · Progress, then the whole year filling in
    progress: 27.5 + s, toYear: 29.0 + s, fill: [29.3 + s, 31.7 + s], dive: 32.15 + s,
    // 8 · The timeline becomes the logo
    morphIn: 32.5 + s, slot: 33.0 + s, morph: 33.5 + s, iris: 33.65 + s, word: 34.0 + s, tagline: 34.15 + s, sub: 34.9 + s,
  };
  // The film opens on the logo; everything above happens after it.
  const later = (value) => (typeof value === "number" ? value + INTRO : Array.isArray(value) ? value.map(later) : typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, later(v)])) : value);
  T = later(T);
  // "Day by day, all year." is said once the line before it has had a moment to land.
  T.yearLine = Math.max(T.toYear + 0.9, T.progress + 0.05 + said("progress") + 0.7);
  /** Kinetic captions: when each word lands and when the line leaves. */
  const hook = V?.lines.hook?.words.map((w) => 0.1 + w.start) ?? [0.05, 0.2, 0.35, 0.6, 0.72, 0.84, 1.15, 1.3];
  TYPE = [
    { id: "hook", at: hook, out: INTRO - 0.32 }, // gone before the app appears: the line is never on top of the interface
    { id: "has", at: [T.pull + 0.3, T.pull + 0.55], out: T.iso + 0.05 },
    { id: "gap", at: [-0.6, -0.45, -0.3, -0.15, 0].map((x) => T.slam + x), out: T.front + 0.55 },
    { id: "reminder", at: [0.1, 0.25, 0.5, 0.62, 0.75].map((x) => T.expand + x), out: T.toGym - 0.1 },
    { id: "done", at: [T.done], out: T.exit - 0.1 },
    { id: "adaptA", at: [T.marks, T.marks + 0.25], out: T.enter - 0.1 },
    { id: "adaptB", at: [-0.1, 0.15, 0.4, 0.55].map((x) => T.optionsIn + x), out: T.spin[0] - 0.15 },
    { id: "chat", at: [0.1, 0.22, 0.36, 0.6, 0.75].map((x) => T.chat + x), out: T.spin2[0] - 0.15 },
    { id: "progress", at: [0.1, 0.3, 0.5, 0.75].map((x) => T.progress + x), out: T.toYear - 0.05 },
    { id: "year", at: [0, 0.12, 0.24, 0.6, 0.72].map((x) => T.yearLine + x), out: T.dive },
  ];
}

/** When each recorded line is spoken. */
function voiceCues() {
  if (!V) return [];
  const lastWord = (id) => V.lines[id]?.words.at(-1)?.start ?? 0;
  return [
    ["hook", 0.1],
    ["has", T.pull + 0.3],
    ["gap", T.slam - lastWord("gap")], // "gap" is said as the block lands
    ["voice", T.front + 0.1],
    ...COACHES.map((name) => [name, T.speak[name]]),
    ["reminder", T.expand + 0.05],
    ["adaptA", T.marks - 0.05],
    ["adaptB", T.optionsIn - 0.15],
    ["chat", T.chat + 0.05],
    ["progress", T.progress + 0.05],
    ["year", T.yearLine],
    ["end", T.slot], // the name as the block lands, the tagline as it appears
  ].filter(([id]) => V.lines[id]).map(([id, at]) => ({ id, at, file: V.lines[id].file }));
}

// ---------- Math ----------
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  linear: (x) => x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  in: (x) => x * x * x,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuint: (x) => 1 - Math.pow(1 - x, 5),
};
/** 0 → 1 between `start` and `start + dur`. */
const prog = (t, start, dur, ease = E.inOut) => ease(clamp01((t - start) / dur));
/** SwiftUI-style spring from 0 to 1, started at `start` (same response and damping numbers as the app). */
function spring(t, start, response = 0.5, damping = 0.8) {
  const x = t - start;
  if (x <= 0) return 0;
  const w0 = (2 * Math.PI) / response;
  if (damping >= 1) return 1 - Math.exp(-w0 * x) * (1 + w0 * x);
  const wd = w0 * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-damping * w0 * x) * (Math.cos(wd * x) + ((damping * w0) / wd) * Math.sin(wd * x));
}
/** A quick dip to `depth` and back: a button being pressed at `at`. */
const press = (t, at, depth = 0.04) => 1 - depth * (prog(t, at - 0.02, 0.08, E.out) - spring(t, at + 0.1, 0.25, 0.65));
/** An impact at `at`: jumps to 1, then rings down to 0. */
const kick = (t, at, response = 0.35, damping = 0.45) => (t >= at ? 1 - spring(t, at, response, damping) : 0);
const mix = (a, b, p) => Object.fromEntries(Object.keys(b).map((k) => [k, lerp(a[k] ?? b[k], b[k], p)]));
/**
 * Keyframes: [[time, value, how], …]. A key's value is approached starting at its time;
 * `how` is seconds, [seconds, ease] or { r, z } for a spring. Values are numbers or objects of numbers.
 */
function K(t, keys) {
  let value = keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [at, to, how] = keys[i];
    if (t <= at) break;
    const p = how?.r ? spring(t, at, how.r, how.z) : Array.isArray(how) ? prog(t, at, how[0], how[1]) : prog(t, at, how ?? 0.4);
    value = typeof to === "number" ? lerp(value, to, p) : mix(value, to, p);
  }
  return value;
}

// ---------- DOM helpers ----------
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let SIZES = {};
let S = {};

/** An SF Symbol, drawn from the exported mask so it takes the text color. */
function sf(name, weight, pt, style = "") {
  const [w, h] = SIZES[`${name}-${weight}`];
  return `<i class="sf" style="width:${(w * pt).toFixed(2)}px;height:${(h * pt).toFixed(2)}px;-webkit-mask-image:url(assets/sf/${name}-${weight}.png);${style}"></i>`;
}

/** Center and box of an element inside `root`, ignoring transforms. */
function box(el, root) {
  let x = 0, y = 0;
  for (let e = el; e && e !== root; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  return { left: x, top: y, w: el.offsetWidth, h: el.offsetHeight, x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 };
}

/** Each word in its own span, so words can land one by one. "\n" in a string is a line break. */
const words = (text) => text.split("\n").map((line) => line.split(" ").map((w) => `<span>${w}</span>`).join(" ")).join("<br>");
/** A caption, line by line, each word in its own span so words can land one at a time. */
const caption = (text) => text.split("\n").map((line) => `<div class="ln">${line.split(" ").map((w) => `<span>${w}</span>`).join(" ")}</div>`).join("");

// ---------- Pieces shared by screens ----------
function dayMark(kind, size, extra = "") {
  const icon = { done: sf("checkmark", "heavy", size * 0.45), snoozed: sf("clock", "bold", size * 0.45), missed: sf("minus", "bold", size * 0.4) }[kind] ?? "";
  return `<div class="mark ${kind} ${extra}" style="width:${size}px;height:${size}px">${icon}</div>`;
}

const checkCircle = () => `<div class="cc"><div class="ring"></div><div class="fill">${sf("checkmark", "heavy", 13.5)}</div></div>`;

const minuteY = (minute) => minute - 360; // 60 pt per hour, from 6 AM

function coachCard(label, card, extra = "") {
  return `<div class="variant ${extra}">
    <div class="label">${sf("calendar.badge.clock", "semibold", 12)}<span>${label}</span></div>
    <div class="text">${card.text}</div>
    ${card.buttons ? `<div class="buttons">${card.buttons.map((b, j) => `<div class="ipill ${j === 0 || card.buttons.length === 1 ? "filled" : "ghost"}">${b}</div>`).join("")}</div>` : ""}
  </div>`;
}

/** The Today screen for one day. `d` describes that day's data. */
function todayScreen(id, d) {
  const hours = S.hours.map((label, i) => `<div class="hour" style="top:${i * 60}px"><span>${label}</span><i></i></div>`).join("");
  const gaps = d.gaps.map(([from, to, label]) =>
    `<div class="gap" style="top:${minuteY(from) + 2}px;height:${Math.max(24, to - from - 4)}px">${label ?? ""}</div>`).join("");
  const events = d.events.map((e) =>
    `<div class="event" id="${id}-${e.id}" style="left:50px;width:${e.half ? 144 : 292}px;top:${minuteY(e.from) + 2}px;height:${Math.max(28, e.to - e.from) - 4}px">
       <span class="${e.work ? "dotf" : "doto"} d"></span><div><div class="ti">${e.text[0]}</div><div class="tm">${e.text[1]}</div></div></div>`).join("");
  const week = d.week.map(([letter, number, state]) =>
    `<div class="wd"><div class="l">${letter}</div><div class="n ${state}">${number}</div><div class="dot" style="opacity:${state === "sel" ? 1 : 0}"></div></div>`).join("");
  return `
  <div class="screen" id="${id}">
    <div class="scroll"><div class="today-pad">
      <div class="t-header">
        <div><div class="t-title">${S.today.title}</div><div class="t-sum">${d.summary}</div></div>
        <div class="pill">🔥 ${d.streak}</div>
      </div>
      <div>
        <div class="week-top"><div class="week-month">${d.month}</div>
          <div style="display:flex;gap:8px"><div class="round">${sf("chevron.left", "bold", 12)}</div><div class="round">${sf("chevron.right", "bold", 12)}</div></div></div>
        <div class="week-days">${week}</div>
      </div>
      <div class="coach">${d.card.map((c) => coachCard(d.coachLabel, c)).join("")}</div>
      <div class="daycard">
        <div class="day-top"><div class="h">${S.today.yourDay}</div>
          <div class="legend"><div class="tiny"><span class="dotf"></span>${S.today.work}</div><div class="tiny"><span class="doto"></span>${S.today.personal}</div></div></div>
        <div class="timeline">${hours}${gaps}${events}${d.habits}<div class="nowline"><b></b><i></i></div></div>
      </div>
    </div></div>
    <div class="topfade"></div>
  </div>`;
}

/** A one-line (under 40 minutes) habit block, like Morning run. */
function compactHabit(id, name, time, at, done) {
  return `<div class="habit" id="${id}" style="left:50px;width:292px;top:${minuteY(at) + 2}px;height:30px;${done ? "background:var(--emphasis);box-shadow:none;color:#fff" : ""}">
    <div class="body one ${done ? "strike" : ""}"><span><b>${name}</b> · ${time}</span></div>
    <div class="ctl"><div class="more" style="width:28px">${sf("ellipsis", "bold", 15)}</div>
      <div class="chk" style="width:34px"><div style="transform:scale(.75)">${done
        ? `<div class="cc"><div class="fill" style="background:#fff;color:#000">${sf("checkmark", "heavy", 13.5)}</div></div>`
        : `<div class="cc"><div class="ring"></div></div>`}</div></div></div>
  </div>`;
}

/** The Gym block: half width beside a meeting, or full width. Used on the screen and as the piece that flies. */
function gymBlock(id) {
  const t = S.today;
  return `<div class="habit" id="${id}">
    <div class="donebg" style="position:absolute;inset:0;background:var(--emphasis);border-radius:12px;opacity:0"></div>
    <div class="body narrow"><span class="gname">${t.gym}</span></div>
    <div class="body full"><div class="name gname">${t.gym}</div><div class="det">${t.gymDetail}</div></div>
    <div class="ctl"><div class="more">${sf("ellipsis", "bold", 15)}</div><div class="chk">${checkCircle()}</div></div>
  </div>`;
}

/** A reminder with the words that carry its tone marked, so the rest can step back. */
const punched = (text, punch) => text.split(punch).map((part) => (part ? `<span class="rest">${part}</span>` : "")).join(`<b class="punch">${punch}</b>`);

function notification(voice, extra = "", id = "") {
  const n = S.notification;
  const voices = Array.isArray(voice) ? voice : [voice];
  return `<div class="notif ${extra}" ${id ? `id="${id}"` : ""}><img class="icon" src="assets/slot-icon-light-1024.png">
    <div class="ncol"><div class="row"><span class="tt">${n.title}</span><span class="when">${n.now}</span></div>
      <div class="bodies">${voices.map((k) => `<div class="bd" data-voice="${k}">${extra === "static" ? punched(n[k], n.punch[k]) : n[k]}</div>`).join("")}</div></div></div>`;
}

/**
 * One habit's year, up to the film's "today" (8 October 2026): planned on weekdays, kept
 * more reliably as the months go by. Each day knows its place in the week-by-week grid.
 */
function yearData() {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const through = lengths.slice(0, 9).reduce((a, b) => a + b, 0) + 8;
  const chance = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const days = [];
  let index = 0;
  lengths.forEach((length, m) => {
    for (let day = 1; day <= length; day += 1) {
      index += 1;
      const row = (index + 2) % 7; // 1 January 2026 is a Thursday; 0 is Monday
      let mark = "none";
      if (index <= through && row < 5) {
        const miss = chance(index + 400);
        mark = chance(index) < lerp(0.58, 0.96, index / through) ? "done" : miss < 0.3 ? "skipped" : miss < 0.55 ? "snoozed" : "missed";
      }
      days.push({ index, month: m + 1, day, row, col: Math.floor((index + 2) / 7), mark });
    }
  });
  return { days, through };
}
const YEAR = yearData();
const YEAR_COLORS = { done: "#000", snoozed: "rgba(0,0,0,0.45)", skipped: "#aeaeb2", missed: "#aeaeb2", none: "#e5e5ea" };

/** HabitYearView: totals, the week-by-week grid and twelve month calendars. */
function yearScreen() {
  const y = S.year;
  const side = 6, step = side * 1.36; // the largest square that fits 41 weeks across the card
  const columns = YEAR.days[YEAR.through - 1].col + 1;
  const shown = YEAR.days.filter((d) => d.col < columns);
  const grid = shown.map((d) => `<i class="yc" data-i="${d.index}" style="left:${d.col * step}px;top:${14 + d.row * step}px;width:${side}px;height:${side}px;border-radius:${side * 0.28}px"></i>`).join("");
  const names = shown.filter((d) => d.day === 1).map((d) => `<span style="left:${d.col * step}px">${y.months[d.month - 1]}</span>`).join("");
  const cell = 99.33 / 8.2, across = cell * 1.2;
  const months = y.months.map((name, m) => {
    const days = YEAR.days.filter((d) => d.month === m + 1);
    const cells = days.map((d) => {
      const slot = days[0].row + d.day - 1;
      return `<i class="yc" data-i="${d.index}" style="left:${(slot % 7) * across}px;top:${Math.floor(slot / 7) * across}px;width:${cell}px;height:${cell}px;border-radius:${cell * 0.28}px"></i>`;
    }).join("");
    return `<div class="y-month"><div class="top"><div class="n">${name}</div><div class="c" data-m="${m + 1}"></div></div><div class="cal">${cells}</div></div>`;
  }).join("");
  const legend = `<div class="y-legend">${y.legend.map((label, i) => `<div><i style="background:${[YEAR_COLORS.done, YEAR_COLORS.snoozed, YEAR_COLORS.missed][i]}"></i>${label}</div>`).join("")}</div>`;
  return `
  <div class="screen" id="year">
    <div class="scroll"><div class="y-pad">
      <div class="y-picker"><div><div class="y-year">${y.year}</div><div class="y-habit">${y.habit}</div></div>
        <div style="display:flex;gap:8px"><div class="y-step">${sf("chevron.left", "bold", 13)}</div><div class="y-step" style="opacity:.35">${sf("chevron.right", "bold", 13)}</div></div></div>
      <div class="y-totals">${[y.kept, y.skipped, y.missed].map((label, i) => `<div class="y-total"><div class="k">${label}</div><div class="v" data-total="${i}">0</div></div>`).join("")}</div>
      <div class="y-card"><div class="y-head"><div class="h">${y.everyDay}</div>${legend}</div><div class="y-grid">${names}${grid}</div></div>
      <div class="y-card" style="gap:16px"><div class="y-head"><div class="h">${y.byMonth}</div>${legend}</div><div class="y-months">${months}</div></div>
    </div></div>
    <div class="y-fade"></div>
    <div class="y-nav"><div class="y-back">${sf("chevron.left", "semibold", 17)}</div><div class="y-navtitle">${y.nav}</div></div>
  </div>`;
}

/** The suggestion under the coach's message: what it is, the key detail, and Preview / Apply. */
function proposalCard(extra = "") {
  const c = S.chat;
  return `<div class="c-prop ${extra}">
    <div class="c-cap"><span>${c.suggested}</span><span>${c.applied}</span></div>
    <div><div class="c-pt">${c.proposalTitle}</div><div class="c-pd">${c.proposalDetail}</div></div>
    <div class="c-buttons"><div class="c-b"><span>${c.preview}</span><span>${c.view}</span></div>
      <div class="c-b c-apply"><span>${c.apply}</span><span class="c-done">${sf("checkmark", "bold", 12)}${c.done}</span></div></div>
  </div>`;
}

/** CoachChatView: the empty chat with its starters, then one exchange. */
function chatScreen() {
  const c = S.chat;
  return `
  <div class="screen" id="chat">
    <div class="c-title">${c.title}</div>
    <div class="c-layer" id="c-intro">
      <div class="c-bubble" style="padding:14px">${c.intro}</div>
      <div class="c-chips">${c.starters.map((text) => `<div class="c-chip">${text}</div>`).join("")}${c.personal.map((text) => `<div class="c-chip mine"><span>✨</span>${text}</div>`).join("")}</div>
    </div>
    <div class="c-layer" id="c-thread">
      <div class="c-bubble user" id="c-user">${c.user}</div>
      <div class="c-slot"><div class="c-typing" id="c-typing"><i></i><i></i><i></i></div><div class="c-bubble" id="c-reply">${c.reply}</div></div>
      ${proposalCard()}
    </div>
    <div class="c-input"><div class="c-field">${c.placeholder}</div><div class="c-send">${sf("arrow.up", "bold", 16)}</div></div>
  </div>`;
}

const ORDER = ["fri", "sat", "sun", "mon", "tue", "wed", "thu"];
const HISTORY = ["done", "none", "none", "snoozed", "done", "snoozed", "snoozed"];

function build() {
  const L = S.weekdayLetters;
  const t = S.today;
  const cardsA = [{ text: t.moveText, buttons: [t.moveButton, t.keepButton] }, { text: t.nextUpText }];

  const todayA = todayScreen("todayA", {
    summary: t.summary, streak: 6, month: t.month, coachLabel: t.coachLabel,
    week: [[L.sun, 27, "kept"], [L.mon, 28, "kept"], [L.tue, 29, "kept"], [L.wed, 30, "kept"], [L.thu, 1, "sel"], [L.fri, 2, "future"], [L.sat, 3, "future"]],
    card: cardsA,
    gaps: [[420, 570, t.free1], [630, 660], [750, 870, t.free3], [960, 990], [1080, 1140, t.free5], [1230, 1380, t.free6]],
    events: [
      { id: "standup", from: 570, to: 630, work: true, text: t.events.standup },
      { id: "review", from: 660, to: 750, work: true, text: t.events.review, half: true },
      { id: "call", from: 870, to: 960, work: true, text: t.events.call },
      { id: "planning", from: 990, to: 1080, work: true, text: t.events.planning },
      { id: "dinner", from: 1140, to: 1230, work: false, text: t.events.dinner },
    ],
    habits: compactHabit("runA", t.run, t.runTime, 420, true) + gymBlock("gym"),
  });

  const l = S.later;
  const cardB = { text: l.adaptText, buttons: [l.seeSuggestion] };
  const todayB = todayScreen("todayB", {
    summary: l.summary, streak: 0, month: l.month, coachLabel: l.coachLabel,
    week: [[L.sun, 4, "kept"], [L.mon, 5, "missed"], [L.tue, 6, "kept"], [L.wed, 7, "missed"], [L.thu, 8, "sel"], [L.fri, 9, "future"], [L.sat, 10, "future"]],
    card: [cardB],
    gaps: [[420, 600, l.free1], [660, 720]],
    events: [{ id: "standup", from: 600, to: 660, work: true, text: l.events.standup }],
    habits: compactHabit("runB", t.run, t.runTime, 420, false),
  });

  const p = S.progress;
  const bars = [[3, 4], [2, 3], [3, 3], [4, 4], [4, 4], [4, 4], [4, 4]];
  const rowMarks = [["none", "done", "none", "none", "done", "none", "done"], ["missed", "none", "none", "done", "done", "done", "done"]];
  const stat = (i, extra = "") => [
    `<div class="stat ${extra}"><div class="k">🔥 ${p.streakTitle}</div><div class="v"><b class="n-streak">5</b><span>${p.streakUnit}</span></div><div class="f">${p.streakNote}</div></div>`,
    `<div class="stat ${extra}"><div class="k">${p.keptTitle}</div><div class="v"><b class="n-kept">92</b><span>%</span></div><div class="f">${p.keptNote}</div></div>`,
  ][i];
  const progress = `
  <div class="screen" id="progress"><div class="p-pad">
    <div class="t-title" style="padding-top:0">${p.title}</div>
    <div class="seg"><div class="on">${p.thisWeek}</div><div>${p.thisMonth}</div></div>
    <div class="rev" id="revcard">
      <div class="r1">${sf("sparkles.rectangle.stack.fill", "regular", 20)}<div style="flex:1"><div class="a">${p.yourReview}</div><div class="b">${p.reviewSub}</div></div>${sf("chevron.right", "bold", 12)}</div>
      <div class="pills"><div>${p.week}</div><div>${p.month}</div></div>
    </div>
    <div class="stats">${stat(0)}${stat(1)}</div>
    <div class="chart"><div class="h">${p.chartTitle}</div>
      <div class="plot">${bars.map(([k, pl], i) => `<div class="col"><div class="stack"><div class="pl" data-h="${pl / 4}"></div><div class="kp" data-h="${k / 4}"></div><div class="an">${k}/${pl}</div></div><div class="x">${S.weekdayShort[ORDER[i]]}</div></div>`).join("")}</div>
      <div class="clegend"><div>${sf("square.fill", "regular", 11)}${p.kept}</div><div>${sf("square", "regular", 11)}${p.planned}</div></div>
    </div>
    <div class="byhabit">${p.byHabit}</div>
    <div class="rows">${p.rows.map(([name, count], r) => `<div class="rowh"><div class="top"><div class="n">${name}</div><div class="c">${count}</div><span style="color:var(--tertiary);display:flex">${sf("chevron.right", "bold", 12)}</span></div>
      <div class="marks">${rowMarks[r].map((m, i) => `<div class="m">${dayMark(m, 26)}${L[ORDER[i]]}</div>`).join("")}</div></div>`).join("")}</div>
  </div><div class="topfade"></div></div>`;

  const a = S.adapt;
  const option = ([title, detail], extra = "") => `<div class="opt ${extra}"><div class="on"></div><div class="o1">${title}</div><div class="o2" style="opacity:.7">${detail}</div></div>`;
  const sheet = `
  <div id="sheet"><div class="grab"></div>
    <div class="s-top"><div class="circle44">${sf("xmark", "bold", 14)}</div><div class="s-eyebrow">${a.eyebrow}</div></div>
    <div class="s-title">${a.title}</div>
    <div class="hist"><div class="marks">${HISTORY.map((m, i) => `<div class="m">${dayMark(m, 32)}${L[ORDER[i]]}</div>`).join("")}</div><div class="txt">${a.detail}</div></div>
    <div class="s-h">${a.tryThis}</div>
    <div class="s-opts">
      <div class="list" id="s-loading"><div class="skel"><i></i></div><div class="skel"><i></i></div><div class="skel"><i></i></div>
        <div class="loading">${sf("sparkles", "regular", 12)}${a.loading}</div></div>
      <div class="list" id="s-list">${[...a.options, a.keep].map((o) => option(o)).join("")}</div>
    </div>
    <div class="s-foot"><div class="primary" id="s-cta"><span>${a.apply[0]}</span><span>${a.apply[1]}</span><span>${a.choose}</span></div><div class="s-note">${a.changeBack}</div></div>
  </div>`;

  const tabIcons = [["calendar", 19], ["chart.bar.fill", 18], ["bubble.left.and.text.bubble.right.fill", 16], ["gearshape.fill", 19]];
  const n = S.notification;
  const actionIcons = ["checkmark.circle.fill", "clock.fill", "circle.lefthalf.filled", "minus.circle.fill"];
  const kinetic = Object.entries(S.captions).map(([key, text]) => `<div class="kt" id="cap-${key}">${caption(text)}</div>`).join("");
  const labels = T.voices.map(([voice]) => `<div class="vlabel" data-voice="${voice}">${S.voiceLabels[voice].split("\n").map((line) => `<div>${line}</div>`).join("")}</div>
    <div class="kt quote" data-voice="${voice}"><span>“${n.punch[voice]}”</span></div>`).join("");
  const hx = (id, inner, extra = "") => `<div class="hx ${extra}" id="${id}"><div class="hin">${inner}</div></div>`;
  const morphBlocks = (texts) => `
    <div class="mb3 e">${texts ? `<div class="tx"><span class="dt"></span><div><div class="t1">${t.events.review[0]}</div><div class="t2">${t.events.review[1]}</div></div></div>` : ""}</div>
    <div class="mb3 h">${texts ? `<div class="tx"><div><div class="t1">${t.gym}</div><div class="t2">${t.gymDetail}</div></div></div><div class="ck">${sf("checkmark", "heavy", 36)}</div>` : ""}</div>
    <div class="mb3 e">${texts ? `<div class="tx"><span class="dt"></span><div><div class="t1">${t.events.call[0]}</div><div class="t2">${t.events.call[1]}</div></div></div>` : ""}</div>`;

  $("#stage").innerHTML = `
    <div id="shapes">${SHAPES.map(() => `<div class="shape"></div>`).join("")}</div>
    <div class="bgflip"></div><div class="bgflip"></div>
    <div id="world"><div id="cam"><div id="device">
      <div id="body"></div>
      <div id="screen">
        <div id="screens">${todayA}${todayB}${chatScreen()}${progress}${yearScreen()}
          <div id="chrome">
            <div class="fab">${sf("plus", "bold", 22)}</div>
            <div id="tabbar"><div id="tabsel"></div>${S.tabs.map((name, i) => `<div class="tab"><div class="ic">${sf(tabIcons[i][0], "medium", tabIcons[i][1])}</div>${name}</div>`).join("")}</div>
          </div>
        </div>
        <div id="dim"></div>
        ${sheet}
        <div id="status"><span id="clock"></span><div class="right">${sf("cellularbars", "semibold", 15)}${sf("wifi", "semibold", 15)}${sf("battery.100percent", "regular", 20)}</div></div>
        <div id="island"></div>
      </div>
      <div id="over">
        <div class="gshadow" id="gymShadow"></div>
        <div class="ripple"></div><div class="ripple"></div>
        ${gymBlock("gymF")}
        ${notification(["strict", "friendly"], "", "notif")}
        ${n.actions.map((title, i) => `<div class="apill"><span>${title}</span>${sf(actionIcons[i], "regular", 17)}</div>`).join("")}
        ${a.options.map((o) => option(o, "clone")).join("")}
        ${stat(0, "clone")}${stat(1, "clone")}
        ${proposalCard("clone")}
        <div id="tap"></div>
      </div>
      <div id="back"><div class="bm"><div></div><div></div><div></div></div></div>
    </div></div></div>
    <div id="hero">
      ${hx("hCoachA", `<div class="coach static">${coachCard(t.coachLabel, cardsA[0], "")}</div>`)}
      ${hx("hCoachB", `<div class="coach static">${coachCard(l.coachLabel, cardB, "")}</div>`)}
      ${T.voices.map(([voice]) => hx(`deck-${voice}`, notification(voice, "static"), "deck")).join("")}
      <div id="hMarks">${HISTORY.map((m, i) => `<div class="hm">${dayMark(m, 104, "dk")}${L[ORDER[i]]}</div>`).join("")}</div>
      <div id="hMarksText">${a.detail}</div>
      ${hx("hStreak", `<div class="pill">🔥<span class="roll"><span>6</span><span>7</span></span></div>`)}
      <div id="tap2"></div>
    </div>
    <div id="morph">
      ${[0, 1, 2, 3].map(() => `<div class="mhour"><i></i></div>`).join("")}
      <div id="morphL">${morphBlocks(true)}</div>
      <div id="morphD">${morphBlocks(false)}</div>
    </div>
    <div id="end">
      <div id="lockup"><div id="mark"><div id="m1"></div><div id="m2"></div><div id="m3"></div></div><div id="wordclip"><div id="word">${S.end.wordmark}</div></div></div>
      <div id="tagline">${words(S.end.tagline)}</div>
      <div id="sub">${words(S.end.sub)}</div>
    </div>
    <div id="intro"><div class="lockup"><div class="imark"><div></div><div></div><div></div></div><div class="iword">${S.end.wordmark}</div></div></div>
    <div id="type">${labels}</div>
    <div id="caps">${kinetic}</div>`;
}

/** Dashed outlines drifting in the dark behind everything: the app's "free gap", as scenery. [x, y, w, h, depth] */
const SHAPES = [[-60, 300, 420, 150, 0.5], [760, 120, 380, 110, 0.8], [640, 900, 520, 170, 0.35], [-120, 1250, 460, 130, 0.7], [300, 1650, 560, 160, 0.45], [820, 1500, 340, 120, 0.9]];
/** Moments the camera throws itself somewhere new; the scenery lurches with it. */
const WHIPS = () => [T.pull, T.iso, T.front, T.hero, T.back, T.toGym, T.exit, T.enter, T.spin[0], T.spin2[0], T.toYear, T.dive];

// ---------- Measured once, after layout ----------
const M = {};
const U = 156 / 30; // one unit of the Slot mark (brand/README.md: a 30 × 30 unit box)
/**
 * The phone and the pieces lifted out of it are laid out this many times larger than their
 * point size (CSS `zoom`) and scaled back down by the camera. The browser draws a 3D layer
 * once, at its laid-out size, and then stretches it; without this a close-up is a blurry
 * enlargement of small text.
 */
const SHARP = 3;

function measure() {
  const A = $("#todayA"), B = $("#todayB");
  for (const screen of [A, B]) {
    const card = $(".coach", screen);
    screen._cardHeights = $$(".variant", card).map((v) => v.offsetHeight);
    card.style.height = screen._cardHeights[0] + "px";
  }
  M.cardA = A._cardHeights;
  M.scrollA = box($(".coach", A), A).top - 66; // the coach card sits just under the status bar
  const timeline = box($(".timeline", A), A);
  M.tl = timeline.top - M.scrollA; // where 6 AM sits on the screen
  M.tlx = timeline.left;

  $("#notif .bodies").style.height = Math.max(...$$("#notif .bd").map((b) => b.offsetHeight)) + "px";
  M.notifHeight = $("#notif").offsetHeight;
  const sheetEl = $("#sheet");
  M.sheetOptions = $$("#s-list .opt").map((o) => box(o, sheetEl));
  M.sheetCta = box($("#s-cta"), sheetEl);
  M.tab = $$("#tabbar .tab").map((tab) => box(tab, $("#screen")));
  M.stats = $$("#progress .stat").map((s) => box(s, $("#progress")));
  const chat = $("#chat");
  M.chip = box($$("#c-intro .c-chip")[2], chat);
  M.prop = box($("#c-thread .c-prop"), chat);
  M.applyButton = box($("#c-thread .c-apply"), $("#c-thread .c-prop"));
  // The year: every square with its day, and running totals so the counters can follow the fill.
  M.yearCells = $$("#year .yc").map((el) => ({ el, day: YEAR.days[el.dataset.i - 1] }));
  M.yearTotals = [[0, 0, 0]];
  for (const day of YEAR.days) {
    const [kept, skipped, missed] = M.yearTotals.at(-1);
    M.yearTotals.push([kept + (day.mark === "done"), skipped + (day.mark === "skipped"), missed + (day.mark === "missed" || day.mark === "snoozed")]);
  }
  M.moveButton = box($("#hCoachA .ipill"), $("#hCoachA"));
  M.suggestButton = box($("#hCoachB .ipill"), $("#hCoachB"));
  M.deckHeight = $(".deck .notif").offsetHeight;

  // Captions and voice labels: as large as fits the frame.
  for (const el of $$(".kt")) {
    if (el.id === "cap-voice") continue;
    const widest = el.classList.contains("quote") ? el.scrollWidth : Math.max(...$$(".ln", el).map((line) => line.offsetWidth));
    el.style.fontSize = Math.min(el.classList.contains("quote") ? 112 : 150, (150 * 950) / widest) + "px";
  }
  const widest = Math.max(...$$(".vlabel").map((el) => el.scrollWidth));
  $$(".vlabel").forEach((el) => (el.style.fontSize = Math.min(200, (200 * 950) / widest) + "px"));

  // The Slot mark, for the back of the phone and as the end lockup's placeholder.
  const blocks = [[0, 0, 22, 7], [8, 10, 22, 10], [0, 23, 22, 7]];
  blocks.forEach(([x, y, w, h], i) => {
    Object.assign($(`#m${i + 1}`).style, { left: x * U + "px", top: y * U + "px", width: w * U + "px", height: h * U + "px", opacity: 0 });
    Object.assign($$("#back .bm div")[i].style, { left: x * 4 + "px", top: y * 4 + "px", width: w * 4 + "px", height: h * 4 + "px", borderRadius: "10px", background: i === 1 ? "#e9e9ee" : "#3a3a3c" });
  });
  $$("#intro .imark div").forEach((el, i) => {
    const [x, y, w, h] = blocks[i];
    Object.assign(el.style, { left: x * U + "px", top: y * U + "px", width: w * U + "px", height: h * U + "px", borderRadius: 2.5 * U + "px", background: i === 1 ? "#fff" : "#48484a" });
  });
  $("#end").style.display = "";
  M.logo = [1, 2, 3].map((i) => {
    const r = $(`#m${i}`).getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  M.poses = poses();
}

/** Where the camera is through the film. `f` is the point on the phone being looked at, `t` where it lands in the frame. */
function poses() {
  const lane = M.tlx + 50 + 146 + 9;
  const tl = M.tl + 9;
  const tl2 = tl - (M.cardA[0] - M.cardA[1]);
  const front = { fx: 210, fy: 446, tx: 540, rx: 0, ry: 0, rz: 0 };
  const gym = { fx: lane, fy: tl2 + 412, tx: 540, ty: 1040, s: 3.2, rx: 0, ry: 0, rz: -5 };
  return [
    [0, { fx: lane, fy: tl + 450, tx: 540, ty: 1060, s: 3.9, rx: 36, ry: 0, rz: -14 }],
    [INTRO, { fx: lane, fy: tl + 490, tx: 540, ty: 1060, s: 3.4, rx: 30, ry: 0, rz: -9 }, [1.4, E.linear]],
    [T.pull, { ...front, ty: 1215, s: 1.75 }, { r: 0.7, z: 0.82 }],
    [T.iso, { fx: lane, fy: tl + 440, tx: 540, ty: 1270, s: 3.5, rx: 48, ry: 0, rz: -20 }, { r: 0.6, z: 0.8 }],
    [T.front, { ...front, ty: 1247, s: 1.9 }, { r: 0.6, z: 0.85 }],
    [T.hero, { ...front, ty: 1740, s: 1.15, rx: 20 }, { r: 0.6, z: 0.85 }],
    [T.back, { ...front, ty: 1247, s: 1.9, rx: 4, ry: -18 }, { r: 0.6, z: 0.85 }],
    [T.expand, { ...front, ty: 1247, s: 1.9, rx: 4, ry: 12 }, [1.6, E.inOut]],
    [T.toGym, gym, { r: 0.5, z: 0.82 }],
    [T.exit, { ...gym, ty: 7000 }, [0.3, E.in]],
    [T.enter - 0.03, { ...front, ty: 3300, s: 1.74, rx: 30, ry: -35, rz: 8 }, [0.01, E.linear]],
    [T.enter, { ...front, ty: 1180, s: 1.74, rx: 5, ry: 12 }, { r: 0.65, z: 0.8 }],
    [T.optionsIn, { ...front, ty: 1180, s: 1.74, rx: 5, ry: -14 }, [2.4, E.inOut]],
    [T.spin[0], { fx: 210, fy: 563, tx: 540, ty: 1010, s: 2.0, rx: 4, ry: -10, rz: 0 }, [T.spin[1] - T.spin[0], E.inOut]],
    [T.chat, { fx: 210, fy: 563, tx: 540, ty: 1010, s: 2.0, rx: 4, ry: 10, rz: 0 }, [3.2, E.inOut]],
    [T.spin2[0], { ...front, ty: 1190, s: 1.7, rx: 3, ry: -12 }, [T.spin2[1] - T.spin2[0], E.inOut]],
    [T.progress, { ...front, ty: 1190, s: 1.76, rx: 3, ry: 10 }, [1.4, E.inOut]],
    [T.toYear, { ...front, ty: 1247, s: 1.9, rx: 2 }, { r: 0.55, z: 0.85 }],
    [T.fill[0], { ...front, ty: 1247, s: 2.04, rx: 2 }, [2.7, E.linear]],
    [T.dive, { fx: 210, fy: 520, tx: 540, ty: 960, s: 14, rx: 0, ry: 0, rz: 0 }, [0.35, E.in]],
  ];
}

// ---------- The film ----------
const clockText = (minute) => {
  const m = Math.round(minute);
  const hour = Math.floor(m / 60), min = String(m % 60).padStart(2, "0");
  return S.clock.format === "24h" ? `${String(hour).padStart(2, "0")}:${min}` : `${((hour + 11) % 12) + 1}:${min}`;
};

function type(t) {
  for (const line of TYPE) {
    const el = $(`#cap-${line.id}`);
    const out = prog(t, line.out, 0.2, E.in);
    const spans = $$("span", el);
    el.style.display = t < line.at[0] - 0.05 || out >= 1 ? "none" : "";
    el.style.transform = `translateY(${-90 * out}px)`;
    el.style.opacity = 1 - out;
    spans.forEach((span, i) => {
      const at = line.at[Math.min(i, line.at.length - 1)];
      const last = i === spans.length - 1;
      const p = prog(t, at, last ? 0.2 : 0.26, last ? E.in : E.outQuint);
      // The last word slams in from large; the others rise into place.
      span.style.opacity = clamp01(p * 4);
      span.style.transform = last
        ? `scale(${lerp(2.6, 1, p) * (1 + 0.08 * kick(t, at + 0.2, 0.3, 0.5))})`
        : `translateY(${(1 - p) * 60}px) scale(${lerp(1.25, 1, p)})`;
    });
  }
}

/** Places a hero piece: `x`, `y` are its top-left in the frame, `k` its scale. */
function place(el, { x, y, k, rx = 0, ry = 0, rz = 0, o = 1 }) {
  el.style.display = o <= 0.001 ? "none" : "";
  el.style.transform = `translate(${x}px, ${y}px) scale(${k / SHARP})`;
  const inner = el.firstElementChild;
  inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
  inner.style.opacity = o;
}

/** The opening: the logo above the hook line, then a push through the logo's habit block into the day. */
function intro(t) {
  const el = $("#intro");
  const through = prog(t, INTRO - 0.5, 0.42, E.in);
  const clear = prog(t, INTRO - 0.1, 0.2);
  el.style.display = clear >= 1 ? "none" : "";
  el.style.opacity = 1 - clear;
  const [top, habit, bottom] = $$("#intro .imark div");
  // The habit block slides into its slot, then grows until it is the whole frame.
  habit.style.transform = `translateX(${(spring(t, 0.05, 0.45, 0.7) - 1) * 8 * U}px) scale(${1 + 170 * through})`;
  habit.style.zIndex = 2;
  const rest = 1 - prog(t, INTRO - 0.65, 0.2);
  top.style.opacity = bottom.style.opacity = $("#intro .iword").style.opacity = rest;
}

function seek(t) {
  intro(t);
  type(t);
  const A = $("#todayA"), B = $("#todayB"), C = $("#chat"), P = $("#progress"), Y = $("#year");

  // ----- Camera -----
  const pose = K(t, M.poses);
  const spin = 360 * (prog(t, T.spin[0], T.spin[1] - T.spin[0], E.inOut) + prog(t, T.spin2[0], T.spin2[1] - T.spin2[0], E.inOut));
  const ry = pose.ry + spin + 2.2 * Math.sin(t * 1.1);
  const rx = pose.rx + 1.4 * Math.sin(t * 0.8 + 1);
  const rz = pose.rz + 1.3 * kick(t, T.slam, 0.2, 0.3) - 0.8 * kick(t, T.done, 0.2, 0.3);
  const scale = pose.s * (1 + 0.07 * kick(t, T.slam) + 0.05 * kick(t, T.done));
  const cam = $("#cam");
  cam.style.transform = `translate(${pose.tx}px, ${pose.ty}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale3d(${scale / SHARP}, ${scale / SHARP}, ${1 / SHARP}) translate(${-pose.fx * SHARP}px, ${-pose.fy * SHARP}px)`;
  // While the reminder cards hold the stage, the phone waits behind them, out of focus.
  const behind = prog(t, T.hero, 0.45) - prog(t, T.back, 0.35);
  cam.style.filter = behind > 0.01 ? `blur(${(10 * SHARP * behind).toFixed(2)}px)` : "none";
  cam.style.opacity = behind > 0.01 ? 1 - 0.5 * behind : 1;
  cam.style.display = t >= T.morphIn ? "none" : "";
  const facing = Math.cos((ry * Math.PI) / 180) >= 0;
  for (const id of ["#body", "#screen", "#over"]) $(id).style.visibility = facing ? "" : "hidden";
  $("#back").style.visibility = facing ? "hidden" : "";

  // ----- Background -----
  const whites = [[T.voices[1][1], T.voices[2][1]], [T.voices[3][1], T.back]];
  $$(".bgflip").forEach((el, i) => {
    const right = 100 * prog(t, whites[i][0] - 0.03, 0.2);
    const left = 100 * prog(t, whites[i][1] - 0.03, 0.2);
    el.style.display = right <= 0 || left >= 100 ? "none" : "";
    el.style.clipPath = `inset(0 ${100 - right}% 0 ${left}%)`;
  });

  const lurch = WHIPS().reduce((sum, at, i) => sum + (i % 2 ? -1 : 1) * spring(t, at, 0.7, 0.75), 0);
  $$(".shape").forEach((el, i) => {
    const [x, y, w, h, depth] = SHAPES[i];
    const travel = (((y - t * 60 * depth - lurch * 260 * depth) % 2300) + 2300) % 2300 - 250;
    Object.assign(el.style, { left: x + lurch * 90 * depth + "px", top: travel + "px", width: w + "px", height: h + "px", opacity: 0.05 + 0.1 * depth });
  });

  // ----- Which screen the phone shows -----
  // The screen changes while the phone's back is to the camera.
  const swap = (T.spin[0] + T.spin[1]) / 2, swap2 = (T.spin2[0] + T.spin2[1]) / 2;
  A.style.display = t < T.exit + 0.4 ? "" : "none";
  B.style.display = t >= T.exit + 0.4 && t < swap ? "" : "none";
  C.style.display = t >= swap && t < swap2 ? "" : "none";
  P.style.display = t >= swap2 ? "" : "none";
  $(".fab").style.display = t >= swap ? "none" : "";
  const flat = prog(t, T.iso, 0.3) - prog(t, T.front, 0.3); // lying flat: only the timeline matters
  $("#chrome").style.opacity = prog(t, T.pull, 0.3) * (1 - flat);
  $("#tabsel").style.transform = `translateX(${t >= swap2 ? 88 : t >= swap ? 176 : 0}px)`;
  const minute = lerp(S.clock.start, S.clock.end, prog(t, T.clock[0], T.clock[1] - T.clock[0]));
  $("#clock").textContent = t < T.exit + 0.4 ? clockText(minute) : "9:41";

  const sheet = spring(t, T.sheetUp, 0.5, 0.9) - prog(t, T.sheetDown, 0.35, E.in);
  const expand = spring(t, T.expand, 0.45, 0.85) - prog(t, T.collapse, 0.3, E.out);
  const screens = $("#screens");
  screens.style.transform = `translateY(${10 * sheet}px) scale(${1 - 0.06 * sheet})`;
  screens.style.borderRadius = `${lerp(55, 34, clamp01(sheet))}px`;
  screens.style.filter = expand > 0.01 ? `blur(${(13 * expand).toFixed(2)}px)` : "none";
  $("#dim").style.opacity = Math.max(clamp01(sheet) * 0.75, clamp01(expand) * 0.6);
  $("#status").style.opacity = 1 - 0.75 * clamp01(expand);

  // ----- 1 · The day fills up -----
  $(".scroll", A).style.transform = `translateY(${-M.scrollA}px)`;
  const cardHeight = lerp(M.cardA[0], M.cardA[1], spring(t, T.front + 0.1, 0.4, 0.85));
  const cardA = $(".coach", A);
  cardA.style.height = cardHeight + "px";
  const nextUp = prog(t, T.front + 0.1, 0.2, E.out);
  $$(".variant", cardA).forEach((v, i) => (v.style.opacity = i === 0 ? 1 - nextUp : nextUp));
  cardA.style.opacity = 1 - (prog(t, T.coachIn, 0.2) - prog(t, T.front, 0.3)); // it has lifted out of the screen
  const tl = M.tl - (M.cardA[0] - cardHeight); // 6 AM on the screen, as the card above changes height

  const hitSlot = kick(t, T.slam, 0.3, 0.4);
  const bump = { "todayA-review": -6 * hitSlot, "todayA-call": 6 * hitSlot };
  const gaps = $$(".gap", A);
  const arrivals = [$("#runA"), gaps[0], $("#todayA-standup"), gaps[1], $("#todayA-review"), $("#gym"), gaps[2], $("#todayA-call"), gaps[3], $("#todayA-planning")];
  arrivals.forEach((el, i) => {
    const p = spring(t, T.blocks + i * 0.11, 0.4, 0.68);
    el.style.transform = `translate(${(1 - p) * 70}px, ${bump[el.id] ?? 0}px) scale(${lerp(0.8, 1, p)})`;
    el.dataset.o = clamp01(p * 2.5);
    el.style.opacity = el.dataset.o;
  });

  // ----- 2 · The Gym block lifts off the screen and lands in the free gap -----
  const moved = prog(t, T.travel[0], T.travel[1] - T.travel[0]);
  const flying = t >= T.lift - 0.01 && t < T.slam + 0.12;
  const landed = t >= T.slam + 0.12;
  const done = prog(t, T.done, 0.25);
  const lift = spring(t, T.lift, 0.45, 0.7) * (1 - prog(t, T.slam - 0.13, 0.13, E.in));
  const gymRect = { left: lerp(198, 50, moved), top: lerp(minuteY(720), minuteY(750), moved) + 2, width: lerp(144, 292, moved) };

  const dressGym = (el, wide, isDone) => {
    $(".narrow", el).style.opacity = 1 - clamp01(wide / 0.4);
    $(".full", el).style.opacity = clamp01((wide - 0.3) / 0.4);
    $(".more", el).style.opacity = clamp01((wide - 0.3) / 0.4);
    $(".donebg", el).style.opacity = isDone;
    const shade = Math.round(255 * isDone);
    el.style.color = `rgb(${shade},${shade},${shade})`;
    $$(".gname", el).forEach((name) => name.classList.toggle("strike", isDone > 0.4));
    $(".cc .ring", el).style.opacity = 1 - isDone;
    Object.assign($(".cc .fill", el).style, { background: "#fff", color: "#000", transform: `scale(${spring(t, T.done, 0.35, 0.5)})`, opacity: t >= T.done ? 1 : 0 });
  };
  const gym = $("#gym");
  Object.assign(gym.style, { left: (landed ? 50 : 198) + "px", width: (landed ? 292 : 144) + "px", top: minuteY(landed ? 750 : 720) + 2 + "px", height: "41px" });
  gym.style.opacity = flying ? 0 : gym.dataset.o;
  dressGym(gym, landed ? 1 : 0, done);

  const gymF = $("#gymF");
  gymF.style.display = flying ? "" : "none";
  Object.assign(gymF.style, { left: M.tlx + gymRect.left + "px", top: tl + gymRect.top + "px", width: gymRect.width + "px", height: "41px" });
  gymF.style.transform = `translateZ(${230 * lift}px) rotateZ(${7 * Math.sin(Math.PI * moved)}deg) scale(${1 + 0.08 * lift})`;
  gymF.style.boxShadow = "inset 0 0 0 1.5px var(--emphasis)";
  dressGym(gymF, moved, 0);
  const shadow = $("#gymShadow");
  shadow.style.display = flying ? "" : "none";
  Object.assign(shadow.style, { left: M.tlx + gymRect.left + 30 * lift + "px", top: tl + gymRect.top + 40 * lift + "px", width: gymRect.width + "px", height: "41px", opacity: 0.5 * lift, filter: `blur(${4 + 14 * lift}px)` });

  // Rings spread from where it lands, and again when it's marked done.
  const hit = t >= T.done ? T.done : T.slam;
  $$(".ripple").forEach((ring, i) => {
    const p = prog(t, hit + i * 0.07, 0.75, E.out);
    ring.style.display = t < hit || p >= 1 ? "none" : "";
    Object.assign(ring.style, { left: M.tlx + 50 + "px", top: tl + minuteY(750) + 2 + "px", width: "292px", height: "41px", opacity: 0.7 * (1 - p) });
    ring.style.transform = `translateZ(1px) scale(${1 + (0.16 + i * 0.16) * p}, ${1 + (1.1 + i * 1.1) * p})`;
  });
  const hint = prog(t, T.iso + 0.3, 0.4, E.out) - prog(t, T.slam, 0.3);
  const ink = Math.round(lerp(199, 40, hint));
  gaps[2].style.borderColor = `rgb(${ink},${ink},${ink})`;
  gaps[2].style.color = hint > 0.5 ? "var(--ink)" : "var(--secondary)";
  $(".nowline", A).style.top = minuteY(minute) - 5 + "px";
  $(".nowline", B).style.top = minuteY(581) - 5 + "px";

  // The coach's suggestion, lifted out of the screen.
  const coachIn = spring(t, T.coachIn, 0.55, 0.78);
  const coachOut = prog(t, T.coachOut, 0.3, E.in);
  const coachY = lerp(-520, 250, coachIn) - 900 * coachOut;
  place($("#hCoachA"), { x: 114, y: coachY, k: 2.3, rx: lerp(-50, 0, coachIn) + 40 * coachOut, o: t < T.coachIn || coachOut >= 1 ? 0 : 1 });
  $("#hCoachA .ipill").style.transform = `scale(${press(t, T.tapMove, 0.07)})`;

  // ----- 3 · One reminder, four voices -----
  const drop = spring(t, T.notif, 0.45, 0.78);
  const gone = prog(t, T.collapse, 0.25, E.in);
  const heroOn = t >= T.hero && t < T.back + 0.38;
  const notif = $("#notif");
  const notifTop = lerp(lerp(-40, 58, drop), 138, clamp01(expand)) - 60 * gone;
  notif.style.transform = `translate3d(0, ${notifTop}px, ${50 * clamp01(expand)}px)`;
  notif.style.opacity = t < T.notif || heroOn ? 0 : clamp01(drop * 2.2) * (1 - gone);
  $$(".bd", notif).forEach((body) => (body.style.opacity = (body.dataset.voice === "strict") === (t < T.hero) ? 1 : 0));

  const arrive = spring(t, T.hero, 0.55, 0.8);
  const leave = prog(t, T.back, 0.38);
  const forward = arrive * (1 - leave); // 0 = on the phone as a banner, 1 = centre stage
  const turn = T.voices.slice(1).reduce((sum, [, at]) => sum + spring(t, at, 0.5, 0.8), 0);
  T.voices.forEach(([voice, at], i) => {
    const el = $(`#deck-${voice}`);
    const depth = i - turn; // 0 is the front card; negative ones have been thrown aside
    const behind = Math.max(0, depth);
    const thrown = Math.max(0, -depth);
    const size = 1 - 0.055 * behind;
    const k = lerp(1.9, 2.45 * size, forward);
    const others = prog(t, T.hero + 0.2, 0.3) * (1 - prog(t, T.back - 0.05, 0.15));
    place(el, {
      x: lerp(173.3, 67 + (1 - size) * 473 - 1500 * thrown, forward),
      y: lerp(526.9, 800 - 37 * behind + 60 * thrown, forward),
      k,
      rz: -20 * thrown,
      rx: 5 * Math.sin(t * 1.6 + i) * forward,
      o: !heroOn || thrown > 0.8 ? 0 : behind > 0.02 ? clamp01(1 - 0.3 * behind) * others : 1,
    });
    el.style.zIndex = 10 - i;

    // Nobody can read a whole reminder in two seconds. Once the coach is named, the few words
    // that carry its tone stay dark and are set large below; the rest of the card steps back.
    const until = T.voices[i + 1]?.[1] ?? T.back;
    const point = prog(t, T.speak[voice] + 0.2, 0.3);
    $$(".rest", el).forEach((rest) => (rest.style.opacity = lerp(1, 0.3, point)));
    const quote = $(`.quote[data-voice="${voice}"]`);
    const land = prog(t, T.speak[voice] + 0.3, 0.22, E.in);
    const gone = prog(t, until - 0.16, 0.16, E.in);
    quote.style.display = land <= 0 || gone >= 1 ? "none" : "";
    quote.style.opacity = clamp01(land * 3) * (1 - gone);
    quote.firstElementChild.style.transform = `scale(${lerp(1.9, 1, land) * (1 + 0.06 * kick(t, T.speak[voice] + 0.52, 0.3, 0.5))}) translateX(${-300 * gone}px)`;

    // Its name, large behind it.
    const label = $(`.vlabel[data-voice="${voice}"]`);
    label.style.display = t < at || t > until + 0.1 ? "none" : "";
    $$("div", label).forEach((line, n) => {
      const enter = prog(t, at + 0.06 + n * 0.07, 0.3, E.outQuint);
      const exit = prog(t, until - 0.14, 0.16, E.in);
      line.style.opacity = clamp01(enter * 3) * (1 - exit);
      line.style.transform = `translateX(${lerp(340, 0, enter) - 420 * exit}px) skewX(${lerp(-16, 0, enter) + 14 * exit}deg)`;
    });
  });
  const cap = $("#cap-voice");
  const capOut = prog(t, T.speak[COACHES[0]] + 0.1, 0.18, E.in);
  cap.style.display = t < T.hero + 0.1 || capOut >= 1 ? "none" : "";
  cap.style.opacity = 1 - capOut;
  $$("span", cap).forEach((span, i) => {
    const p = prog(t, T.hero + 0.3 + i * 0.05, 0.4, E.outQuint);
    span.style.opacity = p;
    span.style.transform = `translateY(${(1 - p) * 30}px)`;
  });

  // ----- 4 · Answer from the reminder -----
  const pillOn = t >= T.expand && t < T.toGym + 0.2;
  $$(".apill").forEach((pill, i) => {
    const pop = spring(t, T.expand + 0.1 + i * 0.07, 0.4, 0.62);
    const chosen = i === 0;
    const fall = chosen ? 0 : prog(t, T.tapDone + 0.04 + i * 0.03, 0.42, E.in);
    const away = chosen ? prog(t, T.collapse, 0.25, E.in) : 0;
    const picked = chosen ? prog(t, T.tapDone, 0.1, E.out) : 0;
    pill.style.display = pillOn ? "" : "none";
    pill.style.opacity = clamp01(pop * 2) * (1 - fall) * (1 - away);
    const y = notifTop + 60 * gone + M.notifHeight + 10 + i * 57 + 560 * fall - 220 * away;
    const size = lerp(0.7, 1, pop) * (1 + (chosen ? 0.1 * kick(t, T.tapDone, 0.3, 0.45) : 0));
    pill.style.transform = `translate3d(0, ${y}px, ${(40 + i * 30) * pop}px) rotateZ(${(i % 2 ? 1 : -1) * 28 * fall}deg) scale(${size})`;
    const shade = Math.round(lerp(250, 10, picked));
    pill.style.background = `rgb(${shade},${shade},${shade})`;
    pill.style.color = picked > 0.5 ? "#fff" : "#000";
  });
  const streak = spring(t, T.done + 0.2, 0.4, 0.55) - prog(t, T.exit - 0.05, 0.2, E.in);
  place($("#hStreak"), { x: 742, y: 770, k: 3.1 * Math.max(0.001, streak), rz: 8, o: streak > 0.01 ? 1 : 0 });
  $$("#hStreak .roll span").forEach((digit) => (digit.style.transform = `translateY(${-20 * spring(t, T.done + 0.5, 0.4, 0.7)}px)`));

  // ----- 5 · A week later -----
  const sweep = prog(t, T.enter - 0.1, 0.3, E.in); // the week's marks and the card leave upward
  const marks = $("#hMarks");
  marks.style.display = t < T.marks || sweep >= 1 ? "none" : "";
  marks.style.transform = `translateY(${-1500 * sweep}px)`;
  $$(".hm", marks).forEach((mark, i) => {
    const pop = spring(t, T.marks + i * 0.125, 0.35, 0.5);
    const snoozed = HISTORY[i] === "snoozed";
    mark.style.opacity = clamp01(pop * 3);
    mark.style.transform = `scale(${pop}) rotate(${snoozed ? 14 * kick(t, T.marks + i * 0.125 + 0.1, 0.3, 0.3) : 0}deg)`;
  });
  const marksText = $("#hMarksText");
  marksText.style.display = marks.style.display;
  marksText.style.opacity = prog(t, T.marks + 0.85, 0.25);
  marksText.style.transform = `translateY(${-1500 * sweep}px)`;
  const coachB = spring(t, T.coachB, 0.55, 0.8);
  const coachBY = lerp(2100, 1010, coachB) - 2700 * sweep;
  place($("#hCoachB"), { x: 114, y: coachBY, k: 2.3, rx: lerp(40, 0, coachB), o: t < T.coachB || sweep >= 1 ? 0 : 1 });
  $("#hCoachB .ipill").style.transform = `scale(${press(t, T.tapSuggest, 0.05)})`;

  const sheetEl = $("#sheet");
  const sheetShift = 820 * (1 - sheet);
  sheetEl.style.transform = `translateY(${sheetShift}px)`;
  sheetEl.style.display = t < T.sheetUp || sheet <= 0.001 ? "none" : "";
  const loaded = prog(t, T.optionsIn, 0.25);
  $("#s-loading").style.opacity = 1 - loaded;
  $$("#s-loading .skel i").forEach((shine) => (shine.style.left = `${-60 + 160 * (((t - T.sheetUp) / 1.2) % 1)}%`));
  const picked = prog(t, T.tapOption + 0.03, 0.18, E.out);
  const floating = t >= T.floatOut - 0.02 && t < T.sheetDown + 0.4;
  const settle = prog(t, T.sheetDown - 0.2, 0.2);
  let tapZ = 0;
  $$("#s-list .opt").forEach((option, i) => {
    const arriveAt = spring(t, T.optionsIn + i * 0.07, 0.45, 0.85);
    const on = i === 0 ? 1 - picked : i === 1 ? picked : 0;
    option.style.opacity = floating && i < 3 ? 0 : clamp01(arriveAt * 1.4);
    $(".on", option).style.opacity = on;
    option.style.color = on > 0.5 ? "#fff" : "#000";
    option.style.transform = `translateY(${(1 - arriveAt) * 16}px)`;
    const clone = $$(".opt.clone")[i];
    if (!clone) return;
    // The three fixes come off the sheet toward the camera; the chosen one comes furthest.
    const out = spring(t, T.floatOut + i * 0.09, 0.5, 0.62) * (1 - settle);
    const z = ([170, 115, 65][i] * (1 - 0.65 * picked * (i === 1 ? 0 : 1)) + (i === 1 ? 110 * spring(t, T.tapOption, 0.4, 0.55) : 0)) * out;
    if (i === 1) tapZ = z;
    clone.style.display = floating ? "" : "none";
    Object.assign(clone.style, { left: M.sheetOptions[i].left + "px", top: 72 + M.sheetOptions[i].top + sheetShift + "px" });
    clone.style.transform = `translateZ(${z}px) scale(${1 + z / 2600})`;
    clone.style.boxShadow = `0 ${z * 0.16}px ${z * 0.4}px rgba(0,0,0,${0.3 * clamp01(z / 120)})`;
    $(".on", clone).style.opacity = on;
    clone.style.color = on > 0.5 ? "#fff" : "#000";
  });
  const cta = $$("#s-cta span");
  cta[0].style.opacity = loaded * (1 - picked);
  cta[1].style.opacity = picked;
  cta[2].style.opacity = 1 - loaded; // "Choose an Option", disabled until the options arrive
  const grey = Math.round(lerp(229, 0, loaded));
  $("#s-cta").style.background = `rgb(${grey},${grey},${Math.round(lerp(234, 0, loaded))})`;
  cta[2].style.color = "rgba(60,60,67,.6)";
  $("#s-cta").style.transform = `scale(${press(t, T.tapApply, 0.04)})`;

  // ----- 6 · Or just tell the coach -----
  const asked = prog(t, T.tapChip + 0.08, 0.2);
  $("#c-intro").style.opacity = 1 - asked;
  $$("#c-intro .c-chip")[2].style.transform = `scale(${press(t, T.tapChip, 0.06)})`;
  $$("#c-intro .mine").forEach((chip, i) => {
    const arrive = spring(t, T.chat - 0.1 + i * 0.07, 0.45, 0.85);
    chip.style.opacity = clamp01(arrive * 2);
    chip.style.transform = `scale(${lerp(0.85, 1, arrive)})`;
  });
  const sent = spring(t, T.tapChip + 0.12, 0.4, 0.75);
  const user = $("#c-user");
  user.style.opacity = clamp01(sent * 2.5);
  user.style.transform = `translateY(${(1 - sent) * 40}px) scale(${lerp(0.8, 1, sent)})`;
  const typing = $("#c-typing");
  typing.style.opacity = t >= T.typing && t < T.reply ? prog(t, T.typing, 0.15) : 0;
  $$("i", typing).forEach((dot, i) => (dot.style.opacity = Math.floor((t - T.typing) / 0.3) % 3 === i ? 1 : 0.3));
  const answered = spring(t, T.reply, 0.4, 0.85);
  const replyEl = $("#c-reply");
  replyEl.style.opacity = clamp01(answered * 2.5);
  replyEl.style.transform = `translateY(${(1 - answered) * 24}px)`;
  // The suggestion comes off the screen toward the camera, and settles back once applied.
  const offered = spring(t, T.reply + 0.15, 0.45, 0.8);
  const applied = prog(t, T.applied, 0.2);
  const propZ = 120 * (spring(t, T.reply + 0.35, 0.5, 0.6) - prog(t, T.applied + 0.35, 0.3));
  const propOut = t >= T.reply + 0.33 && t < T.spin2[0] + 0.3;
  for (const card of $$(".c-prop")) {
    const clone = card.classList.contains("clone");
    card.style.display = clone && !propOut ? "none" : "";
    card.style.opacity = clone ? lerp(1, 0.78, applied) : propOut ? 0 : clamp01(offered * 2.5) * lerp(1, 0.78, applied);
    if (clone) {
      Object.assign(card.style, { left: M.prop.left + "px", top: M.prop.top + "px" });
      card.style.transform = `translateZ(${propZ}px) scale(${1 + propZ / 2600})`;
      card.style.boxShadow = `0 ${propZ * 0.18}px ${propZ * 0.45}px rgba(0,0,0,${0.3 * clamp01(propZ / 90)})`;
    } else {
      card.style.transform = `translateY(${(1 - offered) * 24}px)`;
    }
    $$(".c-cap span, .c-b span", card).forEach((label, i) => (label.style.opacity = i % 2 ? applied : 1 - applied));
    const apply = $(".c-apply", card);
    apply.style.transform = `scale(${press(t, T.tapPause, 0.06)})`;
    apply.style.background = `rgba(0,0,0,${1 - applied})`;
    apply.style.color = applied > 0.5 ? "rgba(60,60,67,.6)" : "#fff";
  }

  // ----- 7 · Progress, then the whole year -----
  const count = spring(t, T.progress + 0.1, 0.9, 0.95);
  $$(".n-streak").forEach((el) => (el.textContent = Math.round(5 * count)));
  $$(".n-kept").forEach((el) => (el.textContent = Math.round(92 * count)));
  $$("#progress .col").forEach((col, i) => {
    const grow = spring(t, T.progress + 0.05 + i * 0.06, 0.55, 0.7);
    const plotHeight = 118;
    $(".pl", col).style.height = plotHeight * $(".pl", col).dataset.h * clamp01(grow * 1.6) + "px";
    $(".kp", col).style.height = plotHeight * $(".kp", col).dataset.h * grow + "px";
    $(".an", col).style.bottom = plotHeight * $(".kp", col).dataset.h * grow + 4 + "px";
    $(".an", col).style.opacity = clamp01(grow * 2 - 1);
  });
  const statsOut = t >= T.progress + 0.15 && t < T.toYear + 0.05;
  $$("#progress .stat").forEach((card, i) => {
    card.style.opacity = statsOut ? 0 : 1;
    const clone = $$(".stat.clone")[i];
    const out = spring(t, T.progress + 0.2 + i * 0.1, 0.5, 0.6) - prog(t, T.toYear - 0.25, 0.25);
    const z = [90, 140][i] * out;
    clone.style.display = statsOut ? "" : "none";
    Object.assign(clone.style, { left: M.stats[i].left + "px", top: M.stats[i].top + "px", width: M.stats[i].w + "px", height: M.stats[i].h + "px" });
    clone.style.transform = `translateZ(${z}px)`;
    clone.style.boxShadow = `0 ${z * 0.18}px ${z * 0.45}px rgba(0,0,0,${0.28 * clamp01(z / 80)})`;
  });

  // The habit's year slides in over Progress and fills in day by day, January to today.
  const yearIn = spring(t, T.toYear, 0.45, 0.9);
  Y.style.display = t < T.toYear ? "none" : "";
  Y.style.transform = `translateX(${402 * (1 - yearIn)}px)`;
  P.style.transform = `translateX(${-120 * yearIn}px)`;
  if (t >= T.toYear - 0.05 && t < T.morphIn) {
    const span = T.fill[1] - T.fill[0];
    for (const { el, day } of M.yearCells) {
      if (day.index > YEAR.through) continue;
      const at = T.fill[0] + (span * day.index) / YEAR.through;
      const pop = spring(t, at, 0.22, 0.6);
      el.style.background = t >= at ? YEAR_COLORS[day.mark] : YEAR_COLORS.none;
      el.style.transform = day.mark === "done" && t >= at ? `scale(${lerp(0.2, 1, pop)})` : "none";
    }
    const today = Math.round(YEAR.through * clamp01((t - T.fill[0]) / span));
    $$("#year [data-total]").forEach((el, i) => (el.textContent = M.yearTotals[today][i]));
    $$("#year [data-m]").forEach((el) => {
      const kept = YEAR.days.filter((d) => d.month === Number(el.dataset.m) && d.index <= today && d.mark === "done").length;
      el.textContent = kept || "";
    });
    $(".scroll", Y).style.transform = `translateY(${-196 * prog(t, T.fill[0] + 0.1, 2.2)}px)`;
  }

  // ----- Taps -----
  const onPhone = [
    [T.tapDone, 300, notifTop + M.notifHeight + 10 + 25, 70],
    [T.tapOption, M.sheetOptions[1].x + 40, 72 + M.sheetOptions[1].y, tapZ + 4],
    [T.tapApply, M.sheetCta.x, 72 + M.sheetCta.y, 2],
    [T.tapChip, M.chip.x, M.chip.y, 2],
    [T.tapPause, M.prop.left + M.applyButton.x, M.prop.top + M.applyButton.y, propZ + 4],
  ];
  const onStage = [
    [T.tapMove, 114 + M.moveButton.x * 2.3, coachY + M.moveButton.y * 2.3, 0],
    [T.tapSuggest, 114 + M.suggestButton.x * 2.3, coachBY + M.suggestButton.y * 2.3, 0],
  ];
  for (const [el, list, size] of [[$("#tap"), onPhone, 1], [$("#tap2"), onStage, 2.3]]) {
    const active = list.find(([at]) => t > at - 0.3 && t < at + 0.4);
    if (!active) { el.style.opacity = 0; continue; }
    const [at, x, y, z] = active;
    const land = prog(t, at - 0.3, 0.24, E.out);
    el.style.opacity = land * (1 - prog(t, at + 0.14, 0.26));
    el.style.transform = `translate3d(${x}px, ${y}px, ${z}px) scale(${size * lerp(1.6, 1, land) * (1 - 0.2 * (prog(t, at - 0.03, 0.08) - prog(t, at + 0.1, 0.15)))})`;
  }

  // ----- 7 · A crop of the timeline becomes the logo -----
  const morph = $("#morph");
  morph.style.display = t < T.morphIn - 0.15 ? "none" : "";
  morph.style.opacity = prog(t, T.morphIn - 0.15, 0.15); // the dive into the year ends in white
  if (t >= T.morphIn - 0.15) {
    const m = prog(t, T.morph, 0.65);
    const crop = [{ x: 120, y: 690, w: 840, h: 190 }, { x: 120, y: 892, w: 840, h: 128 }, { x: 120, y: 1032, w: 840, h: 190 }];
    const slideIn = [1 - spring(t, T.morphIn, 0.5, 0.8), -(1 - prog(t, T.slot - 0.24, 0.24, E.in)), 1 - spring(t, T.morphIn + 0.09, 0.5, 0.8)];
    const shake = 12 * kick(t, T.slot, 0.25, 0.35);
    const fade = 1 - prog(t, T.morph - 0.3, 0.3);
    const iris = 1500 * prog(t, T.iris, 0.5);
    const center = { x: M.logo[1].x + M.logo[1].w / 2, y: M.logo[1].y + M.logo[1].h / 2 };
    $("#morphD").style.clipPath = `circle(${iris}px at ${lerp(540, center.x, m)}px ${lerp(956, center.y, m)}px)`;
    $$(".mhour").forEach((hour, i) => {
      hour.style.top = [684, 886, 1026, 1228][i] + "px";
      hour.style.opacity = fade * prog(t, T.morphIn, 0.3);
    });
    for (const [layer, colors] of [["#morphL", ["#f4f4f6", "#0a0a0a", "#d1d1d6"]], ["#morphD", ["#48484a", "#ffffff", "#48484a"]]]) {
      $$(`${layer} .mb3`).forEach((block, i) => {
        const r = { x: lerp(crop[i].x, M.logo[i].x, m), y: lerp(crop[i].y, M.logo[i].y, m), w: lerp(crop[i].w, M.logo[i].w, m), h: lerp(crop[i].h, M.logo[i].h, m) };
        Object.assign(block.style, { left: r.x - 1200 * slideIn[i] + (i === 1 ? -shake : shake) + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px", borderRadius: lerp(26, 2.5 * U, m) + "px" });
        block.style.background = i === 1 ? colors[1] : layer === "#morphL" ? (m > 0.5 ? colors[2] : colors[0]) : colors[0];
        $$(".tx, .ck", block).forEach((text) => (text.style.opacity = fade));
      });
    }
  }
  const end = $("#end");
  end.style.display = t < T.iris ? "none" : "";
  const word = prog(t, T.word, 0.6, E.outQuint);
  $("#word").style.transform = `translateX(${(word - 1) * 105}%)`;
  [["#tagline", T.tagline, 0.07], ["#sub", T.sub, 0.045]].forEach(([selector, from, step]) => {
    $$(`${selector} span`).forEach((span, i) => {
      const p = prog(t, from + i * step, 0.5, E.outQuint);
      span.style.opacity = p;
      span.style.transform = `translateY(${(1 - p) * 26}px)`;
    });
  });
}

/** Moments the sound design hangs on, in seconds. */
function cues() {
  const pops = Array.from({ length: 10 }, (_, i) => ({ at: T.blocks + i * 0.11, kind: "tick", step: i }));
  const marks = HISTORY.map((_, i) => ({ at: T.marks + i * 0.125, kind: "tick", step: i + 2 }));
  return [
    ...pops,
    { at: 0.12, kind: "snap" },
    { at: INTRO - 0.65, kind: "riser", length: 0.6 },
    { at: INTRO - 0.05, kind: "impact", size: 0.6 },
    { at: T.pull + 0.3, kind: "impact", size: 0.6 },
    { at: T.pull, kind: "whoosh", length: 0.8 },
    { at: T.iso - 0.25, kind: "riser", length: 0.3 },
    { at: T.iso, kind: "whoosh", length: 0.6 },
    { at: T.coachIn, kind: "pop" },
    { at: T.tapMove, kind: "tap" },
    { at: T.lift, kind: "whoosh", length: 0.7 },
    { at: T.slam - 0.45, kind: "riser", length: 0.45 },
    { at: T.slam, kind: "impact", size: 1 },
    { at: T.slam, kind: "snap" },
    { at: T.front, kind: "whoosh", length: 0.6 },
    { at: T.clock[0], kind: "ticks", length: T.clock[1] - T.clock[0] },
    { at: T.notif + 0.08, kind: "notify" },
    { at: T.hero, kind: "whoosh", length: 0.6 },
    ...T.voices.slice(1).map(([, at]) => ({ at: at - 0.05, kind: "whip" })),
    ...T.voices.slice(1).map(([, at]) => ({ at, kind: "impact", size: 0.45 })),
    ...COACHES.map((name) => ({ at: T.speak[name] + 0.5, kind: "impact", size: 0.35 })),
    { at: T.back, kind: "whoosh", length: 0.5 },
    ...[0, 1, 2, 3].map((i) => ({ at: T.expand + 0.1 + i * 0.07, kind: "tick", step: i + 4 })),
    { at: T.tapDone, kind: "tap" },
    { at: T.tapDone + 0.05, kind: "whip" },
    { at: T.toGym, kind: "whoosh", length: 0.5 },
    { at: T.done, kind: "done" },
    { at: T.done, kind: "impact", size: 0.6 },
    { at: T.exit, kind: "whoosh", length: 0.4 },
    ...marks,
    { at: T.marks, kind: "impact", size: 0.5 },
    { at: T.coachB, kind: "pop" },
    { at: T.tapSuggest, kind: "tap" },
    { at: T.enter - 0.1, kind: "whoosh", length: 0.7 },
    { at: T.optionsIn, kind: "pop" },
    ...[0, 1, 2].map((i) => ({ at: T.floatOut + i * 0.09, kind: "tick", step: i + 5 })),
    { at: T.tapOption, kind: "tap" },
    { at: T.tapOption, kind: "impact", size: 0.5 },
    { at: T.tapApply, kind: "tap" },
    { at: T.sheetDown, kind: "whoosh", length: 0.45 },
    { at: T.spin[0] - 0.1, kind: "riser", length: 0.7 },
    { at: T.spin[0], kind: "whoosh", length: 0.7 },
    { at: T.chat, kind: "impact", size: 0.5 },
    { at: T.tapChip, kind: "tap" },
    { at: T.tapChip + 0.12, kind: "whip" },
    { at: T.reply, kind: "pop" },
    { at: T.tapPause, kind: "tap" },
    { at: T.applied, kind: "done" },
    { at: T.spin2[0] - 0.1, kind: "riser", length: 0.7 },
    { at: T.spin2[0], kind: "whoosh", length: 0.7 },
    { at: T.progress, kind: "impact", size: 0.8 },
    { at: T.progress + 0.1, kind: "rise", length: 0.8 },
    { at: T.toYear, kind: "whoosh", length: 0.5 },
    { at: T.fill[0], kind: "riser", length: T.fill[1] - T.fill[0] },
    { at: T.fill[1], kind: "impact", size: 0.6 },
    { at: T.dive - 0.1, kind: "riser", length: 0.45 },
    { at: T.morphIn, kind: "whoosh", length: 0.5 },
    { at: T.slot, kind: "impact", size: 1 },
    { at: T.slot, kind: "snap" },
    { at: T.morph, kind: "whoosh", length: 0.7 },
    { at: T.word, kind: "pop" },
    { at: T.tagline, kind: "done" },
  ];
}

async function start() {
  const lang = new URLSearchParams(location.search).get("lang") ?? "en";
  [SIZES, S] = await Promise.all([fetch("assets/sf/sizes.json").then((r) => r.json()), fetch(`strings/${lang}.json`).then((r) => r.json())]);
  document.documentElement.lang = lang;
  if (new URLSearchParams(location.search).get("voice") !== "off") {
    V = await fetch(`voice/${lang}/manifest.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  makeTimes();
  build();
  await document.fonts.load('800 100px "Onest"', S.end.wordmark);
  await document.fonts.ready;
  await Promise.all($$("img").map((img) => img.decode().catch(() => {})));
  measure();
  window.DURATION = T.total;
  window.CUES = cues();
  window.VOICE = voiceCues();
  window.MUSIC = { drums: [T.pull + 0.1, T.morphIn] };
  window.seek = seek;
  seek(Number(new URLSearchParams(location.search).get("t") ?? 0));
  window.READY = true;
}
start();
