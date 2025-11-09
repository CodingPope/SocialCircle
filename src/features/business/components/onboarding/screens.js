// Description: Streamlined business onboarding screens (Intro -> Basics -> Location -> Review)
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  useBizOnboarding,
  BUSINESS_ONBOARDING_STAGES,
} from '../../stores/businessOnboardingStore';
import { useAuth } from '../../../auth/context/AuthContext';

const STAGE_SEQUENCE = [
  BUSINESS_ONBOARDING_STAGES.BASICS,
  BUSINESS_ONBOARDING_STAGES.LOCATION,
  BUSINESS_ONBOARDING_STAGES.REVIEW,
];

const STAGE_LABELS = {
  [BUSINESS_ONBOARDING_STAGES.INTRO]: 'Get started',
  [BUSINESS_ONBOARDING_STAGES.BASICS]: 'Basics',
  [BUSINESS_ONBOARDING_STAGES.LOCATION]: 'Location',
  [BUSINESS_ONBOARDING_STAGES.REVIEW]: 'Review & submit',
  [BUSINESS_ONBOARDING_STAGES.DONE]: 'Live',
};

export const stageToScreen = (stage) => {
  switch (stage) {
    case BUSINESS_ONBOARDING_STAGES.BASICS:
      return 'Basics';
    case BUSINESS_ONBOARDING_STAGES.LOCATION:
      return 'Location';
    case BUSINESS_ONBOARDING_STAGES.REVIEW:
    case BUSINESS_ONBOARDING_STAGES.DONE:
      return 'Review';
    default:
      return 'Intro';
  }
};

const ProgressHeader = ({ stage }) => {
  const index = STAGE_SEQUENCE.findIndex((value) => value === stage);
  const total = STAGE_SEQUENCE.length;
  const progress =
    stage === BUSINESS_ONBOARDING_STAGES.DONE
      ? 100
      : Math.max(0, index) >= 0
      ? ((index + 1) / total) * 100
      : 0;

  const activeIndex =
    stage === BUSINESS_ONBOARDING_STAGES.DONE ? total - 1 : Math.max(index, 0);

  return (
    <View style={{ marginBottom: 24 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <Text style={{ fontSize: 12, color: '#666' }}>
          {STAGE_LABELS[stage] || 'Get started'}
        </Text>
        <Text style={{ fontSize: 12, color: '#666', fontWeight: '600' }}>
          {Math.round(progress)}% complete
        </Text>
      </View>
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: '#E0E0E0',
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${progress}%`,
            height: '100%',
            borderRadius: 3,
            backgroundColor: '#2F80ED',
          }}
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 10,
        }}
      >
        {STAGE_SEQUENCE.map((value, idx) => (
          <View key={value} style={{ alignItems: 'center', flex: 1 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: idx <= activeIndex ? '#2F80ED' : '#D5DBE4',
              }}
            />
            <Text
              numberOfLines={1}
              style={{ fontSize: 10, color: '#888', marginTop: 6 }}
            >
              {STAGE_LABELS[value]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const InfoPill = ({ icon = 'information-circle-outline', text }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      backgroundColor: '#EBF2FF',
      marginBottom: 12,
    }}
  >
    <Ionicons
      name={icon}
      size={20}
      color='#2F80ED'
      style={{ marginRight: 10 }}
    />
    <Text style={{ color: '#1A1A1A', flex: 1 }}>{text}</Text>
  </View>
);

const MissingDraftNotice = ({ navigation, message }) => (
  <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Ionicons
        name='alert-circle-outline'
        size={56}
        color='#2F80ED'
        style={{ marginBottom: 16 }}
      />
      <Text
        style={{
          fontSize: 18,
          fontWeight: '700',
          color: '#1A1A1A',
          marginBottom: 8,
        }}
      >
        Finish business setup
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: '#666',
          textAlign: 'center',
          lineHeight: 20,
          marginBottom: 20,
        }}
      >
        {message ||
          'We could not find your business draft. Start again to continue.'}
      </Text>
      <TouchableOpacity
        onPress={() => navigation.replace('Intro')}
        style={{
          backgroundColor: '#2F80ED',
          paddingVertical: 12,
          paddingHorizontal: 24,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>
          Return to start
        </Text>
      </TouchableOpacity>
    </View>
  </SafeAreaView>
);

export function IntroScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const {
    start,
    stage,
    loading,
    error,
    draft,
    bizId,
    resumeLatestDraft,
    hydrated,
  } = useBizOnboarding();
  const [refreshing, setRefreshing] = useState(false);
  const hasDraft = Boolean(bizId);
  const resumeRoute = stageToScreen(stage);

  const handleStart = async () => {
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to continue.');
      return;
    }
    // Description: Pass user.uid to start() to ensure proper auth context
    const id = await start(user.uid);
    if (id) {
      navigation.navigate('Basics');
    } else if (error) {
      // Description: Show alert for auth-specific errors
      const isAuthError =
        error?.toLowerCase().includes('unauthenticated') ||
        error?.toLowerCase().includes('sign in') ||
        error?.toLowerCase().includes('authentication');
      if (isAuthError) {
        Alert.alert(
          'Authentication Error',
          'Your session may have expired. Please sign out and sign back in.',
          [{ text: 'OK' }]
        );
      }
    }
  };

  const handleResume = () => {
    navigation.navigate(resumeRoute);
  };

  const handleRefresh = async () => {
    if (!user?.uid) return;
    setRefreshing(true);
    await resumeLatestDraft(user.uid, { force: true });
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Ionicons name='briefcase' size={64} color='#2F80ED' />
          <Text
            style={{
              fontSize: 26,
              fontWeight: '700',
              color: '#1A1A1A',
              marginTop: 16,
            }}
          >
            Set up your business
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: '#666',
              textAlign: 'center',
              marginTop: 8,
              lineHeight: 22,
            }}
          >
            Create a Social Circle business profile in just a few minutes. You
            can finish advanced settings later.
          </Text>
        </View>

        <InfoPill text='Step 1: Add basics → Step 2: Pin your location → Step 3: Review & submit.' />

        {hasDraft && (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#D5DBE4',
              backgroundColor: '#FFF',
              borderRadius: 16,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A1A' }}>
              {draft?.displayName || 'Untitled business'}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: '#2F80ED',
                fontWeight: '600',
                marginTop: 4,
              }}
            >
              {STAGE_LABELS[stage]}
            </Text>
            <TouchableOpacity
              onPress={handleResume}
              style={{
                marginTop: 16,
                backgroundColor: '#2F80ED',
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#FFF', fontWeight: '600' }}>
                Resume setup
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRefresh}
              disabled={refreshing}
              style={{
                marginTop: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#2F80ED',
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              {refreshing ? (
                <ActivityIndicator color='#2F80ED' />
              ) : (
                <Text style={{ color: '#2F80ED', fontWeight: '600' }}>
                  Refresh status
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {error && (
          <View
            style={{
              backgroundColor: '#FEE',
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              borderLeftWidth: 4,
              borderLeftColor: '#E53E3E',
            }}
          >
            <Text style={{ color: '#C53030' }}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          disabled={loading}
          onPress={handleStart}
          style={{
            backgroundColor: loading ? '#A0AEC0' : '#2F80ED',
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 6,
            elevation: 3,
          }}
        >
          {loading ? (
            <ActivityIndicator color='#FFF' />
          ) : (
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>
              {hasDraft ? 'Start a new business' : 'Start business setup'}
            </Text>
          )}
        </TouchableOpacity>

        {!hydrated && (
          <Text
            style={{
              fontSize: 12,
              color: '#999',
              textAlign: 'center',
              marginTop: 16,
            }}
          >
            Checking for an existing business draft…
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export function BasicsScreen() {
  const navigation = useNavigation();
  const { bizId, draft, loading, error, saveBasics, stage } =
    useBizOnboarding();
  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!draft) return;
    setDisplayName(draft.displayName || '');
    setCategory(draft.category || '');
    setDescription(draft.description || '');
    setWebsite(draft.website || '');
    setSupportEmail(draft.supportEmail || '');
    setPhone(draft.phone || '');
  }, [draft]);

  if (!bizId) {
    return (
      <MissingDraftNotice
        navigation={navigation}
        message='Start a business draft to add your basics.'
      />
    );
  }

  const handleContinue = async () => {
    const ok = await saveBasics({
      displayName,
      category,
      description,
      website,
      supportEmail,
      phone,
    });
    if (ok) navigation.navigate('Location');
  };

  const disabled = !displayName.trim() || !category.trim() || loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <ProgressHeader stage={stage} />
          <Text
            style={{
              fontSize: 24,
              fontWeight: '700',
              color: '#1A1A1A',
              marginBottom: 6,
            }}
          >
            Tell us about your business
          </Text>
          <Text style={{ fontSize: 15, color: '#666', marginBottom: 20 }}>
            This info helps people discover and trust your events.
          </Text>

          <InputBlock
            label='Business name'
            value={displayName}
            onChangeText={setDisplayName}
            placeholder='e.g., The Coffee House'
            required
          />
          <InputBlock
            label='Category'
            value={category}
            onChangeText={setCategory}
            placeholder='e.g., Cafe, Fitness Studio, Coworking'
            required
          />
          <TextBlock
            label='Short description'
            value={description}
            onChangeText={setDescription}
            placeholder='What makes your business special?'
            maxLength={200}
          />
          <InputBlock
            label='Website'
            value={website}
            onChangeText={setWebsite}
            placeholder='https://...'
          />
          <InputBlock
            label='Support email'
            value={supportEmail}
            onChangeText={setSupportEmail}
            placeholder='hello@business.com'
          />
          <InputBlock
            label='Phone'
            value={phone}
            onChangeText={setPhone}
            placeholder='(555) 555-5555'
          />

          {error && (
            <View
              style={{
                backgroundColor: '#FEE',
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                borderLeftWidth: 4,
                borderLeftColor: '#E53E3E',
              }}
            >
              <Text style={{ color: '#C53030' }}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            disabled={disabled}
            onPress={handleContinue}
            style={{
              backgroundColor: disabled ? '#A0AEC0' : '#2F80ED',
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
              marginTop: 12,
            }}
          >
            {loading ? (
              <ActivityIndicator color='#FFF' />
            ) : (
              <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 16 }}>
                Save & continue
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function LocationScreen() {
  const navigation = useNavigation();
  const { bizId, locations, loading, error, saveLocation, stage } =
    useBizOnboarding();
  const primary = useMemo(
    () => (Array.isArray(locations) ? locations[0] : null),
    [locations]
  );
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('US');
  const [coordinates, setCoordinates] = useState(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!primary) return;
    setLabel(primary.label || '');
    setAddress(primary.address || '');
    setCity(primary.city || '');
    setState(primary.state || '');
    setCountry(primary.country || 'US');
    if (
      typeof primary.latitude === 'number' &&
      typeof primary.longitude === 'number'
    ) {
      setCoordinates({
        latitude: primary.latitude,
        longitude: primary.longitude,
      });
    }
  }, [primary]);

  if (!bizId) {
    return (
      <MissingDraftNotice
        navigation={navigation}
        message='Start a draft before adding your location.'
      />
    );
  }

  const verifyAddress = async () => {
    if (!address || !city) {
      Alert.alert('Missing info', 'Enter your address and city first.');
      return;
    }
    setVerifying(true);
    try {
      const query = `${address}, ${city}, ${state || ''} ${
        country || ''
      }`.trim();
      const results = await Location.geocodeAsync(query);
      if (results && results.length > 0) {
        const { latitude, longitude } = results[0];
        setCoordinates({ latitude, longitude });
        Alert.alert(
          'Location found',
          'We matched your address to a map point.'
        );
      } else {
        Alert.alert('Not found', 'We could not locate that address.');
      }
    } catch (err) {
      console.warn('Geocode error', err);
      Alert.alert('Error', 'Unable to verify that address.');
    } finally {
      setVerifying(false);
    }
  };

  const useCurrentLocation = async () => {
    setVerifying(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission denied',
          'Allow location access to use this feature.'
        );
        setVerifying(false);
        return;
      }
      const result = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = result.coords;
      setCoordinates({ latitude, longitude });
      const addresses = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });
      if (addresses && addresses.length > 0) {
        const addr = addresses[0];
        setAddress(`${addr.streetNumber || ''} ${addr.street || ''}`.trim());
        setCity(addr.city || '');
        setState(addr.region || '');
        setCountry(addr.isoCountryCode?.toUpperCase() || 'US');
      }
      Alert.alert(
        'Location set',
        'We used your current location as the business address.'
      );
    } catch (err) {
      console.warn('Location error', err);
      Alert.alert('Error', 'Unable to fetch your current location.');
    } finally {
      setVerifying(false);
    }
  };

  const handleContinue = async () => {
    if (!coordinates) {
      Alert.alert('Verify address', 'Please verify your address to continue.');
      return;
    }
    const ok = await saveLocation({
      label: label.trim() || `${city || 'Primary'} location`,
      address,
      city,
      state,
      country,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    });
    if (ok) {
      navigation.navigate('Review');
    }
  };

  const disabled = loading || !address.trim() || !city.trim() || !coordinates;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <ProgressHeader stage={stage} />
          <Text
            style={{
              fontSize: 24,
              fontWeight: '700',
              color: '#1A1A1A',
              marginBottom: 6,
            }}
          >
            Where do you host?
          </Text>
          <Text style={{ fontSize: 15, color: '#666', marginBottom: 20 }}>
            Pin your primary location so nearby members can find you.
          </Text>

          <InputBlock
            label='Location label'
            value={label}
            onChangeText={setLabel}
            placeholder='Main studio, Downtown cafe'
          />
          <InputBlock
            label='Street address'
            value={address}
            onChangeText={setAddress}
            placeholder='123 Market St'
            required
          />
          <InputBlock
            label='City'
            value={city}
            onChangeText={setCity}
            placeholder='San Francisco'
            required
          />
          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            <InputInline
              label='State / Region'
              value={state}
              onChangeText={setState}
            />
            <InputInline
              label='Country'
              value={country}
              onChangeText={setCountry}
              style={{ marginRight: 0 }}
            />
          </View>

          <TouchableOpacity
            onPress={verifyAddress}
            disabled={verifying || !address || !city}
            style={{
              padding: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#2F80ED',
              backgroundColor: '#EBF5FF',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            {verifying ? (
              <ActivityIndicator color='#2F80ED' />
            ) : (
              <Text style={{ color: '#2F80ED', fontWeight: '600' }}>
                Verify address
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={useCurrentLocation}
            disabled={verifying}
            style={{
              padding: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#27AE60',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <Text style={{ color: '#27AE60', fontWeight: '600' }}>
              Use current location
            </Text>
          </TouchableOpacity>

          {coordinates && (
            <View
              style={{
                backgroundColor: '#E8F5E9',
                padding: 12,
                borderRadius: 10,
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <Ionicons
                name='checkmark-circle'
                size={22}
                color='#27AE60'
                style={{ marginRight: 10 }}
              />
              <Text style={{ color: '#1A1A1A', flex: 1 }}>
                Ready to save: {coordinates.latitude.toFixed(4)},{' '}
                {coordinates.longitude.toFixed(4)}
              </Text>
            </View>
          )}

          {error && (
            <View
              style={{
                backgroundColor: '#FEE',
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                borderLeftWidth: 4,
                borderLeftColor: '#E53E3E',
              }}
            >
              <Text style={{ color: '#C53030' }}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            disabled={disabled}
            onPress={handleContinue}
            style={{
              backgroundColor: disabled ? '#A0AEC0' : '#2F80ED',
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
            }}
          >
            {loading ? (
              <ActivityIndicator color='#FFF' />
            ) : (
              <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 16 }}>
                Save & review
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ReviewScreen() {
  const navigation = useNavigation();
  const {
    draft,
    locations,
    stage,
    loading,
    error,
    submit,
    refreshDraft,
    bizId,
  } = useBizOnboarding();
  const primary = useMemo(
    () => (Array.isArray(locations) ? locations[0] : null),
    [locations]
  );

  useEffect(() => {
    if (bizId && (!draft || !primary)) {
      refreshDraft({ silent: true });
    }
  }, [bizId, draft, primary, refreshDraft]);

  if (!bizId) {
    return (
      <MissingDraftNotice
        navigation={navigation}
        message='Start onboarding before reviewing.'
      />
    );
  }

  const isActive = stage === BUSINESS_ONBOARDING_STAGES.DONE;

  const handleSubmit = async () => {
    const res = await submit(true);
    if (res) {
      Alert.alert('Submitted', 'We will review your business shortly.');
    }
  };

  const goTo = (target) => navigation.navigate(target);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <ProgressHeader stage={stage} />
        <Text
          style={{
            fontSize: 24,
            fontWeight: '700',
            color: '#1A1A1A',
            marginBottom: 8,
          }}
        >
          Review & launch
        </Text>
        <Text style={{ fontSize: 15, color: '#666', marginBottom: 20 }}>
          Double-check your info and submit when you’re ready. You can make
          additional changes later from Business Settings.
        </Text>

        <SummaryCard
          title='Business basics'
          status={draft?.displayName ? 'Complete' : 'Missing'}
          description={draft?.displayName || 'Add your business name'}
          onEdit={() => goTo('Basics')}
        />

        <SummaryCard
          title='Primary location'
          status={primary ? 'Complete' : 'Missing'}
          description={
            primary
              ? `${primary.address || ''} · ${primary.city || ''}`
              : 'Add your address'
          }
          onEdit={() => goTo('Location')}
        />

        {error && (
          <View
            style={{
              backgroundColor: '#FEE',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              borderLeftWidth: 4,
              borderLeftColor: '#E53E3E',
            }}
          >
            <Text style={{ color: '#C53030' }}>{error}</Text>
          </View>
        )}

        {isActive ? (
          <View
            style={{
              backgroundColor: '#E8F5E9',
              padding: 16,
              borderRadius: 12,
              marginBottom: 16,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Ionicons
              name='rocket'
              size={28}
              color='#27AE60'
              style={{ marginRight: 12 }}
            />
            <Text style={{ color: '#1A1A1A', flex: 1 }}>
              Your business is live! You can manage events and settings anytime.
            </Text>
          </View>
        ) : (
          <InfoPill
            icon='shield-checkmark-outline'
            text='Submissions may take up to 1 business day to approve.'
          />
        )}

        <TouchableOpacity
          onPress={
            isActive
              ? () => navigation.getParent()?.navigate('BusinessTabs')
              : handleSubmit
          }
          style={{
            backgroundColor: '#2F80ED',
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
            marginTop: 12,
          }}
        >
          {loading ? (
            <ActivityIndicator color='#FFF' />
          ) : (
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>
              {isActive ? 'Go to business home' : 'Submit for review'}
            </Text>
          )}
        </TouchableOpacity>

        {!isActive && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ alignItems: 'center', marginTop: 16 }}
          >
            <Text style={{ color: '#666', fontSize: 15 }}>Back</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InputBlock({ label, required, ...props }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: '#1A1A1A',
          marginBottom: 6,
        }}
      >
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        {...props}
        style={{
          borderWidth: 1,
          borderColor: '#E0E0E0',
          borderRadius: 10,
          padding: 14,
          fontSize: 15,
          backgroundColor: '#FFF',
        }}
      />
    </View>
  );
}

function TextBlock({ label, ...props }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: '#1A1A1A',
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <TextInput
        {...props}
        multiline
        numberOfLines={4}
        style={{
          borderWidth: 1,
          borderColor: '#E0E0E0',
          borderRadius: 10,
          padding: 14,
          fontSize: 15,
          backgroundColor: '#FFF',
          textAlignVertical: 'top',
          minHeight: 120,
        }}
      />
    </View>
  );
}

function InputInline({ label, style, ...props }) {
  return (
    <View style={[{ flex: 1, marginRight: 12 }, style]}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: '#1A1A1A',
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <TextInput
        {...props}
        style={{
          borderWidth: 1,
          borderColor: '#E0E0E0',
          borderRadius: 10,
          padding: 14,
          fontSize: 15,
          backgroundColor: '#FFF',
        }}
      />
    </View>
  );
}

function SummaryCard({ title, description, status, onEdit }) {
  return (
    <View
      style={{
        backgroundColor: '#FFF',
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A1A' }}>
          {title}
        </Text>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: status === 'Complete' ? '#E8F5E9' : '#FFF8EB',
          }}
        >
          <Text
            style={{
              color: status === 'Complete' ? '#27AE60' : '#F2994A',
              fontSize: 12,
              fontWeight: '600',
            }}
          >
            {status}
          </Text>
        </View>
      </View>
      <Text style={{ color: '#4A5568', marginBottom: 12 }}>{description}</Text>
      <TouchableOpacity
        onPress={onEdit}
        style={{
          alignSelf: 'flex-start',
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: '#2F80ED',
        }}
      >
        <Text style={{ color: '#2F80ED', fontWeight: '600' }}>Edit</Text>
      </TouchableOpacity>
    </View>
  );
}
