# טל"ת — בדיקת רכב לפני נסיעה

אפליקציה לגדוד: נהגים ממלאים טל"ת (בדיקת רכב לפני נסיעה), הדיווחים נשמרים במאגר מרכזי, ומפקדים צופים ומסננים אותם. חלק מ"הפרויקטים של Mr.Gor".

## טכנולוגיה
- **Frontend:** React + Vite (נבנה לקובץ HTML יחיד עם `vite-plugin-singlefile`), עברית RTL.
- **Backend:** Cloudflare Worker (`worker.js`) המגיש את האתר וחושף API קטן.
- **מסד נתונים:** Cloudflare KV (binding `TALAT_KV`, namespace `talat-db`). כל דיווח נשמר תחת מפתח `talat:<id>`; תמונות נשמרות כ-base64 בתוך הרשומה.

## מבנה
- `src/App.jsx` — כל האפליקציה: טופס הטל"ת, לוגיקת חיווי הצבע, ועמוד המפקד.
- `src/storage.js` — שכבת אחסון מול ה-API (עם נפילה ל-localStorage בפיתוח מקומי).
- `worker.js` — ה-Worker: מסלולי `/api/storage*` + הגשת `public/`.
- `wrangler.jsonc` — הגדרות הפריסה (שם ה-Worker + binding ל-KV).

## חיווי צבע (אוטומטי, אדום > צהוב > ירוק)
- 🔴 **אדום** — מתיזים לא תקין / לחץ אוויר לא תקין / תאורה לא תקינה / דווח נזק במושבים אחוריים / לא אושר צילום 360°.
- 🟡 **צהוב** — דלק 1/4 / מי קירור מתחת לקו האמצע / אין מנעול תא מטען / חסר כלי עבודה / דווחו תקלות נוספות.
- 🟢 **ירוק** — אף אחד מהתנאים לעיל.

## עמוד מפקד
נתיב "מפקד" בראש העמוד, מוגן בסיסמה (session בלבד). הסיסמה מוגדרת בקבוע `MANAGER_PASSWORD` בקובץ `src/App.jsx`.

## פיתוח והרצה מקומית
```bash
npm install
npm run dev        # פיתוח
npm run build      # בונה ל-public/index.html
```

## עדכון ופריסה מחדש
לאחר שינוי בקוד:
```bash
npm run build
npx wrangler deploy
```

## שינוי סיסמת המפקד
ערוך את `MANAGER_PASSWORD` ב-`src/App.jsx`, ואז `npm run build && npx wrangler deploy`.
