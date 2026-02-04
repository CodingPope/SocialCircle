import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '../../../services/firebase';
import {
  collection,
  query,
  onSnapshot,
  where,
} from '../../../services/firebase/firestoreCompat';
import { filterBlockedEvents } from '../utils/blockUtils';
import { eventPassesGenderGate } from '../utils/genderUtils';

const extractTimestamp = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().getTime();
    } catch {
      return null;
    }
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
};

const getEventStartMs = (event) =>
  extractTimestamp(event?.date) ??
  extractTimestamp(event?.startAt) ??
  extractTimestamp(event?.startDate) ??
  extractTimestamp(event?.start);

const getEventEndMs = (event) =>
  extractTimestamp(event?.endAt) ??
  extractTimestamp(event?.endDate) ??
  extractTimestamp(event?.date) ??
  extractTimestamp(event?.startAt);

const boundaryMsForIsoDate = (isoDate, boundary = 'start') => {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return null;
  const base = new Date(year, month - 1, day);
  if (boundary === 'end') {
    base.setHours(23, 59, 59, 999);
  } else {
    base.setHours(0, 0, 0, 0);
  }
  return base.getTime();
};

export default function useDiscoveryFeed(user) {
  const [events, setEvents] = useState([]);
  const [optimisticEvents, setOptimisticEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [selectedFilters, setSelectedFilters] = useState({
    dateRange: null,
    quickDatePreset: null,
    interests: [],
    genderOnly: null,
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const unsubscribeRef = useRef(null);

  const blockKey = useMemo(() => {
    const blocked = Array.isArray(user?.blocked)
      ? [...user.blocked].sort().join(',')
      : '';
    const blockedBy = Array.isArray(user?.blockedBy)
      ? [...user.blockedBy].sort().join(',')
      : '';
    return `${blocked}|${blockedBy}`;
  }, [user?.blocked, user?.blockedBy]);

  useEffect(() => {
    return () => {
      try {
        unsubscribeRef.current && unsubscribeRef.current();
      } catch {}
    };
  }, []);

  useEffect(() => {
    // Drop optimistic events that now exist in Firestore
    const firestoreIds = new Set(events.map((e) => e.id));
    setOptimisticEvents((prev) =>
      prev.filter((opt) => !firestoreIds.has(opt.id) || opt._optimistic),
    );
  }, [events]);

  useEffect(() => {
    const filtered = filterBlockedEvents(events, user);
    if (filtered.length !== events.length) {
      setEvents(filtered);
    }
  }, [blockKey]);

  const applyFilters = useCallback(
    (filters = {}) => {
      const allEvents = [...events];
      optimisticEvents.forEach((optEvent) => {
        const existingIndex = allEvents.findIndex((e) => e.id === optEvent.id);
        if (existingIndex >= 0) {
          allEvents[existingIndex] = optEvent;
        } else {
          allEvents.push(optEvent);
        }
      });

      if (!Array.isArray(allEvents) || !allEvents.length) {
        setFilteredEvents([]);
        return;
      }

      const { dateRange, date, interests, genderOnly } = filters;
      const now = Date.now();
      const sourceEvents = filterBlockedEvents(allEvents, user);

      let filtered = sourceEvents.filter((event) => {
        if (!eventPassesGenderGate(event, user)) return false;
        const eventEnd = getEventEndMs(event);
        return eventEnd && eventEnd + 60 * 60 * 1000 > now;
      });

      if (dateRange?.start || dateRange?.end) {
        const startMs = boundaryMsForIsoDate(
          dateRange.start || dateRange.end,
          'start',
        );
        const endMs = boundaryMsForIsoDate(
          dateRange.end || dateRange.start,
          'end',
        );
        filtered = filtered.filter((event) => {
          const eventStart = getEventStartMs(event) ?? getEventEndMs(event);
          if (!eventStart) return false;
          if (startMs && eventStart < startMs) return false;
          if (endMs && eventStart > endMs) return false;
          return true;
        });
      } else if (date) {
        filtered = filtered.filter((event) => {
          const startMs = getEventStartMs(event);
          if (!startMs) return false;
          const eventDateStr = new Date(startMs).toISOString().split('T')[0];
          return eventDateStr === date;
        });
      }

      if (Array.isArray(interests) && interests.length > 0) {
        const interestSet = new Set(
          interests
            .map((i) =>
              (typeof i === 'string' ? i : i?.name || i?.id || '')
                .toString()
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean),
        );
        filtered = filtered.filter((event) => {
          const evInterest = (
            typeof event.interest === 'string'
              ? event.interest
              : event.interest?.name || event.category || ''
          )
            .toString()
            .trim()
            .toLowerCase();
          if (!evInterest) return false;
          return interestSet.has(evInterest);
        });
      }

      if (genderOnly) {
        filtered = filtered.filter((event) => event.privacy === genderOnly);
      }

      setFilteredEvents(filtered);
    },
    [events, optimisticEvents, user],
  );

  useEffect(() => {
    applyFilters(selectedFilters);
  }, [applyFilters, selectedFilters]);

  const fetchEventsInRegion = useCallback(
    async (region, isInitial = false) => {
      if (!region) return;
      const { latitude, longitude, latitudeDelta, longitudeDelta } = region;

      const multiplier = 1.5;
      const latMin = latitude - (latitudeDelta * multiplier) / 2;
      const latMax = latitude + (latitudeDelta * multiplier) / 2;
      const lngMin = longitude - (longitudeDelta * multiplier) / 2;
      const lngMax = longitude + (longitudeDelta * multiplier) / 2;

      if (unsubscribeRef.current) unsubscribeRef.current();
      const q = query(
        collection(db, 'events'),
        where('location.latitude', '>=', latMin),
        where('location.latitude', '<=', latMax),
        where('location.longitude', '>=', lngMin),
        where('location.longitude', '<=', lngMax),
        where('isDeleted', '==', false),
      );

      return new Promise((resolve) => {
        unsubscribeRef.current = onSnapshot(
          q,
          (snap) => {
            const nowMs = Date.now();
            const regionEvents = snap.docs
              .map((doc) => ({ id: doc.id, ...doc.data() }))
              .filter((e) => e.isDeleted !== true)
              .filter((event) => {
                let eventTime = null;
                const endAt = getEventEndMs(event);
                if (endAt) eventTime = endAt;
                return eventTime && eventTime + 60 * 60 * 1000 > nowMs;
              });
            const visibleRegionEvents = filterBlockedEvents(regionEvents, user);
            setEvents(visibleRegionEvents);
            applyFilters(selectedFilters);

            if (isInitial) {
              setInitialLoading(false);
            }
            resolve();
          },
          (error) => {
            // Handle permission-denied silently - this happens during sign out
            if (error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied') {
              setEvents([]);
              try {
                unsubscribeRef.current && unsubscribeRef.current();
              } catch {}
              try {
                if (!global.unsubscribeAllListeners)
                  global.unsubscribeAllListeners = [];
                if (unsubscribeRef.current)
                  global.unsubscribeAllListeners.push(unsubscribeRef.current);
              } catch {}
              if (isInitial) setInitialLoading(false);
              resolve();
              return;
            }
            // Only log non-permission errors
            console.warn('Map events listener error:', error?.message || error);
            if (isInitial) setInitialLoading(false);
            resolve();
          },
        );
        try {
          if (!global.unsubscribeAllListeners)
            global.unsubscribeAllListeners = [];
          if (unsubscribeRef.current)
            global.unsubscribeAllListeners.push(unsubscribeRef.current);
        } catch {}
      });
    },
    [applyFilters, selectedFilters, user],
  );

  return {
    events,
    filteredEvents,
    optimisticEvents,
    setOptimisticEvents,
    selectedFilters,
    setSelectedFilters,
    initialLoading,
    setInitialLoading,
    fetchEventsInRegion,
    applyFilters,
  };
}

