import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../../theme';
import { useAuth } from '../../../../features/auth/context/AuthContext';
import { db, functions } from '../../../../services/firebase';
import { getBusinessCapabilities } from '../../../../lib/business/businessCapabilities';
import BusinessTargetPicker from '../BusinessTargetPicker';
import InterestSelector from '../../../profile/components/InterestSelector';
import { Timestamp } from '../../../../services/firebase/firestoreCompat';

const MIN_LEAD_MINUTES = 30;
const MAX_LEAD_DAYS = 7;

// Description: Business event creation form with tier validation and required anchor
export default function BusinessEventForm({ navigation, route }) {
  const theme = useTheme();
  const { user } = useAuth();
  const businessId = route?.params?.businessId || user?.businessId;
  const [business, setBusiness] = useState(null);

  const businessTier = useMemo(() => {
    const tierFromParams = route?.params?.businessTier;
    const tierFromBusiness = business?.tier || business?.businessTier;
    return tierFromParams || tierFromBusiness || 'TIER_1_FREE';
  }, [route?.params?.businessTier, business]);

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [monthlyUsage, setMonthlyUsage] = useState({ used: 0, limit: 0 });
  const [activeCount, setActiveCount] = useState({ used: 0, limit: 0 });
  const [checkingLimits, setCheckingLimits] = useState(true);
  const [checkingAnchors, setCheckingAnchors] = useState(true);
  const [hasAnchor, setHasAnchor] = useState(true);

  const capabilities = useMemo(
    () => getBusinessCapabilities(businessTier),
    [businessTier],
  );

  // Load business data
  useEffect(() => {
    if (!businessId) {
      setBusiness(null);
      setHasAnchor(false);
      setCheckingAnchors(false);
      return;
    }

    let active = true;

    const unsub = db
      .collection('businesses')
      .doc(businessId)
      .onSnapshot(
        (snap) => {
          if (!active) return;
          if (snap.exists) {
            setBusiness({ id: snap.id, ...snap.data() });
          } else {
            setBusiness(null);
          }
        },
        (error) => {
          console.error('[BusinessEventForm] Error loading business:', error);
          if (active) {
            setBusiness(null);
            setHasAnchor(false);
          }
        },
      );

    return () => {
      active = false;
      unsub?.();
    };
  }, [businessId]);

  // Check anchor presence (location or service area)
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    const checkAnchors = async () => {
      try {
        setCheckingAnchors(true);
        const locSnap = await db
          .collection('businesses')
          .doc(businessId)
          .collection('locations')
          .where('isActive', '==', true)
          .limit(1)
          .get();
        const areaSnap = await db
          .collection('businesses')
          .doc(businessId)
          .collection('serviceAreas')
          .where('isActive', '==', true)
          .limit(1)
          .get();
        if (active) {
          setHasAnchor(!locSnap.empty || !areaSnap.empty);
        }
      } catch (err) {
        if (active) setHasAnchor(false);
      } finally {
        if (active) setCheckingAnchors(false);
      }
    };
    checkAnchors();
    return () => {
      active = false;
    };
  }, [businessId]);

  // Check monthly event limit
  useEffect(() => {
    if (!businessId || !capabilities) return;

    let active = true;

    const checkMonthlyLimit = async () => {
      try {
        setCheckingLimits(true);
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Check monthly created count
        const monthlySnap = await db
          .collection('events')
          .where('businessId', '==', businessId)
          .where('createdAt', '>=', Timestamp.fromDate(startOfMonth))
          .get();

        if (!active) return;

        const monthlyUsed = monthlySnap.size;
        setMonthlyUsage({
          used: monthlyUsed,
          limit: capabilities.monthlyEventLimit,
        });

        // Check active events count
        const activeSnap = await db
          .collection('events')
          .where('businessId', '==', businessId)
          .where('isActive', '==', true)
          .where('endAt', '>', Timestamp.now())
          .get();

        if (!active) return;

        const activeUsed = activeSnap.size;
        setActiveCount({
          used: activeUsed,
          limit: capabilities.maxActiveEvents,
        });
      } catch (error) {
        console.error('[BusinessEventForm] Error checking limits:', error);
      } finally {
        if (active) {
          setCheckingLimits(false);
        }
      }
    };

    checkMonthlyLimit();

    return () => {
      active = false;
    };
  }, [businessId, capabilities]);

  const handleDateConfirm = (date) => {
    setStartDate(date);
    setShowDatePicker(false);
  };

  const validateForm = () => {
    if (!title.trim()) {
      Alert.alert('Required Field', 'Please enter an event title');
      return false;
    }

    if (!startDate) {
      Alert.alert('Required Field', 'Please select a date and time');
      return false;
    }

    // Validate lead time
    const now = new Date();
    const minStart = new Date(now);
    minStart.setMinutes(minStart.getMinutes() + MIN_LEAD_MINUTES);

    if (startDate < minStart) {
      Alert.alert(
        'Invalid Date',
        `Events must start at least ${MIN_LEAD_MINUTES} minutes from now`,
      );
      return false;
    }

    const maxStart = new Date(now);
    maxStart.setDate(maxStart.getDate() + MAX_LEAD_DAYS);

    if (startDate > maxStart) {
      Alert.alert(
        'Invalid Date',
        `Events must start within ${MAX_LEAD_DAYS} days from now`,
      );
      return false;
    }

    if (!selectedTarget?.id || !selectedTarget?.type) {
      Alert.alert(
        'Required Field',
        'Please select a business location or service area',
      );
      return false;
    }

    if (selectedInterests.length === 0) {
      Alert.alert('Required Field', 'Please select at least one interest');
      return false;
    }

    if (selectedInterests.length > capabilities.interestSlots) {
      Alert.alert(
        'Interest Limit Exceeded',
        `Your tier allows ${capabilities.interestSlots} interests. Please reduce your selection.`,
      );
      return false;
    }

    // Check monthly limit
    if (monthlyUsage.used >= monthlyUsage.limit) {
      Alert.alert(
        'Monthly Limit Reached',
        `You've created ${monthlyUsage.used} of ${monthlyUsage.limit} events this month. Upgrade your tier for more events.`,
        [{ text: 'OK' }],
      );
      return false;
    }

    // Check active events limit
    if (activeCount.used >= activeCount.limit) {
      Alert.alert(
        'Active Events Limit Reached',
        `You have ${activeCount.used} active events (max ${activeCount.limit}). Wait for events to end or upgrade your tier.`,
        [{ text: 'OK' }],
      );
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);

      // Calculate endAt (default: 2 hours after start)
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 2);

      const payload = {
        businessId,
        title: title.trim(),
        description: description.trim() || null,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        interestIds: selectedInterests,
        businessLocationId:
          selectedTarget?.type === 'location' ? selectedTarget.id : undefined,
        serviceAreaId:
          selectedTarget?.type === 'serviceArea'
            ? selectedTarget.id
            : undefined,
      };

      const createFn = functions.httpsCallable('createBusinessEvent');
      await createFn(payload);

      Alert.alert('Success', 'Business event created successfully!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('[BusinessEventForm] Error creating event:', error);

      // Handle specific server validation errors
      let errorMessage = 'Failed to create event. Please try again.';
      if (error.code === 'functions/resource-exhausted') {
        errorMessage =
          error.message || 'Event limit reached. Please upgrade your tier.';
      } else if (error.code === 'functions/permission-denied') {
        errorMessage =
          error.message ||
          'You do not have permission to create events for this business.';
      } else if (error.code === 'functions/failed-precondition') {
        errorMessage = error.message || 'Business account is inactive.';
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getMinDate = () => {
    const min = new Date();
    min.setMinutes(min.getMinutes() + MIN_LEAD_MINUTES);
    return min;
  };

  const getMaxDate = () => {
    const max = new Date();
    max.setDate(max.getDate() + MAX_LEAD_DAYS);
    return max;
  };

  if (!businessId) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: theme.colors.text }]}>
            No business account found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!checkingAnchors && !hasAnchor) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.errorContainer}>
          <Ionicons
            name='location-outline'
            size={64}
            color={theme.colors.textSecondary}
          />
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
            Add a business location or service area
          </Text>
          <Text
            style={[
              styles.errorText,
              {
                color: theme.colors.textSecondary,
                textAlign: 'center',
                paddingHorizontal: 32,
              },
            ]}
          >
            You need at least one business location or service area before
            creating an event.
          </Text>
          <TouchableOpacity
            style={[
              styles.upgradeButton,
              { backgroundColor: theme.colors.primary },
            ]}
            onPress={() => navigation.navigate('BusinessOnboarding')}
          >
            <Text style={styles.upgradeButtonText}>Finish Setup</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Check if business was deleted while form is open
  if (business === null && !checkingLimits) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.errorContainer}>
          <Ionicons
            name='alert-circle-outline'
            size={64}
            color={theme.colors.textSecondary}
          />
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
            Business Not Found
          </Text>
          <Text
            style={[styles.errorText, { color: theme.colors.textSecondary }]}
          >
            This business account no longer exists
          </Text>
          <TouchableOpacity
            style={[
              styles.upgradeButton,
              { backgroundColor: theme.colors.primary },
            ]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.upgradeButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isSubmitDisabled = loading || checkingLimits;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name='close' size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Create Event
        </Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isSubmitDisabled}
          style={[
            styles.submitButton,
            isSubmitDisabled && styles.submitButtonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator size='small' color={theme.colors.primary} />
          ) : (
            <Text
              style={[styles.submitButtonText, { color: theme.colors.primary }]}
            >
              Create
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {checkingLimits || checkingAnchors ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size='large' color={theme.colors.primary} />
        </View>
      ) : (
        <>
          {/* Usage indicator */}
          <View
            style={[
              styles.usageBox,
              { backgroundColor: theme.colors.backgroundSecondary },
            ]}
          >
            <Text
              style={[styles.usageText, { color: theme.colors.textSecondary }]}
            >
              Monthly: {monthlyUsage.used}/{monthlyUsage.limit} • Active:{' '}
              {activeCount.used}/{activeCount.limit}
            </Text>
          </View>

          <ScrollView
            style={styles.form}
            contentContainerStyle={styles.formContent}
          >
            {/* Title */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Event Title <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
                value={title}
                onChangeText={setTitle}
                placeholder='Enter event title'
                placeholderTextColor={theme.colors.textSecondary}
                maxLength={100}
              />
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Description
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
                value={description}
                onChangeText={setDescription}
                placeholder='Describe your event (optional)'
                placeholderTextColor={theme.colors.textSecondary}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
            </View>

            {/* Date & Time */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Date & Time <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  styles.dateButton,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons
                  name='calendar-outline'
                  size={20}
                  color={theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.dateText,
                    {
                      color: startDate
                        ? theme.colors.text
                        : theme.colors.textSecondary,
                    },
                  ]}
                >
                  {startDate
                    ? startDate.toLocaleString()
                    : 'Select date and time'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Target Location/Area */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Location/Service Area <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  styles.dateButton,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
                onPress={() => setShowTargetPicker(true)}
              >
                <Ionicons
                  name='location-outline'
                  size={20}
                  color={theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.dateText,
                    {
                      color: selectedTarget
                        ? theme.colors.text
                        : theme.colors.textSecondary,
                    },
                  ]}
                >
                  {selectedTarget
                    ? 'Target selected'
                    : 'Select location or area'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Interests */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Interests <Text style={styles.required}>*</Text> (
                {selectedInterests.length}/{capabilities.interestSlots})
              </Text>
              <InterestSelector
                selectedInterests={selectedInterests}
                onInterestsChange={setSelectedInterests}
                maxSelections={capabilities.interestSlots}
              />
            </View>
          </ScrollView>
        </>
      )}

      {/* Date Picker Modal */}
      <DateTimePickerModal
        isVisible={showDatePicker}
        mode='datetime'
        onConfirm={handleDateConfirm}
        onCancel={() => setShowDatePicker(false)}
        minimumDate={getMinDate()}
        maximumDate={getMaxDate()}
      />

      {/* Target Picker Modal */}
      <Modal
        visible={showTargetPicker}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={() => setShowTargetPicker(false)}
      >
        <BusinessTargetPicker
          businessId={businessId}
          selectedId={selectedTarget?.id}
          onSelect={(target) => {
            setSelectedTarget(target);
            setShowTargetPicker(false);
          }}
          onClose={() => setShowTargetPicker(false)}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  submitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
  },
  usageBox: {
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
  },
  usageText: {
    fontSize: 14,
    textAlign: 'center',
  },
  form: {
    flex: 1,
  },
  formContent: {
    padding: 16,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateText: {
    fontSize: 16,
    flex: 1,
  },
});
