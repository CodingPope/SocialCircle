import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_DISCOVERY_RADIUS_METERS = 32093; // ~20 miles
export const MIN_DISCOVERY_RADIUS_METERS = 500;
export const MAX_DISCOVERY_RADIUS_METERS = 200000; // ~125 miles

const clampRadius = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_DISCOVERY_RADIUS_METERS;
  }
  return Math.min(
    Math.max(value, MIN_DISCOVERY_RADIUS_METERS),
    MAX_DISCOVERY_RADIUS_METERS
  );
};

const normalizeCoords = (coords) => {
  if (!coords) return null;
  const { latitude, longitude } = coords || {};
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude)
  ) {
    return null;
  }
  return { latitude, longitude };
};

export const useDiscoveryLocationStore = create(
  persist(
    (set, get) => ({
      gpsLocation: null,
      gpsLabel: null,
      gpsRadiusMeters: DEFAULT_DISCOVERY_RADIUS_METERS,
      lastGpsUpdate: 0,
      override: null,
      setGpsLocation: ({ coords, label, radiusMeters } = {}) =>
        set((state) => {
          const nextCoords =
            coords === null
              ? null
              : coords
              ? normalizeCoords(coords)
              : state.gpsLocation;
          const nextLabel =
            typeof label === 'string'
              ? label
              : label === null
              ? null
              : state.gpsLabel;
          const nextRadius =
            typeof radiusMeters === 'number'
              ? clampRadius(radiusMeters)
              : state.gpsRadiusMeters;
          return {
            gpsLocation: nextCoords,
            gpsLabel: nextLabel,
            gpsRadiusMeters: nextRadius,
            lastGpsUpdate: nextCoords ? Date.now() : state.lastGpsUpdate,
          };
        }),
      setMapOverride: ({ coords, radiusMeters, label, source } = {}) =>
        set(() => {
          const normalized = normalizeCoords(coords);
          if (!normalized) {
            return { override: null };
          }
          return {
            override: {
              coords: normalized,
              radiusMeters: clampRadius(
                typeof radiusMeters === 'number'
                  ? radiusMeters
                  : DEFAULT_DISCOVERY_RADIUS_METERS
              ),
              label: typeof label === 'string' ? label : null,
              source: source || 'map',
              updatedAt: Date.now(),
            },
          };
        }),
      clearOverride: () => set(() => ({ override: null })),
      getEffectiveLocation: () => {
        const state = get();
        return state.override?.coords || state.gpsLocation;
      },
      getEffectiveRadius: () => {
        const state = get();
        return (
          state.override?.radiusMeters ||
          state.gpsRadiusMeters ||
          DEFAULT_DISCOVERY_RADIUS_METERS
        );
      },
    }),
    {
      name: 'discovery-location-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({
        gpsLocation: state.gpsLocation,
        gpsLabel: state.gpsLabel,
        gpsRadiusMeters: state.gpsRadiusMeters,
        lastGpsUpdate: state.lastGpsUpdate,
        override: state.override,
      }),
    }
  )
);
