// מושך את לוחות השידורים של רשת 13, קשת 12 וכאן 11 בצד-שרת ושומר JSON סטטי ב-data/.
// רץ דרך GitHub Action (ראה .github/workflows/update-schedules.yml).
// אין תלויות חיצוניות — fetch מובנה ב-Node 18+, פרסור ב-regex/JSON.
//
// כל תוכנית נשמרת כ-{ start: epoch-ms (UTC מוחלט), time: "HH:MM" (שעון ישראל), title, link, img, desc }.
// חותמת הזמן המוחלטת מאפשרת ללקוח למזג ערוצים, לסנן ל-24 שעות, ולזהות "עכשיו בשידור" בצורה נכונה.

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TZ = "Asia/Jerusalem";

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

// היסט אזור-הזמן (במילישניות) עבור רגע נתון — מטפל אוטומטית בשעון קיץ.
function tzOffsetMs(instant) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
  const p = dtf.formatToParts(instant).reduce((a, x) => (a[x.type] = x.value, a), {});
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour === "24" ? 0 : p.hour, p.minute, p.second);
  return asUTC - instant.getTime();
}
// שעת-קיר בישראל → epoch מוחלט.
function israelWallToEpoch(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let off = tzOffsetMs(new Date(guess));
  off = tzOffsetMs(new Date(guess - off)); // עידון לקצה שעון-קיץ
  return guess - off;
}
// epoch → "HH:MM" בשעון ישראל.
function israelHHMM(epoch) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date(epoch));
}
const item = (start, title, link, img, desc) => ({ start, time: israelHHMM(start), title, link, img, desc });

/* ============ רשת 13 ============ */
async function fetchReshet() {
  const html = await getText("https://13tv.co.il/tv-guide/");
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Reshet: __NEXT_DATA__ not found");
  const data = JSON.parse(m[1]);
  const grids = data?.props?.pageProps?.page?.Content?.PageGrid || [];
  const programs = [];
  for (const grid of grids) {
    for (const day of grid.broadcastWeek || []) {
      const shows = (day.shows || []).filter(s => s.start_time && s.title && !s.isBlank);
      let prevMin = -1, dayOffset = 0;
      for (const s of shows) {
        const [h, mi] = s.start_time.split(":").map(Number);
        const min = h * 60 + mi;
        if (min < prevMin) dayOffset++; // חצה חצות בתוך יום-השידור
        prevMin = min;
        // show_date קבוע לכל יום-השידור; מוסיפים dayOffset לתוכניות שאחרי חצות.
        const [by, bm, bd] = (s.show_date || "").split("-").map(Number);
        if (!by) continue;
        const base = new Date(Date.UTC(by, bm - 1, bd));
        base.setUTCDate(base.getUTCDate() + dayOffset);
        const start = israelWallToEpoch(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, mi);
        programs.push(item(
          start,
          String(s.title).trim(),
          s.link || null,
          s.image || (s.imageObj && s.imageObj.d) || null,
          (s.desc || "").trim()
        ));
      }
    }
  }
  if (!programs.length) throw new Error("Reshet: no programs parsed");
  return programs;
}

/* ============ קשת 12 (mako) ============ */
async function fetchMako() {
  const raw = await getText("https://www.mako.co.il/AjaxPage?jspName=EPGResponse.jsp");
  const data = JSON.parse(raw);
  const programs = [];
  for (const p of data.programs || []) {
    if (!p.ProgramName) continue;
    const start = +p.StartTimeUTC;            // epoch ms מוחלט מהמקור
    if (!Number.isFinite(start)) continue;
    const url = (p.MakoTVURL || "").trim();
    const pic = (p.Picture || "").trim();
    programs.push(item(
      start,
      p.ProgramName.trim(),
      url.startsWith("http") ? url : null,
      pic && !/placeholder/i.test(pic) ? pic : null,
      (p.EventDescription || "").trim()
    ));
  }
  if (!programs.length) throw new Error("Mako: no programs parsed");
  return programs;
}

/* ============ כאן 11 ============ */
function kanUtcToEpoch(s) {
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h, mi, se] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, se || 0); // data-date-utc הוא UTC
}
function parseKanFragment(html) {
  const out = [];
  for (const b of html.split(/class="results-item/).slice(1)) {
    const utc = b.match(/data-date-utc="([^"]+)"/);
    const title = b.match(/class="program-title"[^>]*>([\s\S]*?)<\/h3>/);
    const desc = b.match(/class="program-description"[^>]*>([\s\S]*?)<\/div>/);
    const link = b.match(/href="(\/content\/[^"]+)"/);
    const img = b.match(/<img[^>]+src="([^"]+)"/);
    if (!utc || !title) continue;
    const start = kanUtcToEpoch(utc[1]);
    if (start == null) continue;
    let src = img ? decodeEntities(img[1]) : null;
    if (src && src.startsWith("/")) src = "https://www.kan.org.il" + src;
    out.push(item(
      start,
      clean(title[1]),
      link ? "https://www.kan.org.il" + link[1] : null,
      src,
      desc ? clean(desc[1]) : ""
    ));
  }
  return out;
}
async function fetchKan() {
  const CHANNEL_ID = 4444, PAGE_ID = 1517;
  const programs = [];
  const today = new Date();
  for (let i = 0; i < 3; i++) { // 3 ימים מספיקים לחלון של 24 שעות
    const dt = new Date(today);
    dt.setDate(today.getDate() + i);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dayParam = `${dd}-${mm}-${dt.getFullYear()}`;
    const url = `https://www.kan.org.il/umbraco/surface/LoadBroadcastSchedule/LoadSchedule?day=${dayParam}&channelId=${CHANNEL_ID}&currentPageId=${PAGE_ID}`;
    try {
      const frag = await getText(url, {
        "X-Requested-With": "XMLHttpRequest",
        "X-Time-Offset": "-180",
        "Referer": `https://www.kan.org.il/tv-guide/?channelId=${CHANNEL_ID}`
      });
      programs.push(...parseKanFragment(frag));
    } catch (e) {
      console.warn(`Kan day ${dayParam} failed: ${e.message}`);
    }
  }
  if (!programs.length) throw new Error("Kan: no programs parsed");
  return programs;
}

/* ============ ספורט (ספורט 5 / ONE — כל ערוצי הספורט) ============ */
// ה-endpoint מחזיר טבלת HTML לכל ערוץ (ערוץ הספורט, ספורט 5+, Live, Stars, Gold).
// אירועי שידור חיים בלבד — לכן sparse. כל פריט: שעה, כותרת, סימון "ישיר".
async function fetchSport5() {
  const programs = [];
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() + i);
    const y = dt.getFullYear(), mo = dt.getMonth() + 1, d = dt.getDate();
    const dateParam = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    let html;
    try {
      html = await getText(`https://www.sport5.co.il/Ajax/GetBroadcastSheetData.aspx?date=${dateParam}`, {
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://www.sport5.co.il/html/pages/broadcastsheet.html"
      });
    } catch (e) {
      console.warn(`Sport5 day ${dateParam} failed: ${e.message}`);
      continue;
    }
    let cur = null, curLogo = null;
    for (const row of html.split(/<tr/)) {
      if (/tr-header/.test(row)) {
        const alt = row.match(/alt="([^"]*)"/);
        const src = row.match(/<img[^>]*src="([^"]*)"/);
        cur = alt ? clean(alt[1]) : null;
        curLogo = src ? (src[1].startsWith("http") ? src[1] : "https://www.sport5.co.il" + src[1]) : null;
        // מסננים פלטפורמות שאינן ערוץ טלוויזיה (אתר, מובייל, רדיו)
        if (cur && /אתר|מובייל|רדיו|radio|mobile|web/i.test(cur)) cur = null;
        continue;
      }
      const tm = row.match(/class="date">[\s\S]*?(\d{1,2}:\d{2})/);
      const ti = row.match(/class="text">([\s\S]*?)<\/td>/);
      if (cur && tm && ti) {
        const title = clean(ti[1].replace(/<[^>]+>/g, ""));
        if (!title) continue;
        const [hh, mi] = tm[1].split(":").map(Number);
        const start = israelWallToEpoch(y, mo, d, hh, mi);
        programs.push({
          start, time: israelHHMM(start), title,
          channel: cur, live: /alt="ישיר"/.test(row), link: null, img: curLogo, desc: ""
        });
      }
    }
  }
  if (!programs.length) throw new Error("Sport5: no programs parsed");
  return programs;
}

/* ============ main ============ */
function dedupeSort(programs) {
  programs.sort((a, b) => a.start - b.start);
  const out = [];
  for (const p of programs) {
    const last = out[out.length - 1];
    if (last && last.start === p.start && last.title === p.title && last.channel === p.channel) continue;
    out.push(p);
  }
  return out;
}

async function build(id, name, fetcher) {
  try {
    const programs = dedupeSort(await fetcher());
    const out = { channel: name, channelId: id, updated: new Date().toISOString(), programs };
    await writeFile(join(DATA_DIR, `${id}.json`), JSON.stringify(out), "utf8");
    console.log(`✓ ${id}: ${programs.length} programs`);
    return true;
  } catch (e) {
    console.error(`✗ ${id}: ${e.message}`);
    return false;
  }
}

await mkdir(DATA_DIR, { recursive: true });
const results = await Promise.all([
  build("reshet13", "רשת 13", fetchReshet),
  build("keshet12", "קשת 12", fetchMako),
  build("kan11", "כאן 11", fetchKan),
  build("sport", "ספורט", fetchSport5)
]);
if (!results.some(Boolean)) {
  console.error("All channels failed");
  process.exit(1);
}
