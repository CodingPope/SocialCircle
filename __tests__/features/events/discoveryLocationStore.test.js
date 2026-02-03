// Description: Tests for discovery location store logic
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

import {
  useDiscoveryLocationStore,
  DEFAULT_DISCOVERY_RADIUS_METERS,
  MIN_DISCOVERY_RADIUS_METERS,
  MAX_DISCOVERY_RADIUS_METERS,
} from '../../../src/features/events/stores/discoveryLocationStore';

const resetStore = () =>
  useDiscoveryLocationStore.setState({
    gpsLocation: null,
    gpsLabel: null,
    gpsRadiusMeters: DEFAULT_DISCOVERY_RADIUS_METERS,
    lastGpsUpdate: 0,
    override: null,
  });

describe('discoveryLocationStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('sets GPS location and updates timestamp', () => {
    const before = useDiscoveryLocationStore.getState().lastGpsUpdate;
    useDiscoveryLocationStore
      .getState()
      .setGpsLocation({ coords: { latitude: 47.6, longitude: -122.3 } });
    const state = useDiscoveryLocationStore.getState();
    expect(state.gpsLocation).toEqual({ latitude: 47.6, longitude: -122.3 });
    expect(state.lastGpsUpdate).toBeGreaterThanOrEqual(before);
  });

  it('clamps GPS radius within bounds', () => {
    useDiscoveryLocationStore.getState().setGpsLocation({
      radiusMeters: MAX_DISCOVERY_RADIUS_METERS + 1000,
    });
    expect(useDiscoveryLocationStore.getState().gpsRadiusMeters).toBe(
      MAX_DISCOVERY_RADIUS_METERS,
    );

    useDiscoveryLocationStore.getState().setGpsLocation({
      radiusMeters: MIN_DISCOVERY_RADIUS_METERS - 100,
    });
    expect(useDiscoveryLocationStore.getState().gpsRadiusMeters).toBe(
      MIN_DISCOVERY_RADIUS_METERS,
    );
  });

  it('sets and clears map override', () => {
    useDiscoveryLocationStore.getState().setMapOverride({
      coords: { latitude: 1, longitude: 2 },
      radiusMeters: 99999,
      label: 'Downtown',
      source: 'search',
    });
    let state = useDiscoveryLocationStore.getState();
    expect(state.override.coords).toEqual({ latitude: 1, longitude: 2 });
    expect(state.override.radiusMeters).toBe(99999);
    expect(state.override.label).toBe('Downtown');
    expect(state.override.source).toBe('search');

    useDiscoveryLocationStore.getState().clearOverride();
    state = useDiscoveryLocationStore.getState();
    expect(state.override).toBeNull();
  });

  it('getEffectiveLocation prefers override then gps', () => {
    resetStore();
    useDiscoveryLocationStore
      .getState()
      .setGpsLocation({ coords: { latitude: 3, longitude: 4 } });
    useDiscoveryLocationStore.getState().setMapOverride({
      coords: { latitude: 9, longitude: 9 },
    });

    const { getEffectiveLocation } = useDiscoveryLocationStore.getState();
    expect(getEffectiveLocation()).toEqual({ latitude: 9, longitude: 9 });

    useDiscoveryLocationStore.getState().clearOverride();
    expect(getEffectiveLocation()).toEqual({ latitude: 3, longitude: 4 });
  });
});
