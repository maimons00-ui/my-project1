import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { formatHebrewTime } from './shabbatTimes';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermissions() {
  if (!Device.isDevice) {
    console.warn('Notifications only work on physical devices');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('shabbat-alerts', {
      name: 'התראות שבת',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      lightColor: '#FFD700',
    });
  }

  return true;
}

export async function scheduleShabbatNotifications(shabbatTimes) {
  await cancelAllShabbatNotifications();

  const now = new Date();
  const notifications = [];

  if (shabbatTimes.oneHourBefore > now) {
    const oneHourId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🕯️ שבת בעוד שעה!',
        body: `כניסת שבת בשעה ${formatHebrewTime(shabbatTimes.candleLighting)}\nהכינו את הנרות! 🕯️🕯️`,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android' && { channelId: 'shabbat-alerts' }),
      },
      trigger: {
        type: 'date',
        date: shabbatTimes.oneHourBefore,
      },
    });
    notifications.push({ id: oneHourId, type: 'one-hour-before' });
  }

  if (shabbatTimes.candleLighting > now) {
    const candleLightingId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🕯️ שבת שלום! 🕯️',
        body: `הגיע זמן הדלקת נרות שבת!\n${formatHebrewTime(shabbatTimes.candleLighting)}`,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'android' && { channelId: 'shabbat-alerts' }),
      },
      trigger: {
        type: 'date',
        date: shabbatTimes.candleLighting,
      },
    });
    notifications.push({ id: candleLightingId, type: 'candle-lighting' });
  }

  return notifications;
}

export async function cancelAllShabbatNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getScheduledNotifications() {
  return await Notifications.getAllScheduledNotificationsAsync();
}
