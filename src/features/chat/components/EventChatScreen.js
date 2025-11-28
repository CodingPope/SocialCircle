import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Linking,
  ScrollView,
  Alert,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import Modal from 'react-native-modal';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  getDoc,
  updateDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
  writeBatch,
  serverTimestamp,
  getDocs,
  where,
  Timestamp,
} from '../../../services/firebase/firestoreCompat';
import { functions } from '../../../services/firebase/config';
import { geohashForLocation } from 'geofire-common';
import {
  db,
  auth,
  sendNotification,
  updateEventCount,
  deleteEvent, // import soft-delete helper
} from '../../../services/firebase/config';
import smileDefault from '../../../../assets/smileDefault.png';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReportModal from '../../events/components/ReportModal'; // Import reusable modal component
import {
  track as trackClient,
  trackReportContent,
} from '../../../lib/analytics';
import { navigateToOtherUserProfile } from '../../../navigation/RootNavigation';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { shareEventDetails } from '../../events/utils/shareUtils';
import { addSocialCircleEventToCalendar } from '../../../services/calendarService';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';

// --- Date/Time editing constraints (mirror CreateEventScreen) ---
const MIN_LEAD_MINUTES = 30;
const MAX_LEAD_DAYS = 7;
const MINUTE_INCREMENT = 5;
const MIN_MILLIS = MIN_LEAD_MINUTES * 60 * 1000;
const MAX_MILLIS = MAX_LEAD_DAYS * 24 * 60 * 60 * 1000;

const roundUpToMinuteIncrement = (inputDate) => {
  const date = new Date(inputDate);
  date.setSeconds(0);
  date.setMilliseconds(0);
  if (!MINUTE_INCREMENT || MINUTE_INCREMENT < 1) return date;
  const minutes = date.getMinutes();
  const remainder = minutes % MINUTE_INCREMENT;
  if (remainder !== 0) {
    date.setMinutes(minutes + (MINUTE_INCREMENT - remainder));
  }
  return date;
};

const getEditDateBounds = () => {
  const now = new Date();
  return {
    min: new Date(now.getTime() + MIN_MILLIS),
    max: new Date(now.getTime() + MAX_MILLIS),
  };
};

const coerceDateWithinBounds = (rawDate) => {
  if (!rawDate) return null;
  const { min, max } = getEditDateBounds();
  const rounded = roundUpToMinuteIncrement(rawDate);
  if (rounded < min) return roundUpToMinuteIncrement(min);
  if (rounded > max) return roundUpToMinuteIncrement(max);
  return rounded;
};

const isWithinDateBounds = (candidate) => {
  if (!(candidate instanceof Date)) return false;
  const { min, max } = getEditDateBounds();
  return candidate >= min && candidate <= max;
};

const EventChatScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);
  const datePickerThemeVariant = theme.isDark ? 'dark' : 'light';
  const datePickerTextColor = theme.isDark ? '#fff' : '#000';
  const editDateBounds = getEditDateBounds();
  // Make route params defensive & provide default
  const {
    eventId,
    locationName: locationNameParam = null,
    joinIntent = null,
    joinGraceMs: joinGraceFromParams,
  } = route.params || {};
  const joinGraceDurationMsRaw =
    typeof joinGraceFromParams === 'number' ? joinGraceFromParams : 8000;
  const joinGraceDurationMs = Math.max(0, joinGraceDurationMsRaw);
  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [hostUser, setHostUser] = useState(null);
  const [requesters, setRequesters] = useState([]); // Add state for requesters
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [editLocation, setEditLocation] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState(null);
  const [isEditDatePickerVisible, setIsEditDatePickerVisible] =
    useState(false);
  const [editDateDraft, setEditDateDraft] = useState(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [editPlaceDetails, setEditPlaceDetails] = useState(null);
  const [editLocationCoords, setEditLocationCoords] = useState(null);
  const flatListRef = useRef(null);
  const [pinned, setPinned] = useState(null);
  const [pinnedEditorVisible, setPinnedEditorVisible] = useState(false);
  const [pinnedDraft, setPinnedDraft] = useState('');
  const [pinnedSaving, setPinnedSaving] = useState(false);
  const [leaveInProgress, setLeaveInProgress] = useState(false);
  const [hasShownAccessAlert, setHasShownAccessAlert] = useState(false);
  const [joinGraceActive, setJoinGraceActive] = useState(() => !!joinIntent);
  const sidebarScrollRef = useRef(null);
  const [sidebarScrollOffset, setSidebarScrollOffset] = useState(0);
  const [sidebarContentHeight, setSidebarContentHeight] = useState(0);
  const [sidebarContainerHeight, setSidebarContainerHeight] = useState(0);
  const sidebarScrollOffsetMax = useMemo(() => {
    if (sidebarContentHeight <= sidebarContainerHeight) return 0;
    return Math.max(sidebarContentHeight - sidebarContainerHeight, 0);
  }, [sidebarContentHeight, sidebarContainerHeight]);

  // Track listener unsubscribes so we can stop them immediately on leave
  const eventUnsubRef = useRef(null);
  const messagesUnsubRef = useRef(null);

  // --- Read-only / archived checks ---
  const isSoftDeleted = event?.isDeleted === true;

  // Helper to get event end time in ms: prefer endAt, fallback to date + 1h
  const getEventEndMs = (ev) => {
    if (!ev) return null;
    let endMs = null;
    if (ev.endAt) {
      if (ev.endAt.toDate) endMs = ev.endAt.toDate().getTime();
      else if (typeof ev.endAt.seconds === 'number')
        endMs = ev.endAt.seconds * 1000;
    } else if (ev.date) {
      if (ev.date.toDate) endMs = ev.date.toDate().getTime();
      else if (typeof ev.date.seconds === 'number')
        endMs = ev.date.seconds * 1000;
      else if (ev.date instanceof Date) endMs = ev.date.getTime();
      // Fallback duration = 1 hour when only start date exists
      if (endMs) endMs += 60 * 60 * 1000;
    }
    return endMs;
  };

  const toDateOrNull = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value.seconds === 'number')
      return new Date(value.seconds * 1000);
    if (typeof value === 'number') return new Date(value);
    return null;
  };

  const formatEventDate = (value) => {
    const dateObj = toDateOrNull(value);
    return dateObj
      ? dateObj.toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Date not specified';
  };

  const endMs = getEventEndMs(event);
  const nowMs = Date.now();
  const ended = !!endMs && nowMs >= endMs; // event time has passed
  const archived = !!endMs && nowMs >= endMs + 3 * 24 * 60 * 60 * 1000; // 3 days after end
  const readOnly = isSoftDeleted || archived; // Chat write disabled when archived or soft-deleted

  const pinnedUpdatedAtLabel = useMemo(() => {
    if (!pinned || !pinned.updatedAt) return null;
    try {
      const date =
        typeof pinned.updatedAt.toDate === 'function'
          ? pinned.updatedAt.toDate()
          : new Date(pinned.updatedAt);
      if (!date || Number.isNaN(date.getTime())) return null;
      return date.toLocaleString();
    } catch (err) {
      return null;
    }
  }, [pinned?.updatedAt]);

  const pinnedDraftTrimmed = pinnedDraft.trim();
  const pinnedActionLabel =
    pinnedDraftTrimmed.length > 0 ? 'Save' : pinned?.text ? 'Clear' : 'Save';
  const canSubmitPinned = pinnedDraftTrimmed.length > 0 || !!pinned?.text;

  const handleSidebarScrollTo = useCallback((params) => {
    if (!sidebarScrollRef.current) return;
    sidebarScrollRef.current.scrollTo(params);
  }, []);

  const handleSidebarScroll = useCallback((event) => {
    const nextOffset = event?.nativeEvent?.contentOffset?.y ?? 0;
    setSidebarScrollOffset(nextOffset);
  }, []);

  const handleSidebarLayout = useCallback(({ nativeEvent }) => {
    const nextHeight = nativeEvent?.layout?.height ?? 0;
    setSidebarContainerHeight((prev) =>
      Math.abs(prev - nextHeight) > 0.5 ? nextHeight : prev
    );
  }, []);

  const handleSidebarContentSizeChange = useCallback((_, height) => {
    setSidebarContentHeight((prev) =>
      Math.abs(prev - height) > 0.5 ? height : prev
    );
  }, []);

  useEffect(() => {
    if (!joinGraceActive) return;
    const timeout = setTimeout(
      () => setJoinGraceActive(false),
      joinGraceDurationMs
    );
    return () => clearTimeout(timeout);
  }, [joinGraceActive, joinGraceDurationMs]);

  // Helper: Resolve best location label (expanded with more fallbacks & lat/lng variants)
  const getLocationLabel = (ev = event) => {
    if (!ev) return 'Location not available';

    // 1. Navigation param (if meaningful)
    if (
      locationNameParam &&
      !/Fetching address|Address not available|Location not specified|Unknown address/i.test(
        locationNameParam
      )
    ) {
      return locationNameParam;
    }

    // 2. Direct fields commonly used
    if (ev.locationName && typeof ev.locationName === 'string')
      return ev.locationName;
    if (ev.address && /[a-zA-Z0-9]/.test(ev.address)) return ev.address;

    // 3. Nested location object variations
    const loc = ev.location;
    if (loc) {
      if (typeof loc === 'string' && /[a-zA-Z0-9]/.test(loc)) return loc;
      if (loc.address && /[a-zA-Z0-9]/.test(loc.address)) return loc.address;
      if (loc.name && /[a-zA-Z0-9]/.test(loc.name)) return loc.name;
      if (loc.label && /[a-zA-Z0-9]/.test(loc.label)) return loc.label;

      // Geo point variants
      const lat = loc.latitude || loc.lat || loc._lat;
      const lng = loc.longitude || loc.lng || loc._long || loc.lon;
      if (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        !Number.isNaN(lat) &&
        !Number.isNaN(lng)
      ) {
        return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    }

    // 4. Any legacy field
    if (ev.city && ev.state) return `${ev.city}, ${ev.state}`;
    if (ev.city) return ev.city;

    return 'Location not available';
  };

  const [resolvedLocationLabel, setResolvedLocationLabel] = useState(
    'Location not available'
  );

  // Recompute when event or param changes
  useEffect(() => {
    const label = getLocationLabel();
    setResolvedLocationLabel((prev) => (prev === label ? prev : label));
  }, [
    event?.id,
    event?.address,
    event?.locationName,
    event?.location,
    locationNameParam,
  ]);

  // Debug (remove in production)
  useEffect(() => {
    if (event) {
      // console.log('[EventChat] Event location debug:', { ... })
      trackClient('chat_event_loaded', { event_id: eventId });
    }
  }, [
    event?.id,
    event?.address,
    event?.locationName,
    locationNameParam,
    eventId,
  ]);

  useEffect(() => {
    if (!isModalVisible) {
      setIsEditingEvent(false);
      setIsEditDatePickerVisible(false);
      setEditDateDraft(null);
      setIsSavingEvent(false);
      setEditLocation('');
      setEditDescription('');
      setEditDate(null);
      setEditLocationCoords(null);
      setEditPlaceDetails(null);
    }
  }, [isModalVisible]);

  // Helper: map attendeeSnippets -> UI attendee shape
  const mapSnippetsToAttendees = (snippets) => {
    const arr = Array.isArray(snippets)
      ? snippets
      : Object.values(snippets || {});
    return arr
      .filter((s) => s && s.uid)
      .map((s) => ({
        id: s.uid,
        displayName: s.name || 'User',
        photoURL: s.photoURL || null,
        rating: typeof s.rating === 'number' ? s.rating : null,
      }));
  };

  // Helper: batch fetch minimal user fields for a list of uids (chunks of 10)
  const batchFetchUsersAsAttendees = async (uids) => {
    if (!Array.isArray(uids) || !uids.length) return [];
    const chunks = [];
    for (let i = 0; i < uids.length; i += 10)
      chunks.push(uids.slice(i, i + 10));
    const results = [];
    for (const chunk of chunks) {
      try {
        const q = query(
          collection(db, 'users'),
          where('__name__', 'in', chunk)
        );
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const u = d.data() || {};
          results.push({
            id: d.id,
            displayName:
              u.displayName ||
              `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
              'User',
            photoURL: u.photoURL || u.profileImage || u.avatarURL || null,
            rating:
              typeof u.rating === 'number'
                ? u.rating
                : typeof u.ranking === 'number'
                ? u.ranking
                : null,
          });
        });
      } catch (e) {
        console.warn(
          '[EventChat] batch user fetch failed chunk, falling back',
          e?.message || e
        );
        // Fallback to individual gets for this chunk to avoid dropping users
        const individuals = await Promise.all(
          chunk.map(async (uid) => {
            try {
              const snap = await getDoc(doc(db, 'users', uid));
              const u = snap.exists ? snap.data() : {};
              return {
                id: uid,
                displayName:
                  u.displayName ||
                  `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
                  'User',
                photoURL: u.photoURL || u.profileImage || u.avatarURL || null,
                rating:
                  typeof u.rating === 'number'
                    ? u.rating
                    : typeof u.ranking === 'number'
                    ? u.ranking
                    : null,
              };
            } catch (err) {
              return {
                id: uid,
                displayName: 'User',
                photoURL: null,
                rating: null,
              };
            }
          })
        );
        results.push(...individuals);
      }
    }
    return results;
  };

  // Fetch event info + attendees
  useEffect(() => {
    if (!auth().currentUser) return;

    const unsub = onSnapshot(
      doc(db, 'events', eventId),
      async (snap) => {
        if (!snap.exists) {
          setEvent(null);
          setAttendees([]);
          return;
        }

        const data = snap.data() || {};
        const nextEvent = { id: snap.id, ...data };

        setEvent((prev) => {
          if (
            prev &&
            prev.updatedAt?.seconds === nextEvent.updatedAt?.seconds &&
            prev.attendees?.length === nextEvent.attendees?.length
          ) {
            return prev;
          }
          return nextEvent;
        });

        // Prefer denormalized attendeeSnippets, fallback to batched user fetch
        try {
          if (
            data?.attendeeSnippets &&
            (Array.isArray(data.attendeeSnippets) ||
              typeof data.attendeeSnippets === 'object')
          ) {
            const mapped = mapSnippetsToAttendees(data.attendeeSnippets);
            setAttendees((prev) => {
              const same = prev.length === mapped.length;
              return same ? prev : mapped;
            });
          } else if (Array.isArray(data?.attendees) && data.attendees.length) {
            const attendeeData = await batchFetchUsersAsAttendees(
              data.attendees
            );
            setAttendees((prev) => {
              const same = prev.length === attendeeData.length;
              return same ? prev : attendeeData;
            });
          } else {
            setAttendees([]);
          }
        } catch (e) {
          console.error('[EventChat] attendee hydrate error', e);
          // Last-resort: previous per-uid approach (kept for safety)
          if (Array.isArray(data?.attendees) && data.attendees.length) {
            const attendeePromises = data.attendees.map(async (uid) => {
              const userDoc = await getDoc(doc(db, 'users', uid));
              const userData = userDoc.exists ? userDoc.data() : {};
              return {
                id: uid,
                displayName:
                  userData.displayName ||
                  `${userData.firstName || ''} ${
                    userData.lastName || ''
                  }`.trim() ||
                  'User',
                photoURL:
                  userData.photoURL ||
                  userData.profileImage ||
                  userData.avatarURL ||
                  null,
                rating:
                  typeof userData.rating === 'number'
                    ? userData.rating
                    : typeof userData.ranking === 'number'
                    ? userData.ranking
                    : null,
              };
            });
            const attendeeData = await Promise.all(attendeePromises);
            setAttendees(attendeeData);
          } else {
            setAttendees([]);
          }
        }
      },
      (error) => {
        if (error?.code === 'permission-denied') {
          setEvent(null);
          setAttendees([]);
          return;
        }
        console.error('Event listener error:', error);
      }
    );

    // Save unsub refs for immediate cleanup (leave flow)
    eventUnsubRef.current = unsub;

    // ✅ Track globally for logout cleanup
    if (!global.unsubscribeAllListeners) global.unsubscribeAllListeners = [];
    global.unsubscribeAllListeners.push(unsub);

    return () => {
      try {
        unsub && unsub();
      } catch {}
      if (eventUnsubRef.current === unsub) eventUnsubRef.current = null;
    };
  }, [eventId, auth().currentUser]);

  // ✅ Chat messages listener (single source with error handler)
  useEffect(() => {
    if (!auth().currentUser) return;

    const q = query(
      collection(db, 'chats', eventId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        // Ignore local pending writes to avoid brief flicker before rule rejection/commit
        const items = snap.docs
          .filter((d) => !d.metadata.hasPendingWrites)
          .map((d) => ({ id: d.id, ...d.data() }));
        setMessages(items);
        setLoading(false);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      },
      (error) => {
        if (error?.code === 'permission-denied') {
          setMessages([]);
          setLoading(false);
          return;
        }
        console.error('Chat messages listener error:', error);
      }
    );

    // Save unsub refs for immediate cleanup (leave flow)
    messagesUnsubRef.current = unsub;

    if (!global.unsubscribeAllListeners) global.unsubscribeAllListeners = [];
    global.unsubscribeAllListeners.push(unsub);

    return () => {
      try {
        unsub && unsub();
      } catch {}
      if (messagesUnsubRef.current === unsub) messagesUnsubRef.current = null;
    };
  }, [eventId, auth().currentUser]);

  useEffect(() => {
    if (!eventId) return;
    const chatDocRef = doc(db, 'chats', eventId);
    const unsub = onSnapshot(
      chatDocRef,
      (snap) => {
        if (!snap.exists) {
          setPinned(null);
          return;
        }
        const data = snap.data() || {};
        setPinned(data.pinned || null);
      },
      () => setPinned(null)
    );
    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [eventId]);

  // ✅ Host user info when event changes (no snapshot, just getDoc)
  useEffect(() => {
    const ownerId = event?.ownerId;
    if (ownerId) {
      getDoc(doc(db, 'users', ownerId)).then((userDoc) => {
        if (userDoc.exists) {
          const userData = userDoc.data();
          setHostUser({
            displayName:
              userData.displayName ||
              `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
              'User',
            photoURL: userData.profileImage || userData.avatarURL || null,
            // Rating: prefer 'rating' (current), fallback to legacy 'ranking'
            rating:
              typeof userData.rating === 'number'
                ? userData.rating
                : typeof userData.ranking === 'number'
                ? userData.ranking
                : null,
          });
        } else {
          setHostUser(null);
        }
      });
    } else {
      setHostUser(null);
    }
  }, [event?.ownerId]);

  // Check if current user is attendee
  const currentUid = auth().currentUser?.uid || null;
  const isAttendee =
    Array.isArray(event?.attendees) && currentUid
      ? event.attendees.includes(currentUid)
      : false;

  const hostIds = useMemo(() => {
    const collected = new Set();
    const ownerId = event?.ownerId;
    const hostId = event?.hostId;
    const owner = event?.owner;
    const ownerUID = event?.ownerUID;
    const host = event?.host;
    const hostUID = event?.hostUID;

    if (typeof ownerId === 'string' && ownerId) collected.add(ownerId);
    if (typeof hostId === 'string' && hostId) collected.add(hostId);
    if (typeof owner === 'string' && owner) collected.add(owner);
    if (typeof ownerUID === 'string' && ownerUID) collected.add(ownerUID);
    if (typeof host === 'string' && host) collected.add(host);
    if (typeof hostUID === 'string' && hostUID) collected.add(hostUID);

    const maybeAddFromList = (value) => {
      if (Array.isArray(value)) {
        value.forEach((id) => {
          if (typeof id === 'string' && id) collected.add(id);
        });
      }
    };

    maybeAddFromList(event?.hosts);
    maybeAddFromList(event?.coHosts);
    maybeAddFromList(event?.admins);
    maybeAddFromList(event?.moderators);

    return collected;
  }, [
    event?.ownerId,
    event?.hostId,
    event?.owner,
    event?.ownerUID,
    event?.host,
    event?.hostUID,
    event?.hosts,
    event?.coHosts,
    event?.admins,
    event?.moderators,
  ]);

  // Check if current user is event creator/host (supports legacy fields and host lists)
  const isCreator = currentUid ? hostIds.has(currentUid) : false;

  const safeExitChat = useCallback(() => {
    setIsModalVisible(false);
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation?.navigate?.('MainTabs', { screen: 'Map' });
    }
  }, [navigation]);

  // Block chat access for non-members entirely (with grace periods)
  useEffect(() => {
    if (!event || !currentUid) return;
    const isMember = isAttendee || isCreator;
    if (isMember) {
      setHasShownAccessAlert(false);
      if (joinGraceActive) setJoinGraceActive(false);
      return;
    }
    if (joinGraceActive || leaveInProgress) return;
    if (hasShownAccessAlert) return;
    setHasShownAccessAlert(true);
    Alert.alert(
      'No Access',
      'Only attendees or the host can view this chat.',
      [{ text: 'OK', onPress: safeExitChat }],
      { cancelable: false }
    );
  }, [
    event,
    currentUid,
    isAttendee,
    isCreator,
    joinGraceActive,
    leaveInProgress,
    hasShownAccessAlert,
    safeExitChat,
  ]);

  // Send message
  const sendMessage = async () => {
    // Description: Validate input and permissions, then write message with server timestamp
    const trimmed = (input || '').trim();
    if (!trimmed) return;

    const uid = auth().currentUser?.uid;
    if (!uid) {
      Alert.alert('Not signed in', 'Please sign in to send messages.');
      return;
    }

    // Soft guards in UI (rules still enforce): must be host or attendee
    const allowed = isAttendee || isCreator;
    if (!allowed) {
      Alert.alert(
        'Not allowed',
        'Only attendees or the host can send messages.'
      );
      return;
    }

    // Prevent writes when event is archived or soft-deleted (3+ days after end)
    if (readOnly) {
      Alert.alert('Chat Archived', 'This chat is read-only for this event.');
      return;
    }

    try {
      await addDoc(collection(db, 'chats', eventId, 'messages'), {
        text: trimmed,
        senderId: uid,
        createdAt: serverTimestamp(), // Use server time for stable ordering
      });
      setInput('');
    } catch (err) {
      console.error('sendMessage error:', err);
      const code = err?.code || '';
      let msg = err?.message || 'Failed to send message.';
      if (code.includes('permission') || code.includes('denied')) {
        msg = 'You need to be an attendee or the host to chat in this event.';
      } else if (code.includes('unavailable')) {
        msg = 'Network unavailable. Please try again.';
      }
      Alert.alert('Send failed', msg);
    }
  };

  // Accept request handler
  const handleAcceptRequest = async (userId) => {
    if (isSoftDeleted || ended) {
      Alert.alert(
        'Action unavailable',
        'Cannot modify requests for archived or ended events.'
      );
      return;
    }
    try {
      const accept = functions.httpsCallable('acceptRsvpRequest');
      await accept({ eventId, userId });

      // Optimistic local update; snapshot will reconcile
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              requests: (prev.requests || []).filter((r) => r !== userId),
            }
          : prev
      );
    } catch (err) {
      console.error('Error accepting request:', err.message || err);
      alert('Failed to accept request. Please try again.');
    }
  };

  // Decline request handler
  const handleDeclineRequest = async (userId) => {
    if (isSoftDeleted || ended) {
      Alert.alert(
        'Action unavailable',
        'Cannot modify requests for archived or ended events.'
      );
      return;
    }
    try {
      const decline = functions.httpsCallable('declineRsvpRequest');
      await decline({ eventId, userId });

      setEvent((prev) =>
        prev
          ? {
              ...prev,
              requests: (prev.requests || []).filter((r) => r !== userId),
            }
          : prev
      );
    } catch (err) {
      console.error('Error declining request:', err.message || err);
      alert('Failed to decline request. Please try again.');
    }
  };

  // Ensure requester icon pulls correct user data
  const fetchRequesterDetails = async (userId) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists) {
        const userData = userDoc.data();
        return {
          id: userDoc.id,
          displayName:
            userData.displayName ||
            `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
            'User',
          photoURL: userData.profileImage || smileDefault,
          rating:
            typeof userData.rating === 'number'
              ? userData.rating.toFixed(1)
              : typeof userData.ranking === 'number'
              ? userData.ranking.toFixed(1)
              : 'Unrated',
        };
      }
      return {
        id: userId,
        displayName: 'User',
        photoURL: smileDefault,
        rating: 'Unrated',
      };
    } catch (err) {
      console.error('Error fetching requester details:', err.message);
      return {
        id: userId,
        displayName: 'User',
        photoURL: smileDefault,
        rating: 'Unrated',
      };
    }
  };

  // Batch-fetch requester details when event requests change
  useEffect(() => {
    const fetchRequesters = async () => {
      const uids = Array.isArray(event?.requests) ? event.requests : [];
      if (!uids.length) {
        setRequesters([]);
        return;
      }
      try {
        const users = await batchFetchUsersAsAttendees(uids);
        setRequesters(
          users.map((u) => ({
            id: u.id,
            displayName: u.displayName,
            photoURL: u.photoURL || smileDefault,
            rating: typeof u.rating === 'number' ? u.rating : null,
          }))
        );
      } catch (err) {
        // Fallback to existing per-user detail fetch
        const requesterPromises = uids.map(async (userId) => {
          const userDoc = await getDoc(doc(db, 'users', userId));
          const userData = userDoc.exists ? userDoc.data() : {};
          return {
            id: userId,
            displayName:
              userData.displayName ||
              `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
              'User',
            photoURL: userData.profileImage || smileDefault,
            rating:
              typeof userData.rating === 'number'
                ? Number(userData.rating)
                : typeof userData.ranking === 'number'
                ? Number(userData.ranking)
                : null,
          };
        });
        const resolved = await Promise.all(requesterPromises);
        setRequesters(resolved);
      }
    };
    fetchRequesters();
  }, [event?.requests]);

  // Long press message handler
  const handleLongPressMessage = (message) => {
    setSelectedUser({ id: message.senderId, type: 'message', message });
    setIsReportModalVisible(true);
  };

  // Long press attendee handler (improved cross-platform options)
  const openAttendeeOptions = (attendee) => {
    if (!attendee) return;
    // Host removal / report options
    if (isCreator) {
      Alert.alert(attendee.displayName || 'Attendee', 'Choose an action', [
        {
          text: 'View Profile',
          onPress: () => {
            setIsModalVisible(false);
            navigateToOtherUserProfile(attendee.id);
          },
        },
        {
          text: 'Remove From Event',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Confirm Removal',
              'Remove this attendee? They will lose chat access.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => handleRemoveUser(attendee.id),
                },
              ]
            ),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      // Non-host: open report modal (reuse existing)
      setSelectedUser({ id: attendee.id, type: 'attendee', attendee });
      setIsReportModalVisible(true);
    }
  };

  // Remove user from event
  const handleRemoveUser = async (userId) => {
    if (isSoftDeleted || ended) {
      Alert.alert(
        'Action unavailable',
        'Cannot remove attendees from archived or ended events.'
      );
      return;
    }
    if (!userId || !eventId) return;
    if (userId === event?.ownerId) {
      Alert.alert('You cannot remove the host of the event.');
      return;
    }
    try {
      const eventRef = doc(db, 'events', eventId);
      // Description: Atomically remove user from event attendees
      await updateDoc(eventRef, { attendees: arrayRemove(userId) });

      // Description: Remove event reference from user's attended / attending arrays
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        attendedEvents: arrayRemove(eventId),
        attendingEvents: arrayRemove(eventId), // legacy field support
      }).catch(() => {}); // swallow if fields missing

      // Optional: system message (could be used later for audit trail)
      // await addDoc(collection(db, 'chats', eventId, 'messages'), {
      //   text: 'A user was removed by the host.',
      //   senderId: 'system',
      //   createdAt: new Date(),
      // });

      // Local optimistic update; snapshot will reconcile
      setAttendees((prev) => prev.filter((a) => a.id !== userId));
      Alert.alert('Removed', 'User removed from event.');
      setIsReportModalVisible(false);
    } catch (err) {
      console.error('Error removing user:', err.message);
      Alert.alert('Removal Failed', 'Could not remove user. Try again.');
    }
  };

  // Description: Allow a non-host attendee to leave the event (removes from event + user doc)
  const handleLeaveEvent = async () => {
    if (isSoftDeleted || ended) {
      Alert.alert(
        'Action unavailable',
        'Cannot modify attendance for archived or ended events.'
      );
      return;
    }
    const currentUid = auth().currentUser?.uid;
    if (!currentUid || !eventId) return;
    if (isCreator) return; // Creator uses delete flow instead

    Alert.alert(
      'Leave Event',
      'Are you sure you want to leave this event? You will lose access to the chat.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeaveInProgress(true);
            try {
              // Proactively stop listeners to avoid permission-denied errors during transition
              try {
                eventUnsubRef.current && eventUnsubRef.current();
              } catch {}
              try {
                messagesUnsubRef.current && messagesUnsubRef.current();
              } catch {}
              eventUnsubRef.current = null;
              messagesUnsubRef.current = null;

              const leave = functions.httpsCallable('leaveEvent');
              await leave({ eventId });

              // Optimistic local updates
              setAttendees((prev) => prev.filter((a) => a.id !== currentUid));
              setEvent((prev) =>
                prev
                  ? {
                      ...prev,
                      attendees: (prev.attendees || []).filter(
                        (id) => id !== currentUid
                      ),
                    }
                  : prev
              );

              // Navigate back out of chat
              setIsModalVisible(false);
              safeExitChat();
            } catch (err) {
              console.error('Leave event error:', err);
              const code = err?.code || '';
              let msg = err?.message || 'Could not leave the event.';
              if (code.includes('unauthenticated')) msg = 'Please sign in.';
              else if (code.includes('permission') || code.includes('denied'))
                msg = "You don't have permission to leave this event.";
              else if (code.includes('not-found')) msg = 'Event not found.';
              setLeaveInProgress(false);
              Alert.alert('Leave Failed', msg);
            }
          },
        },
      ]
    );
  };

  // Report submit handler
  const handleReportSubmit = (reportDetails) => {
    // Description: Submit report logic
    const targetUserId = reportDetails?.userId || selectedUser?.id || null;
    const reason = reportDetails?.reason || 'No reason provided';
    const currentUser = auth().currentUser;
    if (!currentUser?.uid || !targetUserId) {
      setIsReportModalVisible(false);
      return;
    }
    reportContent(currentUser.uid, targetUserId, 'user', reason, {
      details: `Report from chat of event ${eventId}`,
      context: { eventId },
    })
      .then(() => {
        try {
          trackReportContent({
            content_type: 'user',
            content_id: targetUserId,
            reason_category: 'user_report',
            event_id: eventId,
            surface: 'chat',
          });
        } catch {}
        trackClient('report_submitted', {
          event_id_present: !!eventId,
          has_reason: !!reason,
          target_present: !!targetUserId,
        });
      })
      .catch((e) => {
        console.error('Report failed:', e?.message || e);
      })
      .finally(() => setIsReportModalVisible(false));
  };

  const handleStartEdit = () => {
    if (!event) return;
    const locationLabel = getLocationLabel(event);
    const sanitizedLocation =
      locationLabel && locationLabel !== 'Location not available'
        ? locationLabel
        : '';
    setEditLocation(sanitizedLocation);
    setEditDescription(event?.description || '');
    setEditDate(coerceDateWithinBounds(toDateOrNull(event?.date) || new Date()));
    const loc = event?.location || {};
    const lat =
      typeof loc.latitude === 'number'
        ? loc.latitude
        : typeof loc.lat === 'number'
        ? loc.lat
        : typeof loc._lat === 'number'
        ? loc._lat
        : null;
    const lng =
      typeof loc.longitude === 'number'
        ? loc.longitude
        : typeof loc.lng === 'number'
        ? loc.lng
        : typeof loc._long === 'number'
        ? loc._long
        : typeof loc.lon === 'number'
        ? loc.lon
        : null;
    if (typeof lat === 'number' && typeof lng === 'number') {
      setEditLocationCoords({ latitude: lat, longitude: lng });
    } else {
      setEditLocationCoords(null);
    }
    setEditPlaceDetails(
      loc && (lat || lng)
        ? {
            name:
              loc.name || loc.label || loc.address || sanitizedLocation || null,
            address: loc.address || sanitizedLocation || null,
            placeId: loc.placeId || loc.place_id || null,
            latitude: lat || null,
            longitude: lng || null,
          }
        : null
    );
    setIsEditDatePickerVisible(false);
    setEditDateDraft(null);
    setIsEditingEvent(true);
    trackClient('event_edit_start', { event_id_present: !!eventId });
  };

  const handleCancelEdit = () => {
    setIsEditingEvent(false);
    setIsEditDatePickerVisible(false);
    setEditDateDraft(null);
    setEditLocation('');
    setEditDescription('');
    setEditDate(null);
    setEditLocationCoords(null);
    setEditPlaceDetails(null);
  };

  const openPinnedEditor = useCallback(() => {
    if (!isCreator) return;
    setPinnedDraft(typeof pinned?.text === 'string' ? pinned.text : '');
    setPinnedEditorVisible(true);
  }, [isCreator, pinned?.text]);

  const handleSavePinned = useCallback(async () => {
    if (!isCreator || !eventId) return;
    setPinnedSaving(true);
    try {
      const trimmed = pinnedDraft.trim();
      const chatDocRef = doc(db, 'chats', eventId);

      // Ensure chat document exists before attempting to update pinned data
      const chatSnap = await getDoc(chatDocRef);
      if (!chatSnap.exists) {
        const participantIds = new Set();
        if (auth().currentUser?.uid) participantIds.add(auth().currentUser.uid);
        if (Array.isArray(event?.attendees)) {
          event.attendees.forEach((uid) => {
            if (typeof uid === 'string' && uid) participantIds.add(uid);
          });
        }
        // Include known host identifiers so they retain access without waiting on backend fan-out
        hostIds.forEach((uid) => {
          if (typeof uid === 'string' && uid) participantIds.add(uid);
        });

        await setDoc(
          chatDocRef,
          {
            eventId,
            createdAt: serverTimestamp(),
            createdBy: auth().currentUser?.uid || null,
            participants: Array.from(participantIds),
            lastUpdated: serverTimestamp(),
            messageCount: 0,
            isArchived: false,
            pinned: null,
          },
          { merge: true }
        );
      }

      const lastUpdated = serverTimestamp();
      if (!trimmed.length) {
        await updateDoc(chatDocRef, {
          pinned: null,
          lastUpdated,
        });
      } else {
        await updateDoc(chatDocRef, {
          pinned: {
            text: trimmed,
            updatedAt: lastUpdated,
            updatedBy: auth().currentUser?.uid || null,
          },
          lastUpdated,
        });
      }
      setPinnedEditorVisible(false);
    } catch (err) {
      console.error('Pinned announcement update failed:', err);
      Alert.alert(
        'Update failed',
        'Unable to update the pinned announcement. Please try again.'
      );
    } finally {
      setPinnedSaving(false);
    }
  }, [
    auth().currentUser?.uid,
    event?.attendees,
    eventId,
    hostIds,
    isCreator,
    pinnedDraft,
  ]);

  const getCurrentEditDate = useCallback(() => {
    if (editDate instanceof Date) return editDate;
    const fallback = toDateOrNull(event?.date) || new Date();
    return coerceDateWithinBounds(fallback) || fallback;
  }, [editDate, event?.date]);

  const openEditDatePicker = () => {
    if (Platform.OS === 'ios') {
      setEditDateDraft(getCurrentEditDate());
    } else {
      setEditDateDraft(null);
    }
    setIsEditDatePickerVisible(true);
  };

  const handleInlineDateChange = (_, selectedDate) => {
    if (selectedDate) {
      setEditDateDraft(roundUpToMinuteIncrement(selectedDate));
    }
  };

  const handleInlineDateCancel = () => {
    setEditDateDraft(null);
    setIsEditDatePickerVisible(false);
  };

  const handleInlineDateSave = () => {
    const nextDate = roundUpToMinuteIncrement(
      editDateDraft || getCurrentEditDate()
    );
    setEditDate(nextDate);
    setEditDateDraft(null);
    setIsEditDatePickerVisible(false);
  };

  const handleEditDateConfirm = (pickedDate) => {
    setEditDate(roundUpToMinuteIncrement(pickedDate || new Date()));
    setEditDateDraft(null);
    setIsEditDatePickerVisible(false);
  };

  const handleSaveEventEdits = async () => {
    if (!eventId) return;
    const trimmedDescription = editDescription.trim();
    if (!trimmedDescription) {
      Alert.alert('Description needed', 'Please enter a description.');
      return;
    }
    const trimmedLocation = editLocation.trim();
    const placeSnapshot = editPlaceDetails;
    const displayAddress =
      placeSnapshot?.address || trimmedLocation || event?.address || null;
    const displayName =
      placeSnapshot?.name || trimmedLocation || event?.locationName || null;

    const updates = {
      description: trimmedDescription,
      locationName: displayName || null,
      address: displayAddress || null,
      updatedAt: serverTimestamp(),
    };

    const baseEditDate =
      editDate instanceof Date ? editDate : toDateOrNull(editDate);
    if (!baseEditDate) {
      Alert.alert('Date required', 'Please select a date and time.');
      return;
    }
    const normalizedDate = roundUpToMinuteIncrement(baseEditDate);
    if (!normalizedDate) {
      Alert.alert('Date required', 'Please select a date and time.');
      return;
    }
    if (!isWithinDateBounds(normalizedDate)) {
      Alert.alert(
        'Date out of range',
        'Events can only be scheduled between 30 minutes and 7 days from now.'
      );
      return;
    }
    updates.date = Timestamp.fromDate(normalizedDate);

    const latitudeCandidate =
      placeSnapshot?.latitude ?? editLocationCoords?.latitude;
    const longitudeCandidate =
      placeSnapshot?.longitude ?? editLocationCoords?.longitude;
    const hasCoords =
      typeof latitudeCandidate === 'number' &&
      typeof longitudeCandidate === 'number';

    if (placeSnapshot || hasCoords || trimmedLocation) {
      updates.location = {
        ...(event?.location || {}),
        ...(hasCoords
          ? { latitude: latitudeCandidate, longitude: longitudeCandidate }
          : {}),
        ...(displayAddress ? { address: displayAddress } : {}),
        ...(displayName ? { name: displayName, label: displayName } : {}),
        ...(placeSnapshot?.placeId ? { placeId: placeSnapshot.placeId } : {}),
      };

      if (hasCoords) {
        try {
          updates.geohash = geohashForLocation([
            latitudeCandidate,
            longitudeCandidate,
          ]);
        } catch (geoErr) {
          console.warn(
            'Failed to compute geohash for updated event location',
            geoErr
          );
        }
      }
    }

    setIsSavingEvent(true);
    try {
      await updateDoc(doc(db, 'events', eventId), updates);
      trackClient('event_edit_saved', { event_id_present: !!eventId });
      Alert.alert('Event Updated', 'Your changes have been saved.');
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              description: updates.description,
              locationName: updates.locationName,
              address: updates.address,
              ...(updates.date ? { date: updates.date } : {}),
              ...(updates.location ? { location: updates.location } : {}),
              ...(updates.geohash ? { geohash: updates.geohash } : {}),
            }
          : prev
      );
      setIsEditingEvent(false);
      setEditLocation('');
      setEditDescription('');
      setEditDate(null);
      setEditLocationCoords(null);
      setEditPlaceDetails(null);
    } catch (err) {
      console.error('Event update failed:', err);
      Alert.alert(
        'Update failed',
        'Unable to save your changes. Please try again.'
      );
    } finally {
      setIsSavingEvent(false);
    }
  };

  if (loading || !event) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  return (
    <SafeAreaView
      style={styles.chatBackground}
      edges={['top', 'left', 'right']}
    >
      {/* Header placed below SafeAreaView padding */}
      <View style={styles.headerContainer}>
        <View style={styles.header}>
          <TouchableOpacity onPress={safeExitChat}>
            <Ionicons name='arrow-back' size={24} color='#007AFF' />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerTitleWrapper}
            onPress={() => setIsModalVisible(true)}
          >
            <Text style={styles.headerTitle} numberOfLines={1}>
              {event?.title || 'Event Chat'}
            </Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            {isCreator && (
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={openPinnedEditor}
                accessibilityRole='button'
                accessibilityLabel={
                  pinned?.text ? 'Edit pinned announcement' : 'Pin message'
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={pinned?.text ? 'pin' : 'pin-outline'}
                  size={22}
                  color='#007AFF'
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() =>
                event &&
                shareEventDetails(event, {
                  surface: 'event_chat',
                  source: 'chat_header',
                })
              }
              accessibilityRole='button'
              accessibilityLabel='Share event'
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name='share-social-outline' size={22} color='#007AFF' />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => setIsModalVisible(true)}
            >
              <Text style={styles.ellipsis}>⋯</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Archived / Ended banner */}
      {(isSoftDeleted || ended) && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {isSoftDeleted
              ? 'This event has been archived. Chat is read-only.'
              : archived
              ? 'This event ended over 3 days ago. Chat is read-only.'
              : 'This event has ended. Chat remains open for 3 days.'}
          </Text>
        </View>
      )}

      {pinned?.text ? (
        <View style={styles.pinnedContainer}>
          <Ionicons
            name='pin'
            size={16}
            color='#1D4ED8'
            style={styles.pinnedIcon}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.pinnedTitle}>Host announcement</Text>
            <Text style={styles.pinnedMessage}>{pinned.text}</Text>
            {pinnedUpdatedAtLabel ? (
              <Text style={styles.pinnedTimestamp}>{pinnedUpdatedAtLabel}</Text>
            ) : null}
          </View>
          {isCreator && (
            <TouchableOpacity
              style={styles.pinnedEditButton}
              onPress={openPinnedEditor}
              accessibilityLabel='Edit pinned announcement'
            >
              <Text style={styles.pinnedEditText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Chat Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSystem =
              item?.senderId === 'system' || item?.type === 'system';
            if (isSystem) {
              return (
                <View style={styles.systemContainer}>
                  <Text style={styles.systemText}>
                    {item?.text || 'System update'}
                  </Text>
                </View>
              );
            }

            const isHost = item.senderId === event?.ownerId;
            const sender =
              isHost && hostUser
                ? {
                    id: event.ownerId,
                    displayName: hostUser.displayName,
                    photoURL: hostUser.photoURL,
                  }
                : attendees.find((a) => a.id === item.senderId);
            const isCurrentUser = item.senderId === auth().currentUser?.uid;
            const displayName =
              sender?.displayName || (isHost ? 'Host' : 'User');
            return (
              <View
                style={{
                  flexDirection: isCurrentUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  marginVertical: 6,
                  marginHorizontal: 10,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    const targetId =
                      sender?.id || (isHost ? event?.ownerId : undefined);
                    if (targetId) navigateToOtherUserProfile(targetId);
                  }}
                  onLongPress={() => handleLongPressMessage(item)}
                >
                  <Image
                    source={
                      sender?.photoURL ? { uri: sender.photoURL } : smileDefault // Fallback to default image
                    }
                    style={[
                      styles.messageAvatar,
                      isHost && styles.hostAvatarBorder,
                    ]}
                  />
                </TouchableOpacity>
                <View
                  style={{
                    maxWidth: '75%',
                    alignItems: isCurrentUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      const targetId =
                        sender?.id || (isHost ? event?.ownerId : undefined);
                      if (targetId) navigateToOtherUserProfile(targetId);
                    }}
                    onLongPress={() => handleLongPressMessage(item)}
                  >
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                      <Text style={styles.senderName}>{displayName}</Text>
                      {isHost && <Text style={styles.hostChip}>HOST</Text>}
                    </View>
                  </TouchableOpacity>
                  <View
                    style={[
                      styles.messageBubble,
                      {
                        backgroundColor: isCurrentUser
                          ? theme.colors.primary
                          : theme.isDark
                          ? '#475569'
                          : '#F3F4F6',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: isCurrentUser ? '#fff' : theme.colors.text,
                      }}
                    >
                      {item.text}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: 10 }}
        />

        {/* Message Input */}
        {isAttendee || isCreator ? (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={
                isSoftDeleted
                  ? 'Event archived — chat read-only'
                  : archived
                  ? 'Chat archived — read-only'
                  : ended
                  ? 'Event ended — chat open for 3 days'
                  : 'Type a message...'
              }
              placeholderTextColor={theme.colors.textSecondary}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => {
                if (!readOnly) sendMessage();
              }}
              editable={!readOnly}
              returnKeyType='send'
            />
            <TouchableOpacity
              onPress={sendMessage}
              style={[
                styles.sendButton,
                (readOnly || !(input || '').trim()) && {
                  opacity: 0.5,
                },
              ]}
              disabled={readOnly || !(input || '').trim()}
            >
              <Text style={styles.sendText}>Send</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#888' }}>
              {isSoftDeleted
                ? 'This event has been archived. Chat is read-only.'
                : ended
                ? 'This event has ended.'
                : 'Only attendees or the event creator can chat in this event.'}
            </Text>
          </View>
        )}

        {/* Event Info Modal */}
        <Modal
          isVisible={isModalVisible}
          onBackdropPress={() => setIsModalVisible(false)}
          onSwipeComplete={() => setIsModalVisible(false)}
          swipeDirection='right'
          style={styles.sidebarModal}
          backdropOpacity={0.4}
          animationIn='slideInRight'
          animationOut='slideOutRight'
          propagateSwipe={true}
          hideModalContentWhileAnimating={true}
          scrollTo={handleSidebarScrollTo}
          scrollOffset={sidebarScrollOffset}
          scrollOffsetMax={sidebarScrollOffsetMax}
            >
              <View style={styles.sidebarWrapper} onLayout={handleSidebarLayout}>
            {/* Floating close button */}
            <TouchableOpacity
              style={styles.floatingCloseButton}
              onPress={() => setIsModalVisible(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name='close' size={28} color='#fff' />
            </TouchableOpacity>

            <ScrollView
              ref={sidebarScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 60, // Space for close button
                paddingBottom: (insets.bottom || 0) + 32,
              }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps='handled'
              bounces={true}
              scrollEventThrottle={16}
              nestedScrollEnabled={true}
              scrollEnabled={true}
              onScroll={handleSidebarScroll}
              onContentSizeChange={handleSidebarContentSizeChange}
            >
              {/* Event Title + Host Info */}
              <TouchableOpacity
                style={styles.card}
                activeOpacity={hostUser ? 0.7 : 1}
                onPress={() => {
                  // Description: Consistent profile navigation logic + close modal after navigation
                  const ownerId = event?.ownerId;
                  if (hostUser && ownerId) {
                    setIsModalVisible(false);
                    if (ownerId === auth().currentUser?.uid) {
                      // Navigate to the main Profile tab
                      navigation.reset({
                        index: 0,
                        routes: [
                          {
                            name: 'MainTabs',
                            params: { screen: 'ProfileStack' },
                          },
                        ],
                      });
                    } else {
                      navigateToOtherUserProfile(ownerId);
                    }
                  }
                }}
              >
                <Text style={styles.cardTitle}>{event?.title}</Text>
                {hostUser && (
                  <View style={styles.hostRow}>
                    <Image
                      source={
                        hostUser?.photoURL
                          ? { uri: hostUser.photoURL }
                          : smileDefault // Fallback to default image
                      }
                      style={styles.hostAvatar}
                    />
                    <View style={{ marginLeft: 10 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Text style={styles.hostName}>
                          Host: {hostUser.displayName}
                        </Text>
                        {hostUser?.verification?.status === 'verified' && (
                          <Ionicons
                            name='checkmark-circle'
                            size={16}
                            color='#2563EB'
                          />
                        )}
                      </View>
                      <Text style={styles.hostRating}>
                        {typeof hostUser.rating === 'number'
                          ? `⭐ Rating: ${hostUser.rating.toFixed(1)} `
                          : 'Rating: Unrated'}
                      </Text>
                    </View>
                  </View>
                )}
                {!hostUser && (
                  <View style={styles.hostRow}>
                    <Image source={smileDefault} style={styles.hostAvatar} />
                    <View style={{ marginLeft: 10 }}>
                      <Text style={styles.hostName}>Host: User</Text>
                      <Text style={styles.hostRating}>Rating: Unrated</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              {/* Location */}
              <View
                style={[
                  styles.card,
                  isCreator && isEditingEvent && styles.cardEditing,
                ]}
              >
                <Text style={styles.sectionTitle}>Location</Text>
                {isCreator && isEditingEvent ? (
                  <View style={styles.autocompleteWrapper}>
                    <GooglePlacesAutocomplete
                      placeholder='Search for a location or address'
                      minLength={2}
                      enablePoweredByContainer={false}
                      fetchDetails
                      debounce={300}
                      predefinedPlaces={[]}
                      keyboardShouldPersistTaps='handled'
                      textInputProps={{
                        value: editLocation,
                        onChangeText: (text) => {
                          setEditLocation(text);
                          setEditPlaceDetails(null);
                        },
                        placeholderTextColor: '#9CA3AF',
                        autoCorrect: false,
                        autoCapitalize: 'none',
                      }}
                      styles={{
                        container: styles.autocompleteContainer,
                        textInput: styles.modalInput,
                        listView: styles.autocompleteList,
                        row: styles.autocompleteRow,
                        separator: styles.autocompleteSeparator,
                        description: styles.autocompleteDescription,
                      }}
                      onPress={(data, details = null) => {
                        const description = data?.description || '';
                        const formattedAddress =
                          details?.formatted_address || description;
                        const primaryText =
                          data?.structured_formatting?.main_text ||
                          details?.name;
                        setEditLocation(description);
                        const lat = details?.geometry?.location?.lat;
                        const lng = details?.geometry?.location?.lng;
                        if (
                          typeof lat === 'number' &&
                          typeof lng === 'number'
                        ) {
                          setEditLocationCoords({
                            latitude: lat,
                            longitude: lng,
                          });
                        }
                        setEditPlaceDetails({
                          name: primaryText || formattedAddress || description,
                          address: formattedAddress || description,
                          placeId: data?.place_id || details?.place_id || null,
                          latitude: typeof lat === 'number' ? lat : null,
                          longitude: typeof lng === 'number' ? lng : null,
                          raw: details || null,
                        });
                      }}
                      onFail={(error) =>
                        console.error('Places autocomplete error:', error)
                      }
                      query={{
                        key: GOOGLE_MAPS_API_KEY,
                        language: 'en',
                      }}
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      if (
                        resolvedLocationLabel &&
                        resolvedLocationLabel !== 'Location not available'
                      ) {
                        Linking.openURL(
                          `https://maps.google.com/?q=${encodeURIComponent(
                            resolvedLocationLabel
                          )}`
                        );
                      }
                    }}
                    disabled={
                      !resolvedLocationLabel ||
                      resolvedLocationLabel === 'Location not available'
                    }
                  >
                    <Text style={styles.linkText}>{resolvedLocationLabel}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Date & Time */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Date & Time</Text>
                <View style={styles.rowBetween}>
                  <Text style={[styles.normalText, styles.dateText]}>
                    {formatEventDate(
                      isCreator && isEditingEvent ? editDate : event?.date
                    )}
                  </Text>
                  <TouchableOpacity
                    style={styles.calendarButton}
                    onPress={async () => {
                      trackClient('add_to_calendar_clicked', {
                        event_id_present: !!eventId,
                      });

                      // Add event to calendar
                      try {
                        const result = await addSocialCircleEventToCalendar(
                          event
                        );
                        if (result.success) {
                          console.log(
                            '[EventChatScreen] Event added to calendar:',
                            result.eventId
                          );
                        }
                      } catch (error) {
                        console.error(
                          '[EventChatScreen] Calendar export failed:',
                          error
                        );
                      }
                    }}
                    accessibilityLabel='Add to calendar'
                  >
                    <Ionicons name='calendar-outline' size={20} color='#fff' />
                  </TouchableOpacity>
                </View>
                {isCreator && isEditingEvent && (
                  <TouchableOpacity
                    style={styles.editDateButton}
                    onPress={openEditDatePicker}
                    disabled={isSavingEvent}
                  >
                    <Ionicons name='time-outline' size={20} color='#2563EB' />
                    <Text style={styles.editDateButtonText}>
                      Adjust Date & Time
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Description */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Description</Text>
                {isCreator && isEditingEvent ? (
                  <>
                    <TextInput
                      style={[styles.modalInput, styles.modalTextarea]}
                      multiline
                      value={editDescription}
                      onChangeText={setEditDescription}
                      placeholder='Share what attendees should know'
                      placeholderTextColor='#9CA3AF'
                    />
                    <Text style={styles.editInfoNotice}>
                      Update details attendees see about this event.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={styles.normalText}
                      numberOfLines={isDescriptionExpanded ? undefined : 3}
                    >
                      {event?.description || 'No description provided.'}
                    </Text>
                    {event?.description?.length > 120 && ( // Show toggle only if long enough
                      <TouchableOpacity
                        onPress={() =>
                          setIsDescriptionExpanded(!isDescriptionExpanded)
                        }
                      >
                        <Text style={styles.linkText}>
                          {isDescriptionExpanded ? 'Show Less' : 'Show More'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>

              {/* Attendees */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Attendees</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.attendeeScrollContent}
                >
                  {attendees.slice(0, 10).map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.attendeePill}
                      onPress={() => {
                        setIsModalVisible(false);
                        if (item?.id) navigateToOtherUserProfile(item.id);
                      }}
                      onLongPress={() => openAttendeeOptions(item)}
                      delayLongPress={350}
                    >
                      <Image
                        source={
                          item.photoURL ? { uri: item.photoURL } : smileDefault // Fallback to default image
                        }
                        style={styles.attendeeImage}
                      />
                      <Text style={styles.attendeeName}>
                        {item.displayName?.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {attendees.length > 10 && (
                  <TouchableOpacity
                    onPress={() => {
                      trackClient('view_all_attendees_clicked', {
                        count: attendees.length,
                      });
                    }}
                  >
                    <Text style={styles.linkText}>
                      View All ({attendees.length})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Requests Section */}
              {event.ownerId === auth().currentUser?.uid && (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Requests</Text>
                  {requesters.length > 0 ? (
                    requesters.map((requester) => (
                      <TouchableOpacity
                        key={requester.userId}
                        style={styles.requestItem}
                        onPress={() => {
                          setIsModalVisible(false);
                          if (requester?.userId)
                            navigateToOtherUserProfile(requester.userId);
                        }}
                      >
                        <Image
                          source={
                            requester.photoURL
                              ? { uri: requester.photoURL }
                              : smileDefault // Fallback to default image
                          }
                          style={styles.requestAvatar}
                        />
                        <View style={styles.requestDetails}>
                          <Text style={styles.requestName}>
                            {requester.displayName}
                          </Text>
                          <Text style={styles.requestRating}>
                            Rating: {requester.rating}
                          </Text>
                        </View>
                        <View style={styles.requestActions}>
                          <TouchableOpacity
                            style={styles.acceptButton}
                            onPress={() =>
                              handleAcceptRequest(requester.userId)
                            }
                          >
                            <Text style={styles.acceptButtonText}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.declineButton}
                            onPress={() =>
                              handleDeclineRequest(requester.userId)
                            }
                          >
                            <Text style={styles.declineButtonText}>
                              Decline
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={styles.emptyText}>
                      No requests at the moment.
                    </Text>
                  )}
                </View>
              )}

              {/* Actions */}
              {isCreator && (
                <View style={styles.editActionsContainer}>
                  {isEditingEvent ? (
                    <>
                      <TouchableOpacity
                        style={[
                          styles.editPrimaryButton,
                          isSavingEvent && { opacity: 0.7 },
                        ]}
                        onPress={handleSaveEventEdits}
                        disabled={isSavingEvent}
                      >
                        {isSavingEvent ? (
                          <ActivityIndicator color='#fff' />
                        ) : (
                          <Text style={styles.editPrimaryButtonText}>
                            Save Changes
                          </Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.editSecondaryButton}
                        onPress={handleCancelEdit}
                        disabled={isSavingEvent}
                      >
                        <Text style={styles.editSecondaryButtonText}>
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={styles.editPrimaryButton}
                      onPress={handleStartEdit}
                    >
                      <Text style={styles.editPrimaryButtonText}>
                        Edit Event
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <TouchableOpacity
                style={[
                  styles.leaveButton,
                  leaveInProgress && styles.leaveButtonDisabled,
                ]}
                onPress={() => {
                  if (isCreator) {
                    Alert.alert(
                      'Delete Event',
                      'Are you sure you want to delete this event? This action cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            // Description: Delete event from Firestore
                            // const eventRef = doc(db, 'events', eventId);
                            // deleteDoc(eventRef)
                            //   .then(() => {
                            //     navigation.goBack();
                            //     Alert.alert(
                            //       'Event Deleted',
                            //       'The event has been deleted.'
                            //     );
                            //   })
                            //   .catch((error) => {
                            //     console.error('Error deleting event:', error);
                            //     Alert.alert(
                            //       'Error',
                            //       'Failed to delete the event.'
                            //     );
                            //   });

                            // Soft delete flow
                            deleteEvent(eventId, auth().currentUser.uid)
                              .then(() => {
                                safeExitChat();
                                Alert.alert(
                                  'Event Deleted',
                                  'The event has been deleted.'
                                );
                              })
                              .catch((error) => {
                                console.error('Error deleting event:', error);
                                Alert.alert(
                                  'Error',
                                  'Failed to delete the event.'
                                );
                              });
                          },
                        },
                      ]
                    );
                  } else {
                    handleLeaveEvent();
                  }
                }}
                disabled={leaveInProgress}
              >
                <Text style={styles.leaveButtonText}>
                  {leaveInProgress
                    ? 'Leaving...'
                    : isCreator
                    ? 'Delete Event'
                    : 'Leave Event'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.reportButton}
                onPress={() => {
                  trackClient('report_event_clicked', {
                    event_id_present: !!eventId,
                  });
                }}
              >
                <Text style={styles.reportButtonText}>Report Event</Text>
              </TouchableOpacity>
            </ScrollView>
            {Platform.OS === 'ios' && isEditDatePickerVisible && (
              <View style={styles.inlineDatePickerOverlay}>
                <TouchableOpacity
                  style={styles.inlineDatePickerBackdrop}
                  activeOpacity={1}
                  onPress={handleInlineDateCancel}
                />
                <View style={styles.inlineDatePickerCard}>
                  <Text style={styles.inlineDatePickerTitle}>
                    Adjust Date & Time
                  </Text>
                  <DateTimePicker
                    mode='datetime'
                    display='spinner'
                    value={editDateDraft || getCurrentEditDate()}
                    minuteInterval={MINUTE_INCREMENT}
                    minimumDate={editDateBounds.min}
                    maximumDate={editDateBounds.max}
                    themeVariant={datePickerThemeVariant}
                    textColor={datePickerTextColor}
                    onChange={handleInlineDateChange}
                    style={styles.inlineDatePickerControl}
                  />
                  <View style={styles.inlineDatePickerActions}>
                    <TouchableOpacity
                      style={[
                        styles.inlineDatePickerButton,
                        styles.inlineDatePickerCancel,
                      ]}
                      onPress={handleInlineDateCancel}
                    >
                      <Text style={styles.inlineDatePickerCancelText}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.inlineDatePickerButton,
                        styles.inlineDatePickerConfirm,
                      ]}
                      onPress={handleInlineDateSave}
                    >
                      <Text style={styles.inlineDatePickerConfirmText}>
                        Save
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </Modal>

        {Platform.OS !== 'ios' && (
          <DateTimePickerModal
            isVisible={isEditDatePickerVisible}
            mode='datetime'
            onConfirm={handleEditDateConfirm}
            onCancel={() => {
              setIsEditDatePickerVisible(false);
              setEditDateDraft(null);
            }}
            date={getCurrentEditDate()}
            minimumDate={editDateBounds.min}
            maximumDate={editDateBounds.max}
            minuteInterval={MINUTE_INCREMENT}
            themeVariant={datePickerThemeVariant}
            textColor={datePickerTextColor}
          />
        )}

        <Modal
          isVisible={pinnedEditorVisible}
          onBackdropPress={() => {
            if (!pinnedSaving) setPinnedEditorVisible(false);
          }}
          onBackButtonPress={() => {
            if (!pinnedSaving) setPinnedEditorVisible(false);
          }}
        >
          <View style={styles.pinnedModal}>
            <Text style={styles.pinnedModalTitle}>Pinned announcement</Text>
            <TextInput
              style={styles.pinnedInput}
              multiline
              placeholder='Share important updates or reminders with attendees'
              value={pinnedDraft}
              onChangeText={setPinnedDraft}
              maxLength={400}
            />
            <View style={styles.pinnedModalActions}>
              <TouchableOpacity
                style={[styles.pinnedModalButton, styles.pinnedModalCancel]}
                onPress={() => setPinnedEditorVisible(false)}
                disabled={pinnedSaving}
              >
                <Text style={styles.pinnedModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.pinnedModalButton,
                  styles.pinnedModalSave,
                  !canSubmitPinned || pinnedSaving
                    ? styles.pinnedModalSaveDisabled
                    : null,
                ]}
                onPress={handleSavePinned}
                disabled={!canSubmitPinned || pinnedSaving}
              >
                <Text style={styles.pinnedModalButtonText}>
                  {pinnedActionLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Report Modal */}
        <ReportModal
          isVisible={isReportModalVisible}
          onClose={() => setIsReportModalVisible(false)}
          onSubmit={handleReportSubmit}
          user={selectedUser}
          isCreator={isCreator}
          onRemove={handleRemoveUser}
        />
      </KeyboardAvoidingView>
      {leaveInProgress && (
        <View style={styles.pendingOverlay} pointerEvents='auto'>
          <View style={styles.pendingOverlayCard}>
            <ActivityIndicator size='large' color='#fff' />
            <Text style={styles.pendingOverlayText}>Leaving event...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

// Description: Create theme-aware styles for EventChatScreen
const createStyles = (
  theme,
  insets = { top: 0, bottom: 0, left: 0, right: 0 }
) =>
  StyleSheet.create({
    messageAvatar: {
      width: 45,
      height: 45,
      borderRadius: 10,
      marginHorizontal: 6,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    chatBackground: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    hostAvatarBorder: {
      borderWidth: 2,
      borderColor: '#8B5CF6', // purple border for host
    },
    senderName: {
      fontSize: 12,
      fontWeight: 'bold',
      marginBottom: 2,
      color: theme.colors.text,
    },
    hostChip: {
      marginLeft: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: '#8B5CF6',
      color: '#fff',
      fontSize: 10,
      fontWeight: 'bold',
      overflow: 'hidden',
    },
    systemContainer: {
      alignSelf: 'center',
      backgroundColor: theme.isDark ? 'rgba(148,163,184,0.2)' : '#EFEFEF',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginVertical: 6,
    },
    systemText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
    },
    messageBubble: {
      borderRadius: 20, // pill/oval shape
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginTop: 2,
    },
    inputRow: {
      flexDirection: 'row',
      padding: 8,
      paddingBottom: 25,
      marginbottom: 5,
      borderTopWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    input: {
      flex: 1,
      borderRadius: 20,
      backgroundColor: theme.colors.inputBackground,
      paddingHorizontal: 16,
      height: 40,
      color: theme.colors.text,
    },
    sendButton: { marginLeft: 8, justifyContent: 'center' },
    sendText: { color: theme.colors.primary, fontWeight: 'bold', fontSize: 16 },

    // Sidebar Modal
    sidebarModal: {
      justifyContent: 'center',
      margin: 0,
      alignItems: 'flex-end',
    },
    sidebarWrapper: {
      flex: 1,
      backgroundColor: theme.colors.background,
      width: '100%', // Full width
      height: '100%',
      position: 'relative',
      paddingLeft: insets.left, // Respect safe area on left
      paddingRight: insets.right, // Respect safe area on right
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: -2, height: 0 },
      elevation: 5,
    },
    floatingCloseButton: {
      position: 'absolute',
      top: insets.top + 12,
      right: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 5,
    },
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.05,
      shadowRadius: 4,
      elevation: 2,
      position: 'relative',
    },
    cardEditing: {
      marginBottom: 20,
      zIndex: 20,
      overflow: 'visible',
      position: 'relative',
    },
    cardTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text },
    sectionTitle: {
      fontWeight: 'bold',
      fontSize: 16,
      marginBottom: 4,
      color: theme.colors.text,
    },
    linkText: { color: theme.colors.primary, fontSize: 15 },
    normalText: { fontSize: 15, color: theme.colors.text },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    dateText: { flex: 1, marginRight: 12, color: theme.colors.text },
    calendarButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalInput: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 8,
      backgroundColor: theme.colors.card,
      color: theme.colors.text,
    },
    modalTextarea: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    editInfoNotice: {
      marginTop: 8,
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    editActionsContainer: {},
    editPrimaryButton: {
      backgroundColor: theme.colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 8, // Description: Reduced from 10 to bring buttons closer
    },
    editPrimaryButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 16,
    },
    editSecondaryButton: {
      borderWidth: 1,
      borderColor: theme.colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 6, // Description: Reduced from 8 to bring buttons closer
    },
    editSecondaryButtonText: {
      color: theme.colors.primary,
      fontWeight: '600',
      fontSize: 16,
    },
    editDateButton: {
      marginTop: 12,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    editDateButtonText: {
      color: theme.colors.primary,
      fontWeight: '600',
      fontSize: 15,
      marginLeft: 8,
    },
    inlineDatePickerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 200,
      paddingHorizontal: 16,
    },
    inlineDatePickerBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    inlineDatePickerCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: theme.colors.card,
      borderRadius: 16,
      padding: 16,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.15,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    },
    inlineDatePickerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    inlineDatePickerControl: {
      width: '100%',
    },
    inlineDatePickerActions: {
      marginTop: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    inlineDatePickerButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
    },
    inlineDatePickerCancel: {
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },
    inlineDatePickerConfirm: {
      backgroundColor: theme.colors.primary,
    },
    inlineDatePickerCancelText: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
    inlineDatePickerConfirmText: {
      color: '#fff',
      fontWeight: '600',
    },
    autocompleteWrapper: {
      marginTop: 12,
      marginBottom: 4,
      position: 'relative',
      zIndex: 20,
    },
    autocompleteContainer: {
      flex: 0,
      width: '100%',
      zIndex: 20,
    },
    autocompleteList: {
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      marginTop: 4,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 4 },
      maxHeight: 220,
      position: 'absolute',
      top: 52,
      width: '100%',
      zIndex: 30,
    },
    autocompleteRow: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    autocompleteSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    autocompleteDescription: {
      color: theme.colors.text,
    },
    attendeeImage: {
      width: 50,
      height: 50,
      borderRadius: 15,
      backgroundColor: theme.colors.backgroundSecondary,
      marginBottom: 4,
    },
    attendeePill: {
      alignItems: 'center',
      marginRight: 12,
    },
    attendeeScrollContent: {
      paddingVertical: 4,
    },
    attendeeName: { fontSize: 12, color: theme.colors.text },
    leaveButton: {
      backgroundColor: theme.colors.danger,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 10, // Description: Equal spacing between all action buttons
    },
    leaveButtonDisabled: {
      opacity: 0.7,
    },
    leaveButtonText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 16,
    },
    reportButton: {
      backgroundColor: theme.isDark ? '#334155' : '#F2F2F2',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 0, // Description: Removed bottom margin since it's the last element
    },
    reportButtonText: {
      color: theme.colors.text,
      fontWeight: 'bold',
      fontSize: 16,
    },
    hostRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 10,
    },
    hostAvatar: {
      width: 60,
      height: 60,
      borderRadius: 10,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    hostName: {
      fontSize: 15,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    hostRating: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    headerContainer: {
      // Description: Ensures header is below SafeAreaView top padding
      backgroundColor: theme.colors.card,
      paddingTop: 6,
      paddingBottom: 2,
      elevation: 2,
      zIndex: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    headerTitleWrapper: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 12,
    },
    backText: { fontSize: 16, color: theme.colors.primary },
    headerTitle: { fontWeight: 'bold', fontSize: 16, color: theme.colors.text },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerIconButton: {
      padding: 4,
      marginLeft: 8,
    },
    ellipsis: { fontSize: 24, color: theme.colors.textSecondary },
    pendingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.isDark
        ? 'rgba(15,23,42,0.7)'
        : 'rgba(17,24,39,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 200,
    },
    pendingOverlayCard: {
      backgroundColor: theme.isDark ? '#1E293B' : '#111827',
      borderRadius: 18,
      paddingVertical: 24,
      paddingHorizontal: 28,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    pendingOverlayText: {
      color: '#fff',
      marginTop: 12,
      fontSize: 16,
      fontWeight: '600',
    },

    // Requests Section Styles
    requestItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      marginVertical: 8,
      backgroundColor: theme.colors.card,
      borderRadius: 8,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    requestAvatar: {
      width: 60,
      height: 60,
      borderRadius: 10,
      marginRight: 3,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    requestDetails: {
      flex: 1,
      marginLeft: 10,
    },
    requestName: {
      fontSize: 15,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    requestRating: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    requestActions: {
      flexDirection: 'column', // Change to column for stacking
      alignItems: 'center',
      gap: 8,
    },
    acceptButton: {
      backgroundColor: theme.colors.success,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    acceptButtonText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 14,
    },
    declineButton: {
      backgroundColor: theme.colors.danger,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    declineButtonText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 14,
    },
    emptyText: {
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontSize: 14,
      marginTop: 8,
    },
    banner: {
      backgroundColor: theme.colors.warning,
      padding: 10,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderColor: theme.isDark ? '#D97706' : '#FFD54F',
    },
    bannerText: {
      fontSize: 14,
      fontWeight: 'bold',
      color: theme.isDark ? '#111827' : '#333',
    },
    pinnedContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.isDark ? 'rgba(59,130,246,0.15)' : '#EEF2FF',
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    pinnedIcon: {
      marginRight: 10,
    },
    pinnedTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.primary,
      marginBottom: 4,
    },
    pinnedMessage: {
      color: theme.colors.text,
      fontSize: 14,
    },
    pinnedTimestamp: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      marginTop: 4,
    },
    pinnedEditButton: {
      marginLeft: 12,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: theme.isDark ? 'rgba(59,130,246,0.25)' : '#E0E7FF',
    },
    pinnedEditText: {
      color: theme.colors.primary,
      fontWeight: '600',
      fontSize: 12,
    },
    pinnedModal: {
      backgroundColor: theme.colors.card,
      borderRadius: 16,
      padding: 20,
    },
    pinnedModalTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 12,
      color: theme.colors.text,
    },
    pinnedInput: {
      minHeight: 100,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      padding: 12,
      textAlignVertical: 'top',
      marginBottom: 16,
      fontSize: 15,
      color: theme.colors.text,
      backgroundColor: theme.colors.inputBackground,
    },
    pinnedModalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    pinnedModalButton: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 8,
      marginLeft: 10,
    },
    pinnedModalCancel: {
      backgroundColor: theme.isDark ? '#475569' : '#E5E7EB',
    },
    pinnedModalSave: {
      backgroundColor: theme.colors.primary,
    },
    pinnedModalSaveDisabled: {
      opacity: 0.6,
    },
    pinnedModalButtonText: {
      color: '#fff',
      fontWeight: '600',
    },
    pinnedModalCancelText: {
      color: theme.colors.text,
      fontWeight: '500',
    },
  });

export default EventChatScreen;
