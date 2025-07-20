import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Linking,
} from 'react-native';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { useNavigation } from '@react-navigation/native';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, updateUserData } from '../firebase/config';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
const screenHeight = Dimensions.get('window').height;

export default function EventPopUpCard({ event, onClose, onJoin }) {
  const bottomSheetRef = useRef(null);
  const { user } = useAuth();
  const navigation = useNavigation();
  const [address, setAddress] = useState('Fetching address...');
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [userDetails, setUserDetails] = useState(null);
  const snapPoints = useMemo(() => ['90%'], []);

  useEffect(() => {
    if (!event?.location) {
      setAddress('Location not specified');
      return;
    }
    const fetchAddress = async () => {
      try {
        const { latitude, longitude } = event.location;
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await res.json();
        if (data.status === 'OK' && data.results.length) {
          setAddress(data.results[0].formatted_address);
        } else {
          setAddress('Address not available');
        }
      } catch (err) {
        setAddress('Error fetching address');
      }
    };
    fetchAddress();

    const ownerId = event.ownerID || event.ownerId;
    if (!ownerId) return;
    const fetchUser = async () => {
      try {
        const ref = doc(db, 'users', ownerId);
        const snap = await getDoc(ref);
        if (snap.exists()) setUserDetails({ id: snap.id, ...snap.data() });
      } catch (err) {
        console.error('Error fetching user details:', err);
      }
    };
    fetchUser();
  }, [event]);

  const displayName = userDetails
    ? `${userDetails.firstName || ''} ${userDetails.lastName || ''}`.trim() ||
      userDetails.name ||
      'Anonymous'
    : 'Anonymous';

  // Use fallback image for event image
  const profileImageSource =
    userDetails?.profileImage || userDetails?.avatarURL
      ? { uri: userDetails.profileImage || userDetails.avatarURL }
      : require('../../assets/smileDefault.png');

  const openInMaps = () => {
    if (event.location) {
      const { latitude, longitude } = event.location;
      Linking.openURL(`https://www.google.com/maps?q=${latitude},${longitude}`);
    }
  };

  // --- Join Event Logic ---
  const attendees = Array.isArray(event.attendees) ? event.attendees : [];
  const isOwner = event.ownerId === user?.uid || event.ownerID === user?.uid;
  const isAttendee = attendees.includes(user?.uid);

  // --- Join/Request/Chat Button Logic ---
  let actionButtonLabel = 'Join Event';
  if (isAttendee || isOwner) {
    actionButtonLabel = 'Check Chat';
  } else if (event.privacy === 'private') {
    actionButtonLabel = 'Request To Join';
  }

  // --- Button Action Handler ---
  const handleActionButton = async () => {
    if (isAttendee || isOwner) {
      navigation.navigate('EventChat', {
        eventId: event.id,
        locationName: address,
      });
      return;
    }
    if (event.privacy === 'private') {
      // Description: Handle request to join for private events (stub for now)
      alert('Request sent to host. Await approval.');
      // TODO: Implement request logic (e.g., add to requests array in Firestore)
      return;
    }
    await handleJoin();
  };

  // --- Report Button Handler ---
  const handleReport = () => {
    // Description: Stub for reporting event (open modal or navigate)
    alert('Report functionality coming soon.');
    // TODO: Implement report modal or navigation
  };

  const handleJoin = async () => {
    // Description: Handles joining event, checks capacity, updates Firestore, navigates to chat
    if (!user || !event?.id) return;
    const isOwner = event.ownerId === user.uid || event.ownerID === user.uid;
    const attendees = Array.isArray(event.attendees) ? event.attendees : [];
    const isAttendee = attendees.includes(user.uid);

    // If already an attendee, just go to chat
    if (isAttendee) {
      navigation.navigate('EventChat', {
        eventId: event.id,
        locationName: address, // Pass address as param
      });
      return;
    }

    // If event is full, show alert
    if (
      typeof event.capacity === 'number' &&
      event.capacity > 0 &&
      attendees.length >= event.capacity
    ) {
      alert('Event is full. You can join the waitlist if available.');
      return;
    }

    // Add user to attendees in Firestore
    try {
      const eventRef = doc(db, 'events', event.id);
      await updateDoc(eventRef, {
        attendees: arrayUnion(user.uid),
      });
      // Add event ID to user's attendedEvents array
      await updateUserData(user.uid, {
        attendedEvents: arrayUnion(event.id),
      });
      navigation.navigate('EventChat', {
        eventId: event.id,
        locationName: address, // Pass address as param
      });
    } catch (err) {
      alert('Failed to join event. Please try again.');
      console.error('Join event error:', err);
    }
  };

  if (!event) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior='close'
        />
      )}
      style={[styles.bottomSheet, { maxHeight: screenHeight }]} // limit the sheet, not the scroll
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator
        contentContainerStyle={{ padding: 10, flexGrow: 1 }}
      >
        {/* Event Image: Only show if imageUri or imageUrl exists */}
        {(event.imageUri || event.imageUrl) && (
          <Image
            source={{ uri: event.imageUri || event.imageUrl }}
            style={styles.image}
            resizeMode='cover'
          />
        )}
        {/* No fallback image shown if no imageUri/imageUrl */}
        <Text style={styles.title}>{event.title || 'Untitled Event'}</Text>
        {event.category && (
          <Text style={styles.categoryTag}>{event.category}</Text>
        )}

        <Text style={styles.label}>Description:</Text>
        <Text style={styles.description}>
          {showFullDescription
            ? event.description
            : event.description?.length > 300
            ? `${event.description.slice(0, 300)}...`
            : event.description}
        </Text>
        {event.description && event.description.length > 300 && (
          <TouchableOpacity
            onPress={() => setShowFullDescription(!showFullDescription)}
          >
            <Text style={styles.showMore}>
              {showFullDescription ? 'Read Less' : 'Read More'}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.label}>Date:</Text>
        <Text style={styles.subText}>
          {event.date
            ? new Date(event.date.seconds * 1000).toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Date not specified'}
        </Text>
        <Text style={styles.label}>Address:</Text>
        <TouchableOpacity style={styles.addressContainer} onPress={openInMaps}>
          <Ionicons name='pin' size={20} color='blue' />
          <Text style={[styles.subText, { color: 'blue' }]}>{address}</Text>
        </TouchableOpacity>

        {userDetails && (
          <TouchableOpacity
            style={styles.userContainer}
            onPress={() => {
              // Description: Consistent profile navigation logic for Social Circle
              if (userDetails.id === user?.uid) {
                navigation.navigate('MainTabs', { screen: 'ProfileStack' });
              } else {
                navigation.navigate('OtherUserProfile', {
                  userId: userDetails.id,
                });
              }
            }}
          >
            <Image source={profileImageSource} style={styles.userImage} />
            <View>
              <Text style={styles.userName}>{displayName}</Text>
              <Text style={styles.userRating}>
                {'★'.repeat(Math.round(userDetails.rating || 0))}{' '}
                {userDetails.ratingCount || 0} reviews
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.actionsContainer}>
          {/* Capacity display */}
          {typeof event.capacity === 'number' && event.capacity > 0 ? (
            <Text style={styles.capacityText}>
              {attendees.length} / {event.capacity} Joined
            </Text>
          ) : (
            <Text style={styles.capacityText}>{attendees.length} joined</Text>
          )}
          {/* Main Action Button */}
          <TouchableOpacity
            style={styles.joinButton}
            onPress={handleActionButton}
          >
            <Text style={styles.joinButtonText}>{actionButtonLabel}</Text>
          </TouchableOpacity>
          {/* Report Button */}
          <TouchableOpacity style={styles.reportButton} onPress={handleReport}>
            <Text style={styles.reportButtonText}>Report</Text>
          </TouchableOpacity>
          {/* <View style={styles.secondaryActionsContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareIconButton}>
              <MaterialIcons name='share' size={20} color='#007BFF' />
            </TouchableOpacity>
          </View> */}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 100, // Ensure BottomSheet overlays FABs
    elevation: 100, // For Android overlay
  },

  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 10,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: 10,
  },
  placeholderText: { fontSize: 16, color: '#888' },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  categoryTag: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  label: { fontSize: 14, color: '#333', fontWeight: 'bold', marginBottom: 4 },
  description: { fontSize: 14, color: '#555', marginBottom: 12 },
  showMore: {
    color: 'blue',
    marginBottom: 10,
    fontWeight: 'bold',
  },
  subText: { fontSize: 14, color: '#666', marginBottom: 8 },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  userContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  userImage: { width: 40, height: 40, borderRadius: 10, marginRight: 8 },
  userName: { fontSize: 16, fontWeight: 'bold' },
  userRating: { fontSize: 14 },
  actionsContainer: {
    flexDirection: 'column', // Stack buttons vertically
    marginTop: 16,
  },
  joinButton: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 8, // Add spacing between buttons
  },
  joinButtonText: { color: '#fff', fontWeight: 'bold' },
  reportButton: {
    backgroundColor: '#FFB300',
    padding: 8,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 8,
  },
  reportButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  secondaryActionsContainer: {
    flexDirection: 'row', // Place cancel and share buttons side by side
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  cancelButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  shareIconButton: {
    padding: 6,
    borderRadius: 5,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  capacityText: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: 'bold',
    marginBottom: 8,
  },
});
