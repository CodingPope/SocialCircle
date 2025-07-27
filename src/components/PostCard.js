import React, { useState } from 'react';
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
import { useAuth } from '../context/AuthContext'; // Import useAuth for current user context
import { deleteEvent, reportContent } from '../firebase/config'; // Import functions

export default function PostCard({ event, onPress, onJoinPress }) {
  const { user } = useAuth(); // Get the current user
  const [menuVisible, setMenuVisible] = useState(false);

  const isOwner = event.ownerId === user?.uid; // Check if the event is assigned to the current user

  const handleEllipsisPress = () => {
    setMenuVisible(true);
  };

  const handleDelete = async () => {
    setMenuVisible(false);
    try {
      await deleteEvent(event.id, user.uid); // Call deleteEvent with event ID and user ID
      alert('Event deleted successfully.');
    } catch (error) {
      alert('Failed to delete the event. Please try again.');
    }
  };

  const handleReport = async () => {
    setMenuVisible(false);
    try {
      await reportContent(user.uid, event.id, 'event', 'Inappropriate content'); // Example reason
      alert('Event reported successfully.');
    } catch (error) {
      alert('Failed to report the event. Please try again.');
    }
  };

  const postType = event.postType || 'event';

  const eventDateTime = event.date?.seconds
    ? new Date(event.date.seconds * 1000).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      })
    : 'Date TBD';

  const getFormattedLocation = (loc) => {
    if (!loc) return 'Location not available';
    if (loc.city && loc.state && loc.address) {
      return `${loc.address}, ${loc.city}, ${loc.state}`;
    }
    if (typeof loc.address === 'string') {
      const parts = loc.address.split(',');
      if (parts.length > 1) {
        return parts
          .slice(0, parts.length - 1)
          .join(', ')
          .trim();
      }
      return loc.address.trim();
    }
    if (loc.city && loc.state) {
      return `${loc.city}, ${loc.state}`;
    }
    return 'Location not specified';
  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress?.(event)}>
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

      {/* ✅ PopupMenu for Options */}
      <PopupMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        isOwner={isOwner} // Pass the correct ownership status
        onDelete={handleDelete} // Pass delete handler
        onReport={handleReport} // Pass report handler
        eventId={event.id} // Pass event ID
      />

      {/* ✅ INFO */}
      <View style={styles.info}>
        {/* ✅ Horizontal Ellipsis Button */}
        <TouchableOpacity
          style={styles.ellipsisButton}
          onPress={handleEllipsisPress}
        >
          <Text style={styles.ellipsisText}>⋯</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{event.title}</Text>

        <View style={styles.hostRow}>
          <Avatar
            uri={postType === 'groupPost' ? event.groupPhoto : event.hostPhoto}
            size={50}
          />
          <View style={{ marginLeft: 8 }}>
            {/* ✅ NEW: HOST NAME & RATING */}
            {postType !== 'groupPost' && (
              <View style={styles.nameRow}>
                <Text style={styles.hostName}>
                  {event.hostName || 'Unknown Host'}
                </Text>
                {event.hostRating !== undefined && (
                  <Text style={styles.rating}>
                    ⭐ {event.hostRating.toFixed(1)}
                  </Text>
                )}
              </View>
            )}
            {postType === 'groupPost' && (
              <Text style={styles.groupName}>{event.groupName}</Text>
            )}
            <Text style={styles.date}>{eventDateTime}</Text>
            {event.location && (
              <Text style={styles.location}>
                {getFormattedLocation(event.location)}
              </Text>
            )}
          </View>
        </View>

        {/* ✅ TAGS / JOIN (Only for Events) */}
        {postType === 'event' && (
          <View style={styles.tagRow}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{event.role}</Text>
            </View>
            <View style={[styles.tag, { backgroundColor: '#E8F5E9' }]}>
              <Text style={[styles.tagText, { color: '#388E3C' }]}>
                {event.attendees?.length || 0} Attending
              </Text>
            </View>
            <TouchableOpacity
              style={styles.joinButton}
              onPress={() => onJoinPress?.(event)}
            >
              <Text style={styles.joinText}>Join</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
  ellipsisButton: {
    position: 'absolute',
    top: 0,
    right: 6,
    padding: 5,
    zIndex: 10,
  },
  ellipsisText: {
    fontSize: 20,
    color: '#888',
    fontWeight: 'bold',
  },
  info: { padding: 12 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  hostRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hostName: { fontSize: 14, fontWeight: '600', color: '#333' },
  rating: { fontSize: 13, color: '#FFB300', fontWeight: '600' },
  groupName: { fontSize: 14, fontWeight: '600', color: '#333' },
  date: { fontSize: 13, color: '#555' },
  location: { fontSize: 13, color: '#007AFF' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  tagText: { fontSize: 12, color: '#555' },
  joinButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  joinText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
