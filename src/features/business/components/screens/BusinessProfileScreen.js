import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../../../theme';
import { useAuth } from '../../../auth/context/AuthContext';
import { db } from '../../../../services/firebase';
import { Timestamp } from '../../../../services/firebase/firestoreCompat';
import { BUSINESS_TIERS } from '../../../../lib/business/businessConstants';
import { getBusinessCapabilities } from '../../../../lib/business/businessCapabilities';
import InterestSelector from '../../../profile/components/InterestSelector';

const VIEW_MODES = { PUBLIC: 'PUBLIC', MANAGE: 'MANAGE' };

export default function BusinessProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const theme = useTheme();
  const { user } = useAuth();

  const businessId = route?.params?.bizId || user?.businessId || null;

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(VIEW_MODES.PUBLIC);
  const [events, setEvents] = useState([]);
  const [perks, setPerks] = useState([]);
  const [locations, setLocations] = useState([]);
  const [serviceAreas, setServiceAreas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [about, setAbout] = useState('');
  const [website, setWebsite] = useState('');
  const [phonePublic, setPhonePublic] = useState('');
  const [emailPublic, setEmailPublic] = useState('');
  const [interestIds, setInterestIds] = useState([]);

  const tier = useMemo(
    () => business?.tier || business?.businessTier || BUSINESS_TIERS.TIER_1_FREE,
    [business]
  );
  const capabilities = useMemo(() => getBusinessCapabilities(tier), [tier]);
  const canCreatePerk = capabilities.canCreatePerk;

  // --- Data loading ---
  useEffect(() => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    let active = true;
    const unsub = db
      .collection('businesses')
      .doc(businessId)
      .onSnapshot(
        (snap) => {
          if (!active) return;
          const data = snap.exists ? { id: snap.id, ...snap.data() } : null;
          setBusiness(data);
          setAbout(data?.about || '');
          setWebsite(data?.website || '');
          setPhonePublic(data?.phonePublic || '');
          setEmailPublic(data?.emailPublic || '');
          setInterestIds(Array.isArray(data?.interestIds) ? data.interestIds : []);
          setLoading(false);
        },
        () => active && setLoading(false)
      );
    return () => {
      active = false;
      unsub?.();
    };
  }, [businessId]);

  // Locations / service areas (view-only)
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    const loadAnchors = async () => {
      try {
        const [locSnap, areaSnap] = await Promise.all([
          db
            .collection('businesses')
            .doc(businessId)
            .collection('locations')
            .where('isActive', '==', true)
            .get(),
          db
            .collection('businesses')
            .doc(businessId)
            .collection('serviceAreas')
            .where('isActive', '==', true)
            .get(),
        ]);
        if (!active) return;
        setLocations(locSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setServiceAreas(areaSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        if (active) {
          setLocations([]);
          setServiceAreas([]);
        }
      }
    };
    loadAnchors();
    return () => {
      active = false;
    };
  }, [businessId]);

  // Events list (business host)
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    const now = Timestamp.now();
    db.collection('events')
      .where('businessId', '==', businessId)
      .where('hostType', '==', 'BUSINESS')
      .where('endAt', '>=', now)
      .orderBy('endAt', 'asc')
      .limit(20)
      .get()
      .then((snap) => {
        if (!active) return;
        setEvents(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      })
      .catch(() => active && setEvents([]));
    return () => {
      active = false;
    };
  }, [businessId]);

  // Perks list
  useEffect(() => {
    if (!businessId || !canCreatePerk) {
      setPerks([]);
      return;
    }
    let active = true;
    const now = Timestamp.now();
    db.collection('perks')
      .where('businessId', '==', businessId)
      .where('expiresAt', '>', now)
      .orderBy('expiresAt', 'asc')
      .limit(20)
      .get()
      .then((snap) => {
        if (!active) return;
        setPerks(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      })
      .catch(() => active && setPerks([]));
    return () => {
      active = false;
    };
  }, [businessId, canCreatePerk]);

  // --- Actions ---
  const handleDirections = useCallback(() => {
    const loc = locations[0];
    if (!loc?.coordinates) {
      Alert.alert('Add location', 'Add a business location to enable directions.');
      return;
    }
    const { latitude, longitude } = loc.coordinates;
    const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    Linking.openURL(url).catch(() => {});
  }, [locations]);

  const handleOpenWebsite = useCallback(() => {
    if (!website) return;
    const url = website.startsWith('http') ? website : `https://${website}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Unable to open link', 'Check the website URL and try again.')
    );
  }, [website]);

  const handleEditAnchors = useCallback(() => {
    navigation.navigate('BusinessOnboarding');
  }, [navigation]);

  const businessSettingsRouteExists = (() => {
    try {
      const state = navigation.getState?.();
      const names = state?.routeNames || [];
      return Array.isArray(names) && names.includes('BusinessSettings');
    } catch {
      return false;
    }
  })();

  const handleOpenSettings = useCallback(() => {
    if (businessSettingsRouteExists) {
      navigation.navigate('BusinessSettings');
    } else {
      Alert.alert('Settings not available', 'Business settings are coming soon.');
    }
  }, [navigation, businessSettingsRouteExists]);

  const handleSaveManage = useCallback(async () => {
    if (!businessId) return;
    if (interestIds.length > capabilities.interestSlots) {
      Alert.alert(
        'Interest limit',
        `Your tier allows up to ${capabilities.interestSlots} interests.`
      );
      return;
    }
    try {
      setSaving(true);
      await db
        .collection('businesses')
        .doc(businessId)
        .update({
          about: about || null,
          website: website || null,
          phonePublic: phonePublic || null,
          emailPublic: emailPublic || null,
          interestIds,
          updatedAt: Timestamp.now(),
        });
      Alert.alert('Saved', 'Profile updated.');
    } catch (err) {
      Alert.alert('Save failed', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [about, website, phonePublic, emailPublic, interestIds, capabilities.interestSlots, businessId]);

  // --- UI helpers ---
  const renderEventList = () => {
    if (!events.length) {
      return <EmptyRow icon='calendar-outline' text='No upcoming events' theme={theme} />;
    }
    return events.map((evt) => (
      <ListRow
        key={evt.id}
        title={evt.title || 'Untitled event'}
        subtitle={formatDate(evt.startAt || evt.startsAt)}
        theme={theme}
      />
    ));
  };

  const renderPerkList = () => {
    if (!canCreatePerk) return null;
    if (!perks.length) {
      return <EmptyRow icon='gift-outline' text='No active perks' theme={theme} />;
    }
    return perks.map((perk) => (
      <ListRow
        key={perk.id}
        title={perk.title || 'Untitled perk'}
        subtitle={formatDate(perk.expiresAt)}
        theme={theme}
      />
    ));
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size='large' color={theme.colors.primary} />
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Loading business profile…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!businessId || !business) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <Ionicons name='briefcase-outline' size={48} color={theme.colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
            No business profile
          </Text>
          <Text style={[styles.helper, { color: theme.colors.textSecondary }]}>
            Finish setup to view your business profile here.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('BusinessOnboarding')}>
            <Text style={styles.primaryButtonText}>Finish setup</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const inPublic = viewMode === VIEW_MODES.PUBLIC;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Toggle */}
        <View style={[styles.toggleRow, { borderColor: theme.colors.border }]}>
          {Object.values(VIEW_MODES).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.toggleButton,
                viewMode === mode && { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => setViewMode(mode)}
            >
              <Text
                style={[
                  styles.toggleLabel,
                  { color: viewMode === mode ? '#fff' : theme.colors.text },
                ]}
              >
                {mode === VIEW_MODES.PUBLIC ? 'Public View' : 'Manage'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Header */}
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{business.displayName || 'Business'}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            {business.primaryCategoryId || business.category || 'Category'}
          </Text>
          {!!about && inPublic && (
            <Text style={[styles.bodyText, { color: theme.colors.text }]}>{about}</Text>
          )}
          {/* Chips */}
          <View style={styles.chipRow}>
            {interestIds.map((id) => (
              <Chip key={id} label={id} theme={theme} />
            ))}
          </View>
        </View>

        {inPublic ? (
          <>
            {/* Actions */}
            <View style={[styles.rowCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <ActionButton icon='navigate-outline' label='Directions' onPress={handleDirections} theme={theme} />
              {website ? (
                <ActionButton icon='globe-outline' label='Website' onPress={handleOpenWebsite} theme={theme} />
              ) : null}
            </View>

            {/* Lists */}
            <Section title='Events' theme={theme}>
              {renderEventList()}
            </Section>

            {canCreatePerk && (
              <Section title='Perks' theme={theme}>
                {renderPerkList()}
              </Section>
            )}
          </>
        ) : (
          <>
            <ManageField label='About' value={about} onChange={setAbout} multiline theme={theme} />
            <ManageField label='Website' value={website} onChange={setWebsite} theme={theme} />
            <ManageField label='Public phone' value={phonePublic} onChange={setPhonePublic} theme={theme} />
            <ManageField label='Public email' value={emailPublic} onChange={setEmailPublic} theme={theme} />

            <Section title={`Interests (${interestIds.length}/${capabilities.interestSlots})`} theme={theme}>
              <InterestSelector
                selectedInterests={interestIds}
                onInterestsChange={setInterestIds}
                maxSelections={capabilities.interestSlots}
              />
            </Section>

            <Section title='Locations / Service areas' theme={theme}>
              {locations.length === 0 && serviceAreas.length === 0 ? (
                <EmptyRow icon='location-outline' text='No anchor added yet' theme={theme} />
              ) : (
                <>
                  {locations.map((loc) => (
                    <ListRow
                      key={loc.id}
                      title={loc.name || 'Location'}
                      subtitle={loc.address || 'Address not set'}
                      theme={theme}
                    />
                  ))}
                  {serviceAreas.map((sa) => (
                    <ListRow
                      key={sa.id}
                      title={sa.name || 'Service area'}
                      subtitle={sa.type || ''}
                      theme={theme}
                    />
                  ))}
                </>
              )}
              <TouchableOpacity style={styles.linkButton} onPress={handleEditAnchors}>
                <Text style={[styles.linkLabel, { color: theme.colors.primary }]}>
                  Edit location / service area
                </Text>
              </TouchableOpacity>
            </Section>

            <TouchableOpacity
              style={[styles.primaryButton, saving && { opacity: 0.6 }]}
              onPress={handleSaveManage}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color='#fff' />
              ) : (
                <Text style={styles.primaryButtonText}>Save changes</Text>
              )}
            </TouchableOpacity>

            {businessSettingsRouteExists && (
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                onPress={handleOpenSettings}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
                  Business Settings
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Small components ---

const Section = ({ title, children, theme }) => (
  <View style={[styles.section, { borderColor: theme.colors.border }]}>
    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
    {children}
  </View>
);

const ListRow = ({ title, subtitle, theme }) => (
  <View style={[styles.listRow, { borderColor: theme.colors.border }]}>
    <View>
      <Text style={[styles.listTitle, { color: theme.colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      {!!subtitle && (
        <Text style={[styles.listSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      )}
    </View>
  </View>
);

const EmptyRow = ({ icon, text, theme }) => (
  <View style={[styles.emptyRow, { borderColor: theme.colors.border }]}>
    <Ionicons name={icon} size={16} color={theme.colors.textSecondary} />
    <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>{text}</Text>
  </View>
);

const Chip = ({ label, theme }) => (
  <View style={[styles.chip, { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundSecondary }]}>
    <Text style={[styles.chipText, { color: theme.colors.text }]}>{label}</Text>
  </View>
);

const ActionButton = ({ icon, label, onPress, theme }) => (
  <TouchableOpacity style={[styles.actionButton, { borderColor: theme.colors.border }]} onPress={onPress}>
    <Ionicons name={icon} size={18} color={theme.colors.primary} />
    <Text style={[styles.actionLabel, { color: theme.colors.text }]}>{label}</Text>
  </TouchableOpacity>
);

const ManageField = ({ label, value, onChange, multiline = false, theme }) => (
  <View style={[styles.manageField, { borderColor: theme.colors.border }]}>
    <Text style={[styles.manageLabel, { color: theme.colors.text }]}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      multiline={multiline}
      style={[
        styles.manageInput,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          height: multiline ? 90 : 44,
          color: theme.colors.text,
        },
      ]}
      placeholderTextColor={theme.colors.textSecondary}
    />
  </View>
);

// Utility: format date
function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return '';
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 24 },
  helper: { fontSize: 14, textAlign: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: { fontWeight: '600', fontSize: 15 },
  toggleRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  toggleButton: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  toggleLabel: { fontWeight: '700', fontSize: 14 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 14 },
  bodyText: { fontSize: 14, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 13 },
  rowCard: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: 'center',
  },
  actionLabel: { fontWeight: '600', fontSize: 14 },
  section: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  listRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  listTitle: { fontSize: 15, fontWeight: '600' },
  listSubtitle: { fontSize: 13, marginTop: 2 },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: 'center',
  },
  emptyText: { fontSize: 13 },
  linkButton: { marginTop: 8 },
  linkLabel: { fontWeight: '700', fontSize: 14 },
  manageField: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  manageLabel: { fontWeight: '600', fontSize: 14 },
  manageInput: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
