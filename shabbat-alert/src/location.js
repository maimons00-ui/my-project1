import * as Location from 'expo-location';

export async function requestLocationPermissions() {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    return { granted: false, error: 'נדרשת הרשאת מיקום כדי לחשב זמני שבת' };
  }

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

  return {
    granted: true,
    backgroundGranted: backgroundStatus === 'granted',
  };
}

export async function getCurrentLocation() {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeout: 15000,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown) {
      return {
        latitude: lastKnown.coords.latitude,
        longitude: lastKnown.coords.longitude,
      };
    }

    return null;
  }
}

export async function getLocationName(latitude, longitude) {
  try {
    const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (address) {
      return address.city || address.subregion || address.region || 'מיקום לא ידוע';
    }
  } catch {
    // Geocoding unavailable
  }
  return 'מיקום לא ידוע';
}
