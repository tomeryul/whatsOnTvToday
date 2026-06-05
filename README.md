# whatsOnTvToday

לוח שידורים חי לערוצים 12 (קשת) ו-13 (רשת) — דף סטטי בצד-לקוח בלבד.

## הפעלה עם GitHub Pages

האתר הוא `index.html` יחיד, ללא צורך בבנייה (build). כדי לפרסם:

1. ב-GitHub עבור ל-**Settings → Pages**.
2. תחת **Build and deployment → Source** בחר **Deploy from a branch**.
3. בחר את הענף שבו נמצא הקובץ (למשל `main` לאחר מיזוג, או הענף הנוכחי) ותיקייה `/ (root)`.
4. שמור — תוך דקה-שתיים האתר יהיה זמין בכתובת:
   `https://<username>.github.io/whatsOnTvToday/`

## הערות

- הדף עובד כולו בצד-הלקוח ומושך נתונים דרך פרוקסי CORS (allorigins / corsproxy),
  ולכן פועל היטב על אחסון סטטי כמו GitHub Pages.
- **רשת 13** עובד מהקופסה — לחץ "טען לוח".
- **קשת 12** דורש הדבקת endpoint של ה-XHR (mako) בשדה המתאים.
- הקובץ `.nojekyll` מבטיח ש-GitHub Pages יגיש את הקבצים כמו שהם ללא עיבוד Jekyll.
