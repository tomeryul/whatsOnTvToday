// מושך את לוחות השידורים של רשת 13, קשת 12 וכאן 11 בצד-שרת ושומר JSON סטטי ב-data/.
// רץ דרך GitHub Action (ראה .github/workflows/update-schedules.yml).
// אין תלויות חיצוניות — fetch מובנה ב-Node 18+, פרסור ב-regex/JSON.

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const HEB_DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];

async function getText(url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
      "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
      ...extraHeaders
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
const clean = s => decodeEntities(s).replace(/\s+/g, " ").trim();

/* ============ רשת 13 ============ */
async function fetchReshet() {
  const html = await getText("https://13tv.co.il/tv-guide/");
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Reshet: __NEXT_DATA__ not found");
  const data = JSON.parse(m[1]);
  const grids = data?.props?.pageProps?.page?.Content?.PageGrid || [];
  const days = [];
  for (const grid of grids) {
    for (const day of grid.broadcastWeek || []) {
      const items = (day.shows || [])
        .filter(s => s.start_time && s.title && !s.isBlank)
        .map(s => ({
          time: s.start_time,
          title: String(s.title).trim(),
          link: s.link || null,
          img: s.image || (s.imageObj && s.imageObj.d) || null,
          desc: (s.desc || "").trim()
        }));
      if (items.length) {
        const label = [day.weekday, day.shortDate].filter(Boolean).join(" · ");
        days.push({ label, items });
      }
    }
  }
  if (!days.length) throw new Error("Reshet: no days parsed");
  return days;
}

/* ============ קשת 12 (mako) ============ */
async function fetchMako() {
  const raw = await getText("https://www.mako.co.il/AjaxPage?jspName=EPGResponse.jsp");
  const data = JSON.parse(raw);
  const progs = data.programs || [];
  const days = [];
  let curKey = null, cur = null;
  for (const p of progs) {
    const time = p.DisplayStartTime, title = (p.ProgramName || "").trim();
    if (!time || !title) continue;
    const datePart = (p.Date || "").split(" ")[0]; // DD/MM/YYYY
    if (datePart !== curKey) {
      curKey = datePart;
      let label = datePart;
      const dm = datePart.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (dm) {
        const dt = new Date(+dm[3], +dm[2] - 1, +dm[1]);
        label = HEB_DAYS[dt.getDay()] + " · " + dm[1] + "." + dm[2];
      }
      cur = { label, items: [] };
      days.push(cur);
    }
    const url = (p.MakoTVURL || "").trim();
    const pic = (p.Picture || "").trim();
    cur.items.push({
      time, title,
      link: url.startsWith("http") ? url : null,
      img: pic && !/placeholder/i.test(pic) ? pic : null,
      desc: (p.EventDescription || "").trim()
    });
  }
  if (!days.length) throw new Error("Mako: no days parsed");
  return days;
}

/* ============ כאן 11 ============ */
// ממיר "D.M.YYYY H:M:S" (UTC) לשעת ישראל HH:mm (כולל שעון קיץ אוטומטי).
function utcToIsraelTime(s) {
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h, mi, se] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, se || 0));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date);
}

function parseKanFragment(html) {
  const items = [];
  // כל תוכנית עטופה ב-results-item; מפצלים ולוקחים את השדות הראשונים בכל בלוק.
  const blocks = html.split(/class="results-item/).slice(1);
  for (const b of blocks) {
    const utc = b.match(/data-date-utc="([^"]+)"/);
    const title = b.match(/class="program-title"[^>]*>([\s\S]*?)<\/h3>/);
    const desc = b.match(/class="program-description"[^>]*>([\s\S]*?)<\/div>/);
    const link = b.match(/href="(\/content\/[^"]+)"/);
    const img = b.match(/<img[^>]+src="([^"]+)"/);
    if (!utc || !title) continue;
    const time = utcToIsraelTime(utc[1]);
    if (!time) continue;
    let src = img ? decodeEntities(img[1]) : null;
    if (src && src.startsWith("/")) src = "https://www.kan.org.il" + src;
    items.push({
      time,
      title: clean(title[1]),
      link: link ? "https://www.kan.org.il" + link[1] : null,
      img: src,
      desc: desc ? clean(desc[1]) : ""
    });
  }
  return items;
}

async function fetchKan() {
  const CHANNEL_ID = 4444;   // כאן 11
  const PAGE_ID = 1517;      // עמוד לוח השידורים
  const days = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() + i);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    const dayParam = `${dd}-${mm}-${yyyy}`;
    const url = `https://www.kan.org.il/umbraco/surface/LoadBroadcastSchedule/LoadSchedule?day=${dayParam}&channelId=${CHANNEL_ID}&currentPageId=${PAGE_ID}`;
    let frag;
    try {
      frag = await getText(url, {
        "X-Requested-With": "XMLHttpRequest",
        "X-Time-Offset": "-180",
        "Referer": `https://www.kan.org.il/tv-guide/?channelId=${CHANNEL_ID}`
      });
    } catch (e) {
      console.warn(`Kan day ${dayParam} failed: ${e.message}`);
      continue;
    }
    const items = parseKanFragment(frag);
    if (items.length) {
      const label = HEB_DAYS[dt.getDay()] + " · " + dd + "." + mm;
      days.push({ label, items });
    }
  }
  if (!days.length) throw new Error("Kan: no days parsed");
  return days;
}

/* ============ main ============ */
async function build(name, fetcher, channelName) {
  try {
    const days = await fetcher();
    const out = { channel: channelName, updated: new Date().toISOString(), days };
    await writeFile(join(DATA_DIR, `${name}.json`), JSON.stringify(out), "utf8");
    const total = days.reduce((n, d) => n + d.items.length, 0);
    console.log(`✓ ${name}: ${days.length} days, ${total} programs`);
    return true;
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    return false;
  }
}

await mkdir(DATA_DIR, { recursive: true });
const results = await Promise.all([
  build("reshet13", fetchReshet, "רשת 13"),
  build("keshet12", fetchMako, "קשת 12"),
  build("kan11", fetchKan, "כאן 11")
]);
// נכשל רק אם כולם נכשלו (כדי לא לדרוס נתונים תקינים מריצה קודמת ללא צורך).
if (!results.some(Boolean)) {
  console.error("All channels failed");
  process.exit(1);
}
