import * as Location from 'expo-location';
import { useDiscoveryLocationStore } from '../stores/discoveryLocationStore';
import { useUserStore } from '../../profile/stores/userStore';

const isValidCoords = (coords) => {
  if (!coords) return false;
  const { latitude, longitude } = coords;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude)
  );
};

const getStoredFallback = () => {
  const state = useDiscoveryLocationStore.getState();
  if (isValidCoords(state?.override?.coords)) {
    return {
      coords: state.override.coords,
      source: state.override.source || 'override',
    };
  }
  if (isValidCoords(state?.gpsLocation)) {
    return { coords: state.gpsLocation, source: 'cachedGps' };
  }
  const user = useUserStore.getState().user;
  if (isValidCoords(user?.location)) {
    return { coords: user.location, source: 'profile' };
  }
  return null;
};

export async function ensureForegroundPermission() {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing?.status === 'granted') return true;
  } catch {}
  try {
    const requested = await Location.requestForegroundPermissionsAsync();
    return requested?.status === 'granted';
  } catch {
    return false;
  }
}

async function getDeviceCoords(options = {}) {
  const servicesEnabled = await Location.hasServicesEnabledAsync?.();
  if (servicesEnabled === false) {
    const error = new Error('Location services disabled');
    error.code = 'services_disabled';
    throw error;
  }
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy?.Balanced,
    maximumAge: 15000,
    timeout: 20000,
    mayShowUserSettingsDialog: true,
    ...options,
  });
  if (isValidCoords(position?.coords)) {
    useDiscoveryLocationStore.getState().setGpsLocation({
      coords: position.coords,
    });
    return position.coords;
  }
  const error = new Error('No coordinates returned');
  error.code = 'no_coords';
  throw error;
}

export async function resolveLocationWithFallback({
  canUseDevice = true,
  allowLastKnown = true,
  locationOptions = {},
} = {}) {
  const errors = [];

  if (canUseDevice) {
    try {
      const coords = await getDeviceCoords(locationOptions);
      return { coords, source: 'gps' };
    } catch (error) {
      errors.push(error);
    }

    if (allowLastKnown) {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (isValidCoords(lastKnown?.coords)) {
          return { coords: lastKnown.coords, source: 'lastKnown' };
        }
      } catch (error) {
        errors.push(error);
      }
    }
  }

  const fallback = getStoredFallback();
  if (fallback) {
    return fallback;
  }

  return { coords: null, source: null, errors };
}
