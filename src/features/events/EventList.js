import React, { memo, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { GOOGLE_MAPS_API_KEY } from '@env';

// Helper component for rendering individual event cards
const EventCard = memo(({ event, navigation }) => {
  const [address, setAddress] = useState('Fetching address...');

  useEffect(() => {
    const fetchAddress = async () => {
      if (!event?.location) {
        setAddress('Address not available');
        return;
      }
      try {
        const { latitude, longitude } = event.location;
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await res.json();
        if (data.status === 'OK' && data.results.length) {
          const fullAddress = data.results[0].formatted_address;
          const next = fullAddress.split(',').slice(0, 2).join(', ');
          setAddress((prev) => (prev === next ? prev : next));
        } else {
          setAddress('Address not available');
        }
      } catch {
        setAddress('Error fetching address');
      }
    };
    fetchAddress();
    // Depend on primitive lat/lng to avoid re-running from object identity churn
  }, [event?.location?.latitude, event?.location?.longitude]);

  return (
    <TouchableOpacity
      style={styles.eventCardFriendStyle}
      onPress={() => navigation.navigate('EventChat', { eventId: event.id })}
    >
      <Image
        source={{
          uri:
            event.imageUrl ||
            'https://via.placeholder.com/60/cccccc/ffffff?text=EV',
        }}
        style={styles.eventImageFriendStyle}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.eventTitleFriendStyle} numberOfLines={1}>
          {event.title || 'Untitled Event'}
        </Text>
        <Text style={styles.eventSubTextFriendStyle} numberOfLines={1}>
          {address}
        </Text>
        <View style={styles.badgeRowFriendStyle}>
          <View style={styles.badgeFriendStyle}>
            <Text style={styles.badgeTextFriendStyle}>
              {event.date
                ? event.date.toDate().toLocaleDateString()
                : 'Upcoming'}
            </Text>
          </View>
          <View
            style={[styles.badgeFriendStyle, { backgroundColor: '#4da6ff' }]}
          >
            <Text style={styles.badgeTextFriendStyle}>
              {event.attendees?.length || 0} Attending
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.chevronIcon}>›</Text>
    </TouchableOpacity>
  );
});

export default function EventList({ events, loading, navigation }) {
  // Note: For host photo/name/rating, prefer enhancing upstream via userSnippetStore ensureSnippets(ownerIds)
  if (loading) {
    return (
      <Text style={{ color: '#888', marginTop: 8 }}>Loading events...</Text>
    );
  }

  if (!events.length) {
    return (
      <Text style={{ color: '#888', marginTop: 8 }}>No events available.</Text>
    );
  }

  return (
    <View>
      {events.map((event) => (
        <PostCard key={event.id} event={event} navigation={navigation} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  eventCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    marginVertical: 8,
    padding: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  eventImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#ddd',
    marginRight: 12,
  },
  eventInfo: {
    flex: 1,
    flexDirection: 'column',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
    color: '#222',
  },
  eventDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  eventAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  eventAttendees: {
    fontSize: 13,
    color: '#444',
  },
  eventListContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  eventCardNew: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
    overflow: 'hidden',
  },
  imageWrapper: {
    position: 'relative',
  },
  eventImageNew: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  eventImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#aaa',
  },
  badgeRow: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  eventInfoNew: {
    padding: 8,
  },
  eventTitleNew: {
    fontSize: 14,
    fontWeight: '700',
    color: '#222',
    marginBottom: 4,
  },
  eventAddressNew: {
    fontSize: 12,
    color: '#666',
  },
  eventCardFriendStyle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  eventImageFriendStyle: {
    width: 55,
    height: 55,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: '#ddd',
  },
  eventTitleFriendStyle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
    marginBottom: 2,
  },
  eventSubTextFriendStyle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  badgeRowFriendStyle: {
    flexDirection: 'row',
    marginTop: 2,
  },
  badgeFriendStyle: {
    backgroundColor: '#eee',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 6,
  },
  badgeTextFriendStyle: {
    fontSize: 12,
    color: '#444',
    fontWeight: '600',
  },
  chevronIcon: {
    fontSize: 20,
    color: '#bbb',
    marginLeft: 6,
  },
});
