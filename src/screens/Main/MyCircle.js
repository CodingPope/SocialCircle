import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useUserStore } from '../../store/userStore';
import EventPopUpCard from '../../components/EventPopUpCard';

export default function MyCircle({ navigation }) {
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
  const [hostingEvents, setHostingEvents] = useState([]);
  const [attendingEvents, setAttendingEvents] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendActivities, setFriendActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    // Description: Optimized fetchData for faster load using parallelization and batching
    const fetchData = async () => {
      if (!user?.uid) return;
      setLoading(true);

      try {
        const now = new Date();

        // Helper: Enhance event with host data
        const enhanceWithHostData = async (events) => {
          if (!events.length) return [];
          // Batch fetch all unique ownerIds
          const ownerIds = [
            ...new Set(events.map((e) => e.ownerId).filter(Boolean)),
          ];
          const ownerSnaps = await Promise.all(
            ownerIds.map((id) => getDoc(doc(db, 'users', id)))
          );
          const ownerMap = {};
          ownerSnaps.forEach((snap, i) => {
            if (snap.exists()) {
              ownerMap[ownerIds[i]] = snap.data();
            }
          });
          return events.map((event) => {
            const data = ownerMap[event.ownerId] || {};
            return {
              ...event,
              hostPhoto: data.profileImage || data.avatarURL || null,
              hostRating: data.rating || 0,
              hostName:
                data.displayName ||
                data.username ||
                data.name ||
                data.fullName ||
                `${data.firstName || ''} ${data.lastName || ''}`.trim() ||
                'Unknown Host',
            };
          });
        };

        // Batch queries for events and friends
        let hostingSnapshot, attendingSnapshot, friendsSnapshot;
        [hostingSnapshot, attendingSnapshot] = await Promise.all([
          getDocs(
            query(collection(db, 'events'), where('ownerId', '==', user.uid))
          ),
          getDocs(
            query(
              collection(db, 'events'),
              where('attendees', 'array-contains', user.uid)
            )
          ),
        ]);
        // Only query friends if following is a non-empty array
        if (Array.isArray(user.following) && user.following.length > 0) {
          friendsSnapshot = await getDocs(
            query(
              collection(db, 'users'),
              where('__name__', 'in', user.following)
            )
          );
        } else {
          friendsSnapshot = { docs: [] };
        }

        // Upcoming events
        let hosting = hostingSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((e) => e.isDeleted !== true)
          .filter((e) => e.date?.toDate() > now);
        let attending = attendingSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((e) => e.isDeleted !== true)
          .filter((e) => e.date?.toDate() > now);
        // Enhance events in parallel
        const [hostingEnhanced, attendingEnhanced] = await Promise.all([
          enhanceWithHostData(hosting),
          enhanceWithHostData(attending),
        ]);
        setHostingEvents(hostingEnhanced);
        setAttendingEvents(attendingEnhanced);

        // Friends
        let allFriends = friendsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        allFriends = allFriends.map((friend) => ({
          ...friend,
          displayName:
            friend.displayName ||
            friend.name ||
            friend.fullName ||
            `${friend.firstName || ''} ${friend.lastName || ''}`.trim() ||
            friend.username ||
            'Friend',
        }));
        setFriends(allFriends);

        // Friend Activities: batch all event fetches in parallel
        const friendEventIds = [];
        allFriends.forEach((friend) => {
          (friend.createdEvents || []).forEach((id) =>
            friendEventIds.push({ id, type: 'hosting', friend })
          );
          (friend.attendedEvents || []).forEach((id) =>
            friendEventIds.push({ id, type: 'attending', friend })
          );
        });
        // Remove duplicate event ids
        const uniqueEventIds = [...new Set(friendEventIds.map((e) => e.id))];
        // Fetch all events in parallel
        const eventSnaps = await Promise.all(
          uniqueEventIds.map((id) => getDoc(doc(db, 'events', id)))
        );
        // Map eventId to event data
        const eventMap = {};
        eventSnaps.forEach((snap, i) => {
          if (snap.exists()) {
            eventMap[uniqueEventIds[i]] = { id: snap.id, ...snap.data() };
          }
        });
        // Filter only upcoming events and enhance
        const validFriendEvents = friendEventIds
          .map(({ id, type, friend }) => {
            const event = eventMap[id];
            if (!event || !event.date?.toDate || event.date.toDate() <= now)
              return null;
            return { type, friend, event, date: event.date.toDate() };
          })
          .filter(Boolean);
        // Enhance all friend events with host data in one batch
        const enhancedFriendEvents = await enhanceWithHostData(
          validFriendEvents.map((e) => e.event)
        );
        // Merge back enhanced data
        const friendFeed = validFriendEvents.map((item, idx) => ({
          ...item,
          event: enhancedFriendEvents[idx],
        }));
        friendFeed.sort((a, b) => a.date - b.date);
        setFriendActivities(friendFeed);
      } catch (err) {
        console.error('Error loading MyCircle data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user?.uid, user?.following]);

  const renderEventCard = (event) => (
    <TouchableOpacity
      key={event.id}
      style={styles.eventCard}
      onPress={() => setSelectedEvent(event)}
    >
      <Image
        source={{ uri: event.imageUrl || 'https://via.placeholder.com/200' }}
        style={styles.eventImage}
      />
      <View style={styles.eventBadge}>
        <Text style={styles.eventBadgeText}>
          {event.date?.seconds
            ? new Date(event.date.seconds * 1000).toLocaleDateString()
            : event.date?.toLocaleDateString?.() || 'Date TBD'}
        </Text>
      </View>
      <Text style={styles.eventTitle} numberOfLines={2}>
        {event.title || 'Untitled Event'}
      </Text>
    </TouchableOpacity>
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
          {hostingEvents.length > 0 || attendingEvents.length > 0 ? (
            <FlatList
              horizontal
              data={[...hostingEvents, ...attendingEvents]}
              renderItem={({ item }) => renderEventCard(item)}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
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
                  onPress={() =>
                    navigation.navigate('OtherUserProfile', { userId: item.id })
                  }
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
  eventCard: {
    width: 160,
    marginRight: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  eventImage: {
    width: '100%',
    height: 110,
  },
  eventBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#4da6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  eventBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
    margin: 8,
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
