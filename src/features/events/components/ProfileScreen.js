import React, {
  useState,
  useEffect,
  useCallback,
  memo,
  useRef,
  useMemo,
} from 'react';
import { Animated, Dimensions, PanResponder } from 'react-native';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert,
  TextInput,
  ScrollView,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { signOut } from 'firebase/auth';
import {
  auth,
  getUserData,
  updateUserData,
  uploadProfileImage,
  db,
  reportContent,
} from '../../../firebase/config';
import { useUserStore } from '../../profile/stores/userStore';
import { useMyEvents } from '../hooks/useMyEvents';
import * as ImagePicker from 'expo-image-picker';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  arrayRemove,
} from 'firebase/firestore';
import PostCard from './PostCard';
import InterestPostCard from '../../interestPosts/components/InterestPostCard';
import { fetchInterestPostsByCreator } from '../../interestPosts/services/interestPostService';
import ActionModals from '../../profile/components/ActionModals';
import { shareProfile } from '../../../services/share';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { useUserSnippetStore } from '../../profile/stores/userSnippetStore';
import { trackReportContent } from '../../../lib/analytics';
import { getEventEndMs, getTimelineTimestamp, mergeUniqueEvents } from '../utils/dateUtils';

export default function ProfileScreen({ navigation }) {
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
  const myEvents = useMyEvents(user?.uid || '');
  const now = new Date();

  // Keep a stable reference to myEvents to avoid effect dependency loops
  const myEventsRef = useRef(myEvents);
  useEffect(() => {
    myEventsRef.current = myEvents;
  }, [myEvents]);

  // Ensure snippet fetcher from store
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);

  // --- Notification badge state ---
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (!user?.uid) return;
    // Listen for recipient notifications; compute unread locally to include docs without `read` field
    const fs = require('firebase/firestore');
    const cfg = require('../../../firebase/config');
    const q = fs.query(
      fs.collection(cfg.db, 'notifications'),
      fs.where('recipientId', '==', user.uid)
    );

    let unsub = fs.onSnapshot(
      q,
      (snapshot) => {
        try {
          const activeUnread = snapshot.docs.filter((d) => {
            const data = d.data() || {};
            return data.isDeleted !== true && data.read !== true; // count undefined or false
          });
          setUnreadCount(activeUnread.length);
        } catch (e) {
          console.warn('Notifications parse error:', e?.message || e);
        }
      },
      (error) => {
        // Avoid unhandled errors when auth state changes and rules deny access
        if (error?.code === 'permission-denied') {
          setUnreadCount(0);
          try {
            unsub && unsub();
          } catch {}
          return;
        }
        console.warn('Notifications listener error:', error?.message || error);
      }
    );

    // Register globally so logout can proactively clean it up before signOut()
    try {
      if (!global.unsubscribeAllListeners) global.unsubscribeAllListeners = [];
      global.unsubscribeAllListeners.push(unsub);
    } catch {}

    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [user?.uid]);

  // Optimistically clear badge and mark unread as read
  const handleNotificationsPress = async () => {
    // Optimistic UI: clear badge immediately
    setUnreadCount(0);
    try {
      if (!user?.uid) {
        navigation.navigate('Notifications');
        return;
      }
      const fs = require('firebase/firestore');
      const cfg = require('../../../firebase/config');
      const q = fs.query(
        fs.collection(cfg.db, 'notifications'),
        fs.where('recipientId', '==', user.uid)
      );
      const snap = await fs.getDocs(q);
      if (snap?.size) {
        const batch = fs.writeBatch(cfg.db);
        snap.docs.forEach((d) => {
          const data = d.data() || {};
          if (data.isDeleted !== true && data.read !== true) {
            batch.update(d.ref, { read: true, readAt: fs.serverTimestamp() });
          }
        });
        await batch.commit();
      }
    } catch (e) {
      // Non-blocking; the Notifications screen will also mark as read via its store
      console.warn('Failed to mark notifications as read:', e?.message || e);
    } finally {
      navigation.navigate('Notifications');
    }
  };

  const handleShareProfile = useCallback(async () => {
    if (!user?.uid) {
      Alert.alert(
        'Share unavailable',
        'You need to be signed in to share your profile.'
      );
      return;
    }

    try {
      await shareProfile(user, {
        surface: 'profile',
        source: 'profile_header',
      });
    } catch (err) {
      console.warn('Profile share failed:', err?.message || err);
    }
  }, [user]);

  // --- Soft Delete Handler (with double confirmation) ---
  const handleDeleteAccount = async () => {
    if (!user?.uid) return;
    Alert.alert(
      'Delete Account',
      'This will permanently remove your profile and you will not be able to join or host events. Are you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Soft delete user in Firestore
              await updateDoc(doc(db, 'users', user.uid), {
                isDeleted: true,
                deletedAt: new Date(),
                displayName: 'Deleted User',
                profileImage: null,
                bio: '',
              });
              // Sign out
              await logout();
              setUser(null);
              // AppNavigator will render AuthStack when user is null
              setTimeout(() => {
                Alert.alert(
                  'Profile Deleted',
                  'Your profile has been deleted. You have been signed out.'
                );
              }, 600);
            } catch (err) {
              Alert.alert('Error', 'Failed to delete account.');
            }
          },
        },
      ]
    );
  };

  // --- State ---
  const [showFullBio, setShowFullBio] = useState(false);
  const MAX_BIO_LENGTH = 100;
  const [bio, setBio] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [ratingCount, setRatingCount] = useState(0);
  const [rating, setRating] = useState(0);
  const [verified, setVerified] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userEvents, setUserEvents] = useState({
    created: [],
    attending: [],
    attended: [],
  });
  const [interestPosts, setInterestPosts] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [groupEvents, setGroupEvents] = useState([]);
  const EVENTS_PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(EVENTS_PAGE_SIZE);
  // NEW: tab selection for Timeline vs Current
  const [selectedTab, setSelectedTab] = useState('Timeline');
  // Modal for event actions (delete/report)
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  // Add animated sidebar state/refs
  const sidebarPan = useRef(null);
  const sidebarAnim = useRef(
    new Animated.Value(Dimensions.get('window').width)
  ).current;
  const sidebarClosing = useRef(false);

  // PanResponder for swipe-to-close gesture
  sidebarPan.current =
    sidebarPan.current ||
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only respond to horizontal swipes (rightward)
        return (
          Math.abs(gestureState.dx) > 10 &&
          Math.abs(gestureState.dy) < 20 &&
          gestureState.dx > 0
        );
      },
      onPanResponderMove: (evt, gestureState) => {
        // Move sidebarAnim with finger, but not past the screen width
        if (gestureState.dx > 0) {
          sidebarAnim.setValue(
            Math.min(gestureState.dx, Dimensions.get('window').width)
          );
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        // If swiped more than 1/3 of sidebar width, close; else snap back
        const sidebarWidth = Dimensions.get('window').width * 0.9;
        if (gestureState.dx > sidebarWidth / 3) {
          Animated.timing(sidebarAnim, {
            toValue: Dimensions.get('window').width,
            duration: 200,
            useNativeDriver: true,
          }).start();
        } else {
          Animated.timing(sidebarAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      },
    });
  // Sidebar open/close animation
  const openSidebar = () => {
    sidebarClosing.current = false;
    sidebarAnim.setValue(Dimensions.get('window').width);
    setSidebarVisible(true);
    requestAnimationFrame(() => {
      Animated.timing(sidebarAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
  };

  // Fix: Avoid calling setSidebarVisible in animation callback (causes useInsertionEffect error)
  const closeSidebar = () => {
    sidebarClosing.current = true;
    Animated.timing(sidebarAnim, {
      toValue: Dimensions.get('window').width,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  // Effect: Hide sidebar after animation completes
  useEffect(() => {
    if (!sidebarVisible) return;
    const screenWidth = Dimensions.get('window').width;
    // Listen for sidebarAnim value to reach the closed position
    const id = sidebarAnim.addListener(({ value }) => {
      if (!sidebarClosing.current) return;
      if (value >= screenWidth - 1) {
        sidebarClosing.current = false;
        setSidebarVisible(false);
        sidebarAnim.removeListener(id);
      }
    });
    return () => sidebarAnim.removeListener(id);
  }, [sidebarVisible, sidebarAnim]);
  const [enhancedEvents, setEnhancedEvents] = useState([]);
  const [modals, setModals] = useState({
    share: false,
    report: false,
    signOut: false,
  });

  // --- Logout handler ---
  const setUser = useUserStore((state) => state.setUser);
  const logout = useUserStore((state) => state.logout);

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      // AppNavigator will switch to AuthStack when user becomes null
    } catch (err) {
      Alert.alert('Logout Error', err.message);
    }
  };

  // --- Derived ---
  const fullName = `${user.firstName} ${user.lastName}`;
  const avatarURL =
    user.profileImage ||
    user.avatarURL ||
    'https://example.com/default-avatar.png';
  const userSince =
    user.createdAt && typeof user.createdAt.toDate === 'function'
      ? user.createdAt
          .toDate()
          .toLocaleString('default', { month: 'short', year: 'numeric' })
      : '';
  const followerCount =
    typeof user.followerCount === 'number'
      ? user.followerCount
      : Array.isArray(user.followers)
      ? user.followers.length
      : 0;
  const eventCount =
    (Array.isArray(user.createdEvents) ? user.createdEvents.length : 0) +
    (Array.isArray(user.attendedEvents) ? user.attendedEvents.length : 0);

  // --- Refresh handler ---
  const onRefresh = useCallback(async () => {
    if (!user?.uid) return;
    setRefreshing(true);

    try {
      // Refresh user data
      const data = await getUserData(user.uid);
      setBio(data.bio || '');
      setProfileImage(data.profileImage || null);
      setRating(data.rating || 0);
      setRatingCount(data.ratingCount || 0);
      setVerified(data.verified || false);

      // Refresh follow count
      const followerCount =
        typeof data.followerCount === 'number'
          ? data.followerCount
          : Array.isArray(data.followers)
          ? data.followers.length
          : 0;

      // Refresh user events
      const fetchEventsByIds = async (ids) => {
        if (!ids.length) return [];
        // Use helper from firebase config if exposed
        try {
          const { getUserEventsByIds } = require('../../../firebase/config');
          if (typeof getUserEventsByIds === 'function') {
            const res = await getUserEventsByIds(ids);
            return res.filter((e) => e.isDeleted !== true);
          }
        } catch (e) {
          // ignore and fallback to manual batching
        }

        try {
          const eventsRef = collection(db, 'events');
          const chunks = [];
          for (let i = 0; i < ids.length; i += 30)
            chunks.push(ids.slice(i, i + 30));
          let results = [];
          for (const chunk of chunks) {
            const q = query(eventsRef, where('__name__', 'in', chunk));
            const snapshot = await getDocs(q);
            results = results.concat(
              snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
            );
          }
          // Exclude soft-deleted
          return results.filter((e) => e.isDeleted !== true);
        } catch {
          // Fallback: filter from latest myEvents snapshot without re-triggering effects
          return (myEventsRef.current || []).filter(
            (ev) => ids.includes(ev.id) && ev.isDeleted !== true
          );
        }
      };

      const [created, attending, attended] = await Promise.all([
        fetchEventsByIds(data.createdEvents || []),
        fetchEventsByIds(data.attendingEvents || []),
        fetchEventsByIds(data.attendedEvents || []),
      ]);

      setUserEvents({ created, attending, attended });
      setEnhancedEvents(
        mergeUniqueEvents(created, attending, attended, groupEvents)
      );

      try {
        const postsResult = await fetchInterestPostsByCreator({
          creatorId: user.uid,
          pageSize: 50,
        });
        const timelinePosts = Array.isArray(postsResult?.posts)
          ? postsResult.posts
          : Array.isArray(postsResult)
          ? postsResult
          : [];
        setInterestPosts(timelinePosts.filter((post) => post?.isDeleted !== true));
      } catch (err) {
        console.warn('Failed to refresh interest posts', err);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    let isMounted = true;
    const fetchUserData = async () => {
      if (!user?.uid) return;
      const data = await getUserData(user.uid);
      if (!isMounted) return;
      setBio(data.bio || '');
      setProfileImage(data.profileImage || null);
      setRating(data.rating || 0);
      setRatingCount(data.ratingCount || 0);
      setVerified(data.verified || false);
    };
    fetchUserData();
    return () => {
      isMounted = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    let isMounted = true;
    async function fetchUserEvents() {
      setLoadingEvents(true);
      if (!user?.uid) {
        if (isMounted)
          setUserEvents({ created: [], attending: [], attended: [] });
        if (isMounted) setLoadingEvents(false);
        return;
      }
      const userData = await getUserData(user.uid);
      const fetchEventsByIds = async (ids) => {
        if (!ids.length) return [];
        // Use helper from firebase config if exposed
        try {
          const { getUserEventsByIds } = require('../../../firebase/config');
          if (typeof getUserEventsByIds === 'function') {
            const res = await getUserEventsByIds(ids);
            return res.filter((e) => e.isDeleted !== true);
          }
        } catch (e) {
          // ignore and fallback to manual batching
        }

        try {
          const eventsRef = collection(db, 'events');
          const chunks = [];
          for (let i = 0; i < ids.length; i += 30)
            chunks.push(ids.slice(i, i + 30));
          let results = [];
          for (const chunk of chunks) {
            const q = query(eventsRef, where('__name__', 'in', chunk));
            const snapshot = await getDocs(q);
            results = results.concat(
              snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
            );
          }
          // Exclude soft-deleted
          return results.filter((e) => e.isDeleted !== true);
        } catch {
          // Fallback: filter from latest myEvents snapshot without re-triggering effects
          return (myEventsRef.current || []).filter(
            (ev) => ids.includes(ev.id) && ev.isDeleted !== true
          );
        }
      };
      const [createdIds, attendingIds, attendedIds] = await Promise.all([
        fetchEventsByIds(userData.createdEvents || []),
        fetchEventsByIds(userData.attendingEvents || []),
        fetchEventsByIds(userData.attendedEvents || []),
      ]);

      // Query-based fallbacks to ensure host/attendee events still populate
      const eventsRef = collection(db, 'events');
      const [createdQSnap, attendingQSnap] = await Promise.all([
        getDocs(
          query(
            eventsRef,
            where('ownerId', '==', user.uid),
            where('isDeleted', '==', false)
          )
        ),
        getDocs(
          query(
            eventsRef,
            where('attendees', 'array-contains', user.uid),
            where('isDeleted', '==', false)
          )
        ),
      ]);
      const createdByQuery = createdQSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.isDeleted !== true);
      const attendingByQuery = attendingQSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.isDeleted !== true);

      const created = mergeUniqueEvents(createdIds, createdByQuery);
      const attending = mergeUniqueEvents(attendingIds, attendingByQuery);
      const attended = mergeUniqueEvents(attendedIds);

      let creatorPosts = [];
      try {
        const postsResult = await fetchInterestPostsByCreator({
          creatorId: user.uid,
          pageSize: 50,
        });
        creatorPosts = Array.isArray(postsResult?.posts)
          ? postsResult.posts
          : Array.isArray(postsResult)
          ? postsResult
          : [];
      } catch (err) {
        console.warn('Failed to load interest posts for profile timeline', err);
      }

      if (isMounted) setUserEvents({ created, attending, attended });
      if (isMounted)
        setInterestPosts(creatorPosts.filter((post) => post?.isDeleted !== true));
      if (isMounted) setLoadingEvents(false);
    }
    fetchUserEvents();
    return () => {
      isMounted = false;
    };
  }, [user?.uid]);

  // ✅ Move these two lines UP, before the useEffect
  const allEvents = mergeUniqueEvents(
    userEvents.created,
    userEvents.attending,
    userEvents.attended,
    groupEvents
  );

  // NEW: Current events = user’s events that have not ended yet
  const currentEvents = useMemo(() => {
    const nowMs = Date.now();
    return allEvents.filter((ev) => {
      const endMs = getEventEndMs(ev);
      return endMs ? nowMs < endMs : true; // if no end info, treat as current
    });
  }, [allEvents]);

  // Replace: visibleEvents depends on selected tab
  const visibleEvents = useMemo(() => {
    const list = selectedTab === 'Current' ? currentEvents : allEvents;
    return list.slice(0, visibleCount);
  }, [selectedTab, currentEvents, allEvents, visibleCount]);

  const visibleIdsKey = useMemo(
    () => visibleEvents.map((e) => e.id).join('|'),
    [visibleEvents]
  );

  const timelineItems = useMemo(() => {
    if (selectedTab === 'Current') {
      return (enhancedEvents || []).map((event) => ({
        type: 'event',
        id: `event-${event.id}`,
        event,
      }));
    }
    const eventItems = (enhancedEvents || []).map((event) => ({
      type: 'event',
      id: `event-${event.id}`,
      event,
    }));
    const postItems = (interestPosts || []).slice(0, 25).map((post) => ({
      type: 'post',
      id: `post-${post.id}`,
      post,
    }));
    const seen = new Set();
    return [...eventItems, ...postItems]
      .filter((item) => {
        if (!item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => getTimelineTimestamp(b) - getTimelineTimestamp(a));
  }, [selectedTab, enhancedEvents, interestPosts]);

  useEffect(() => {
    const enhanceEventData = async () => {
      // Snapshot current slice to avoid drift during async work
      const slice = visibleEvents;
      if (!slice.length) {
        setEnhancedEvents([]);
        return;
      }
      // Batch ownerId hydration via snippet store
      const ownerIds = [
        ...new Set(slice.map((e) => e?.ownerId).filter(Boolean)),
      ];

      let map = new Map();
      try {
        if (ownerIds.length && ensureSnippets)
          map = await ensureSnippets(ownerIds);
      } catch (e) {
        // ignore, will fallback to unknown host
      }

      const updated = slice.map((event) => {
        const s = event.ownerId ? map.get(event.ownerId) : null;
        const hostName = s?.name || event.ownerName || 'Unknown Host';
        const hostPhoto = s?.photoURL || null;
        const hostRating = typeof s?.rating === 'number' ? s.rating : 0;
        return {
          ...event,
          hostPhoto,
          hostRating,
          hostName,
          formattedDate: event.date?.seconds
            ? new Date(event.date.seconds * 1000).toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Date TBD',
          location: event.location?.address || 'Location not available',
        };
      });

      // Avoid unnecessary state updates that can cause effect churn
      setEnhancedEvents((prev) => {
        if (Array.isArray(prev) && prev.length === updated.length) {
          let same = true;
          for (let i = 0; i < prev.length; i++) {
            if (
              prev[i].id !== updated[i].id ||
              prev[i].hostName !== updated[i].hostName ||
              prev[i].hostPhoto !== updated[i].hostPhoto
            ) {
              same = false;
              break;
            }
          }
          if (same) return prev;
        }
        return updated;
      });
    };

    if (visibleEvents.length) {
      enhanceEventData();
    } else {
      setEnhancedEvents([]);
    }
    // Depend only on a stable key of the current slice to prevent infinite loops
  }, [visibleIdsKey]);

  // Helper function to format location
  const formatLocation = (location) => {
    if (!location) return 'Location not available';
    if (location.latitude && location.longitude) {
      return `Lat: ${location.latitude.toFixed(
        4
      )}, Lng: ${location.longitude.toFixed(4)}`;
    }
    return 'Location not specified';
  };

  const handleImageUpload = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        alert('Permission to access the photo library is required!');
        return;
      }
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (pickerResult.canceled) {
        alert('No image selected.');
        return;
      }
      const imageUri = pickerResult.assets[0].uri;
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const newImage = await uploadProfileImage(user.uid, blob);
      if (newImage) {
        await updateUserData(user.uid, { profileImage: newImage });
        setProfileImage(newImage);
        alert('Profile image updated successfully!');
      } else {
        alert('Failed to upload image.');
      }
    } catch {
      alert('Failed to update profile image. Please try again.');
    }
  };

  const handleSaveChanges = async () => {
    await updateUserData(user.uid, { bio });
    setIsEditing(false);
    alert('Changes saved successfully!');
  };

  const handleEllipsisClick = (event) => {
    setSelectedEvent(event);
    setModalVisible(true);
  };

  const handleReportEvent = () => {
    if (!selectedEvent || !selectedEvent.id || !user?.uid) {
      Alert.alert('Report', 'Unable to report this event right now.');
      setModalVisible(false);
      return;
    }
    reportContent(
      user.uid,
      selectedEvent.id,
      'event',
      'Inappropriate content',
      {
        details: `Report from ProfileScreen event actions for event ${selectedEvent.id}`,
        context: { eventId: selectedEvent.id },
      }
    )
      .then(() => Alert.alert('Report', 'Thanks for the report.'))
      .catch(() => Alert.alert('Report', 'Failed to submit report.'))
      .finally(() => setModalVisible(false));
  };

  // Add: implement delete handler referenced by modal
  const handleDeleteEvent = async () => {
    try {
      if (!selectedEvent || !selectedEvent.id) {
        setModalVisible(false);
        return;
      }
      // Only host can delete (soft delete)
      if (selectedEvent.ownerId && selectedEvent.ownerId !== user?.uid) {
        Alert.alert('Not allowed', 'Only the host can delete this event.');
        setModalVisible(false);
        return;
      }
      await updateDoc(doc(db, 'events', selectedEvent.id), {
        isDeleted: true,
        deletedAt: new Date(),
      });
      Alert.alert('Deleted', 'Event has been deleted.');
    } catch (e) {
      Alert.alert('Error', 'Failed to delete event.');
    } finally {
      setModalVisible(false);
    }
  };

  const handleMenuOptionClick = (option) => {
    setSidebarVisible(false);
    switch (option) {
      case 'Edit Profile':
        setIsEditing(true);
        break;
      case 'Manage Interests':
        navigation.navigate('ManageInterestsScreen');
        break;
      case 'Privacy and Info':
        navigation.navigate('PrivacyInfo');
        break;
      case 'Logout':
        handleLogout();
        break;
      case 'Delete Account':
        handleDeleteAccount();
        break;
      default:
        break;
    }
  };

  const handleEventClick = async (eventId, opts = {}) => {
    try {
      const eventRef = doc(db, 'events', eventId);
      const eventSnapshot = await getDoc(eventRef);
      if (!eventSnapshot.exists()) {
        Alert.alert('Event not found', 'This event no longer exists.');
        return;
      }
      const eventData = eventSnapshot.data();

      if (eventData.isDeleted === true) {
        Alert.alert(
          'Event archived',
          'This event has been archived and is no longer interactive.'
        );
        return;
      }

      // Determine membership
      const uid = user?.uid;
      const isMember =
        eventData.ownerId === uid ||
        (Array.isArray(eventData.attendees) &&
          eventData.attendees.includes(uid));

      // If explicitly coming from RSVP success, go straight to chat
      if (opts?.source === 'EventChat') {
        navigation.navigate('EventChat', { eventId });
        return;
      }

      // On normal taps: require membership to enter chat
      if (!isMember) {
        Alert.alert(
          'No Access',
          'You must be the host or an attendee to view this chat.'
        );
        return;
      }

      navigation.navigate('EventChat', { eventId });
    } catch (error) {
      Alert.alert('Error', 'Failed to navigate to the event chat.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Sidebar Menu (Animated right-to-left slide-in) */}
      {sidebarVisible && (
        <View style={styles.sidebarAbsoluteOverlay}>
          <TouchableOpacity
            style={styles.sidebarBackdrop}
            activeOpacity={1}
            onPress={closeSidebar}
            accessibilityLabel='Close sidebar overlay'
          />
          <Animated.View
            style={[
              styles.sidebarAnimated,
              { transform: [{ translateX: sidebarAnim }] },
            ]}
            {...sidebarPan.current.panHandlers}
          >
            <SafeAreaView style={styles.sidebarSafeArea}>
              {/* HEADER */}
              <View style={styles.sidebarHeader}>
                <TouchableOpacity
                  style={styles.sidebarHeaderBack}
                  onPress={closeSidebar}
                  accessibilityLabel='Close sidebar'
                >
                  <Ionicons name='arrow-back' size={26} color='#333' />
                </TouchableOpacity>
                <Text style={styles.sidebarHeaderTitle}>Settings</Text>
              </View>

              {/* BODY */}
              <View style={styles.sidebarContentWrapper}>
                {/* Top Options */}
                <View style={styles.sidebarTopSection}>
                  {[
                    'Edit Profile',
                    'Manage Interests',
                    'Logout',
                    'Privacy and Info',
                  ].map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={styles.sidebarOption}
                      onPress={() => {
                        closeSidebar();
                        setTimeout(() => handleMenuOptionClick(option), 200);
                      }}
                    >
                      <Text style={styles.sidebarOptionText}>{option}</Text>
                    </TouchableOpacity>
                  ))}

                  {/* Moved analytics opt-in to Privacy and Info screen */}
                </View>
                <View style={{ flex: 1 }} />
                {/* Bottom Delete - moved to bottom */}
                <View style={styles.sidebarBottomSection}>
                  <TouchableOpacity
                    style={[styles.sidebarOption, styles.sidebarDeleteOption]}
                    onPress={() => {
                      closeSidebar();
                      setTimeout(
                        () => handleMenuOptionClick('Delete Account'),
                        200
                      );
                    }}
                  >
                    <Text
                      style={[
                        styles.sidebarOptionText,
                        styles.sidebarDeleteText,
                      ]}
                    >
                      Delete Account
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      )}

      {/* Event Actions Modal (Delete/Report) */}
      {modalVisible && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalOptionText}>Event Actions</Text>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={handleDeleteEvent}
            >
              <Text style={[styles.modalOptionText, { color: '#d11a2a' }]}>
                Delete Event
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={handleReportEvent}
            >
              <Text style={styles.modalOptionText}>Report Event</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalOptionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <LinearGradient
          colors={['#4DA0B0', 'coral']}
          style={styles.profileHeader}
        >
          <View style={styles.navBar}>
            <Text style={styles.navTitle}>Profile</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={handleShareProfile}
                style={{ marginRight: 16 }}
                accessibilityLabel='Share profile'
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name='share-social-outline' size={26} color='#fff' />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNotificationsPress}
                style={{ marginRight: 16 }}
                accessibilityLabel='Notifications'
              >
                <View>
                  <MaterialCommunityIcons
                    name='bell-outline'
                    size={28}
                    color='#fff'
                  />
                  {unreadCount > 0 && (
                    <View
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        backgroundColor: '#FF3B30',
                        borderRadius: 8,
                        minWidth: 16,
                        height: 16,
                        justifyContent: 'center',
                        alignItems: 'center',
                        paddingHorizontal: 3,
                        zIndex: 10,
                      }}
                    >
                      <Text
                        style={{
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 'bold',
                        }}
                      >
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={openSidebar}>
                <Ionicons name='menu' size={28} color='#fff' />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.avatarWrapper}>
            <TouchableOpacity onPress={isEditing ? handleImageUpload : null}>
              <Image
                source={{ uri: profileImage || avatarURL }}
                style={styles.profileImage}
              />
              {isEditing && (
                <View style={styles.imageOverlay}>
                  <Text style={styles.overlayText}>Change Photo</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={styles.name}>
              {fullName}
              {verified && (
                <MaterialIcons
                  name='verified'
                  size={20}
                  style={styles.verifiedBadgeAdjusted}
                />
              )}
            </Text>
          </View>
          <Text style={styles.stat}>
            {ratingCount === 0
              ? '☆☆☆☆☆ (Not yet rated)'
              : `${
                  '★'.repeat(Math.floor(rating)) +
                  '☆'.repeat(5 - Math.floor(rating))
                } (${ratingCount})`}
          </Text>
          <Text style={styles.since}>User since {userSince}</Text>
        </LinearGradient>
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statCard}>
            <Text style={styles.statValue}>{followerCount}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard}>
            <Text style={styles.statValue}>{eventCount}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </TouchableOpacity>
          <View style={styles.statCard}>
            <MaterialIcons name='star' size={28} color='#FFD700' />
            <Text style={styles.statLabel}>Badges</Text>
          </View>
        </View>
        {/* Bio */}
        <View style={styles.bioContainer}>
          <TextInput
            style={[styles.bioText, isEditing && styles.bioEditing]}
            value={bio}
            onChangeText={setBio}
            editable={isEditing}
            placeholder='Write your bio here...'
            multiline
          />
          {bio.length > MAX_BIO_LENGTH && !showFullBio && (
            <TouchableOpacity onPress={() => setShowFullBio(true)}>
              <Text style={styles.showMoreText}>Show More</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Edit & Save Buttons */}
        {isEditing && (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveChanges}
            >
              <MaterialIcons name='check' size={18} color='#fff' />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Events Timeline */}
        <View style={styles.timelineHeader}>
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                selectedTab === 'Timeline' && styles.tabButtonActive,
              ]}
              onPress={() => setSelectedTab('Timeline')}
              accessibilityLabel='Show timeline'
            >
              <Text
                style={[
                  styles.tabButtonText,
                  selectedTab === 'Timeline' && styles.tabButtonTextActive,
                ]}
              >
                Timeline
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                selectedTab === 'Current' && styles.tabButtonActive,
              ]}
              onPress={() => setSelectedTab('Current')}
              accessibilityLabel='Show current events'
            >
              <Text
                style={[
                  styles.tabButtonText,
                  selectedTab === 'Current' && styles.tabButtonTextActive,
                ]}
              >
                Current
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.timelineTitle}>
            {selectedTab === 'Current'
              ? 'Your Current Events'
              : 'Your Timeline'}
          </Text>
          {selectedTab === 'Current' && (
            <Text style={{ color: '#666', marginTop: 4 }}>
              Saved events coming soon
            </Text>
          )}
        </View>
        {loadingEvents ? (
          <Text style={{ textAlign: 'center', marginTop: 20 }}>
            Loading timeline...
          </Text>
        ) : (
          timelineItems.map((item) => {
            if (item.type === 'post') {
              return (
                <InterestPostCard
                  key={item.id}
                  post={item.post}
                  enableInlineComposer={false}
                  onPress={() =>
                    navigation.navigate('InterestPost', {
                      postId: item.post.id,
                      initialPost: item.post,
                    })
                  }
                  onDeleted={(postId) =>
                    setInterestPosts((prev) =>
                      prev.filter((post) => post.id !== postId)
                    )
                  }
                />
              );
            }

            const event = item.event;
            const now = new Date();
            const isPastEvent = event?.date?.seconds
              ? new Date(event.date.seconds * 1000) < now
              : false;
            const role = isPastEvent
              ? user?.createdEvents?.includes(event.id)
                ? 'Hosted'
                : 'Attended'
              : user?.createdEvents?.includes(event.id)
              ? 'Hosting'
              : 'Attending';

            return (
              <PostCard
                key={item.id}
                event={{
                  ...event,
                  role,
                  address: event?.address,
                  location: event?.location,
                  formattedDate: event?.formattedDate,
                }}
                onPress={(e, dest) =>
                  handleEventClick(e.id, {
                    source:
                      dest === 'EventChat'
                        ? 'EventChat'
                        : undefined,
                  })
                }
                onEllipsisPress={(e) => handleEllipsisClick(e)}
              />
            );
          })
        )}
      </ScrollView>
      {/* ActionModals for share, report, sign out */}
      <ActionModals modals={modals} setModals={setModals} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    position: 'relative',
  },

  sidebarHeaderBack: {
    position: 'absolute',
    left: 0, // Move arrow closer to the left edge
    top: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 20,
    zIndex: 1,
  },

  sidebarHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  sidebarContentWrapper: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 10, // ensures buttons don't overlap the back icon
  },

  sidebarTopSection: {
    gap: 8,
  },

  sidebarDeleteOption: {
    backgroundColor: '#fff0f0',
    borderColor: '#ffd6d6',
    borderWidth: 1,
    borderRadius: 10,
  },

  sidebarDeleteText: {
    color: '#d11a2a',
    fontWeight: '600',
  },
  sidebarAbsoluteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sidebarAnimated: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '90%',
    maxWidth: 300,
    height: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 30 : 60,
    paddingHorizontal: 16,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 1000,
  },
  safe: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, // Add padding for Android
  },
  scrollContent: { paddingBottom: 20 },
  profileHeader: {
    paddingBottom: 60,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 20,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
  },
  navTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  avatarWrapper: {
    alignSelf: 'center',
    marginTop: 10,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 15,
    padding: 3,
    backgroundColor: '#fff',
  },
  profileImage: { width: 120, height: 120, borderRadius: 15 },
  verifiedBadge: { position: 'absolute', bottom: 0, right: 0 },
  verifiedBadgeAdjusted: {
    position: 'absolute',
    bottom: 0,
    right: -10,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginTop: 6,
  },
  stat: { color: '#fff', fontSize: 15, textAlign: 'center', marginTop: 4 },
  since: { color: '#fff', fontSize: 13, textAlign: 'center', marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: -50,
    paddingHorizontal: 10,
  },
  statCard: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 3,
  },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 13, color: '#777', marginTop: 4 },
  bioContainer: {
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    elevation: 1,
  },
  bioText: { fontSize: 15, color: '#333' },
  bioEditing: { borderColor: '#ddd', borderWidth: 1, borderRadius: 8 },
  showMoreText: { color: '#007AFF', fontSize: 14, marginTop: 4 },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  editButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    gap: 6,
  },
  editButtonText: { color: '#fff', fontWeight: 'bold' },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#28a745',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    gap: 6,
  },
  saveButtonText: { color: '#fff', fontWeight: 'bold' },
  timelineHeader: { marginTop: 20, marginHorizontal: 16 },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#007AFF',
  },
  tabButtonText: {
    color: '#333',
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  timelineTitle: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    elevation: 2,
    position: 'relative',
  },
  eventImage: { width: 70, height: 70, borderRadius: 10, marginRight: 10 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  pill: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  pillText: { fontSize: 12, color: '#555' },
  eventLocation: { fontSize: 13, color: '#007AFF', marginTop: 2 },
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  modalOption: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  sidebarOverlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sidebarSafeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 40 : 80,
  },
  sidebarContentRight: {
    flex: 1,
  },
  sidebarCloseButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? StatusBar.currentHeight + 12 : 20,
    left: 0,
    padding: 0,
    zIndex: 10,
  },
  sidebarOption: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f9f9f9',
  },

  sidebarOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
  },
  overlayText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
