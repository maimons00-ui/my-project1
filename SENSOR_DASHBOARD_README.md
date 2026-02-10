# 🏠 דשבורד חיישני הבית - Tuya Smart v2.0

מערכת מלאה להצגת נתוני חיישנים מ-Tuya WiFi על טאבלט.

## 📊 תכונות

### חיישנים נתמכים
- 🔥 **צריכת גז** - קריאה בזמן אמת (m³/שעה) + היסטוריה חודשית
- 💧 **צריכת מים** - קריאה בזמן אמת (ליטר/דקה) + היסטוריה חודשית
- ⚡ **צריכת חשמל** - קריאה בזמן אמת (וואט) + צריכה חודשית (kWh)
- 🌡️ **טמפרטורת דוד מים** - קריאה בזמן אמת (°C) + ממוצע יומי

### תצוגה ויזואלית
- 4 עיגולי התקדמות צבעוניים
- קריאה בזמן אמת **בצהוב** במרכז כל עיגול
- היסטוריה חודשית מצטברת
- טבעת התקדמות מתחילת החודש
- גרפים מתקדמים עם Chart.js

### 📱 תמיכה ב-PWA (Progressive Web App)
- התקנה כאפליקציה על מסך הבית
- עבודה אופליין
- עדכונים אוטומטיים
- Push Notifications

### 🔔 מערכת התראות
- התראה בחריגה מיעדים (ניתן להגדרה)
- באנר התראה בחלק העליון
- צליל התראה (ניתן להשבתה)
- היסטוריית התראות
- Push Notifications (עם אישור)

### 📈 גרפים מתקדמים
- גרף קו לצריכת גז
- גרף קו לצריכת מים
- גרף עמודות לחשמל
- גרף טמפרטורה עם טווח מומלץ
- גרף Radar להשוואת כל החיישנים
- תקופות: 7/14/30 ימים

### 🌙 מצב לילה/יום אוטומטי
- מעבר אוטומטי לפי שעה
- הגדרת שעות מעבר
- אפשרות לקביעה ידנית

### אחסון נתונים
- שמירה מקומית על הטאבלט
- היסטוריה של 30 יום
- ייצוא נתונים ל-JSON
- גיבוי אוטומטי

## 🚀 התקנה

### אפשרות 1: קובץ HTML בלבד (פשוט)

פשוט פתחו את הקובץ `sensor_dashboard.html` בדפדפן.
הנתונים יישמרו ב-localStorage של הדפדפן.

### אפשרות 2: עם שרת Node.js (מומלץ)

```bash
# התקנת התלויות (אין תלויות חיצוניות!)
npm install

# הפעלת השרת
npm start
```

השרת יפעל בכתובת: http://localhost:3000

## ⚙️ הגדרת Tuya

### 1. יצירת חשבון מפתח ב-Tuya

1. היכנסו ל-[Tuya IoT Platform](https://iot.tuya.com/)
2. צרו פרויקט חדש
3. קבלו את `Access ID` ו-`Access Secret`
4. הוסיפו את המכשירים שלכם לפרויקט

### 2. הגדרת מזהי המכשירים

**דרך ממשק המשתמש:**
לחצו על כפתור ⚙️ (הגדרות) בפינה השמאלית התחתונה והזינו:
- Access ID
- Access Secret
- Device ID לכל חיישן

**דרך משתני סביבה:**
```bash
export TUYA_ACCESS_ID="your_access_id"
export TUYA_ACCESS_SECRET="your_access_secret"
export TUYA_GAS_DEVICE_ID="device_id_for_gas"
export TUYA_WATER_DEVICE_ID="device_id_for_water"
export TUYA_ELECTRICITY_DEVICE_ID="device_id_for_electricity"
export TUYA_TEMPERATURE_DEVICE_ID="device_id_for_temperature"

npm start
```

## 📱 התקנה על טאבלט אנדרואיד

### שיטה 1: דרך דפדפן
1. העבירו את הקבצים לטאבלט
2. התקינו שרת מקומי (כמו Termux + Node.js)
3. הפעילו את השרת
4. פתחו את http://localhost:3000 בדפדפן

### שיטה 2: Progressive Web App (PWA)
1. פתחו את הדשבורד בדפדפן Chrome
2. לחצו על ⋮ (תפריט)
3. בחרו "הוסף למסך הבית"
4. האפליקציה תופיע כאייקון

### שיטה 3: Termux על אנדרואיד
```bash
# התקינו Termux מ-F-Droid
pkg update && pkg upgrade
pkg install nodejs

# העתיקו את הקבצים
cd /sdcard/Download/sensor-dashboard
npm start
```

## 🔌 API

השרת מספק API לגישה לנתונים:

| Endpoint | Method | תיאור |
|----------|--------|-------|
| `/api/sensors` | GET | כל נתוני החיישנים הנוכחיים |
| `/api/history?type=gas&days=7` | GET | היסטוריה (gas/water/electricity/temperature/all) |
| `/api/settings` | POST | עדכון הגדרות |
| `/api/export` | GET | ייצוא כל הנתונים |

### דוגמאות שימוש:

```javascript
// קבלת נתונים נוכחיים
fetch('http://localhost:3000/api/sensors')
  .then(r => r.json())
  .then(data => console.log(data));

// קבלת היסטוריית מים ל-30 יום
fetch('http://localhost:3000/api/history?type=water&days=30')
  .then(r => r.json())
  .then(data => console.log(data));
```

## 🎨 התאמה אישית

### שינוי יעדים חודשיים
ערכו את הקובץ `server.js`:
```javascript
TARGETS: {
    gas: 50,        // m³ לחודש
    water: 15,      // m³ לחודש
    electricity: 500 // kWh לחודש
}
```

### שינוי צבעים
ערכו את ה-CSS בקובץ `sensor_dashboard.html`:
```css
/* צבע הקריאה במרכז */
.current-value {
    color: #ffd700; /* צהוב */
}

/* גרדיאנטים של הטבעות */
#gasGradient { ... }
#waterGradient { ... }
```

### שינוי תדירות עדכון
```javascript
// בקובץ server.js
POLL_INTERVAL: 30000, // מילישניות (30 שניות)

// בקובץ HTML
CONFIG.UPDATE_INTERVAL: 5000, // מילישניות (5 שניות)
```

## 📁 מבנה קבצים

```
/workspace/
├── sensor_dashboard.html    # הדשבורד הראשי (HTML עצמאי)
├── server.js               # שרת Node.js
├── package.json            # הגדרות npm
├── sensor_data.json        # נתונים שמורים (נוצר אוטומטית)
├── sensor_history.json     # היסטוריה (נוצר אוטומטית)
└── settings.json           # הגדרות (נוצר אוטומטית)
```

## 🔧 פתרון בעיות

### הנתונים לא מתעדכנים
- ודאו שהחיישנים מחוברים לרשת WiFi
- בדקו את מזהי המכשירים ב-Tuya
- ודאו שה-Access ID/Secret תקינים

### השרת לא עולה
```bash
# בדקו שהפורט פנוי
lsof -i :3000
# או שנו פורט בקובץ server.js
```

### נתונים נמחקו
הנתונים נשמרים ב:
- `sensor_data.json` - נתונים נוכחיים
- `sensor_history.json` - היסטוריה

גבו קבצים אלו באופן קבוע.

## 🔒 אבטחה

⚠️ **חשוב:**
- אל תחשפו את ה-Access Secret שלכם
- השתמשו ב-HTTPS בסביבת ייצור
- הגבילו גישה לשרת לרשת מקומית בלבד

## 📄 רישיון

MIT License - שימוש חופשי

---

נבנה עם ❤️ לבית חכם יותר
