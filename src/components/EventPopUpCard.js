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
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  collection,
  addDoc,
} from 'firebase/firestore';
// Do NOT import addDoc directly here; use sendNotification from config.js which handles notification creation
import { db, updateUserData, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '../store/userStore';
import { useEventStore } from '../store/eventStore';
const screenHeight = Dimensions.get('window').height;

export default function EventPopUpCard({ event, onClose, onJoin }) {
  const bottomSheetRef = useRef(null);
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
  const navigation = useNavigation();
  const [address, setAddress] = useState('Fetching address...');
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [userDetails, setUserDetails] = useState(null);
  const snapPoints = useMemo(() => ['50%', '90%', '95%'], []);

  useEffect(() => {
    if (!event || event.isDeleted) {
      onClose();
      return;
    }

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

    const ownerId = event.ownerId;
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

  const isSoftDeleted = event?.isDeleted === true;
  const isExpired = (() => {
    if (!event) return false;
    let eventTime = null;
    if (event.endAt) {
      if (event.endAt.toDate) eventTime = event.endAt.toDate().getTime();
      else if (event.endAt.seconds) eventTime = event.endAt.seconds * 1000;
    } else if (event.date) {
      if (event.date.toDate) eventTime = event.date.toDate().getTime();
      else if (event.date.seconds) eventTime = event.date.seconds * 1000;
      else if (event.date instanceof Date) eventTime = event.date.getTime();
    }
    if (!eventTime) return false;
    return eventTime + 60 * 60 * 1000 <= Date.now();
  })();

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
  const requests = Array.isArray(event.requests) ? event.requests : [];
  const isOwner = event.ownerId === user?.uid;
  const isAttendee = attendees.includes(user?.uid);
  const hasRequested = requests.includes(user?.uid);

  // --- Join/Request/Chat Button Logic ---
  let actionButtonLabel = 'Join Event';
  if (isAttendee || isOwner) {
    actionButtonLabel = 'Check Chat';
  } else if (event.privacy === 'rsvp') {
    actionButtonLabel = hasRequested ? 'Request Pending' : 'Request To Join';
  }

  // --- Button Action Handler ---
  const handleActionButton = async () => {
    if (isSoftDeleted) {
      alert('This event has been archived and is no longer interactive.');
      return;
    }
    if (isExpired) {
      alert('This event has ended and is read-only.');
      return;
    }
    if (isAttendee || isOwner) {
      // Use navigation prop for navigation actions
      navigation.navigate('EventChat', {
        eventId: event.id,
        locationName: address,
      });
      return;
    }
    if (event.privacy === 'rsvp') {
      if (hasRequested) {
        alert('Your request is pending approval.');
        return;
      }
      await handleRequestToJoin();
      return;
    }
    await handleJoin();
  };

  const handleRequestToJoin = async () => {
    if (!user || !event?.id) return;
    try {
      const call = httpsCallable(functions, 'requestToJoinEvent');
      const res = await call({ eventId: event.id });
      const already = res?.data?.alreadyRequested;
      alert(
        already
          ? 'You have already requested to join. Please wait for approval.'
          : 'Request sent to the host. Await approval.'
      );
    } catch (err) {
      console.error('Request to join error:', err);
      alert(`Failed to send request. Error: ${err?.message || err}`);
    }
  };

  // Description: Centralized join implementation using eventStore.rsvpEvent
  const handleJoin = async () => {
    if (isSoftDeleted) {
      alert('This event has been archived and cannot be joined.');
      return;
    }
    if (isExpired) {
      alert('This event has ended and cannot be joined.');
      return;
    }
    if (!user || !event?.id) return;

    // Local checks
    const attendees = Array.isArray(event.attendees) ? event.attendees : [];
    const isOwnerLocal = event.ownerId === user.uid;
    if (isOwnerLocal || attendees.includes(user.uid)) {
      navigation.navigate('EventChat', {
        eventId: event.id,
        locationName: address,
      });
      return;
    }

    if (
      typeof event.capacity === 'number' &&
      event.capacity > 0 &&
      attendees.length >= event.capacity
    ) {
      alert('Event is full. You can join the waitlist if available.');
      return;
    }

    try {
      const rsvpFn = useEventStore.getState().rsvpEvent;
      if (typeof rsvpFn !== 'function') {
        throw new Error('RSVP function unavailable');
      }

      // Call centralized RSVP which handles callables, optimistic updates, and chat creation
      await rsvpFn(event.id, user.uid);

      // Navigate to chat after success
      navigation.navigate('EventChat', {
        eventId: event.id,
        locationName: address,
      });
      return;
    } catch (err) {
      console.error('Join event via store failed:', err);
      alert(friendlyJoinError(err));
    }
  };

  const handleReport = async () => {
    if (!user || !event?.id) return;
    try {
      const reportRef = collection(db, 'reports');
      await addDoc(reportRef, {
        reporterId: user.uid,
        eventId: event.id,
        reportedAt: new Date(),
        status: 'pending',
      });
      alert('Event reported successfully. Our team will review it shortly.');
    } catch (err) {
      console.error('Report error:', err);
      alert('Failed to report the event. Please try again.');
    }
  };

  if (!event) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose} // Close modal when clicking outside
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior='close' // Close modal when clicking backdrop
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
              {/* Description: Unified host rating display to match PostCard (gold star + numeric rating) */}
              <Text style={styles.userRating}>
                {typeof userDetails.rating === 'number' &&
                userDetails.rating > 0
                  ? `⭐ ${userDetails.rating.toFixed(1)}`
                  : 'No Rating'}
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
  userRating: {
    fontSize: 14,
    color: '#FFB300', // Description: Gold color to match PostCard rating star
    fontWeight: '600',
    marginTop: 2,
  },
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
