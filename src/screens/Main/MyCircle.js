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
import { useAuth } from '../../context/AuthContext';
import EventPopUpCard from '../../components/EventPopUpCard';

export default function MyCircle({ navigation }) {
  const { user } = useAuth();
  const [hostingEvents, setHostingEvents] = useState([]);
  const [attendingEvents, setAttendingEvents] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendActivities, setFriendActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.uid) return;
      setLoading(true);

      try {
        const now = new Date();

        // ✅ Enhance helper
        const enhanceWithHostData = async (events) =>
          Promise.all(
            events.map(async (event) => {
              if (!event.ownerId)
                return {
                  ...event,
                  hostPhoto: null,
                  hostRating: 0,
                  hostName: 'Unknown Host',
                };

              try {
                const snap = await getDoc(doc(db, 'users', event.ownerId));
                if (snap.exists()) {
                  const data = snap.data();
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
                }
              } catch (err) {
                console.error('Error enhancing event host:', err);
              }

              return {
                ...event,
                hostPhoto: null,
                hostRating: 0,
                hostName: 'Unknown Host',
              };
            })
          );

        // ✅ Hosting Events
        const hostingSnapshot = await getDocs(
          query(collection(db, 'events'), where('ownerId', '==', user.uid))
        );
        let hosting = hostingSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((e) => e.date?.toDate() > now);
        hosting = await enhanceWithHostData(hosting);
        setHostingEvents(hosting);

        // ✅ Attending Events
        const attendingSnapshot = await getDocs(
          query(
            collection(db, 'events'),
            where('attendees', 'array-contains', user.uid)
          )
        );
        let attending = attendingSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((e) => e.date?.toDate() > now);
        attending = await enhanceWithHostData(attending);
        setAttendingEvents(attending);

        // ✅ Friends & Friend Activities
        if (user.following?.length) {
          let allFriends = [];
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
          for (let i = 0; i < user.following.length; i += 10) {
            const chunk = user.following.slice(i, i + 10);
            const q = query(
              collection(db, 'users'),
              where('__name__', 'in', chunk)
            );
            const snapshot = await getDocs(q);
            allFriends = allFriends.concat(
              snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
            );
          }
          setFriends(allFriends);

          let friendFeed = [];
          for (const friend of allFriends) {
            const createdEvents = friend.createdEvents || [];
            const attendedEvents = friend.attendedEvents || [];

            const fetchAndPushEvent = async (id, type) => {
              const eventSnap = await getDoc(doc(db, 'events', id));
              if (eventSnap.exists()) {
                const data = eventSnap.data();
                if (data.date?.toDate() > now) {
                  const [enhanced] = await enhanceWithHostData([
                    { id: eventSnap.id, ...data },
                  ]);
                  friendFeed.push({
                    type,
                    friend,
                    event: enhanced,
                    date: data.date?.toDate(),
                  });
                }
              }
            };

            for (const id of createdEvents) {
              await fetchAndPushEvent(id, 'hosting');
            }
            for (const id of attendedEvents) {
              await fetchAndPushEvent(id, 'attending');
            }
          }

          friendFeed.sort((a, b) => a.date - b.date);
          setFriendActivities(friendFeed);
        }
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
        {(hostingEvents.length > 0 || attendingEvents.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Your Upcoming Events</Text>
            <FlatList
              horizontal
              data={[...hostingEvents, ...attendingEvents]}
              renderItem={({ item }) => renderEventCard(item)}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

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
              No upcoming friend activities.
            </Text>
          )}
        </View>

        {/* Friends Quick Scroll */}
        {friends.length > 0 && (
          <View style={styles.section}>
            <View style={styles.friendsHeader}>
              <Text style={styles.sectionTitle}>Friends</Text>
              <TouchableOpacity>
                <Text style={styles.seeAll}>+ See All</Text>
              </TouchableOpacity>
            </View>
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
                </TouchableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}
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
});
