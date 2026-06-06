# whatsOnTvToday

לוח שידורים בסגנון Netflix לערוצים **רשת 13**, **קשת 12** ו**כאן 11** — דף סטטי שרץ על GitHub Pages.

## איך זה עובד

הדף (`index.html`) הוא צד-לקוח בלבד וקורא קובצי JSON סטטיים מתיקיית `data/`:

- `data/reshet13.json` · `data/keshet12.json` · `data/kan11.json`

הקבצים האלה מתעדכנים אוטומטית ע"י **GitHub Action** (`.github/workflows/update-schedules.yml`)
שרץ כל 6 שעות, מריץ את `scripts/fetch-schedules.mjs` שמושך את הלוחות **בצד-שרת** ושומר אותם כ-JSON.

למה צד-שרת? כי כאן 11 חסום ב-Cloudflare לבקשות דפדפן/פרוקסי, ומשיכה משרת עם
User-Agent תקין עוקפת את זה. גם רשת 13 וקשת 12 נמשכים כך — כך הדף לא תלוי בפרוקסי CORS כלל.

## הפעלה עם GitHub Pages

1. ב-GitHub: **Settings → Pages**.
2. **Source → Deploy from a branch**, בחר את הענף ותיקייה `/ (root)`.
3. האתר יעלה בכתובת `https://<username>.github.io/whatsOnTvToday/`.

> הערה: ריצות ה-cron של GitHub Actions מתבצעות על ענף ברירת המחדל (`main`).
> לאחר מיזוג ל-`main` הנתונים יתרעננו אוטומטית. אפשר גם להריץ ידנית מ-**Actions → Update TV schedules → Run workflow**.

## עדכון ידני מקומי

```bash
node scripts/fetch-schedules.mjs   # דורש Node 18+ (fetch מובנה); ללא תלויות
```

## תכונות

- מראה Netflix: באנר "עכשיו בשידור", שורות אופקיות נגללות של כרטיסי פוסטר.
- טעינה אוטומטית בפתיחה + מעבר בין ערוצים.
- הדגשת התוכנית המשודרת כעת + גלילה אליה.
- מודאל פרטים לכל תוכנית (תמונה, תיאור, קישור לעמוד התוכנית).
- חיצי גלילה בכל שורה.
