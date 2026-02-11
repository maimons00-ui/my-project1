# Sensor Dashboard Dev1 - דשבורד חיישני הבית

מערכת ניטור חיישנים חכמים לבית עם אינטגרציה ל-Tuya Cloud API.

## תכונות עיקריות

- **ניטור בזמן אמת** - גז, מים, חשמל וטמפרטורת דוד מים
- **גרפים ותרשימים** - 30 ימים של היסטוריה עם Chart.js
- **מערכת התראות** - התראות על חריגה מטמפרטורה גבוהה/נמוכה
- **הגדרות יעדים** - מעקב צריכה חודשית מול יעדים מותאמים
- **אפליקציית PWA** - ניתן להתקנה כאפליקציה על הטלפון
- **עיצוב מותאם** - תצוגה רספונסיבית, RTL, מצב כהה
- **Tuya Cloud API** - קריאת נתונים מחיישנים חכמים של Tuya/Smart Life

## מבנה הפרויקט

```
Sensor_Dashboard_Dev1/
  server.js                 # שרת Node.js - API + הגשת קבצים סטטיים
  sensor_dashboard.html     # דשבורד ראשי (HTML/CSS/JS)
  manifest.json             # PWA manifest
  package.json              # תלויות Node.js
  settings.json             # הגדרות (לא ב-Git - מכיל מפתחות API)
  settings.example.json     # תבנית הגדרות (לדוגמה)
  sensor_data.json          # נתוני חיישנים נוכחיים (נוצר אוטומטית)
  sensor_history.json       # היסטוריית נתונים (נוצר אוטומטית)
  start_dashboard.bat       # הפעלה ב-Windows
  start_dashboard_hidden.vbs # הפעלה מוסתרת ב-Windows
```

## התקנה

### דרישות
- Node.js 14.0.0 ומעלה

### שלבים

1. **העתק את התיקייה** `Sensor_Dashboard_Dev1` למחשב שלך

2. **צור קובץ הגדרות** - העתק את התבנית והזן את הפרטים שלך:
   ```bash
   cd Sensor_Dashboard_Dev1
   cp settings.example.json settings.json
   ```

3. **ערוך את `settings.json`** עם פרטי Tuya שלך:
   - `accessId` - מפתח ה-Access ID מ-Tuya IoT Platform
   - `accessSecret` - מפתח ה-Access Secret
   - `devices` - Device IDs של החיישנים שלך

4. **הפעל את השרת**:
   ```bash
   node server.js
   ```

5. **פתח בדפדפן**: [http://localhost:3002](http://localhost:3002)

## קבלת מפתחות Tuya

1. הירשם ב-[Tuya IoT Platform](https://iot.tuya.com/)
2. צור פרויקט Cloud חדש (בחר אזור EU)
3. הוסף את המכשירים שלך תחת הפרויקט
4. העתק את ה-Access ID/Secret מדף הפרויקט
5. מצא את ה-Device ID של כל מכשיר בדף ה-Devices

## חיישנים נתמכים

| חיישן | סוג | DP Codes |
|--------|------|----------|
| חשמל | Dual CT Clamp Meter | `cur_power1`, `cur_power2`, `all_energy`, `cur_voltage1` |
| טמפרטורה | חיישן טמפ' Tuya | `temp_current`, `temperature`, `va_temperature` |
| גז | חיישן גז (עתידי) | - |
| מים | חיישן מים (עתידי) | - |

## API Endpoints

| נתיב | שיטה | תיאור |
|-------|--------|---------|
| `/api/sensors` | GET | נתוני חיישנים נוכחיים |
| `/api/history` | GET | היסטוריית נתונים (params: `type`, `days`) |
| `/api/settings` | GET | קריאת הגדרות |
| `/api/settings` | POST | עדכון הגדרות |
| `/api/export` | GET | ייצוא כל הנתונים |
| `/api/reset` | POST | איפוס כל הנתונים |

## רישיון

MIT
