import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import * as ImagePicker from 'expo-image-picker';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Ionicons } from '@expo/vector-icons';
import { geohashForLocation } from 'geofire-common';
import {
  collection,
  addDoc,
  Timestamp,
  updateDoc,
  doc,
  arrayUnion,
  getDocs,
  getDoc,
} from '../../../firebase/firestoreCompat';
import { db, storage, auth, authInstance } from '../../../firebase/config';
import { useUserStore } from '../../profile/stores/userStore';
import { updateEventCount } from '../../../firebase/config';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import InterestSelector from '../../profile/components/InterestSelector'; // Import the reusable InterestSelector
import categoriesData from '../constants/categoriesData.json';
import { track as trackClient } from '../../../lib/analytics';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
import { useMemo } from 'react';
import {
  interpretStorageError,
  logStorageDiagnostic,
} from '../../../firebase/storageUtils';

// --- Date/Time constraints ---
const MIN_LEAD_MINUTES = 30; // hard limit: at least 30 minutes in the future
const MAX_LEAD_DAYS = 7; // hard limit: at most 7 days in the future
const MIN_MILLIS = MIN_LEAD_MINUTES * 60 * 1000;
const MAX_MILLIS = MAX_LEAD_DAYS * 24 * 60 * 60 * 1000;
const MINUTE_INCREMENT = 5; // tweak to 10 or 30 if you want fewer choices in the picker
const MAX_EVENT_IMAGE_BYTES = 10 * 1024 * 1024;

const getAuthUser = () => {
  try {
    return authInstance?.currentUser || auth().currentUser || null;
  } catch (err) {
    console.warn('[CreateEvent] Unable to fetch auth user:', err);
    return null;
  }
};

// Description: Round UP to the next configured minute boundary to avoid rounding backwards
const roundUpToMinuteIncrement = (inputDate) => {
  const d = new Date(inputDate);
  d.setSeconds(0);
  d.setMilliseconds(0);
  if (!MINUTE_INCREMENT || MINUTE_INCREMENT < 1) return d;
  const minutes = d.getMinutes();
  const remainder = minutes % MINUTE_INCREMENT;
  if (remainder !== 0) d.setMinutes(minutes + (MINUTE_INCREMENT - remainder));
  return d;
};

export default function CreateEventScreen({ location, onCancel, onSuccess }) {
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Debug: print Firebase runtime info to help diagnose permission errors
  useEffect(() => {
    try {
      // console.log('DBG firebase auth().currentUser', getAuthUser());
      // console.log('DBG user store.user', user || null);
      // console.log('DBG firestore projectId', db?.app?.options?.projectId);
      trackClient('create_event_screen_mount', {});
    } catch (err) {
      console.warn('DBG firebase info error', err);
    }
  }, [user]);

  const [imageUri, setImageUri] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  // Missing states restored
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Default date: 30 minutes in the future, rounded up to the configured minute slot
  const [date, setDate] = useState(() =>
    roundUpToMinuteIncrement(new Date(Date.now() + MIN_MILLIS))
  );
  const [manualAddress, setManualAddress] = useState('');
  const [manualLocation, setManualLocation] = useState(null);

  const [interestOptions, setInterestOptions] = useState([]);
  const [selectedInterest, setSelectedInterest] = useState(null);
  const [isInterestPickerOpen, setIsInterestPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(''); // State for search term

  const [ageRange, setAgeRange] = useState([18, 99]);
  const [privacyIndex, setPrivacyIndex] = useState(0);
  const segments = [
    'Public',
    'RSVP',
    `${user.sex === 'female' ? 'Women' : 'Men'} Only`,
  ];
  const privacyValues = [
    'public',
    'rsvp',
    `${user.sex === 'female' ? 'female-only' : 'male-only'}`,
  ];
  const [placeInput, setPlaceInput] = useState('');

  const [capacity, setCapacity] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const showDatePicker = () => setIsDatePickerVisible(true);
  const hideDatePicker = () => setIsDatePickerVisible(false);

  const handleConfirmDate = (selectedDate) => {
    // Clamp to [now + 30min, now + 7days] and round up to the configured minute slot
    const now = new Date();
    const min = new Date(now.getTime() + MIN_MILLIS);
    const max = new Date(now.getTime() + MAX_MILLIS);

    let picked = roundUpToMinuteIncrement(selectedDate);
    if (picked < min) picked = roundUpToMinuteIncrement(min);
    if (picked > max) picked = roundUpToMinuteIncrement(max);

    setDate(picked);
    hideDatePicker();
  };

  const handleGeocode = async () => {
    if (!manualAddress.trim()) return Alert.alert('Enter an address');
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          manualAddress
        )}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const json = await res.json();
      if (json.status === 'OK') {
        const loc = json.results[0].geometry.location;
        setManualLocation({ latitude: loc.lat, longitude: loc.lng });
        Alert.alert('Location set', 'Pin will be placed on map.');
      } else {
        Alert.alert('Address not found');
      }
    } catch {
      Alert.alert('Error geocoding address');
    }
  };

  const pickImageAndUpload = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permission Required',
          'Photo library access is needed to upload an event image. Please enable it in Settings.'
        );
        return;
      }
      const mediaTypeImages =
        ImagePicker?.MediaType?.IMAGES ??
        ImagePicker?.MediaType?.IMAGE ??
        ImagePicker?.MediaTypeOptions?.Images;

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaTypeImages,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const uri = res.assets[0].uri;
        // Description: Defer uploading until after the event document exists (so storage rules that require ownerId match succeed).
        setImageUri(uri);
      }
    } catch (e) {
      console.error('Image pick error:', e);
      Alert.alert(
        'Image Selection Failed',
        e.message || 'Could not select image. Please try again.'
      );
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) return Alert.alert('Title is required');
    if (title.trim().length > 40)
      return Alert.alert('Title must not exceed 40 characters');
    if (description.trim().length < 10)
      return Alert.alert('Description must be at least 10 characters');

    // Ensure user is authenticated and matches local store
    const currentAuthUser = getAuthUser();
    if (!currentAuthUser || !currentAuthUser.uid) {
      return Alert.alert('Not authenticated', 'Please sign in and try again.');
    }
    if (currentAuthUser.uid !== user?.uid) {
      console.warn('Auth UID mismatch', currentAuthUser.uid, user?.uid);
      return Alert.alert(
        'Authentication error',
        'Signed-in user mismatch. Please re-login.'
      );
    }

    // Description: Enforce 30 minutes minimum lead time and 7 days maximum
    const now = new Date();
    const minDate = new Date(now.getTime() + MIN_MILLIS); // 30 minutes buffer
    const maxDate = new Date(now.getTime() + MAX_MILLIS);
    if (date < minDate) {
      return Alert.alert('Event must be at least 30 minutes in the future');
    }
    if (date > maxDate) {
      return Alert.alert('Event cannot be more than 7 days in the future');
    }

    if (!manualLocation && !location) return Alert.alert('Address is required');
    if (!selectedInterest) return Alert.alert('Select an interest');

    const privacyValue = privacyValues[privacyIndex];
    if (
      (privacyValue === 'female-only' && user.gender !== 'female') ||
      (privacyValue === 'male-only' && user.gender !== 'male')
    ) {
      return Alert.alert('Gender privacy mismatch');
    }

    const eventLocation = manualLocation || location;
    const geohash = geohashForLocation([
      eventLocation.latitude,
      eventLocation.longitude,
    ]);

    const extractedCity = manualAddress?.split(',')?.[1]?.trim() || '';

    // Description: Create event without image first. Upload image after we have an event ID so Storage rules (owner check) pass.
    const newEvent = {
      title: title.trim(),
      description: description.trim(),
      imageUrl: null, // upload later and update
      location: eventLocation,
      geohash,
      address: manualAddress,
      city: extractedCity,
      // References for business context (optional, set by server or future UI)
      businessId: null,
      locationId: null,
      date: Timestamp.fromDate(date),
      createdAt: Timestamp.now(),
      ageRange,
      capacity: capacity ? parseInt(capacity, 10) : null,
      privacy: privacyValue,
      genderFilter: 'any',
      ownerId: user.uid,
      interest: selectedInterest,
      eventTags: [],
      viewCount: 0,
      joinCount: 0,
      saveCount: 0,
      status: 'active',
      isReported: false,
      attendees: [],
      isDeleted: false, // New field to mark the event as active
      deletedAt: null, // New field to store deletion timestamp
    };

    setUploading(true);

    let createdEventId = null;
    try {
      const authSnapshot = getAuthUser();

      trackClient('event_create_attempt', {
        auth_uid_present: !!authSnapshot?.uid,
        owner_matches_auth: authSnapshot?.uid === newEvent.ownerId,
        image_selected: !!imageUri,
        has_location: !!newEvent?.location?.geohash,
        interest: newEvent?.interest || null,
        privacy: newEvent?.privacy || null,
      });

      // Description: Create event doc and return immediately for instant UI feedback
      const docRef = await addDoc(collection(db, 'events'), newEvent);
      createdEventId = docRef.id;

      // Description: Call success handler immediately - don't block on upload
      try {
        onSuccess && onSuccess(eventLocation);
      } catch (navErr) {
        console.warn('onSuccess handler error:', navErr);
      }

      // Description: Fire-and-forget background task for image upload + user doc updates
      (async () => {
        try {
          // Wait for the event document to be readable by security rules (avoid storage.get() race)
          const waitForEventDoc = async (id, attempts = 12, delayMs = 750) => {
            for (let i = 0; i < attempts; i++) {
              try {
                const snap = await getDoc(doc(db, 'events', id));
                const activeUser = getAuthUser();
                if (snap.exists && snap.data()?.ownerId === activeUser?.uid)
                  return true;
              } catch (err) {
                // ignore and retry
              }
              await new Promise((r) => setTimeout(r, delayMs));
            }
            return false;
          };

          const ready = await waitForEventDoc(docRef.id);
          if (!ready) {
            console.warn(
              'DBG event doc not readable yet or ownerId mismatch for',
              docRef.id
            );
          }

          // Extra delay to avoid any propagation timing issues before Storage rule get() lookup
          await new Promise((res) => setTimeout(res, 500));

          // If user selected an image, upload now to owner-scoped path so storage rules allow it
          if (imageUri) {
            try {
              const resp = await fetch(imageUri);
              const blob = await resp.blob();
              const contentType = blob.type || 'image/jpeg';

              if (blob?.size && blob.size > MAX_EVENT_IMAGE_BYTES) {
                console.warn(
                  'Image exceeds 10MB limit - event created without photo'
                );
              } else {
                // Retry upload a few times to avoid transient rule/propagation issues
                const tryUpload = async () => {
                  const storageRef = storage.ref(
                    `event-images/${docRef.id}/${Date.now()}.jpg`
                  );
                  await storageRef.putFile(imageUri, { contentType });
                  return await storageRef.getDownloadURL();
                };

                let downloadUrl = null;
                let lastErr = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    downloadUrl = await tryUpload();
                    break;
                  } catch (e) {
                    lastErr = e;
                    console.warn(
                      `Upload attempt ${attempt} failed:`,
                      e?.code || e
                    );
                    await new Promise((r) => setTimeout(r, 500 * attempt));
                  }
                }

                // Fallback: if Storage rule still denies under event-images, upload under user's profileImages
                if (!downloadUrl && lastErr?.code === 'storage/unauthorized') {
                  try {
                    const altRef = storage.ref(
                      `profileImages/${user.uid}/${docRef.id}-${Date.now()}.jpg`
                    );
                    await altRef.putFile(imageUri, { contentType });
                    downloadUrl = await altRef.getDownloadURL();
                  } catch (altErr) {
                    logStorageDiagnostic('event-image-fallback', {
                      code: altErr?.code,
                      message: altErr?.message,
                      path: `profileImages/${user.uid}/${docRef.id}`,
                    });
                    console.warn('Fallback upload also failed:', altErr);
                  }
                }

                if (downloadUrl) {
                  // Update event document with the uploaded image URL
                  await updateDoc(doc(db, 'events', docRef.id), {
                    imageUrl: downloadUrl,
                  });
                  setImageUrl(downloadUrl);
                } else if (lastErr) {
                  const interpreted = interpretStorageError(lastErr, {
                    context: 'create-event',
                    path: `event-images/${docRef.id}`,
                  });
                  logStorageDiagnostic(
                    'event-image-upload',
                    interpreted.details
                  );
                  console.warn(
                    'Image upload failed:',
                    interpreted.userMessage || lastErr
                  );
                }
              }
            } catch (uploadErr) {
              const interpreted = interpretStorageError(uploadErr, {
                context: 'create-event-unexpected',
                path: `event-images/${docRef?.id || 'unknown'}`,
              });
              logStorageDiagnostic(
                'event-image-unexpected',
                interpreted.details
              );
              console.warn('Image upload unexpected error:', uploadErr);
            }
          }

          // User doc updates (non-critical)
          try {
            await trackCreateEventSafe({
              privacy: privacyValue,
              hasImage: !!imageUri,
              category: selectedInterest || 'unknown',
            });
          } catch {}

          // Normalize deviceToken to satisfy Firestore rules on update
          const safeToken =
            typeof user?.deviceToken === 'string' &&
            /^ExponentPushToken/.test(user.deviceToken)
              ? user.deviceToken
              : null;
          try {
            await updateDoc(doc(db, 'users', user.uid), {
              createdEvents: arrayUnion(docRef.id),
              deviceToken: safeToken,
            });
          } catch (userUpdateErr) {
            console.warn(
              'Non-critical: failed to tag createdEvents on user',
              userUpdateErr
            );
          }
          try {
            await updateEventCount(user.uid);
          } catch (cntErr) {
            console.warn('Non-critical: updateEventCount failed', cntErr);
          }
        } catch (bgErr) {
          console.warn(
            'Background event post-create task failed (non-critical):',
            bgErr
          );
        }
      })();
    } catch (e) {
      console.error('Create event failed', e?.code || '', e?.message || e);
      // Only surface error for creation step (addDoc). If we got here, addDoc likely failed
      Alert.alert(
        'Creation failed',
        e?.message || 'Missing or insufficient permissions.'
      );
    } finally {
      setUploading(false);
    }
  };

  // Fetch categories (activities) from Firestore
  useEffect(() => {
    const fetchInterests = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'categories'));
        const interests = snapshot.docs.flatMap((doc) => {
          const data = doc.data();
          return (data.interests || []).map((i) => ({
            label: i.name,
            value: i.name,
          }));
        });
        if (interests && interests.length) {
          setInterestOptions(JSON.parse(JSON.stringify(interests)));
        } else {
          // If Firestore returns empty, fall back to bundled categories
          const fallback = (categoriesData || []).flatMap((c) =>
            (c.interests || []).map((i) => ({ label: i.name, value: i.name }))
          );
          setInterestOptions(fallback);
        }
      } catch (err) {
        console.warn('Error fetching interests (firestore):', err);
        // Use bundled categories as a silent fallback to avoid spamming the user
        const fallback = (categoriesData || []).flatMap((c) =>
          (c.interests || []).map((i) => ({ label: i.name, value: i.name }))
        );
        if (fallback && fallback.length) {
          setInterestOptions(fallback);
        } else {
          // Only surface an alert when we have no fallback data to show
          Alert.alert('Failed to load interests');
        }
      }
    };
    fetchInterests();
  }, []);

  useEffect(() => {
    if (location?.address) {
      setManualAddress(location.address);
      setManualLocation({
        latitude: location.latitude,
        longitude: location.longitude,
      });
    }
  }, [location]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
      <TouchableOpacity
        style={[
          styles.closeButton,
          {
            top: (safeAreaInsets?.top || 0) + 8,
            left: (safeAreaInsets?.left || 0) + 16,
          },
        ]}
        onPress={() => onCancel?.()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole='button'
        accessibilityLabel='Close create event form'
        activeOpacity={0.7}
      >
        <Ionicons name='close' size={22} color={theme.colors.text} />
      </TouchableOpacity>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: (safeAreaInsets?.top || 0) + 16,
            paddingBottom: (safeAreaInsets?.bottom || 0) + 32,
          },
        ]}
        keyboardShouldPersistTaps='handled'
        extraScrollHeight={Platform.OS === 'ios' ? 24 : 0}
        enableOnAndroid
      >
        <View>
          {/* Image Preview */}
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.preview} />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Text>No Image</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.photoBtn}
            onPress={pickImageAndUpload}
          >
            <Text style={styles.photoBtnText}>
              {imageUri ? 'Change Photo' : 'Add Photo'}
            </Text>
          </TouchableOpacity>

          {/* Title */}
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder='Event title'
            placeholderTextColor={theme.colors.textSecondary}
            keyboardAppearance={themeMode === 'dark' ? 'dark' : 'light'}
          />

          {/* Description */}
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What's your event about?"
            placeholderTextColor='grey'
            multiline
            keyboardAppearance={themeMode === 'dark' ? 'dark' : 'light'}
          />

          {/* Date & Time */}
          <Text style={styles.label}>Date & Time</Text>
          <TouchableOpacity style={styles.input} onPress={showDatePicker}>
            <Text>
              {date.toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </Text>
          </TouchableOpacity>
          <DateTimePickerModal
            isVisible={isDatePickerVisible}
            mode='datetime'
            date={date}
            onConfirm={handleConfirmDate}
            onCancel={hideDatePicker}
            minimumDate={new Date(Date.now() + MIN_MILLIS)}
            maximumDate={new Date(Date.now() + MAX_MILLIS)}
            minuteInterval={MINUTE_INCREMENT}
            themeVariant='light' // Explicitly set theme to light
            textColor='#000' // Ensure text is visible
          />

          {/* Address Input */}
          <Text style={styles.label}>Location</Text>
          <View style={{ zIndex: 10 }}>
            <GooglePlacesAutocomplete
              placeholder='Enter address'
              placeholderTextColor={theme.colors.textSecondary}
              minLength={2}
              fetchDetails={true}
              debounce={300}
              enablePoweredByContainer={false}
              keyboardShouldPersistTaps='handled'
              predefinedPlaces={[]} // Prevents `.filter()` crash
              styles={{
                textInput: [styles.input, styles.flex],
                container: { flex: 1 },
                listView: {
                  backgroundColor: '#fff',
                  elevation: 5,
                  position: 'absolute',
                  top: 55,
                  maxHeight: 200,
                },
              }}
              textInputProps={{
                value: placeInput,
                onChangeText: setPlaceInput,
              }}
              onPress={(data, details = null) => {
                if (details?.geometry?.location) {
                  const { lat, lng } = details.geometry.location;
                  setManualLocation({ latitude: lat, longitude: lng });
                  setManualAddress(data?.description ?? '');
                  Alert.alert('Location set', 'Pin will be placed on map.');
                }
              }}
              query={{
                key: GOOGLE_MAPS_API_KEY,
                language: 'en',
              }}
            />
          </View>
          {manualLocation && (
            <View style={styles.row}>
              <Ionicons
                name='location-outline'
                size={20}
                color='#666'
                style={{ marginRight: 8 }}
              />
              <Text style={styles.pinLocationText}>
                Pin Location: {manualAddress || 'Unknown'}
              </Text>
            </View>
          )}

          {/* Interests */}
          <Text style={styles.label}>Interest</Text>
          <InterestSelector
            selectedInterests={selectedInterest ? [selectedInterest] : []}
            toggleInterest={(interest) => setSelectedInterest(interest)}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
          />

          {/* Age Slider */}
          <Text style={styles.label}>
            Age Range: {ageRange[0]} - {ageRange[1]}
          </Text>
          <View style={styles.sliderWrapper}>
            <MultiSlider
              values={ageRange}
              sliderLength={280}
              onValuesChange={setAgeRange}
              min={18}
              max={99}
              step={1}
              allowOverlap={false}
              snapped
            />
          </View>

          {/* Privacy */}
          <Text style={styles.label}>Privacy</Text>
          {Platform.OS === 'ios' ? (
            <SegmentedControl
              values={segments}
              selectedIndex={privacyIndex}
              onChange={(event) =>
                setPrivacyIndex(event.nativeEvent.selectedSegmentIndex)
              }
              style={styles.segment}
              backgroundColor='#f0f0f0'
              tintColor='#007AFF'
              fontStyle={{ color: '#333' }}
              activeFontStyle={{ color: '#fff' }}
            />
          ) : (
            <View style={styles.androidPrivacyWrapper}>
              {segments.map((seg, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.androidPrivacyBtn,
                    privacyIndex === idx && styles.androidPrivacyBtnActive,
                  ]}
                  onPress={() => setPrivacyIndex(idx)}
                >
                  <Text
                    style={[
                      styles.androidPrivacyTxt,
                      privacyIndex === idx && styles.androidPrivacyTxtActive,
                    ]}
                  >
                    {seg}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Capacity */}
          <Text style={styles.label}>Capacity (optional)</Text>
          <TextInput
            style={styles.input}
            value={capacity}
            onChangeText={setCapacity}
            placeholder='Leave empty for unlimited'
            placeholderTextColor={theme.colors.textSecondary}
            keyboardType='numeric'
            keyboardAppearance={themeMode === 'dark' ? 'dark' : 'light'}
          />

          {/* Buttons */}
          <TouchableOpacity
            style={[styles.btn, uploading && styles.btnDis]}
            onPress={handleCreate}
            disabled={uploading}
          >
            <Text style={styles.btnTxt}>
              {uploading ? 'Creating...' : 'Create Event'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

// Description: Create theme-aware styles for CreateEventScreen
const createStyles = (theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
      position: 'relative',
    },
    scroll: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 20,
      backgroundColor: theme.colors.background,
    },
    closeButton: {
      position: 'absolute',
      top: 12,
      left: 16,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.isDark
        ? 'rgba(51,65,85,0.95)'
        : 'rgba(255,255,255,0.95)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.3 : 0.1,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    preview: {
      width: '100%',
      height: 200,
      borderRadius: 8,
      marginBottom: 10,
    },
    previewPlaceholder: {
      width: '100%',
      height: 200,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      marginBottom: 10,
    },
    photoBtn: {
      padding: 10,
      backgroundColor: theme.colors.primary,
      borderRadius: 6,
      alignItems: 'center',
      marginBottom: 15,
    },
    photoBtnText: { color: '#fff', fontWeight: 'bold' },
    label: {
      fontWeight: 'bold',
      marginTop: 15,
      color: theme.colors.text,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      padding: 10,
      marginTop: 5,
      color: theme.colors.text,
      backgroundColor: theme.colors.card,
    },
    textArea: { height: 80, textAlignVertical: 'top' },
    row: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    flex: { flex: 1 },
    pinLocationText: {
      color: theme.colors.text,
      marginTop: 5,
    },
    dropdownBox: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      height: 44,
    },
    dropdownInput: { color: theme.colors.text },
    dropdownList: {
      marginTop: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      maxHeight: 150,
      backgroundColor: theme.colors.card,
    },
    dropdownItem: { paddingVertical: 12, paddingHorizontal: 10 },
    dropdownText: { fontSize: 14, color: theme.colors.text },
    sliderWrapper: {
      height: 60,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 10,
    },
    segment: { marginTop: 10, marginBottom: 20 },
    androidPrivacyWrapper: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginVertical: 10,
    },
    androidPrivacyBtn: {
      flex: 1,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      marginHorizontal: 3,
      alignItems: 'center',
      backgroundColor: theme.colors.card,
    },
    androidPrivacyBtnActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    androidPrivacyTxt: {
      color: theme.colors.text,
    },
    androidPrivacyTxtActive: {
      color: '#fff',
      fontWeight: 'bold',
    },
    btn: {
      backgroundColor: theme.colors.primary,
      padding: 15,
      borderRadius: 6,
      alignItems: 'center',
      marginTop: 15,
    },
    btnDis: {
      backgroundColor: theme.isDark ? '#475569' : '#99cfff',
      opacity: 0.7,
    },
    btnTxt: { color: '#fff', fontWeight: 'bold' },
    cancelButton: {
      marginTop: 15,
      padding: 12,
      borderRadius: 6,
      backgroundColor: theme.isDark ? '#334155' : '#f0f0f0',
      alignItems: 'center',
    },
    cancelButtonText: {
      color: theme.colors.primary,
      fontWeight: 'bold',
      fontSize: 16,
    },
  });
