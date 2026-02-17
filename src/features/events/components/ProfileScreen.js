import React, {
  useState,
  useEffect,
  useCallback,
  memo,
  useRef,
  useMemo,
} from 'react';
import { Animated, Dimensions, PanResponder } from 'react-native';
import { useScrollToTop } from '@react-navigation/native';
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
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  auth,
  getUserData,
  updateUserData,
  switchToPersonalAccount,
  uploadProfileImage,
  db,
  reportContent,
  deleteEvent,
  deleteUserAccount,
} from '../../../services/firebase';
import { useUserStore } from '../../profile/stores/userStore';
import { useSessionRole } from '../../profile/stores/sessionRoleStore';
import { useMyEvents } from '../hooks/useMyEvents';
import * as ImagePicker from 'expo-image-picker';
import { pickAndCompressImage } from '../../../lib/imagePicker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  arrayRemove,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from '../../../services/firebase/firestoreCompat';
import PostCard from './PostCard';
import InterestPostCard from '../../interestPosts/components/InterestPostCard';
import { fetchInterestPostsByCreator } from '../../interestPosts/api/interestPostService';
import ActionModals from '../../profile/components/ActionModals';
import { shareProfile } from '../../../services/shareService';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { useUserSnippetStore } from '../../profile/stores/userSnippetStore';
import { trackReportContent } from '../../../lib/analytics';
import {
  getEventEndMs,
  getTimelineTimestamp,
  mergeUniqueEvents,
  toMillis,
} from '../utils/dateUtils';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
import VerificationModal from '../../profile/components/VerificationModal';
import logger from '../../../lib/logger';

// Extracted components (available for progressive migration)
// import ProfileSidebar from '../../profile/components/ProfileSidebar';
// import ProfileStatsCard from '../../profile/components/ProfileStatsCard';
// import ProfileTutorialOverlay from '../../profile/components/ProfileTutorialOverlay';

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

const removeEventById = (list = [], eventId) => {
  if (!Array.isArray(list) || !eventId)
    return Array.isArray(list) ? [...list] : [];
  return list.filter((event) => event?.id !== eventId);
};

const cloneEventsState = (events) => ({
  created: Array.isArray(events?.created) ? [...events.created] : [],
  attending: Array.isArray(events?.attending) ? [...events.attending] : [],
  attended: Array.isArray(events?.attended) ? [...events.attended] : [],
});

const getEventVersionToken = (event) => {
  if (!event) return '';
  const version =
    toMillis(event.updatedAt) ||
    toMillis(event.date) ||
    toMillis(event.startAt) ||
    toMillis(event.createdAt);
  return `${event.id || 'event'}:${version || 0}`;
};

const eventListsMatch = (left = [], right = []) => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i]?.id !== right[i]?.id) return false;
    if (getEventVersionToken(left[i]) !== getEventVersionToken(right[i]))
      return false;
  }
  return true;
};

export default function ProfileScreen({
  navigation,
  profileOverride = null,
  mode = 'user',
}) {
  // Description: Get current user from Zustand userStore
  const storeUser = useUserStore((state) => state.user);
  const user =
    profileOverride && storeUser
      ? { ...storeUser, ...profileOverride, uid: storeUser.uid }
      : storeUser;
  const myEvents = useMyEvents(user?.uid || '');
  const now = new Date();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  const setRole = useSessionRole((s) => s.setRole);
  const setNextConsumerRoute = useSessionRole((s) => s.setNextConsumerRoute);
  useEffect(() => {
    const parent = navigation?.getParent?.();
    if (!parent) return;
    const unsubscribe = parent.addListener('tabPress', (e) => {
      if (!navigation?.isFocused?.()) return;
      if (scrollRef.current?.scrollTo) {
        scrollRef.current.scrollTo({ y: 0, animated: true });
      }
    });
    return unsubscribe;
  }, [navigation]);

  // Description: Get theme mode and toggle function from theme store
  const themeMode = useThemeStore((state) => state.mode);
  const toggleTheme = useThemeStore((state) => state.toggleMode);

  const tutorialStorageKey = useMemo(() => {
    return user?.uid ? `profile_tutorial_seen_${user.uid}` : null;
  }, [user?.uid]);

  // Keep a stable reference to myEvents to avoid effect dependency loops
  const myEventsRef = useRef(myEvents);
  useEffect(() => {
    myEventsRef.current = myEvents;
  }, [myEvents]);

  // Ensure snippet fetcher from store
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);
  const hostCacheRef = useRef(new Map());
  const hasBusinessProfile = Boolean(user?.businessId);

  // --- Notification badge state ---
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (!user?.uid) return;
    // Listen for recipient notifications; compute unread locally to include docs without `read` field
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('recipientId', '==', user.uid),
    );

    let unsub = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        try {
          const activeUnread = snapshot.docs.filter((d) => {
            const data = d.data() || {};
            return data.isDeleted !== true && data.read !== true; // count undefined or false
          });
          setUnreadCount(activeUnread.length);
        } catch (e) {
          logger.warn('Notifications parse error:', e?.message || e);
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
        logger.warn('Notifications listener error:', error?.message || error);
      },
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

  useEffect(() => {
    if (!tutorialStorageKey) return;
    let isMounted = true;
    AsyncStorage.getItem(tutorialStorageKey)
      .then((value) => {
        if (isMounted && value !== 'true') {
          setShowProfileTutorial(true);
        }
      })
      .catch((err) => {
        logger.warn('Profile tutorial flag read failed:', err?.message || err);
        if (isMounted) setShowProfileTutorial(true);
      });
    return () => {
      isMounted = false;
    };
  }, [tutorialStorageKey]);

  useEffect(() => {
    if (tutorialStorageKey) return;
    setShowProfileTutorial(false);
    setMenuHighlightLayout(null);
    menuHighlightLatestRef.current = null;
  }, [tutorialStorageKey]);

  // Optimistically clear badge and mark unread as read
  const handleNotificationsPress = async () => {
    // Optimistic UI: clear badge immediately
    setUnreadCount(0);
    try {
      if (!user?.uid) {
        navigation.navigate('Notifications');
        return;
      }
      const q = query(
        collection(db, 'notifications'),
        where('recipientId', '==', user.uid),
      );
      const snap = await getDocs(q);
      if (snap?.size) {
        const batch = writeBatch(db);
        snap.docs.forEach((d) => {
          const data = d.data() || {};
          if (data.isDeleted !== true && data.read !== true) {
            batch.update(d.ref, { read: true, readAt: serverTimestamp() });
          }
        });
        await batch.commit();
      }
    } catch (e) {
      // Non-blocking; the Notifications screen will also mark as read via its store
      logger.warn('Failed to mark notifications as read:', e?.message || e);
    } finally {
      navigation.navigate('Notifications');
    }
  };

  const measureMenuButton = useCallback(() => {
    if (
      !menuButtonRef.current ||
      typeof menuButtonRef.current.measureInWindow !== 'function'
    ) {
      return;
    }
    menuButtonRef.current.measureInWindow((x, y, width, height) => {
      if (!width && !height) return;
      const layout = { x, y, width, height };
      menuHighlightLatestRef.current = layout;
      setMenuHighlightLayout(layout);
    });
  }, []);

  const handleMenuButtonLayout = useCallback(() => {
    requestAnimationFrame(() => measureMenuButton());
  }, [measureMenuButton]);

  const dismissProfileTutorial = useCallback(async () => {
    setShowProfileTutorial(false);
    setMenuHighlightLayout(null);
    menuHighlightLatestRef.current = null;
    if (!tutorialStorageKey) return;
    try {
      await AsyncStorage.setItem(tutorialStorageKey, 'true');
    } catch (err) {
      logger.warn('Profile tutorial flag write failed:', err?.message || err);
    }
  }, [tutorialStorageKey]);

  useEffect(() => {
    if (!showProfileTutorial) return;
    const timer = setTimeout(() => {
      measureMenuButton();
    }, 200);

    let attempts = 0;
    const retryInterval = setInterval(() => {
      if (menuHighlightLatestRef.current || attempts >= 5) {
        clearInterval(retryInterval);
        return;
      }
      attempts += 1;
      measureMenuButton();
    }, 220);

    let subscription;
    if (typeof Dimensions?.addEventListener === 'function') {
      subscription = Dimensions.addEventListener('change', measureMenuButton);
    }

    return () => {
      clearTimeout(timer);
      clearInterval(retryInterval);
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      } else if (typeof Dimensions?.removeEventListener === 'function') {
        Dimensions.removeEventListener('change', measureMenuButton);
      }
    };
  }, [measureMenuButton, showProfileTutorial]);

  const handleShareProfile = useCallback(async () => {
    if (!user?.uid) {
      Alert.alert(
        'Share unavailable',
        'You need to be signed in to share your profile.',
      );
      return;
    }

    try {
      await shareProfile(user, {
        surface: 'profile',
        source: 'profile_header',
      });
    } catch (err) {
      logger.warn('Profile share failed:', err?.message || err);
    }
  }, [user]);

  // --- Soft Delete Handler (with double confirmation) ---
  const handleDeleteAccount = async () => {
    if (!user?.uid) return;
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, profile, events, and messages. This action cannot be undone.\n\nAre you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingAccount(true);

              // Call cloud function to permanently delete account
              await deleteUserAccount();

              // Stop all Firestore listeners before clearing state
              // This prevents the AuthContext onSnapshot from racing
              // with the soft-deleted doc and re-setting user
              if (global.unsubscribeAllListeners) {
                global.unsubscribeAllListeners.forEach((unsub) => {
                  try { unsub(); } catch {}
                });
                global.unsubscribeAllListeners = [];
              }

              // Clear local state — AppNavigator will show AuthStack (welcome screen)
              setUser(null);

              // Sign out of Firebase Auth to clear cached auth state
              try {
                await auth().signOut();
              } catch (signOutErr) {
                // Auth user was already deleted server-side, signOut may fail - that's OK
                console.log('[ProfileScreen] SignOut after deletion:', signOutErr?.message);
              }

              // Show success message
              setTimeout(() => {
                Alert.alert(
                  'Account Deleted',
                  'Your account has been successfully deleted.',
                  [{ text: 'OK' }],
                );
              }, 600);
            } catch (err) {
              console.error('[ProfileScreen] Account deletion failed:', err);
              Alert.alert(
                'Deletion Failed',
                err?.message ||
                  'Failed to delete account. Please try again or contact support@findyourcircle.app',
              );
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  // --- State ---
  const [showFullBio, setShowFullBio] = useState(false);
  const MAX_BIO_LENGTH = 100;
  const [bio, setBio] = useState(user?.bio || '');
  const [profileImage, setProfileImage] = useState(user?.profileImage || null);
  const [isEditing, setIsEditing] = useState(false);
  const [ratingCount, setRatingCount] = useState(user?.ratingCount || 0);
  const [rating, setRating] = useState(user?.rating || 0);
  const [verified, setVerified] = useState(user?.verified || false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userEvents, setUserEvents] = useState({
    created: [],
    attending: [],
    attended: [],
  });
  const [interestPosts, setInterestPosts] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [groupEvents, setGroupEvents] = useState([]);
  const EVENTS_PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(EVENTS_PAGE_SIZE);
  // NEW: tab selection for Timeline vs Current
  const [selectedTab, setSelectedTab] = useState('Timeline');
  // Modal for event actions (delete/report)
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [showProfileTutorial, setShowProfileTutorial] = useState(false);
  const [menuHighlightLayout, setMenuHighlightLayout] = useState(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  // Add animated sidebar state/refs
  const sidebarPan = useRef(null);
  const sidebarAnim = useRef(
    new Animated.Value(Dimensions.get('window').width),
  ).current;
  const sidebarClosing = useRef(false);
  const menuButtonRef = useRef(null);
  const menuHighlightLatestRef = useRef(null);
  const optimisticallyRemovedIdsRef = useRef(new Set());

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
            Math.min(gestureState.dx, Dimensions.get('window').width),
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
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const avatarURL =
    user.profileImage ||
    user.avatarURL ||
    'https://example.com/default-avatar.png';

  // Description: Parse user join date with fallback handling
  const userSince = useMemo(() => {
    if (!user?.createdAt) {
      logger.debug(
        '[ProfileScreen] No createdAt found on user object:',
        user?.uid,
      );
      // Fallback to current month/year for newly created users
      const now = new Date();
      return now.toLocaleString('default', { month: 'short', year: 'numeric' });
    }

    logger.debug(
      '[ProfileScreen] createdAt value:',
      user.createdAt,
      'type:',
      typeof user.createdAt,
    );

    try {
      let date;
      // Handle Firestore Timestamp
      if (typeof user.createdAt.toDate === 'function') {
        date = user.createdAt.toDate();
      }
      // Handle Firestore Timestamp object with seconds
      else if (user.createdAt.seconds) {
        date = new Date(user.createdAt.seconds * 1000);
      }
      // Handle serialized timestamp with _seconds
      else if (user.createdAt._seconds) {
        date = new Date(user.createdAt._seconds * 1000);
      }
      // Handle plain Date object
      else if (user.createdAt instanceof Date) {
        date = user.createdAt;
      }
      // Handle ISO string
      else if (typeof user.createdAt === 'string') {
        date = new Date(user.createdAt);
      }
      // Handle timestamp-like object with _type marker - use current date as fallback
      else if (user.createdAt._type === 'timestamp') {
        logger.debug(
          '[ProfileScreen] createdAt is placeholder timestamp, using current date',
        );
        date = new Date();
      }

      if (date && !isNaN(date.getTime())) {
        const formatted = date.toLocaleString('default', {
          month: 'short',
          year: 'numeric',
        });
        logger.debug('[ProfileScreen] Formatted userSince:', formatted);
        return formatted;
      }
    } catch (e) {
      logger.warn('[ProfileScreen] Error parsing createdAt:', e);
    }

    // Final fallback
    const now = new Date();
    return now.toLocaleString('default', { month: 'short', year: 'numeric' });
  }, [user?.createdAt, user?.uid]);

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
          const { getUserEventsByIds } = require('../../../services/firebase');
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
              snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
            );
          }
          // Exclude soft-deleted
          return results.filter((e) => e.isDeleted !== true);
        } catch {
          // Fallback: filter from latest myEvents snapshot without re-triggering effects
          return (myEventsRef.current || []).filter(
            (ev) => ids.includes(ev.id) && ev.isDeleted !== true,
          );
        }
      };

      const [created, attending, attended] = await Promise.all([
        fetchEventsByIds(data.createdEvents || []),
        fetchEventsByIds(data.attendingEvents || []),
        fetchEventsByIds(data.attendedEvents || []),
      ]);

      setUserEvents({ created, attending, attended });

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
        setInterestPosts(
          timelinePosts.filter((post) => post?.isDeleted !== true),
        );
      } catch (err) {
        logger.warn('Failed to refresh interest posts', err);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [user?.uid]);

  // Description: Sync local state with user prop changes from store
  useEffect(() => {
    if (user) {
      setBio(user.bio || '');
      setProfileImage(user.profileImage || null);
      setRating(user.rating || 0);
      setRatingCount(user.ratingCount || 0);
      setVerified(user.verified || false);
    }
  }, [
    user?.uid,
    user?.bio,
    user?.profileImage,
    user?.rating,
    user?.ratingCount,
    user?.verified,
  ]);

  useEffect(() => {
    let isMounted = true;
    const fetchUserData = async () => {
      if (!user?.uid) return;
      const data = await getUserData(user.uid);
      if (!isMounted) return;

      logger.debug(
        '[ProfileScreen] Fetched user data createdAt:',
        data.createdAt,
      );

      setBio(data.bio || '');
      setProfileImage(data.profileImage || null);
      setRating(data.rating || 0);
      setRatingCount(data.ratingCount || 0);
      setVerified(data.verified || false);

      // Update the store with fresh data including proper timestamps
      if (data.createdAt) {
        setUser({ ...user, ...data });
      }
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
          const { getUserEventsByIds } = require('../../../services/firebase');
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
              snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
            );
          }
          // Exclude soft-deleted
          return results.filter((e) => e.isDeleted !== true);
        } catch {
          // Fallback: filter from latest myEvents snapshot without re-triggering effects
          return (myEventsRef.current || []).filter(
            (ev) => ids.includes(ev.id) && ev.isDeleted !== true,
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
            where('isDeleted', '==', false),
          ),
        ),
        getDocs(
          query(
            eventsRef,
            where('attendees', 'array-contains', user.uid),
            where('isDeleted', '==', false),
          ),
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
        logger.warn('Failed to load interest posts for profile timeline', err);
      }

      if (isMounted) setUserEvents({ created, attending, attended });
      if (isMounted)
        setInterestPosts(
          creatorPosts.filter((post) => post?.isDeleted !== true),
        );
      if (isMounted) setLoadingEvents(false);
    }
    fetchUserEvents();
    return () => {
      isMounted = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!Array.isArray(myEvents)) return;
    const hiddenIds = optimisticallyRemovedIdsRef.current;
    if (hiddenIds?.size) {
      hiddenIds.forEach((eventId) => {
        const stillExists = myEvents.some((event) => event?.id === eventId);
        if (!stillExists) hiddenIds.delete(eventId);
      });
    }
    const liveEvents = myEvents.filter(
      (event) => event?.id && !hiddenIds?.has(event.id),
    );
    const nextCreated = mergeUniqueEvents(liveEvents);
    setUserEvents((prev) => {
      if (eventListsMatch(prev.created, nextCreated)) return prev;
      return { ...prev, created: nextCreated };
    });
  }, [myEvents]);

  // ✅ Move these two lines UP, before the useEffect
  const allEvents = mergeUniqueEvents(
    userEvents.created,
    userEvents.attending,
    userEvents.attended,
    groupEvents,
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
    [visibleEvents],
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
        const cached = hostCacheRef.current.get(event.id);
        const fallbackHost =
          (event.ownerId && event.ownerId === user?.uid ? user : null) ||
          event.ownerSnapshot ||
          event.owner ||
          null;

        const deriveName = (host) => {
          if (!host) return null;
          const first = (host.firstName || host.givenName || '')
            .toString()
            .trim();
          const last = (host.lastName || host.familyName || '')
            .toString()
            .trim();
          const full = `${first} ${last}`.trim();
          return full || host.displayName || host.name || host.username || null;
        };

        const derivePhoto = (host) => {
          if (!host) return null;
          return (
            host.profileImage ||
            host.avatarURL ||
            host.photoURL ||
            host.avatar ||
            null
          );
        };

        const deriveRating = (host) => {
          if (!host) return null;
          if (typeof host.rating === 'number') return host.rating;
          if (typeof host.ranking === 'number') return host.ranking;
          if (typeof host.averageRating === 'number') return host.averageRating;
          return null;
        };

        const deriveVerification = (host) => {
          if (!host) return false;
          if (host.verified === true || host.isVerified === true) return true;
          if (host.verification?.status === 'verified') return true;
          return false;
        };

        const hostName =
          s?.name ||
          cached?.hostName ||
          deriveName(fallbackHost) ||
          event.ownerName ||
          'Unknown Host';
        const hostPhoto =
          s?.photoURL || cached?.hostPhoto || derivePhoto(fallbackHost) || null;
        const derivedRating = deriveRating(fallbackHost);
        const hostRating =
          typeof s?.rating === 'number'
            ? s.rating
            : typeof cached?.hostRating === 'number'
              ? cached.hostRating
              : typeof derivedRating === 'number'
                ? derivedRating
                : 0;
        const hostVerified =
          s?.verified === true ||
          cached?.hostVerified === true ||
          deriveVerification(fallbackHost);

        return {
          ...event,
          hostPhoto,
          hostRating,
          hostName,
          hostVerified,
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
        updated.forEach((evt) => {
          hostCacheRef.current.set(evt.id, {
            hostName: evt.hostName,
            hostPhoto: evt.hostPhoto,
            hostRating: evt.hostRating,
            hostVerified: evt.hostVerified,
          });
        });
        return updated;
      });
    };

    if (visibleEvents.length) {
      enhanceEventData();
    } else {
      setEnhancedEvents([]);
    }
    // Depend only on a stable key of the current slice to prevent infinite loops
  }, [visibleIdsKey, user]);

  // Helper function to format location
  const formatLocation = (location) => {
    if (!location) return 'Location not available';
    if (location.latitude && location.longitude) {
      return `Lat: ${location.latitude.toFixed(
        4,
      )}, Lng: ${location.longitude.toFixed(4)}`;
    }
    return 'Location not specified';
  };

  const tutorialHighlightStyle = useMemo(() => {
    if (!menuHighlightLayout) return null;
    const padding = 12;
    return {
      top: Math.max(menuHighlightLayout.y - padding, 0),
      left: Math.max(menuHighlightLayout.x - padding, 0),
      width: menuHighlightLayout.width + padding * 2,
      height: menuHighlightLayout.height + padding * 2,
    };
  }, [menuHighlightLayout]);

  const tutorialTooltipPosition = useMemo(() => {
    const windowSize = Dimensions.get('window');
    const tooltipWidth = 260;

    if (!menuHighlightLayout) {
      const centeredLeft = (windowSize.width - tooltipWidth) / 2;
      const safeLeft = Math.min(
        Math.max(centeredLeft, 16),
        windowSize.width - tooltipWidth - 16,
      );
      return {
        width: tooltipWidth,
        top: Math.min(windowSize.height * 0.25, windowSize.height - 180),
        left: safeLeft,
      };
    }

    const horizontalOrigin =
      menuHighlightLayout.x + menuHighlightLayout.width - tooltipWidth;
    const left = Math.min(
      Math.max(horizontalOrigin, 16),
      windowSize.width - tooltipWidth - 16,
    );
    const preferredTop =
      menuHighlightLayout.y + menuHighlightLayout.height + 18;
    const top = Math.min(preferredTop, windowSize.height - 180);
    return { top, left, width: tooltipWidth };
  }, [menuHighlightLayout]);

  const handleImageUpload = useCallback(async () => {
    if (!user?.uid) {
      Alert.alert(
        'Sign in required',
        'Please sign in again before updating your profile photo.',
      );
      return;
    }

    try {
      logger.debug('[ProfileScreen] Starting image upload');

      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Permission needed',
          'Photo library access is required to change your profile picture.',
        );
        return;
      }

      // Description: Use pickAndCompressImage which handles compression with PROFILE limits (5MB/1024px)
      const compressed = await pickAndCompressImage(
        { aspect: [1, 1] },
        'PROFILE',
      );

      if (!compressed) {
        logger.debug('[ProfileScreen] Image picker canceled');
        return;
      }

      logger.debug('[ProfileScreen] Image compressed, URI:', compressed.uri);

      logger.debug('[ProfileScreen] Uploading to Firebase Storage...');
      const newImage = await uploadProfileImage(user.uid, compressed.uri);
      logger.debug('[ProfileScreen] Upload successful, URL:', newImage);

      logger.debug('[ProfileScreen] Updating Firestore user document...');
      await updateUserData(user.uid, { profileImage: newImage });

      logger.debug('[ProfileScreen] Updating local state...');
      setProfileImage(newImage);
      setUser({ ...user, profileImage: newImage });

      // Clear snippet cache so event cards show the new profile image immediately
      const clearUserFromCache = useUserSnippetStore.getState().clearUser;
      if (clearUserFromCache) {
        clearUserFromCache(user.uid);
        logger.debug(
          '[ProfileScreen] Cleared user snippet cache for updated profile image',
        );
      }

      logger.debug('[ProfileScreen] Profile image update complete!');
      Alert.alert('Profile updated', 'Your profile photo was changed.');
    } catch (err) {
      console.error('[ProfileScreen] Profile image upload failed:', err);
      console.error('[ProfileScreen] Error code:', err?.code);
      console.error('[ProfileScreen] Error message:', err?.message);
      Alert.alert(
        'Upload failed',
        'Failed to update profile image. Please try again.',
      );
    }
  }, [user, setUser]);

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
      },
    )
      .then(() => Alert.alert('Report', 'Thanks for the report.'))
      .catch(() => Alert.alert('Report', 'Failed to submit report.'))
      .finally(() => setModalVisible(false));
  };

  // Add: implement delete handler referenced by modal
  const handleDeleteEvent = async () => {
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

    const eventId = selectedEvent.id;
    const previousEventsSnapshot = cloneEventsState(userEvents);
    const previousEnhancedSnapshot = Array.isArray(enhancedEvents)
      ? [...enhancedEvents]
      : [];
    const previousMyEventsSnapshot = Array.isArray(myEventsRef.current)
      ? [...myEventsRef.current]
      : null;
    const guardLiveEvents =
      Array.isArray(previousMyEventsSnapshot) &&
      previousMyEventsSnapshot.some((event) => event?.id === eventId);

    if (guardLiveEvents) {
      optimisticallyRemovedIdsRef.current.add(eventId);
    }

    setUserEvents((prev) => ({
      created: removeEventById(prev.created, eventId),
      attending: removeEventById(prev.attending, eventId),
      attended: removeEventById(prev.attended, eventId),
    }));
    setEnhancedEvents((prev) => removeEventById(prev, eventId));
    hostCacheRef.current.delete(eventId);
    if (previousMyEventsSnapshot) {
      myEventsRef.current = removeEventById(previousMyEventsSnapshot, eventId);
    }

    try {
      // Use callable to ensure transactional delete with proper validation
      await deleteEvent(eventId, user?.uid);

      if (user) {
        const filterIds = (list) =>
          Array.isArray(list) ? list.filter((id) => id !== eventId) : list;
        setUser({
          ...user,
          createdEvents: filterIds(user.createdEvents),
          attendingEvents: filterIds(user.attendingEvents),
          attendedEvents: filterIds(user.attendedEvents),
        });
      }

      Alert.alert('Deleted', 'Event has been deleted.');
    } catch (e) {
      setUserEvents(previousEventsSnapshot);
      setEnhancedEvents(previousEnhancedSnapshot);
      if (previousMyEventsSnapshot) {
        myEventsRef.current = previousMyEventsSnapshot;
      }
      if (guardLiveEvents) {
        optimisticallyRemovedIdsRef.current.delete(eventId);
      }
      Alert.alert('Error', 'Failed to delete event.');
    } finally {
      setSelectedEvent(null);
      setModalVisible(false);
    }
  };

  const switchToPersonal = async () => {
    try {
      setRole('consumer');
      setNextConsumerRoute('Profile');
    } catch {}
    if (!user?.uid) return;
    try {
      await switchToPersonalAccount();
    } catch (err) {
      console.warn('[profile] Failed to switch account type', err);
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
      case 'Account Type':
        navigation.navigate('AccountType');
        break;
      case 'Switch to Business':
        // For users who already have a business, just switch the session role
        setRole('business');
        setNextConsumerRoute('Profile');
        break;
      case 'Switch to personal':
        switchToPersonal();
        break;
      case 'Light Mode':
      case 'Dark Mode':
        try {
          toggleTheme();
        } catch {}
        break;
      case 'Privacy and Info':
        navigation.navigate('PrivacyInfo');
        break;
      case 'Get Verified':
        setShowVerificationModal(true);
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
      if (!eventSnapshot.exists) {
        Alert.alert('Event not found', 'This event no longer exists.');
        return;
      }
      const eventData = eventSnapshot.data();

      if (eventData.isDeleted === true) {
        Alert.alert(
          'Event archived',
          'This event has been archived and is no longer interactive.',
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
          'You must be the host or an attendee to view this chat.',
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
      <StatusBar
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      {showProfileTutorial && (
        <View style={styles.tutorialOverlay} pointerEvents='auto'>
          <View style={styles.tutorialBackdrop} />
          {tutorialHighlightStyle && (
            <View
              pointerEvents='none'
              style={[styles.tutorialHighlight, tutorialHighlightStyle]}
            />
          )}
          {tutorialTooltipPosition && (
            <View
              style={[styles.tutorialTooltip, tutorialTooltipPosition]}
              accessibilityLabel='Profile tutorial tooltip'
            >
              <Text style={styles.tutorialTitle}>Profile menu</Text>
              <Text style={styles.tutorialDescription}>
                Open the menu to add a profile photo, edit your bio, and manage
                your account details.
              </Text>
              <TouchableOpacity
                style={styles.tutorialButton}
                onPress={dismissProfileTutorial}
                accessibilityRole='button'
                accessibilityLabel='Got it, close profile tutorial'
              >
                <Text style={styles.tutorialButtonText}>Got it</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
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
              {
                transform: [{ translateX: sidebarAnim }],
                backgroundColor: theme.colors.card,
              },
            ]}
            {...sidebarPan.current.panHandlers}
          >
            <SafeAreaView style={styles.sidebarSafeArea}>
              {/* HEADER */}
              <View
                style={[
                  styles.sidebarHeader,
                  { borderBottomColor: theme.colors.border },
                ]}
              >
                <TouchableOpacity
                  style={styles.sidebarHeaderBack}
                  onPress={closeSidebar}
                  accessibilityLabel='Close sidebar'
                >
                  <Ionicons
                    name='arrow-back'
                    size={26}
                    color={theme.colors.text}
                  />
                </TouchableOpacity>
                <Text
                  style={[
                    styles.sidebarHeaderTitle,
                    { color: theme.colors.text },
                  ]}
                >
                  Settings
                </Text>
              </View>

              {/* BODY */}
              <View style={styles.sidebarContentWrapper}>
                {/* Top Options */}
                <View style={styles.sidebarTopSection}>
                  {(mode === 'business'
                    ? ['Switch to personal', 'Logout', 'Privacy and Info']
                    : [
                        'Edit Profile',
                        'Manage Interests',
                        // Show switch when user already has a business profile; otherwise fall back to Account Type (dev-only)
                        ...(hasBusinessProfile
                          ? ['Switch to Business']
                          : __DEV__
                            ? ['Account Type']
                            : []),
                        'Logout',
                        'Privacy and Info',
                      ]
                  ).map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.sidebarOption,
                        {
                          backgroundColor: theme.colors.backgroundSecondary,
                          borderBottomColor: theme.colors.border,
                        },
                      ]}
                      onPress={() => {
                        closeSidebar();
                        setTimeout(() => handleMenuOptionClick(option), 200);
                      }}
                    >
                      <Text
                        style={[
                          styles.sidebarOptionText,
                          { color: theme.colors.text },
                        ]}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  {/* Get Verified Button - Show only if not already verified */}
                  {!verified && mode !== 'business' && (
                    <TouchableOpacity
                      style={[
                        styles.sidebarOption,
                        {
                          backgroundColor: theme.colors.backgroundSecondary,
                          borderBottomColor: theme.colors.border,
                        },
                      ]}
                      onPress={() => {
                        closeSidebar();
                        setTimeout(
                          () => handleMenuOptionClick('Get Verified'),
                          200,
                        );
                      }}
                    >
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center' }}
                      >
                        <Text
                          style={[
                            styles.sidebarOptionText,
                            { color: theme.colors.text },
                          ]}
                        >
                          Get Verified
                        </Text>
                        <Ionicons
                          name='checkmark-circle'
                          size={18}
                          color={theme.colors.primary}
                          style={{ marginLeft: 8 }}
                        />
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Dark Mode Toggle */}
                  <View
                    style={[
                      styles.sidebarOptionWithSwitch,
                      {
                        backgroundColor: theme.colors.backgroundSecondary,
                        borderBottomColor: theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sidebarOptionText,
                        { color: theme.colors.text },
                      ]}
                    >
                      Dark Mode
                    </Text>
                    <Switch
                      value={themeMode === 'dark'}
                      onValueChange={toggleTheme}
                      trackColor={{ false: '#767577', true: '#34C759' }}
                      thumbColor='#FFFFFF'
                    />
                  </View>

                  {/* Moved analytics opt-in to Privacy and Info screen */}
                </View>
                <View style={{ flex: 1 }} />
                {/* Bottom Delete - moved to bottom */}
                {mode !== 'business' && (
                  <View style={styles.sidebarBottomSection}>
                    <TouchableOpacity
                      style={[
                        styles.sidebarOption,
                        styles.sidebarDeleteOption,
                        {
                          backgroundColor: theme.colors.backgroundSecondary,
                          borderBottomColor: theme.colors.border,
                        },
                      ]}
                      onPress={() => {
                        closeSidebar();
                        setTimeout(
                          () => handleMenuOptionClick('Delete Account'),
                          200,
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
                )}
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
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            title=''
          />
        }
      >
        {/* Header */}
        <LinearGradient
          colors={['#ff6b6b', '#4dabf7']}
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
              <View
                ref={menuButtonRef}
                onLayout={handleMenuButtonLayout}
                collapsable={false}
              >
                <TouchableOpacity onPress={openSidebar}>
                  <Ionicons name='menu' size={28} color='#fff' />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <View style={styles.avatarWrapper}>
            <TouchableOpacity onPress={handleImageUpload}>
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
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <MaterialIcons name='star' size={20} color='#FFD700' />
              <Text style={styles.statValue}>
                {rating > 0 ? rating.toFixed(1) : '0'}
              </Text>
            </View>
            <Text style={styles.statLabel}>
              {ratingCount > 0
                ? `${ratingCount} rating${ratingCount !== 1 ? 's' : ''}`
                : 'No ratings'}
            </Text>
          </View>
        </View>
        {/* Bio */}
        <View style={styles.bioSection}>
          <View style={styles.bioCard}>
            <TextInput
              style={[
                styles.bioInput,
                isEditing && styles.bioInputEditing,
                { color: theme.colors.text },
              ]}
              value={bio}
              onChangeText={setBio}
              editable={isEditing}
              placeholder='Share a bit about yourself...'
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              maxLength={300}
              textAlignVertical='top'
              keyboardAppearance={themeMode === 'dark' ? 'dark' : 'light'}
            />
            {isEditing && (
              <Text style={styles.bioCharCount}>
                {bio.length}/300 characters
              </Text>
            )}
            {bio.length > MAX_BIO_LENGTH && !showFullBio && !isEditing && (
              <TouchableOpacity onPress={() => setShowFullBio(true)}>
                <Text style={styles.showMoreText}>Read More</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Edit & Save Buttons */}
          {isEditing && (
            <TouchableOpacity
              style={styles.saveButtonModern}
              onPress={handleSaveChanges}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#10b981', '#059669']}
                style={styles.saveButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.saveButtonTextModern}>Save Changes</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
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
          {selectedTab === 'Current'}
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
                      prev.filter((post) => post.id !== postId),
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
                    source: dest === 'EventChat' ? 'EventChat' : undefined,
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

      {/* Verification Modal */}
      <VerificationModal
        isVisible={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        onSuccess={() => {
          // Update local verified state immediately
          setVerified(true);
          // Refresh user data from Firestore to get verifiedAt timestamp and update Zustand store
          if (user?.uid) {
            getUserData(user.uid)
              .then((userData) => {
                if (userData?.verified) {
                  setVerified(true);
                  // Update the Zustand store with fresh user data
                  useUserStore.setState({
                    user: { ...user, ...userData },
                  });
                }
              })
              .catch((err) => logger.warn('Failed to refresh user data:', err));
          }
        }}
      />
    </SafeAreaView>
  );
}

// Description: Create theme-aware styles for ProfileScreen
const createStyles = (theme) =>
  StyleSheet.create({
    sidebarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      position: 'relative',
    },

    sidebarHeaderBack: {
      position: 'absolute',
      left: 0,
      top: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 20,
      zIndex: 1,
    },

    sidebarHeaderTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    sidebarContentWrapper: {
      flex: 1,
      justifyContent: 'space-between',
      paddingTop: 10,
    },

    sidebarTopSection: {
      gap: 8,
    },

    sidebarDeleteOption: {
      backgroundColor: theme.isDark ? 'rgba(239,68,68,0.15)' : '#fff0f0',
      borderColor: theme.isDark ? 'rgba(239,68,68,0.3)' : '#ffd6d6',
      borderWidth: 1,
      borderRadius: 10,
    },

    sidebarDeleteText: {
      color: theme.isDark ? '#F87171' : '#d11a2a',
      fontWeight: '600',
    },
    sidebarAbsoluteOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 999,
      backgroundColor: theme.colors.overlay,
      justifyContent: 'flex-end',
      alignItems: 'flex-end',
    },
    sidebarBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.overlay,
    },
    sidebarAnimated: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: '90%',
      maxWidth: 300,
      height: '100%',
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: 24,
      borderBottomLeftRadius: 24,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 30 : 60,
      paddingHorizontal: 16,
      paddingBottom: 40,
      shadowColor: '#000',
      shadowOffset: { width: -4, height: 0 },
      shadowOpacity: theme.isDark ? 0.5 : 0.15,
      shadowRadius: 20,
      elevation: 12,
      zIndex: 1000,
    },
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    tutorialOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1000,
    },
    tutorialBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    tutorialHighlight: {
      position: 'absolute',
      borderRadius: 24,
      borderWidth: 2,
      borderColor: '#ffffff',
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    tutorialTooltip: {
      position: 'absolute',
      padding: 16,
      borderRadius: 12,
      backgroundColor: '#101824',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 10,
    },
    tutorialTitle: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 6,
    },
    tutorialDescription: {
      color: '#e5edff',
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 14,
    },
    tutorialButton: {
      alignSelf: 'flex-start',
      backgroundColor: '#3A7BFF',
      paddingVertical: 8,
      paddingHorizontal: 18,
      borderRadius: 20,
    },
    tutorialButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
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
      backgroundColor: theme.colors.card,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      alignItems: 'center',
      elevation: 3,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.1,
      shadowRadius: 4,
    },
    statValue: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
    statLabel: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    bioSection: {
      marginTop: 20,
      marginHorizontal: 16,
      gap: 12,
    },
    bioCard: {
      backgroundColor: theme.colors.card,
      padding: 16,
      borderRadius: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.isDark ? 0.4 : 0.08,
      shadowRadius: 8,
      elevation: 4,
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    },
    bioInput: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.text,
      minHeight: 80,
      padding: 12,
      borderRadius: 10,
      backgroundColor: theme.isDark
        ? 'rgba(255,255,255,0.03)'
        : 'rgba(0,0,0,0.02)',
    },
    bioInputEditing: {
      borderWidth: 2,
      borderColor: theme.colors.primary,
      backgroundColor: theme.isDark
        ? 'rgba(59,130,246,0.08)'
        : 'rgba(59,130,246,0.04)',
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 2,
    },
    bioCharCount: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textAlign: 'right',
      marginTop: 6,
      fontWeight: '500',
    },
    saveButtonModern: {
      borderRadius: 14,
      overflow: 'hidden',
      shadowColor: '#10b981',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    saveButtonGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      paddingHorizontal: 24,
      gap: 8,
    },
    saveButtonTextModern: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    bioContainer: {
      backgroundColor: theme.colors.card,
      marginTop: 16,
      marginHorizontal: 16,
      padding: 12,
      borderRadius: 10,
      elevation: 1,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.05,
      shadowRadius: 4,
    },
    bioText: { fontSize: 15, color: theme.colors.text },
    bioEditing: {
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
    },
    showMoreText: {
      color: theme.colors.primary,
      fontSize: 14,
      marginTop: 8,
      fontWeight: '600',
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 16,
    },
    editButton: {
      flexDirection: 'row',
      backgroundColor: theme.colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 25,
      alignItems: 'center',
      gap: 6,
    },
    editButtonText: { color: '#fff', fontWeight: 'bold' },
    saveButton: {
      flexDirection: 'row',
      backgroundColor: theme.colors.success,
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
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: 16,
      alignItems: 'center',
    },
    tabButtonActive: {
      backgroundColor: theme.colors.primary,
    },
    tabButtonText: {
      color: theme.colors.text,
      fontWeight: '600',
    },
    tabButtonTextActive: {
      color: '#fff',
    },
    timelineTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    eventCard: {
      flexDirection: 'row',
      backgroundColor: theme.colors.card,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 12,
      padding: 12,
      elevation: 2,
      position: 'relative',
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.05,
      shadowRadius: 4,
    },
    eventImage: {
      width: 70,
      height: 70,
      borderRadius: 10,
      marginRight: 10,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    eventInfo: { flex: 1 },
    eventTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 6,
      color: theme.colors.text,
    },
    pillRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    pill: {
      backgroundColor: theme.colors.backgroundSecondary,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    pillText: { fontSize: 12, color: theme.colors.textSecondary },
    eventLocation: { fontSize: 13, color: theme.colors.primary, marginTop: 2 },
    ellipsisButtonAbsolute: {
      position: 'absolute',
      top: 8,
      right: 8,
      zIndex: 10,
      padding: 5,
    },
    ellipsisText: {
      fontSize: 20,
      color: theme.colors.textSecondary,
      fontWeight: 'bold',
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay,
    },
    modalContent: {
      backgroundColor: theme.colors.card,
      padding: 20,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
    },
    modalOption: {
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    modalOptionText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    sidebarOverlay: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay,
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
      borderBottomColor: theme.colors.border,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    sidebarOptionWithSwitch: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor: theme.colors.backgroundSecondary,
    },

    sidebarOptionText: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.colors.text,
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
