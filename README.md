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

- **תצוגה מאוחדת**: כל שלושת הערוצים בדף אחד — מה שמשודר עכשיו ו-24 השעות הקרובות בלבד.
- **תג ערוץ צבעוני** ליד כל תוכנית (רשת 13 / קשת 12 / כאן 11).
- זיהוי "עכשיו בשידור" מדויק לפי חותמת זמן מוחלטת (epoch), כולל בר התקדמות.
- צ'יפים לסינון ערוצים, טעינה אוטומטית, ורענון "עכשיו" כל דקה.
- מודאל פרטים לכל תוכנית (תמונה, תיאור, שעות, קישור לעמוד התוכנית).

> כל תוכנית נשמרת ב-JSON עם `start` (epoch-ms מוחלט) ו-`time` (שעון ישראל),
> כך שהמיזוג בין הערוצים והחלון של 24 שעות מדויקים גם סביב חצות.

## תגובות ולייקים (Firebase)

האתר תומך בלייקים ותגובות לסדרות, וברשימת "הכי אהובים" לפי המשתמשים. זה דורש
פרויקט Firebase (חינמי לשימוש אישי). כל עוד `firebase-config.js` ריק — האתר עובד
רגיל בלי הפיצ'רים האלה.

### הקמה (פעם אחת)

1. צור פרויקט ב-https://console.firebase.google.com (חינם).
2. **Build → Authentication → Sign-in method → Google → Enable**.
3. **Authentication → Settings → Authorized domains** → הוסף את דומיין ה-Pages (למשל `tomeryul.github.io`).
4. **Build → Firestore Database → Create database** (Production mode).
5. **Project settings ⚙ → Your apps → Web (`</>`)** → רשום אפליקציה והעתק את
   ערכי `firebaseConfig` לקובץ `firebase-config.js` בריפו.
6. **Firestore → Rules** → הדבק את החוקים הבאים ופרסם:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /series/{key} {
      allow read: if true;
      allow create, update: if request.auth != null;
      match /likers/{uid} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == uid;
      }
      match /comments/{c} {
        allow read: if true;
        allow create: if request.auth != null
          && request.resource.data.text is string
          && request.resource.data.text.size() > 0
          && request.resource.data.text.size() <= 1000;
        allow delete: if request.auth != null && resource.data.uid == request.auth.uid;
      }
    }
  }
}
```

הזהות מבוססת על התחברות **Google**. שם התצוגה כברירת מחדל הוא השם מחשבון Google,
וניתן לשנותו לכינוי מותאם (נשמר מקומית). המפתחות ב-`firebase-config.js` פומביים
מטבעם — האבטחה נעשית דרך חוקי Firestore למעלה.
