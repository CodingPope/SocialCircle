import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
} from '../../../services/firebase/firestoreCompat';
import { db } from '../../../services/firebase/config';
import { useUserStore } from '../../profile/stores/userStore';
import { useUserSnippetStore } from '../../profile/stores/userSnippetStore';
import EventPopUpCard from './EventPopUpCard';
import UpcomingEventCard from './UpcomingEventCard';
import { navigateToOtherUserProfile } from '../../../navigation/RootNavigation';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSavedEventsStore } from '../stores/savedEventsStore';
import { removeSavedEventForUser } from '../api/savedEventsService';
import { getBlockContext, isEventVisibleForUser } from '../utils/blockUtils';
import {
  trackSaveEvent,
  AnalyticsSurfaces,
  AnalyticsSources,
} from '../../../lib/analytics';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
import EventThumbnail from './EventThumbnail';
import { eventPassesGenderGate } from '../utils/genderUtils';

export default function MyCircle({ navigation }) {
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);
  const [hostingEvents, setHostingEvents] = useState([]);
  const [attendingEvents, setAttendingEvents] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendActivities, setFriendActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [followingIds, setFollowingIds] = useState(
    Array.isArray(user?.following) ? user.following : []
  );
  const { width: windowWidth } = useWindowDimensions();

  // Collapsible section state
  const [collapsedSections, setCollapsedSections] = useState({
    friendActivities: false,
    saved: false,
    friends: false,
  });

  const savedRecords = useSavedEventsStore((s) => s.savedEvents);
  const savedLoading = useSavedEventsStore((s) => s.isLoading);
  const savedReady = useSavedEventsStore((s) => s.isReady);
  const ensureSavedSubscribed = useSavedEventsStore((s) => s.ensureSubscribed);
  const resetSavedStore = useSavedEventsStore((s) => s.reset);

  const [savedFeed, setSavedFeed] = useState([]);
  const [unsavingMap, setUnsavingMap] = useState({});
  const savedEventCacheRef = useRef(new Map());
  const savedEventListenersRef = useRef(new Map());
  const [savedCacheVersion, setSavedCacheVersion] = useState(0);
  const blockContext = useMemo(
    () => getBlockContext(user),
    [user?.uid, user?.blocked, user?.blockedBy]
  );
  const blockKey = useMemo(() => {
    const blocked = Array.isArray(user?.blocked)
      ? [...user.blocked].sort().join(',')
      : '';
    const blockedBy = Array.isArray(user?.blockedBy)
      ? [...user.blockedBy].sort().join(',')
      : '';
    return `${blocked}|${blockedBy}`;
  }, [user?.blocked, user?.blockedBy]);

  const visibleFollowingIds = useMemo(() => {
    const blockedSet = new Set(
      Array.isArray(user?.blocked) ? user.blocked.filter(Boolean) : []
    );
    const blockedBySet = new Set(
      Array.isArray(user?.blockedBy) ? user.blockedBy.filter(Boolean) : []
    );
    return (followingIds || []).filter(
      (id) => id && !blockedSet.has(id) && !blockedBySet.has(id)
    );
  }, [followingIds, blockKey]);

  // Layout hint for upcoming events carousel to keep cards centered across devices
  const { cardWidth, cardSpacing, sidePadding, snapInterval } = useMemo(() => {
    const safeWidth = windowWidth || 360;
    const width = Math.max(Math.min(safeWidth * 0.6, 224), 196);
    const spacing = 14;
    const rawPadding = (safeWidth - width) / 2;
    const padding = Math.max(Math.min(rawPadding, 28), 18);
    return {
      cardWidth: width,
      cardSpacing: spacing,
      sidePadding: padding,
      snapInterval: width + spacing,
    };
  }, [windowWidth]);

  useEffect(() => {
    if (!user?.uid) {
      resetSavedStore();
      savedEventListenersRef.current.forEach((unsub) => {
        try {
          unsub && unsub();
        } catch {}
      });
      savedEventListenersRef.current.clear();
      savedEventCacheRef.current.clear();
      setSavedFeed([]);
      return;
    }

    const unsubscribe = ensureSavedSubscribed(user.uid);
    return () => {
      try {
        unsubscribe && unsubscribe();
      } catch {}
    };
  }, [user?.uid, ensureSavedSubscribed, resetSavedStore]);

  // Helper: Enhance event with host data (cached snippets)
  const enhanceWithHostData = useCallback(
    async (events) => {
      if (!events?.length) return [];
      const ownerIds = [
        ...new Set(events.map((e) => e?.ownerId).filter(Boolean)),
      ];
      let map;
      try {
        map = await ensureSnippets(ownerIds);
      } catch {
        map = new Map();
      }
      return events.map((event) => {
        const s = event?.ownerId ? map.get(event.ownerId) : null;
        return {
          ...event,
          hostPhoto: s?.photoURL || event?.hostPhoto || null,
          hostRating:
            typeof s?.rating === 'number' ? s.rating : event?.hostRating || 0,
          hostName: s?.name || event?.hostName || 'Unknown Host',
        };
      });
    },
    [ensureSnippets]
  );

  // Realtime: listen to current user's following list so Friends section updates without reload
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const data = snap.data() || {};
        const next = Array.isArray(data.following) ? data.following : [];
        setFollowingIds(next);
      },
      (err) => console.error('User doc listener error:', err)
    );
    return () => unsub();
  }, [user?.uid]);

  // Realtime: listen to hosting and attending events
  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const qHosting = query(
      collection(db, 'events'),
      where('ownerId', '==', user.uid)
    );
    const qAttending = query(
      collection(db, 'events'),
      where('attendees', 'array-contains', user.uid)
    );

    let cancelled = false;
    const handleSnapshot = async (snapshot, setter) => {
      try {
        const now = new Date();
        const events = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((e) => e?.isDeleted !== true)
          .filter((e) => (e?.date?.toDate ? e.date.toDate() > now : false));
        const enhanced = await enhanceWithHostData(events);
        if (!cancelled) setter(enhanced);
      } catch (e) {
        console.error('Events listener error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const unsub1 = onSnapshot(qHosting, (snap) =>
      handleSnapshot(snap, setHostingEvents)
    );
    const unsub2 = onSnapshot(qAttending, (snap) =>
      handleSnapshot(snap, setAttendingEvents)
    );

    return () => {
      cancelled = true;
      unsub1();
      unsub2();
    };
  }, [user?.uid, enhanceWithHostData]);

  // Realtime: listen to friend docs in chunks (Firestore 'in' limit is 10). Update Friends and Activities when friends change
  useEffect(() => {
    let unsubs = [];
    let cancelled = false;

    const run = async () => {
      if (!visibleFollowingIds?.length) {
        setFriends([]);
        setFriendActivities([]);
        return;
      }

      const acc = new Map();

      const recomputeFriendsAndActivities = async () => {
        const allFriends = Array.from(acc.values()).map((friend) => ({
          ...friend,
          displayName:
            friend.displayName ||
            friend.name ||
            friend.fullName ||
            `${friend.firstName || ''} ${friend.lastName || ''}`.trim() ||
            friend.username ||
            'Friend',
        }));
        const visibleFriends = allFriends.filter(
          (friend) =>
            !blockContext.blocked.has(friend.id) &&
            !blockContext.blockedBy.has(friend.id)
        );
        if (!cancelled) setFriends(visibleFriends);

        const friendEventIds = [];
        visibleFriends.forEach((friend) => {
          (friend.createdEvents || []).forEach((id) =>
            friendEventIds.push({ id, type: 'hosting', friend })
          );
          (friend.attendedEvents || []).forEach((id) =>
            friendEventIds.push({ id, type: 'attending', friend })
          );
        });
        const uniqueEventIds = [...new Set(friendEventIds.map((e) => e.id))];
        if (uniqueEventIds.length === 0) {
          if (!cancelled) setFriendActivities([]);
          return;
        }
        try {
          const eventSnaps = await Promise.all(
            uniqueEventIds.map((id) => getDoc(doc(db, 'events', id)))
          );
          const eventMap = {};
          eventSnaps.forEach((snap, i) => {
            if (snap.exists) {
              eventMap[uniqueEventIds[i]] = { id: snap.id, ...snap.data() };
            }
          });
          const now = new Date();
          const validFriendEvents = friendEventIds
            .map(({ id, type, friend }) => {
              const event = eventMap[id];
              if (!event || !event.date?.toDate || event.date.toDate() <= now)
                return null;
              return { type, friend, event, date: event.date.toDate() };
            })
            .filter(Boolean);

          if (validFriendEvents.length === 0) {
            if (!cancelled) setFriendActivities([]);
            return;
          }

          const enhancedFriendEvents = await enhanceWithHostData(
            validFriendEvents.map((e) => e.event)
          );
          const friendFeed = validFriendEvents.map((item, idx) => ({
            ...item,
            event: enhancedFriendEvents[idx],
          }));
          friendFeed.sort((a, b) => a.date - b.date);
          const visibleFeed = friendFeed.filter((item) =>
            isEventVisibleForUser(item.event, blockContext)
          );
          if (!cancelled) setFriendActivities(visibleFeed);
        } catch (e) {
          console.error('Friend activities update error:', e);
        }
      };

      visibleFollowingIds.forEach((friendId) => {
        const friendRef = doc(db, 'users', friendId);
        const unsub = onSnapshot(
          friendRef,
          (snap) => {
            if (snap.exists) {
              acc.set(friendId, { id: friendId, ...snap.data() });
            } else {
              acc.delete(friendId);
            }
            recomputeFriendsAndActivities();
          },
          (err) => {
            if (err?.code === 'permission-denied') {
              acc.delete(friendId);
              recomputeFriendsAndActivities();
            } else {
              console.error('Friends listener error:', err);
            }
          }
        );
        unsubs.push(unsub);
      });
    };

    run();
    return () => {
      cancelled = true;
      unsubs.forEach((fn) => fn && fn());
    };
  }, [JSON.stringify(visibleFollowingIds), enhanceWithHostData, blockContext]);

  useEffect(() => {
    const listeners = savedEventListenersRef.current;
    const cache = savedEventCacheRef.current;
    const currentIds = new Set(
      savedRecords.map((rec) => rec.eventId).filter(Boolean)
    );

    listeners.forEach((unsub, eventId) => {
      if (currentIds.has(eventId)) return;
      try {
        unsub && unsub();
      } catch {}
      listeners.delete(eventId);
      cache.delete(eventId);
    });

    savedRecords.forEach((rec) => {
      const eventId = rec.eventId;
      if (!eventId || listeners.has(eventId)) return;
      const ref = doc(db, 'events', eventId);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists) {
            cache.delete(eventId);
            setSavedCacheVersion((v) => v + 1);
            return;
          }
          const data = { id: snap.id, ...snap.data() };
          cache.set(eventId, data);
          setSavedCacheVersion((v) => v + 1);
        },
        (err) => console.error('Saved event listener error:', err)
      );
      listeners.set(eventId, unsub);
    });
  }, [savedRecords]);

  useEffect(() => {
    return () => {
      savedEventListenersRef.current.forEach((unsub) => {
        try {
          unsub && unsub();
        } catch {}
      });
      savedEventListenersRef.current.clear();
      savedEventCacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const computeSavedFeed = async () => {
      const now = Date.now();
      if (!savedRecords.length) {
        if (!cancelled) setSavedFeed([]);
        return;
      }

      const cache = savedEventCacheRef.current;
      const missingIds = savedRecords
        .map((rec) => rec.eventId)
        .filter((id) => id && !cache.has(id));

      if (missingIds.length) {
        await Promise.all(
          missingIds.map(async (eventId) => {
            try {
              const snap = await getDoc(doc(db, 'events', eventId));
              if (snap.exists) {
                cache.set(eventId, { id: snap.id, ...snap.data() });
              } else {
                cache.delete(eventId);
              }
            } catch (err) {
              console.error('Failed to hydrate saved event', err);
            }
          })
        );
      }

      const pairs = savedRecords
        .map((rec) => {
          const event = cache.get(rec.eventId);
          if (!event) return null;
          return { record: rec, event };
        })
        .filter(Boolean)
        .filter(({ record, event }) => {
          if (!record.eventStartMs || record.eventStartMs <= now) return false;
          if (event.isDeleted === true) return false;
          const eventStart = getEventStartMs(event);
          return eventStart > now;
        });

      const visiblePairs = pairs.filter(({ event }) =>
        isEventVisibleForUser(event, blockContext)
      );

      if (!visiblePairs.length) {
        if (!cancelled) setSavedFeed([]);
        return;
      }

      const enhancedEvents = await enhanceWithHostData(
        visiblePairs.map((p) => p.event)
      );

      const combined = visiblePairs
        .map((pair, idx) => ({
          record: pair.record,
          event: enhancedEvents[idx],
        }))
        .sort((a, b) => b.record.savedAtMs - a.record.savedAtMs);

      if (!cancelled) setSavedFeed(combined);
    };

    computeSavedFeed();
    return () => {
      cancelled = true;
    };
  }, [
    savedRecords,
    savedCacheVersion,
    enhanceWithHostData,
    getEventStartMs,
    blockKey,
  ]);

  const getEventStartMs = useCallback((event) => {
    if (!event?.date) return Number.MAX_SAFE_INTEGER;
    const { date } = event;
    if (typeof date?.seconds === 'number') return date.seconds * 1000;
    if (typeof date?.toDate === 'function') return date.toDate().getTime();
    if (date instanceof Date) return date.getTime();
    return Number.MAX_SAFE_INTEGER;
  }, []);

  // Merge hosting and attending sets without duplicates for the carousel
  const upcomingEvents = useMemo(() => {
    const unique = new Map();
    hostingEvents.forEach((event) => {
      if (!event?.id) return;
      unique.set(event.id, { ...event, viewerStatus: 'hosting' });
    });
    attendingEvents.forEach((event) => {
      if (!event?.id) return;
      if (unique.has(event.id)) return;
      unique.set(event.id, { ...event, viewerStatus: 'attending' });
    });
    return Array.from(unique.values())
      .filter((event) =>
        event.viewerStatus === 'hosting'
          ? true
          : isEventVisibleForUser(event, blockContext)
      )
      .sort((a, b) => getEventStartMs(a) - getEventStartMs(b));
  }, [attendingEvents, hostingEvents, getEventStartMs, blockContext]);

  const hasUpcomingEvents = upcomingEvents.length > 0;

  const toggleSection = useCallback((sectionKey) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  }, []);

  const handleEventPress = useCallback(
    (event, targetScreen) => {
      if (targetScreen && navigation?.navigate) {
        navigation.navigate(targetScreen, { eventId: event.id, event });
        return;
      }
      setSelectedEvent(event);
    },
    [navigation]
  );

  const handleEventPrimaryAction = useCallback(
    (event) => {
      handleEventPress(event, 'EventChat');
    },
    [handleEventPress]
  );

  const renderUpcomingCarouselItem = useCallback(
    ({ item }) => (
      <View style={[styles.carouselCard, { width: cardWidth }]}>
        <UpcomingEventCard
          event={item}
          onOpen={handleEventPress}
          onPrimaryAction={handleEventPrimaryAction}
        />
      </View>
    ),
    [cardWidth, handleEventPress, handleEventPrimaryAction]
  );

  const renderCarouselSeparator = useCallback(
    () => <View style={{ width: cardSpacing }} />,
    [cardSpacing]
  );

  const markUnsaving = useCallback((eventId, value) => {
    if (!eventId) return;
    setUnsavingMap((prev) => {
      const next = { ...prev };
      if (value) next[eventId] = true;
      else delete next[eventId];
      return next;
    });
  }, []);

  const handleRemoveSavedEvent = useCallback(
    async (eventOrId) => {
      const eventId =
        typeof eventOrId === 'string'
          ? eventOrId
          : eventOrId?.id || eventOrId?.eventId;
      if (!eventId || !user?.uid) return;
      markUnsaving(eventId, true);
      try {
        await removeSavedEventForUser({ userId: user.uid, eventId });
        const analyticsEvent =
          typeof eventOrId === 'object' && eventOrId
            ? eventOrId
            : savedFeed.find((item) => item.event.id === eventId)?.event;
        trackSaveEvent({
          event_id: eventId,
          surface: AnalyticsSurfaces.MY_CIRCLE,
          source: AnalyticsSources.SAVED,
          saved: false,
          interest: analyticsEvent?.interest,
          category: analyticsEvent?.category,
        });
      } catch (err) {
        Alert.alert(
          'Unable to remove',
          err?.message || 'We could not unsave this event. Please try again.'
        );
      } finally {
        markUnsaving(eventId, false);
      }
    },
    [markUnsaving, savedFeed, user?.uid]
  );

  const savedSectionLoading = savedLoading && !savedReady;

  // Description: Build unified data structure for single FlatList rendering
  const feedSections = useMemo(() => {
    const sections = [];

    // Upcoming Events Section
    sections.push({
      type: 'section-header',
      id: 'upcoming-header',
      title: '📅 Your Upcoming Events',
      collapsible: false,
    });

    if (hasUpcomingEvents) {
      sections.push({
        type: 'carousel',
        id: 'upcoming-carousel',
        data: upcomingEvents,
      });
    } else {
      sections.push({
        type: 'empty',
        id: 'upcoming-empty',
        message: 'Attend or host meetups to see them here.',
      });
    }

    // Friend Activities Section
    sections.push({
      type: 'section-header',
      id: 'activities-header',
      title: '👥 Friend Activities',
      collapsible: true,
      sectionKey: 'friendActivities',
      collapsed: collapsedSections.friendActivities,
    });

    if (!collapsedSections.friendActivities) {
      if (friendActivities.length > 0) {
        friendActivities.forEach((item, idx) => {
          sections.push({
            type: 'friend-activity',
            id: `activity-${item.event.id}-${idx}`,
            data: item,
          });
        });
      } else {
        sections.push({
          type: 'empty',
          id: 'activities-empty',
          message: "Add friends to see what they're up to.",
        });
      }
    }

    // Saved Events Section
    sections.push({
      type: 'section-header',
      id: 'saved-header',
      title: '🔖 Saved',
      collapsible: true,
      sectionKey: 'saved',
      collapsed: collapsedSections.saved,
    });

    if (!collapsedSections.saved) {
      if (savedSectionLoading) {
        sections.push({
          type: 'loading',
          id: 'saved-loading',
        });
      } else if (savedFeed.length > 0) {
        savedFeed.forEach((item) => {
          sections.push({
            type: 'saved-event',
            id: `saved-${item.event.id}`,
            data: item,
          });
        });
      } else {
        sections.push({
          type: 'empty',
          id: 'saved-empty',
          message: 'Tap the bookmark icon on events to keep them handy.',
        });
      }
    }

    // Friends Section
    sections.push({
      type: 'section-header',
      id: 'friends-header',
      title: 'Friends',
      collapsible: true,
      sectionKey: 'friends',
      collapsed: collapsedSections.friends,
    });

    if (!collapsedSections.friends) {
      if (friends.length > 0) {
        sections.push({
          type: 'friends-horizontal',
          id: 'friends-list',
          data: friends,
        });
      } else {
        sections.push({
          type: 'empty',
          id: 'friends-empty',
          message: 'Make connections to see your friends here.',
        });
      }
    }

    return sections;
  }, [
    hasUpcomingEvents,
    upcomingEvents,
    friendActivities,
    savedFeed,
    friends,
    collapsedSections,
    savedSectionLoading,
  ]);

  const formatSavedEventDate = useCallback(
    (event) => {
      const ms = getEventStartMs(event);
      if (!ms) return 'Date TBD';
      return new Date(ms).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    },
    [getEventStartMs]
  );

  const handleSavedEventPress = useCallback((event) => {
    if (!event) return;
    setSelectedEvent(event);
  }, []);

  const renderSavedEvent = useCallback(
    ({ item }) => {
      if (!item?.event?.id) return null;
      const { event } = item;
      const isUnsaving = !!unsavingMap[event.id];
      const hostLabel = event.hostName ? `Hosted by ${event.hostName}` : null;
      const interestLabel =
        (item.record?.interest && item.record.interest.trim()) ||
        (typeof event.interest === 'string' ? event.interest : null);

      return (
        <View style={styles.savedCard}>
          <TouchableOpacity
            style={styles.savedMain}
            onPress={() => handleSavedEventPress(event)}
            activeOpacity={0.82}
          >
            <EventThumbnail
              event={event}
              size={60}
              borderRadius={14}
              style={styles.savedImage}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.savedTitle} numberOfLines={1}>
                {event.title || 'Untitled Event'}
              </Text>
              {interestLabel ? (
                <View style={styles.savedChip}>
                  <Text style={styles.savedChipText} numberOfLines={1}>
                    {interestLabel}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.savedMeta}>
                {formatSavedEventDate(event)}
              </Text>
              {hostLabel ? (
                <Text style={styles.savedHost} numberOfLines={1}>
                  {hostLabel}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.savedIconButton}
            onPress={() => handleRemoveSavedEvent(event)}
            disabled={isUnsaving}
            accessibilityLabel='Unsave event'
          >
            {isUnsaving ? (
              <ActivityIndicator size='small' color='#4da6ff' />
            ) : (
              <Ionicons name='bookmark-outline' size={22} color='#4da6ff' />
            )}
          </TouchableOpacity>
        </View>
      );
    },
    [
      formatSavedEventDate,
      handleRemoveSavedEvent,
      handleSavedEventPress,
      unsavingMap,
    ]
  );

  const renderFriendActivity = ({ item }) => (
    <TouchableOpacity
      style={styles.activityCard}
      onPress={() => setSelectedEvent(item.event)}
    >
      <Image
        source={{
          uri: item.friend.profileImage || 'https://via.placeholder.com/50',
        }}
        style={styles.friendAvatar}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.activityText}>
          <Text style={styles.friendName}>
            {item.friend.displayName ||
              item.friend.name ||
              item.friend.fullName ||
              `${item.friend.firstName || ''} ${
                item.friend.lastName || ''
              }`.trim() ||
              item.friend.username ||
              'Friend'}
          </Text>
          {item.type === 'hosting' ? ' is Hosting' : ' is Attending'}
        </Text>
        <Text style={styles.activityEvent}>{item.event.title}</Text>
        <Text style={styles.activityDate}>
          {item.event.date?.seconds
            ? new Date(item.event.date.seconds * 1000).toLocaleDateString()
            : item.event.date?.toLocaleDateString?.() || 'Date TBD'}
        </Text>
      </View>
      <EventThumbnail
        event={item.event}
        size={50}
        borderRadius={8}
        style={styles.activityEventImage}
      />
    </TouchableOpacity>
  );

  const renderFeedItem = useCallback(
    ({ item }) => {
      switch (item.type) {
        case 'section-header':
          if (item.collapsible) {
            return (
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(item.sectionKey)}
                activeOpacity={0.7}
              >
                <Text style={styles.sectionTitle}>{item.title}</Text>
                <Ionicons
                  name={item.collapsed ? 'chevron-down' : 'chevron-up'}
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            );
          }
          return (
            <View style={styles.sectionHeaderNonCollapsible}>
              <Text style={styles.sectionTitle}>{item.title}</Text>
            </View>
          );

        case 'carousel':
          return (
            <View style={styles.carouselWrapper}>
              <FlatList
                horizontal
                data={item.data}
                renderItem={renderUpcomingCarouselItem}
                ItemSeparatorComponent={renderCarouselSeparator}
                keyExtractor={(event) => event.id}
                showsHorizontalScrollIndicator={false}
                snapToInterval={snapInterval}
                snapToAlignment='start'
                decelerationRate='fast'
                bounces={false}
                overScrollMode='never'
                contentContainerStyle={[
                  styles.carouselContent,
                  { paddingLeft: sidePadding, paddingRight: sidePadding },
                ]}
              />
            </View>
          );

        case 'friend-activity':
          return renderFriendActivity({ item: item.data });

        case 'saved-event':
          return renderSavedEvent({ item: item.data });

        case 'friends-horizontal':
          return (
            <FlatList
              horizontal
              data={item.data}
              keyExtractor={(friend) => friend.id}
              renderItem={({ item: friend }) => (
                <TouchableOpacity
                  style={styles.friendAvatarWrapper}
                  onPress={() => navigateToOtherUserProfile(friend.id)}
                >
                  <Image
                    source={{
                      uri:
                        friend.profileImage || 'https://via.placeholder.com/50',
                    }}
                    style={styles.friendQuickAvatar}
                  />
                  <Text style={styles.friendNameText}>
                    {friend.firstName || 'Friend'}
                  </Text>
                </TouchableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
            />
          );

        case 'empty':
          return <Text style={styles.emptyState}>{item.message}</Text>;

        case 'loading':
          return (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size='small' color='#4da6ff' />
            </View>
          );

        default:
          return null;
      }
    },
    [
      renderUpcomingCarouselItem,
      renderCarouselSeparator,
      renderFriendActivity,
      renderSavedEvent,
      snapInterval,
      sidePadding,
      theme.colors.textSecondary,
      toggleSection,
    ]
  );

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size='large' color='#4da6ff' />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.topBar}>
        <Text style={styles.headerTitle}>My Circle</Text>
        <Text style={styles.headerSubtitle}>
          See what your friends are up to 🎉
        </Text>
      </View>
      <FlatList
        data={feedSections}
        renderItem={renderFeedItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={11}
        initialNumToRender={8}
      />

      {selectedEvent && (
        <EventPopUpCard
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </SafeAreaView>
  );
}

// Description: Create theme-aware styles for MyCircle
const createStyles = (theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    topBar: {
      paddingTop: 12,
      paddingBottom: 16,
      paddingHorizontal: 16,
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    pageContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    contentContainer: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    headerSubtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      marginTop: 24,
    },
    sectionHeaderNonCollapsible: {
      marginBottom: 12,
      marginTop: 24,
    },
    sectionTitle: {
      fontWeight: '700',
      fontSize: 18,
      color: theme.colors.text,
    },
    loadingContainer: {
      paddingVertical: 12,
    },
    emptyState: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontStyle: 'italic',
    },
    carouselContent: {
      paddingVertical: 4,
    },
    carouselCard: {
      flexShrink: 0,
    },
    carouselWrapper: {
      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : '#EEF2FF',
      borderRadius: 28,
      paddingVertical: 14,
      marginBottom: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(59,130,246,0.25)',
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.08,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
    },
    activityCard: {
      flexDirection: 'row',
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.05,
      shadowRadius: 5,
      elevation: 2,
    },
    friendAvatar: {
      width: 45,
      height: 45,
      borderRadius: 12,
      marginRight: 10,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    friendName: {
      fontWeight: '700',
      color: theme.colors.text,
    },
    activityText: {
      fontSize: 14,
      color: theme.colors.text,
    },
    activityEvent: {
      fontWeight: '600',
      color: theme.colors.text,
    },
    activityDate: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    activityEventImage: {
      marginLeft: 10,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    savedCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.04,
      shadowRadius: 5,
      elevation: 2,
    },
    savedMain: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    savedImage: {
      marginRight: 12,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    savedTitle: {
      fontWeight: '700',
      color: theme.colors.text,
      fontSize: 15,
      marginBottom: 2,
    },
    savedMeta: {
      color: theme.colors.textSecondary,
      fontSize: 13,
    },
    savedChip: {
      alignSelf: 'flex-start',
      backgroundColor: theme.isDark ? 'rgba(59,130,246,0.2)' : '#E8F1FF',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
      marginTop: 4,
      marginBottom: 2,
    },
    savedChipText: {
      color: theme.isDark ? '#60A5FA' : '#1D4ED8',
      fontWeight: '600',
      fontSize: 12,
    },
    savedHost: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      marginTop: 4,
    },
    savedIconButton: {
      padding: 6,
      marginLeft: 8,
    },
    friendsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    seeAll: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
    friendAvatarWrapper: {
      marginRight: 12,
    },
    friendQuickAvatar: {
      width: 55,
      height: 55,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    friendNameText: {
      marginTop: 4,
      textAlign: 'center',
      color: theme.colors.text,
      fontWeight: '500',
    },
  });
