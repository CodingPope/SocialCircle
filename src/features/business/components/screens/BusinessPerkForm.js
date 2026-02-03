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

// Description: Business perk creation form (Tier2+) with tier validation and required expiry
export default function BusinessPerkForm({ navigation, route }) {
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
  const [details, setDetails] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
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
          console.error('[BusinessPerkForm] Error loading business:', error);
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

  // Check monthly perk limit
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
          .collection('perks')
          .where('businessId', '==', businessId)
          .where('createdAt', '>=', Timestamp.fromDate(startOfMonth))
          .get();

        if (!active) return;

        const monthlyUsed = monthlySnap.size;
        setMonthlyUsage({
          used: monthlyUsed,
          limit: capabilities.monthlyPerkLimit,
        });

        // Check active perks count
        const activeSnap = await db
          .collection('perks')
          .where('businessId', '==', businessId)
          .where('isActive', '==', true)
          .where('expiresAt', '>', Timestamp.now())
          .get();

        if (!active) return;

        const activeUsed = activeSnap.size;
        setActiveCount({
          used: activeUsed,
          limit: capabilities.maxActivePerks,
        });
      } catch (error) {
        console.error('[BusinessPerkForm] Error checking limits:', error);
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
    setExpiresAt(date);
    setShowDatePicker(false);
  };

  const validateForm = () => {
    if (!title.trim()) {
      Alert.alert('Required Field', 'Please enter a perk title');
      return false;
    }

    if (!details.trim()) {
      Alert.alert('Required Field', 'Please enter perk details');
      return false;
    }

    if (!expiresAt) {
      Alert.alert('Required Field', 'Please select an expiration date');
      return false;
    }

    // Validate expiration is at least 1 day in the future
    const minExpiry = new Date();
    minExpiry.setDate(minExpiry.getDate() + 1);

    if (expiresAt < minExpiry) {
      Alert.alert(
        'Invalid Expiration',
        'Perks must be valid for at least 1 day',
      );
      return false;
    }

    // Validate expiration is within 1 year
    const maxExpiry = new Date();
    maxExpiry.setFullYear(maxExpiry.getFullYear() + 1);

    if (expiresAt > maxExpiry) {
      Alert.alert(
        'Invalid Expiration',
        'Perks cannot expire more than 1 year from now',
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
        `You've created ${monthlyUsage.used} of ${monthlyUsage.limit} perks this month. Upgrade your tier for more perks.`,
        [{ text: 'OK' }],
      );
      return false;
    }

    // Check active perks limit
    if (activeCount.used >= activeCount.limit) {
      Alert.alert(
        'Active Perks Limit Reached',
        `You have ${activeCount.used} active perks (max ${activeCount.limit}). Wait for perks to expire or upgrade your tier.`,
        [{ text: 'OK' }],
      );
      return false;
    }

    // Check tier permission
    if (!capabilities.canCreatePerk) {
      Alert.alert(
        'Upgrade Required',
        'Perks are available on Growth tier and above. Upgrade to create perks.',
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

      const payload = {
        businessId,
        title: title.trim(),
        details: details.trim(),
        expiresAt: expiresAt.toISOString(),
        interestIds: selectedInterests,
        businessLocationId:
          selectedTarget?.type === 'location' ? selectedTarget.id : undefined,
        serviceAreaId:
          selectedTarget?.type === 'serviceArea'
            ? selectedTarget.id
            : undefined,
        targetRadiusMiles: selectedTarget?.radiusMiles,
      };

      const createFn = functions.httpsCallable('createBusinessPerk');
      await createFn(payload);

      Alert.alert('Success', 'Business perk created successfully!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('[BusinessPerkForm] Error creating perk:', error);

      // Handle specific server validation errors
      let errorMessage = 'Failed to create perk. Please try again.';
      if (error.code === 'functions/resource-exhausted') {
        errorMessage =
          error.message || 'Perk limit reached. Please upgrade your tier.';
      } else if (error.code === 'functions/permission-denied') {
        errorMessage =
          error.message ||
          'Perks require Growth tier or above. Please upgrade.';
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
    min.setDate(min.getDate() + 1); // At least 1 day from now
    return min;
  };

  const getMaxDate = () => {
    const max = new Date();
    max.setFullYear(max.getFullYear() + 1); // Max 1 year from now
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
            creating a perk.
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

  if (!capabilities.canCreatePerk) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.errorContainer}>
          <Ionicons
            name='lock-closed-outline'
            size={64}
            color={theme.colors.textSecondary}
          />
          <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
            Upgrade Required
          </Text>
          <Text
            style={[styles.errorText, { color: theme.colors.textSecondary }]}
          >
            Perks are available on Growth tier and above
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
          Create Perk
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
                Perk Title <Text style={styles.required}>*</Text>
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
                placeholder='E.g., 10% off your first visit'
                placeholderTextColor={theme.colors.textSecondary}
                maxLength={100}
              />
            </View>

            {/* Details */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Details <Text style={styles.required}>*</Text>
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
                value={details}
                onChangeText={setDetails}
                placeholder='Describe the perk, terms, and how to redeem'
                placeholderTextColor={theme.colors.textSecondary}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
            </View>

            {/* Expires At */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Expiration Date <Text style={styles.required}>*</Text>
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
                      color: expiresAt
                        ? theme.colors.text
                        : theme.colors.textSecondary,
                    },
                  ]}
                >
                  {expiresAt
                    ? expiresAt.toLocaleDateString()
                    : 'Select expiration date'}
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
        mode='date'
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
    paddingHorizontal: 40,
    gap: 16,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  upgradeButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 8,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
