import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
} from 'react-native';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useUserStore } from '../profile/userStore';
import { useUserSnippetStore } from '../profile/userSnippetStore';
import EventPopUpCard from './EventPopUpCard';
import UpcomingEventCard from './UpcomingEventCard';
import { navigateToOtherUserProfile } from '../../navigation/RootNavigation';

export default function MyCircle({ navigation }) {
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
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
      if (!followingIds?.length) {
        setFriends([]);
        setFriendActivities([]);
        return;
      }

      // Chunk following IDs by 10
      const chunks = [];
      for (let i = 0; i < followingIds.length; i += 10) {
        chunks.push(followingIds.slice(i, i + 10));
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
        if (!cancelled) setFriends(allFriends);

        // Build Friend Activities feed (fetch events on demand for latest IDs)
        const friendEventIds = [];
        allFriends.forEach((friend) => {
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
            if (snap.exists()) {
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
          if (!cancelled) setFriendActivities(friendFeed);
        } catch (e) {
          console.error('Friend activities update error:', e);
        }
      };

      chunks.forEach((chunk) => {
        const q = query(
          collection(db, 'users'),
          where('__name__', 'in', chunk)
        );
        const unsub = onSnapshot(
          q,
          (snap) => {
            snap.docs.forEach((d) => acc.set(d.id, { id: d.id, ...d.data() }));
            recomputeFriendsAndActivities();
          },
          (err) => console.error('Friends listener error:', err)
        );
        unsubs.push(unsub);
      });
    };

    run();
    return () => {
      cancelled = true;
      unsubs.forEach((fn) => fn && fn());
    };
  }, [JSON.stringify(followingIds), enhanceWithHostData]);

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
    return Array.from(unique.values()).sort(
      (a, b) => getEventStartMs(a) - getEventStartMs(b)
    );
  }, [attendingEvents, hostingEvents, getEventStartMs]);

  const hasUpcomingEvents = upcomingEvents.length > 0;

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
      <Image
        source={{
          uri: item.event.imageUrl || 'https://via.placeholder.com/60',
        }}
        style={styles.activityEventImage}
      />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size='large' color='#4da6ff' />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.pageContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Circle</Text>
          <Text style={styles.headerSubtitle}>
            See what your friends are up to 🎉
          </Text>
        </View>

        {/* Upcoming Events */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Your Upcoming Events</Text>
          {hasUpcomingEvents ? (
            <FlatList
              horizontal
              data={upcomingEvents}
              renderItem={renderUpcomingCarouselItem}
              ItemSeparatorComponent={renderCarouselSeparator}
              keyExtractor={(item) => item.id}
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
          ) : (
            <Text style={styles.emptyState}>
              Attend or host meetups to see them here.
            </Text>
          )}
        </View>

        {/* Friend Activities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👥 Friend Activities</Text>
          {friendActivities.length > 0 ? (
            <FlatList
              data={friendActivities}
              renderItem={renderFriendActivity}
              keyExtractor={(item, i) => item.event.id + i}
              scrollEnabled={false}
            />
          ) : (
            <Text style={styles.emptyState}>
              Add friends to see what they're up to.
            </Text>
          )}
        </View>

        {/* Friends Quick Scroll */}
        <View style={styles.section}>
          <View style={styles.friendsHeader}>
            <Text style={styles.sectionTitle}>Friends</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>+ See All</Text>
            </TouchableOpacity>
          </View>
          {friends.length > 0 ? (
            <FlatList
              horizontal
              data={friends}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.friendAvatarWrapper}
                  onPress={() => navigateToOtherUserProfile(item.id)}
                >
                  <Image
                    source={{
                      uri:
                        item.profileImage || 'https://via.placeholder.com/50',
                    }}
                    style={styles.friendQuickAvatar}
                  />
                  <Text style={styles.friendNameText}>
                    {item.firstName || 'Friend'}
                  </Text>
                </TouchableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
            />
          ) : (
            <Text style={styles.emptyState}>
              Make connections to see your friends here.
            </Text>
          )}
        </View>
      </ScrollView>

      {selectedEvent && (
        <EventPopUpCard
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pageContainer: {
    flex: 1,
    backgroundColor: '#f8f9fb',
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginTop: 35,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#222',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 12,
    color: '#222',
  },
  emptyState: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
  },
  carouselContent: {
    paddingVertical: 4,
  },
  carouselCard: {
    flexShrink: 0,
  },
  activityCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  friendAvatar: {
    width: 45,
    height: 45,
    borderRadius: 12,
    marginRight: 10,
  },
  friendName: {
    fontWeight: '700',
    color: '#222',
  },
  activityText: {
    fontSize: 14,
    color: '#444',
  },
  activityEvent: {
    fontWeight: '600',
    color: '#222',
  },
  activityDate: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  activityEventImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginLeft: 10,
  },
  friendsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  seeAll: {
    color: '#4da6ff',
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
    borderColor: '#4da6ff',
  },
  friendNameText: {
    marginTop: 4,
    textAlign: 'center',
    color: '#222',
    fontWeight: '500',
  },
});
