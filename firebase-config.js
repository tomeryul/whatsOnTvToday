// ====== הגדרות Firebase ======
// מלא כאן את הפרטים מ-Firebase Console:
//   1. כנס ל-https://console.firebase.google.com ויצור פרויקט (חינם).
//   2. Build → Authentication → Get started → הפעל "Anonymous".
//   3. Build → Firestore Database → Create database → Production mode.
//   4. Project settings (גלגל שיניים) → "Your apps" → Web (</>) → רשום אפליקציה.
//   5. העתק לכאן את הערכים מאובייקט firebaseConfig שמוצג שם.
//   6. הדבק את חוקי האבטחה מתוך README (Firestore → Rules).
//
// המפתחות האלה פומביים מטבעם (הם נחשפים לכל גולש) — האבטחה נעשית דרך חוקי Firestore.
// כל עוד apiKey ריק — האתר עובד רגיל בלי תגובות/לייקים.

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: ""
};
