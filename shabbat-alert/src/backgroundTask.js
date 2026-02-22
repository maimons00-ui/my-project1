import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { getCurrentLocation } from './location';
import { getShabbatTimes, isFriday } from './shabbatTimes';
import { scheduleShabbatNotifications } from './notifications';

const SHABBAT_BACKGROUND_TASK = 'SHABBAT_BACKGROUND_FETCH';

TaskManager.defineTask(SHABBAT_BACKGROUND_TASK, async () => {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay();

    // Run on Thursday (4) or Friday (5) to ensure notifications are set
    if (dayOfWeek !== 4 && dayOfWeek !== 5) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const location = await getCurrentLocation();
    if (!location) {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }

    const times = getShabbatTimes(location.latitude, location.longitude);
    if (!times) {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }

    await scheduleShabbatNotifications(times);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundTask() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SHABBAT_BACKGROUND_TASK);
    if (isRegistered) {
      return true;
    }

    await BackgroundFetch.registerTaskAsync(SHABBAT_BACKGROUND_TASK, {
      minimumInterval: 6 * 60 * 60, // 6 hours
      stopOnTerminate: false,
      startOnBoot: true,
    });

    return true;
  } catch (error) {
    console.error('Failed to register background task:', error);
    return false;
  }
}

export async function unregisterBackgroundTask() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SHABBAT_BACKGROUND_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(SHABBAT_BACKGROUND_TASK);
    }
  } catch (error) {
    console.error('Failed to unregister background task:', error);
  }
}
