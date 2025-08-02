import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { Video } from 'expo-video';
import Avatar from './ui/Avatar';
import PopupMenu from './PopupMenu';
import { useAuth } from '../context/AuthContext';
import { deleteEvent, reportContent } from '../firebase/config';
import { GOOGLE_MAPS_API_KEY } from '@env';

export default function PostCard({ event, onPress }) {
  const { user } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState(
    event.address || 'Fetching address...'
  );

  const isOwner = event.ownerId === user?.uid;

  const handleEllipsisPress = () => {
    setMenuVisible(true);
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent?.id) return;
    try {
      await softDeleteEvent(selectedEvent.id);
      Alert.alert('Deleted', 'The event was marked as deleted.');
      // Refresh user events
      const updatedEvents = allEvents.map((ev) =>
        ev.id === selectedEvent.id ? { ...ev, isDeleted: true } : ev
      );
      setEnhancedEvents(updatedEvents);
    } catch (error) {
      Alert.alert('Error', 'Failed to delete the event.');
    } finally {
      setModalVisible(false);
    }
  };

  const handleReport = async () => {
    setMenuVisible(false);
    try {
      await reportContent(user.uid, event.id, 'event', 'Inappropriate content');
      alert('Event reported successfully.');
    } catch (error) {
      alert('Failed to report the event. Please try again.');
    }
  };

  const isDeleted = event?.isDeleted;

  const postType = event.postType || 'event';

  const eventDateTime = event.date?.seconds
    ? new Date(event.date.seconds * 1000).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      })
    : 'Date TBD';

  useEffect(() => {
    if (
      !event.address &&
      event.location?.latitude &&
      event.location?.longitude
    ) {
      const fetchAddress = async () => {
        try {
          const { latitude, longitude } = event.location;
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
          );
          const data = await res.json();
          if (data.status === 'OK' && data.results.length) {
            setResolvedAddress(data.results[0].formatted_address);
          } else {
            setResolvedAddress('Address not available');
          }
        } catch {
          setResolvedAddress('Error fetching address');
        }
      };
      fetchAddress();
    }
  }, [event.address, event.location]);

  const MAX_ADDRESS_LENGTH = 30;
  const truncatedAddress =
    resolvedAddress.length > MAX_ADDRESS_LENGTH
      ? `${resolvedAddress.slice(0, MAX_ADDRESS_LENGTH)}...`
      : resolvedAddress;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress?.(event)}
      activeOpacity={0.9}
    >
      {/* ✅ MEDIA (Video > Image > None) */}
      {event.videoUrl ? (
        <Video
          source={{ uri: event.videoUrl }}
          style={styles.media}
          resizeMode='cover'
          isMuted
          shouldPlay={false}
          isLooping
        />
      ) : event.imageUrl ? (
        <Image source={{ uri: event.imageUrl }} style={styles.media} />
      ) : null}

      {/* ✅ INFO */}
      <View
        style={[
          styles.info,
          !event.imageUrl && !event.videoUrl && styles.noMediaInfo,
        ]}
      >
        <TouchableOpacity
          style={styles.ellipsisButtonAbsolute}
          onPress={handleEllipsisPress}
        >
          <Text style={styles.ellipsisText}>⋮</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{event.title}</Text>
        <View style={styles.hostRow}>
          <Avatar uri={event.hostPhoto} size={50} />
          <View style={{ marginLeft: 8 }}>
            <Text style={styles.hostName}>{event.hostName}</Text>
            <Text style={styles.rating}>
              {event.hostRating
                ? `⭐ ${event.hostRating.toFixed(1)}`
                : 'No Rating'}
            </Text>
            <Text style={styles.dateTime}>{eventDateTime}</Text>
            <Text
              style={styles.location}
              numberOfLines={1}
              ellipsizeMode='tail'
            >
              {truncatedAddress}
            </Text>
          </View>
        </View>
      </View>

      {/* ✅ JOIN BUTTON */}
      <View style={styles.actionRow}>
        <View style={styles.infoBubbleContainer}>
          <View style={styles.interestBubble}>
            <Text style={styles.interestText}>
              {event.interest || 'General'}
            </Text>
          </View>
          <Text style={styles.attendeesText}>
            {event.attendees?.length || 0} attending
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => onPress?.(event)}
        >
          <Text style={styles.joinText}>Join</Text>
        </TouchableOpacity>
      </View>

      {/* ✅ POPUP MENU */}
      {menuVisible && (
        <PopupMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          isOwner={isOwner}
          onReport={handleReport}
          onDelete={handleDeleteEvent}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 6,
    marginTop: 6,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  media: {
    width: '100%',
    height: 200,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  noMediaInfo: {
    paddingTop: 20,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  joinButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  joinText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  ellipsisButtonAbsolute: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    padding: 5,
  },
  ellipsisText: {
    fontSize: 20,
    color: '#888',
    fontWeight: 'bold',
  },
  info: { padding: 12 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    marginRight: 40,
  },
  dateTime: {
    fontSize: 14,
    color: '#555',
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hostName: { fontSize: 14, fontWeight: '600', color: '#333' },
  rating: { fontSize: 13, color: '#FFB300', fontWeight: '600' },
  groupName: { fontSize: 14, fontWeight: '600', color: '#333' },
  date: { fontSize: 13, color: '#555' },
  location: {
    fontSize: 13,
    color: '#007AFF',
    overflow: 'hidden',
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  tagText: { fontSize: 12, color: '#555' },
  infoBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  interestBubble: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginRight: 8,
  },
  interestText: {
    fontSize: 12,
    color: '#555',
  },
  attendeesText: {
    fontSize: 13,
    color: 'coral',
    fontWeight: '700',
    backgroundColor: '#FFF3F4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
