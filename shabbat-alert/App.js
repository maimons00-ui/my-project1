import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  I18nManager,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCurrentLocation, getLocationName, requestLocationPermissions } from './src/location';
import { getShabbatTimes, formatHebrewTime, getNextFriday, getHebrewDayName } from './src/shabbatTimes';
import {
  requestNotificationPermissions,
  scheduleShabbatNotifications,
  getScheduledNotifications,
  cancelAllShabbatNotifications,
} from './src/notifications';
import { registerBackgroundTask } from './src/backgroundTask';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

export default function App() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [shabbatTimes, setShabbatTimes] = useState(null);
  const [notificationsScheduled, setNotificationsScheduled] = useState(false);
  const [scheduledList, setScheduledList] = useState([]);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [error, setError] = useState(null);

  const setupPermissions = async () => {
    const locPermission = await requestLocationPermissions();
    const notifPermission = await requestNotificationPermissions();

    if (!locPermission.granted) {
      setError('נדרשת הרשאת מיקום.\nאנא אפשרו גישה למיקום בהגדרות.');
      return false;
    }
    if (!notifPermission) {
      setError('נדרשת הרשאת התראות.\nאנא אפשרו התראות בהגדרות.');
      return false;
    }

    setPermissionsGranted(true);
    return true;
  };

  const loadShabbatData = useCallback(async () => {
    try {
      setError(null);
      const loc = await getCurrentLocation();
      if (!loc) {
        setError('לא הצלחנו לקבל מיקום.\nאנא ודאו שה-GPS פעיל.');
        return;
      }

      setLocation(loc);
      const name = await getLocationName(loc.latitude, loc.longitude);
      setLocationName(name);

      const times = getShabbatTimes(loc.latitude, loc.longitude);
      if (!times) {
        setError('לא הצלחנו לחשב זמני שבת למיקום זה.');
        return;
      }

      setShabbatTimes(times);
    } catch (err) {
      setError('שגיאה בטעינת נתונים: ' + err.message);
    }
  }, []);

  const scheduleNotifs = async () => {
    if (!shabbatTimes) return;

    try {
      const result = await scheduleShabbatNotifications(shabbatTimes);
      if (result.length > 0) {
        setNotificationsScheduled(true);
        const scheduled = await getScheduledNotifications();
        setScheduledList(scheduled);
      } else {
        Alert.alert('שים לב', 'זמני ההתראה כבר עברו השבוע.\nההתראות יתוזמנו אוטומטית ביום שישי הבא.');
      }
    } catch (err) {
      Alert.alert('שגיאה', 'לא הצלחנו לתזמן התראות: ' + err.message);
    }
  };

  const cancelNotifs = async () => {
    await cancelAllShabbatNotifications();
    setNotificationsScheduled(false);
    setScheduledList([]);
  };

  const initialize = async () => {
    setLoading(true);
    const permsOk = await setupPermissions();
    if (permsOk) {
      await loadShabbatData();
      await registerBackgroundTask();
    }
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadShabbatData();
    setRefreshing(false);
  };

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (shabbatTimes && permissionsGranted && !notificationsScheduled) {
      scheduleNotifs();
    }
  }, [shabbatTimes, permissionsGranted]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <MaterialCommunityIcons name="candle" size={60} color="#FFD700" />
        <Text style={styles.loadingText}>מחשב זמני שבת...</Text>
        <ActivityIndicator size="large" color="#FFD700" style={{ marginTop: 20 }} />
      </View>
    );
  }

  const friday = getNextFriday();
  const fridayStr = `${friday.getDate()}/${friday.getMonth() + 1}/${friday.getFullYear()}`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFD700" />}
    >
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <MaterialCommunityIcons name="candle" size={40} color="#FFD700" />
        <Text style={styles.title}>התראת שבת</Text>
        <MaterialCommunityIcons name="candle" size={40} color="#FFD700" />
      </View>

      <Text style={styles.subtitle}>התראה אוטומטית לכניסת שבת</Text>

      {error ? (
        <View style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle" size={40} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initialize}>
            <Text style={styles.retryButtonText}>נסה שוב</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Location Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="map-marker" size={24} color="#4FC3F7" />
              <Text style={styles.cardTitle}>מיקום</Text>
            </View>
            <Text style={styles.locationName}>{locationName}</Text>
            {location && (
              <Text style={styles.coordinates}>
                {location.latitude.toFixed(4)}°N, {location.longitude.toFixed(4)}°E
              </Text>
            )}
          </View>

          {/* Shabbat Times Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="clock-outline" size={24} color="#FFD700" />
              <Text style={styles.cardTitle}>זמני שבת</Text>
            </View>
            <Text style={styles.fridayDate}>יום שישי {fridayStr}</Text>

            {shabbatTimes && (
              <View style={styles.timesContainer}>
                <View style={styles.timeRow}>
                  <View style={styles.timeBlock}>
                    <Text style={styles.timeLabel}>🔔 התראה ראשונה</Text>
                    <Text style={styles.timeSubLabel}>שעה לפני</Text>
                    <Text style={styles.timeValue}>{formatHebrewTime(shabbatTimes.oneHourBefore)}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.timeRow}>
                  <View style={styles.timeBlock}>
                    <Text style={styles.timeLabel}>🔔 התראה שנייה</Text>
                    <Text style={styles.timeSubLabel}>5 דקות לפני</Text>
                    <Text style={styles.timeValue}>{formatHebrewTime(shabbatTimes.fiveMinutesBefore)}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.timeRow}>
                  <View style={styles.timeBlock}>
                    <Text style={styles.timeLabel}>🕯️ הדלקת נרות</Text>
                    <Text style={styles.timeSubLabel}>כניסת שבת</Text>
                    <Text style={[styles.timeValue, styles.mainTime]}>
                      {formatHebrewTime(shabbatTimes.candleLighting)}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.timeRow}>
                  <View style={styles.timeBlock}>
                    <Text style={styles.timeLabel}>🌅 שקיעה</Text>
                    <Text style={styles.timeValue}>{formatHebrewTime(shabbatTimes.sunset)}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Notifications Status Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name={notificationsScheduled ? 'bell-ring' : 'bell-off'}
                size={24}
                color={notificationsScheduled ? '#4CAF50' : '#ff6b6b'}
              />
              <Text style={styles.cardTitle}>סטטוס התראות</Text>
            </View>

            {notificationsScheduled ? (
              <>
                <Text style={styles.statusActive}>✅ התראות מתוזמנות</Text>
                <Text style={styles.statusDetail}>
                  {scheduledList.length} התראות ממתינות
                </Text>
                <TouchableOpacity style={styles.cancelButton} onPress={cancelNotifs}>
                  <Text style={styles.cancelButtonText}>בטל התראות</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.statusInactive}>אין התראות מתוזמנות</Text>
                <TouchableOpacity style={styles.scheduleButton} onPress={scheduleNotifs}>
                  <MaterialCommunityIcons name="bell-plus" size={20} color="#fff" />
                  <Text style={styles.scheduleButtonText}>תזמן התראות</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Info Card */}
          <View style={[styles.card, styles.infoCard]}>
            <Text style={styles.infoTitle}>איך זה עובד?</Text>
            <Text style={styles.infoText}>
              📍 האפליקציה מזהה את המיקום שלך{'\n'}
              🧮 מחשבת את שעת כניסת השבת{'\n'}
              🔔 התראה ראשונה: שעה לפני כניסת שבת{'\n'}
              🕯️ התראה שנייה: 5 דקות לפני כניסת שבת{'\n'}
              ⚙️ הכל אוטומטי, בכל שישי!
            </Text>
          </View>
        </>
      )}

      <Text style={styles.footer}>שבת שלום! 🕊️</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1b3e',
  },
  contentContainer: {
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0d1b3e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFD700',
    fontSize: 20,
    marginTop: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#8899bb',
    textAlign: 'center',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#162552',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e3470',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e0e6f0',
  },
  locationName: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  coordinates: {
    fontSize: 13,
    color: '#6b7fa8',
    textAlign: 'center',
  },
  fridayDate: {
    fontSize: 16,
    color: '#a0b0d0',
    textAlign: 'center',
    marginBottom: 16,
  },
  timesContainer: {
    gap: 0,
  },
  timeRow: {
    paddingVertical: 12,
  },
  timeBlock: {
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#c0d0f0',
    marginBottom: 2,
  },
  timeSubLabel: {
    fontSize: 13,
    color: '#7088b8',
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 2,
  },
  mainTime: {
    fontSize: 36,
    color: '#FFD700',
  },
  divider: {
    height: 1,
    backgroundColor: '#1e3470',
    marginHorizontal: 20,
  },
  statusActive: {
    fontSize: 18,
    color: '#4CAF50',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 4,
  },
  statusInactive: {
    fontSize: 16,
    color: '#ff6b6b',
    textAlign: 'center',
    marginBottom: 12,
  },
  statusDetail: {
    fontSize: 14,
    color: '#8899bb',
    textAlign: 'center',
    marginBottom: 12,
  },
  scheduleButton: {
    backgroundColor: '#1565C0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  scheduleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#37474F',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#ccc',
    fontSize: 15,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#101e40',
    borderColor: '#1a2d5c',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFD700',
    marginBottom: 8,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 15,
    color: '#a0b0d0',
    lineHeight: 26,
    textAlign: 'right',
  },
  errorCard: {
    backgroundColor: '#1e1020',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3d1030',
  },
  errorText: {
    color: '#ff8a8a',
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 12,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: '#1565C0',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    color: '#4a5a80',
    fontSize: 16,
    marginTop: 16,
    marginBottom: 20,
  },
});
