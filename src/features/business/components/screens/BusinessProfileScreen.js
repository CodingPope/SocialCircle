// Description: Gorgeous Business Profile Screen - Modern UI inspired by ProfileScreen.js
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { db, auth } from '../../../../services/firebase/config';

export default function BusinessProfileScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [business, setBusiness] = useState(null);
  const [events, setEvents] = useState([]);
  const [locations, setLocations] = useState([]);
  const [stats, setStats] = useState({
    totalEvents: 0,
    totalAttendees: 0,
    upcomingEvents: 0,
    pastEvents: 0,
  });
  const toDateSafe = useCallback((value) => {
    if (!value) return null;
    if (typeof value.toDate === 'function') {
      try {
        return value.toDate();
      } catch {
        return null;
      }
    }
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, []);
  const primaryLocation = useMemo(
    () => (Array.isArray(locations) && locations.length > 0 ? locations[0] : null),
    [locations]
  );
  const { upcoming: upcomingEvents, past: pastEvents } = useMemo(() => {
    if (!Array.isArray(events) || events.length === 0) {
      return { upcoming: [], past: [] };
    }
    const now = new Date();
    const upcoming = [];
    const past = [];
    events.forEach((event) => {
      const start = toDateSafe(event.startTime);
      if (start && start >= now) {
        upcoming.push(event);
      } else {
        past.push(event);
      }
    });
    upcoming.sort(
      (a, b) =>
        (toDateSafe(a.startTime)?.getTime() || 0) -
        (toDateSafe(b.startTime)?.getTime() || 0)
    );
    past.sort(
      (a, b) =>
        (toDateSafe(b.startTime)?.getTime() || 0) -
        (toDateSafe(a.startTime)?.getTime() || 0)
    );
    return { upcoming: upcoming.slice(0, 3), past: past.slice(0, 3) };
  }, [events, toDateSafe]);
  const interestChips = useMemo(
    () =>
      Array.isArray(business?.interests)
        ? business.interests.filter(Boolean).slice(0, 6)
        : [],
    [business?.interests]
  );
  const hasPolicySection =
    !!(
      business?.houseRules ||
      interestChips.length > 0 ||
      (business?.ageRestriction && business.ageRestriction !== 'none') ||
      (business?.genderRestriction && business.genderRestriction !== 'none')
    );
  const showDetailsSection =
    !!(
      business?.legalName ||
      business?.status ||
      business?.type ||
      typeof business?.rating === 'number'
    );

  // Sidebar state
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const sidebarAnim = useRef(
    new Animated.Value(Dimensions.get('window').width)
  ).current;
  const sidebarClosing = useRef(false);

  // PanResponder for swipe-to-close
  const sidebarPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) =>
        gestureState.dx > 10 && Math.abs(gestureState.dy) < 50,
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dx > 0) sidebarAnim.setValue(gestureState.dx);
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 100) closeSidebar();
        else
          Animated.spring(sidebarAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
      },
    })
  ).current;

  const openSidebar = () => {
    setSidebarVisible(true);
    sidebarClosing.current = false;
    Animated.spring(sidebarAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 9,
    }).start();
  };

  const closeSidebar = () => {
    if (sidebarClosing.current) return;
    sidebarClosing.current = true;
    Animated.timing(sidebarAnim, {
      toValue: Dimensions.get('window').width,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setSidebarVisible(false);
      sidebarClosing.current = false;
    });
  };

  const handleLogout = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your business account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔴 Signing out from business profile...');
              await auth().signOut();
              console.log('✅ Sign out successful');
              closeSidebar();
              setTimeout(() => {
                navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
              }, 100);
            } catch (error) {
              console.error('❌ Logout error:', error);
              Alert.alert(
                'Error',
                `Failed to sign out: ${error.message || 'Unknown error'}`
              );
            }
          },
        },
      ]
    );
  };

  const fetchBusinessData = async () => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser?.uid) {
        console.log('⚠️ No authenticated user in BusinessProfileScreen');
        setLoading(false);
        return;
      }

      console.log('🔍 Fetching business data for user:', currentUser.uid);

      const bizSnap = await db
        .collection('businesses')
        .where('ownerId', '==', currentUser.uid)
        .limit(1)
        .get();

      if (!bizSnap.empty) {
        const bizDoc = bizSnap.docs[0];
        const bizData = { id: bizDoc.id, ...bizDoc.data() };
        console.log('✅ Business found:', bizData.displayName);
        setBusiness(bizData);
        setFetchAttempts(0); // Reset attempts on success

        let locationList = [];
        try {
          const locationsSnap = await db
            .collection('businesses')
            .doc(bizDoc.id)
            .collection('locations')
            .orderBy('createdAt', 'asc')
            .limit(5)
            .get();
          locationList = locationsSnap.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() || {}),
          }));
        } catch (locErr) {
          console.warn(
            '⚠️ Failed to load business locations:',
            locErr?.message || locErr
          );
        }
        setLocations(locationList);

        const eventsSnap = await db
          .collection('events')
          .where('businessId', '==', bizDoc.id)
          .orderBy('startTime', 'desc')
          .limit(10)
          .get();

        const eventsList = eventsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setEvents(eventsList);

        const now = new Date();
        let upcomingCount = 0;
        let pastCount = 0;
        const totalAttendees = eventsList.reduce(
          (sum, e) => sum + (e.attendees?.length || 0),
          0
        );
        eventsList.forEach((event) => {
          const startTime = event.startTime?.toDate
            ? event.startTime.toDate()
            : event.startTime
            ? new Date(event.startTime)
            : null;
          if (startTime && startTime >= now) {
            upcomingCount += 1;
          } else {
            pastCount += 1;
          }
        });

        setStats({
          totalEvents: eventsList.length,
          totalAttendees,
          upcomingEvents: upcomingCount,
          pastEvents: pastCount,
        });
      } else {
        console.log(
          '⚠️ No business profile found for user (attempt',
          fetchAttempts + 1,
          ')'
        );
        setFetchAttempts((prev) => prev + 1);

        // If this is the first attempt, try again after a delay
        // (in case Firestore write is still propagating)
        if (fetchAttempts < 1) {
          console.log('🔄 Retrying in 2 seconds...');
          setTimeout(() => {
            if (!sidebarClosing.current) {
              fetchBusinessData();
            }
          }, 2000);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching business data:', error);
      setFetchAttempts((prev) => prev + 1);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBusinessData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBusinessData();
  };

  // Description: Auto-redirect to onboarding only after multiple failed attempts
  const [fetchAttempts, setFetchAttempts] = useState(0);

  useEffect(() => {
    const currentUser = auth().currentUser;
    // Only redirect if we've tried multiple times and still no business found
    if (!loading && !business && currentUser?.uid && fetchAttempts >= 2) {
      console.warn(
        '⚠️ Business profile not found after multiple attempts, redirecting to onboarding...'
      );
      Alert.alert(
        'Setup Required',
        'Please complete your business profile setup to continue.',
        [
          {
            text: 'Complete Setup',
            onPress: () =>
              navigation.getParent()?.navigate('BusinessOnboarding'),
          },
        ],
        { cancelable: false }
      );
    }
  }, [loading, business, navigation, fetchAttempts]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size='large' color='#2F80ED' />
          <Text style={styles.loadingText}>
            Loading your business profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!business) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          {fetchAttempts < 2 ? (
            <>
              <ActivityIndicator size='large' color='#2F80ED' />
              <Text style={styles.loadingText}>
                {fetchAttempts === 0
                  ? 'Loading your business profile...'
                  : 'Retrying...'}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name='business-outline' size={64} color='#CCC' />
              <Text style={styles.loadingText}>No business profile found</Text>
              <Text style={{ fontSize: 14, color: '#999', marginTop: 8 }}>
                Complete the setup to create your profile
              </Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const businessSince = business.createdAt?.toDate
    ? business.createdAt
        .toDate()
        .toLocaleString('default', { month: 'short', year: 'numeric' })
    : 'Recently';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Hero Section with Cover + Gradient */}
        <View style={styles.heroSection}>
          {/* Cover Image or Gradient Background */}
          {business.coverUrl ? (
            <>
              <Image
                source={{ uri: business.coverUrl }}
                style={styles.coverImage}
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.7)']}
                style={styles.coverGradient}
              />
            </>
          ) : (
            <LinearGradient
              colors={['#2F80ED', '#1E5BB8']}
              style={styles.coverGradient}
            />
          )}

          {/* Hamburger Menu (Floating) */}
          <TouchableOpacity style={styles.menuButton} onPress={openSidebar}>
            <Ionicons name='menu' size={24} color='#fff' />
          </TouchableOpacity>

          {/* Business Logo (Floating) */}
          <View style={styles.logoContainer}>
            {business.logoUrl ? (
              <Image source={{ uri: business.logoUrl }} style={styles.logo} />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder]}>
                <Ionicons name='business' size={50} color='#999' />
              </View>
            )}
            {business.verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name='checkmark-circle' size={32} color='#2F80ED' />
              </View>
            )}
          </View>

          {/* Business Name & Category */}
          <Text style={styles.businessName}>
            {business.displayName || 'Business Name'}
          </Text>
          <Text style={styles.businessCategory}>
            {business.category || 'Business'} •{' '}
            {primaryLocation?.city || 'Location'}
          </Text>
          <Text style={styles.businessSince}>
            Business since {businessSince}
          </Text>
        </View>

        {/* Stats Cards Row */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View
              style={[styles.statIconCircle, { backgroundColor: '#EBF5FF' }]}
            >
              <Ionicons name='calendar' size={24} color='#2F80ED' />
            </View>
            <Text style={styles.statValue}>{stats.totalEvents}</Text>
            <Text style={styles.statLabel}>Hosted Events</Text>
          </View>

          <View style={styles.statCard}>
            <View
              style={[styles.statIconCircle, { backgroundColor: '#FFF3E0' }]}
            >
              <Ionicons name='time-outline' size={24} color='#FB923C' />
            </View>
            <Text style={styles.statValue}>{stats.upcomingEvents}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>

          <View style={styles.statCard}>
            <View
              style={[styles.statIconCircle, { backgroundColor: '#F3E8FF' }]}
            >
              <Ionicons name='refresh-outline' size={24} color='#8B5CF6' />
            </View>
            <Text style={styles.statValue}>{stats.pastEvents}</Text>
            <Text style={styles.statLabel}>Past Highlights</Text>
          </View>

          <View style={styles.statCard}>
            <View
              style={[styles.statIconCircle, { backgroundColor: '#E8F5E9' }]}
            >
              <Ionicons name='people' size={24} color='#27AE60' />
            </View>
            <Text style={styles.statValue}>{stats.totalAttendees}</Text>
            <Text style={styles.statLabel}>People Hosted</Text>
          </View>
        </View>

        {showDetailsSection && (
          <View style={styles.detailsSection}>
            <Text style={styles.sectionTitle}>Company Details</Text>
            <View style={styles.detailsCard}>
              <DetailItem label='Legal Name' value={business.legalName} />
              <DetailItem
                label='Status'
                value={formatStatus(business.status)}
              />
              <DetailItem
                label='Verification'
                value={formatVerification(business.verification)}
              />
              <DetailItem
                label='Business Type'
                value={
                  business.type
                    ? business.type === 'multi'
                      ? 'Multiple locations'
                      : 'Single location'
                    : null
                }
              />
              <DetailItem
                label='Average Rating'
                value={
                  typeof business.rating === 'number'
                    ? `${business.rating.toFixed(1)} / 5`
                    : null
                }
              />
              <DetailItem
                label='On Social Circle Since'
                value={businessSince}
              />
            </View>
          </View>
        )}

        {/* Bio Section */}
        {business.description && (
          <View style={styles.bioSection}>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.bioCard}>
              <Text style={styles.bioText}>{business.description}</Text>
            </View>
          </View>
        )}

        {hasPolicySection && (
          <View style={styles.policySection}>
            <Text style={styles.sectionTitle}>Guests & Policies</Text>
            {business.houseRules ? (
              <View style={styles.bioCard}>
                <Text style={styles.policyHeading}>House Rules</Text>
                <Text style={styles.bioText}>{business.houseRules}</Text>
              </View>
            ) : null}
            <View style={styles.policyGrid}>
              <PolicyPill
                icon='shield-checkmark-outline'
                label='Age'
                value={formatAgeRestriction(business.ageRestriction)}
              />
              <PolicyPill
                icon='people-outline'
                label='Audience'
                value={formatGenderRestriction(business.genderRestriction)}
              />
            </View>
            {interestChips.length > 0 && (
              <View style={styles.interestsWrap}>
                {interestChips.map((interest) => (
                  <View key={interest} style={styles.interestChip}>
                    <Text style={styles.interestChipText}>{interest}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Contact Info */}
        <View style={styles.contactSection}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <View style={styles.contactCard}>
            {business.website && (
              <ContactItem
                icon='globe-outline'
                label='Website'
                value={business.website}
                color='#2F80ED'
              />
            )}
            {business.phone && (
              <ContactItem
                icon='call-outline'
                label='Phone'
                value={business.phone}
                color='#27AE60'
              />
            )}
            {business.supportEmail && (
              <ContactItem
                icon='mail-outline'
                label='Email'
                value={business.supportEmail}
                color='#F2994A'
              />
            )}
            {primaryLocation && (
              <ContactItem
                icon='location-outline'
                label='Location'
                value={[
                  primaryLocation.address,
                  primaryLocation.city,
                  primaryLocation.state,
                ]
                  .filter(Boolean)
                  .join(', ')}
                color='#E53E3E'
              />
            )}
          </View>
        </View>

        {primaryLocation?.hours &&
          typeof primaryLocation.hours === 'object' && (
          <View style={styles.hoursSection}>
            <Text style={styles.sectionTitle}>Hours</Text>
            <View style={styles.hoursCard}>
              {Object.entries(primaryLocation.hours).map(([day, config]) => (
                <HourRow
                  key={day}
                  day={day}
                  value={formatHoursRange(config)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity style={styles.primaryActionButton}>
            <LinearGradient
              colors={['#2F80ED', '#1E5BB8']}
              style={styles.actionButtonGradient}
            >
              <Ionicons
                name='add-circle'
                size={22}
                color='#fff'
                style={{ marginRight: 8 }}
              />
              <Text style={styles.primaryActionText}>Create New Event</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.secondaryActions}>
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() =>
                navigation.getParent()?.navigate('BusinessOnboarding')
              }
            >
              <Ionicons name='create-outline' size={20} color='#2F80ED' />
              <Text style={styles.secondaryActionText}>Edit Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryAction}>
              <Ionicons name='bar-chart-outline' size={20} color='#2F80ED' />
              <Text style={styles.secondaryActionText}>Analytics</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Events Timeline */}
        <View style={styles.eventsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Events</Text>
            {events.length > 0 && (
              <TouchableOpacity>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.eventsSubheading}>Upcoming</Text>
          {upcomingEvents.length === 0 ? (
            <MiniEmptyState
              icon='time-outline'
              title='No events scheduled'
              subtitle='Add your next event to stay top of mind.'
            />
          ) : (
            <View style={styles.eventsList}>
              {upcomingEvents.map((event) => (
                <EventCard key={`upcoming-${event.id}`} event={event} />
              ))}
            </View>
          )}

          <Text style={styles.eventsSubheading}>Recent Highlights</Text>
          {pastEvents.length === 0 ? (
            <MiniEmptyState
              icon='trophy-outline'
              title='No past events yet'
              subtitle='Your completed events will appear here.'
            />
          ) : (
            <View style={styles.eventsList}>
              {pastEvents.map((event) => (
                <EventCard key={`past-${event.id}`} event={event} />
              ))}
            </View>
          )}
        </View>

        {/* Bottom Padding */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Sidebar Menu */}
      {sidebarVisible && (
        <Modal
          visible={sidebarVisible}
          transparent
          animationType='none'
          onRequestClose={closeSidebar}
        >
          <View style={styles.sidebarOverlay}>
            <TouchableOpacity
              style={styles.sidebarBackdrop}
              activeOpacity={1}
              onPress={closeSidebar}
            />

            <Animated.View
              style={[
                styles.sidebarContent,
                { transform: [{ translateX: sidebarAnim }] },
              ]}
              {...sidebarPan.panHandlers}
            >
              {/* Sidebar Header */}
              <View style={styles.sidebarHeader}>
                <TouchableOpacity
                  onPress={closeSidebar}
                  style={styles.sidebarCloseButton}
                >
                  <Ionicons name='close' size={28} color='#1A1A1A' />
                </TouchableOpacity>
                <Text style={styles.sidebarTitle}>Menu</Text>
              </View>

              {/* Sidebar Options */}
              <View style={styles.sidebarOptions}>
                <TouchableOpacity
                  style={styles.sidebarOption}
                  onPress={() => {
                    closeSidebar();
                    navigation.getParent()?.navigate('BusinessOnboarding');
                  }}
                >
                  <Ionicons name='create-outline' size={24} color='#1A1A1A' />
                  <Text style={styles.sidebarOptionText}>Edit Profile</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sidebarOption}>
                  <Ionicons name='settings-outline' size={24} color='#1A1A1A' />
                  <Text style={styles.sidebarOptionText}>Settings</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sidebarOption}>
                  <Ionicons
                    name='bar-chart-outline'
                    size={24}
                    color='#1A1A1A'
                  />
                  <Text style={styles.sidebarOptionText}>Analytics</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sidebarOption}>
                  <Ionicons
                    name='help-circle-outline'
                    size={24}
                    color='#1A1A1A'
                  />
                  <Text style={styles.sidebarOptionText}>Help & Support</Text>
                </TouchableOpacity>

                <View style={styles.sidebarDivider} />

                <TouchableOpacity
                  style={[styles.sidebarOption, styles.sidebarOptionDanger]}
                  onPress={handleLogout}
                >
                  <Ionicons name='log-out-outline' size={24} color='#E53E3E' />
                  <Text
                    style={[
                      styles.sidebarOptionText,
                      styles.sidebarOptionTextDanger,
                    ]}
                  >
                    Sign Out
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function DetailItem({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function PolicyPill({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.policyPill}>
      <Ionicons name={icon} size={18} color='#2F80ED' />
      <View style={{ marginLeft: 10 }}>
        <Text style={styles.policyLabel}>{label}</Text>
        <Text style={styles.policyValue}>{value}</Text>
      </View>
    </View>
  );
}

function MiniEmptyState({ icon, title, subtitle }) {
  return (
    <View style={styles.miniEmptyState}>
      <Ionicons name={icon} size={40} color='#CBD5F5' />
      <Text style={styles.miniEmptyTitle}>{title}</Text>
      {subtitle ? (
        <Text style={styles.miniEmptySubtitle}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

// Contact Item Component
function ContactItem({ icon, label, value, color }) {
  return (
    <View style={styles.contactItem}>
      <View
        style={[styles.contactIconCircle, { backgroundColor: `${color}15` }]}
      >
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.contactInfo}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={styles.contactValue}>{value}</Text>
      </View>
    </View>
  );
}

function HourRow({ day, value }) {
  return (
    <View style={styles.hourRow}>
      <Text style={styles.hourDay}>{formatDayLabel(day)}</Text>
      <Text style={styles.hourValue}>{value}</Text>
    </View>
  );
}

// Event Card Component
function EventCard({ event }) {
  const eventDate = event.startTime?.toDate
    ? event.startTime.toDate()
    : new Date();
  const formattedDate = eventDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = eventDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={styles.eventCard}>
      {event.image ? (
        <Image source={{ uri: event.image }} style={styles.eventImage} />
      ) : (
        <View style={[styles.eventImage, styles.eventImagePlaceholder]}>
          <Ionicons name='calendar' size={32} color='#999' />
        </View>
      )}

      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle} numberOfLines={2}>
          {event.title || 'Untitled Event'}
        </Text>
        <View style={styles.eventMeta}>
          <View style={styles.eventMetaItem}>
            <Ionicons name='calendar-outline' size={14} color='#666' />
            <Text style={styles.eventMetaText}>{formattedDate}</Text>
          </View>
          <View style={styles.eventMetaItem}>
            <Ionicons name='time-outline' size={14} color='#666' />
            <Text style={styles.eventMetaText}>{formattedTime}</Text>
          </View>
        </View>
        <View style={styles.eventMetaItem}>
          <Ionicons name='people-outline' size={14} color='#27AE60' />
          <Text style={[styles.eventMetaText, { color: '#27AE60' }]}>
            {event.attendees?.length || 0} attending
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.eventChevron}>
        <Ionicons name='chevron-forward' size={20} color='#999' />
      </TouchableOpacity>
    </View>
  );
}

function formatStatus(status) {
  if (!status) return 'Draft';
  const normalized = String(status).toLowerCase();
  if (normalized === 'active') return 'Live';
  if (normalized === 'pending_review') return 'Under review';
  if (normalized === 'pending') return 'Pending';
  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatVerification(verification = {}) {
  const normalized = String(verification?.status || '').toLowerCase();
  if (normalized === 'verified') return 'Verified';
  if (normalized === 'pending_review' || normalized === 'pending')
    return 'Pending verification';
  if (normalized === 'rejected') return 'Needs attention';
  return 'Not verified yet';
}

function formatAgeRestriction(value) {
  const normalized = String(value || 'none').toLowerCase();
  if (normalized === '21+') return '21+ only';
  if (normalized === '18+' || normalized === '18plus') return '18+ only';
  return 'All ages welcome';
}

function formatGenderRestriction(value) {
  const normalized = String(value || 'none').toLowerCase();
  if (normalized === 'women_only') return 'Women only';
  if (normalized === 'men_only') return 'Men only';
  if (normalized === 'other') return 'Invite only';
  return 'Everyone welcome';
}

function formatHoursRange(config = {}) {
  if (!config || config.closed) return 'Closed';
  const open = formatHourValue(config.open);
  const close = formatHourValue(config.close);
  if (open && close) return `${open} – ${close}`;
  if (open || close) return open || close;
  return 'By appointment';
}

function formatHourValue(value) {
  if (!value) return '';
  if (/[a-z]/i.test(value)) return value;
  const [hour = '0', minute = '0'] = String(value).split(':');
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDayLabel(day) {
  if (!day) return '';
  const normalized = String(day);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 15,
  },

  // Hero Section
  heroSection: {
    height: 340,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  coverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    width: '100%',
  },
  coverGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    width: '100%',
  },
  menuButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : StatusBar.currentHeight + 10,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#FFF',
    backgroundColor: '#FFF',
  },
  logoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E0E0E0',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: '#FFF',
    borderRadius: 16,
  },
  businessName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  businessCategory: {
    fontSize: 15,
    color: '#FFF',
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.95,
  },
  businessSince: {
    fontSize: 13,
    color: '#FFF',
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.85,
  },

  // Stats Section
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: -50,
    marginBottom: 24,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  statIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  detailsSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  detailsCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F5',
  },
  detailLabel: {
    fontSize: 14,
    color: '#777',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },

  // Bio Section
  bioSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  bioCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  bioText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  policySection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  policyHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  policyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  policyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#EEF4FF',
    flexBasis: '48%',
    flexGrow: 1,
  },
  policyLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  policyValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  interestsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 8,
  },
  interestChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F0F4FF',
    borderRadius: 16,
  },
  interestChipText: {
    color: '#1A56DB',
    fontWeight: '600',
    fontSize: 13,
  },

  // Contact Section
  contactSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  contactCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  hoursSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  hoursCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  hourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F5',
  },
  hourDay: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
  },
  hourValue: {
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '600',
  },

  // Actions Section
  actionsSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  primaryActionButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#2F80ED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  primaryActionText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2F80ED',
  },

  // Events Section
  eventsSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewAllText: {
    fontSize: 14,
    color: '#2F80ED',
    fontWeight: '600',
  },
  eventsSubheading: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    marginTop: 4,
  },
  miniEmptyState: {
    backgroundColor: '#F1F4FF',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  miniEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 8,
    marginBottom: 4,
  },
  miniEmptySubtitle: {
    fontSize: 13,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 18,
  },
  eventsList: {
    gap: 12,
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  eventImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 12,
  },
  eventImagePlaceholder: {
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  eventMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  eventMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventMetaText: {
    fontSize: 13,
    color: '#666',
  },
  eventChevron: {
    padding: 8,
  },

  // Sidebar
  sidebarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sidebarContent: {
    width: '85%',
    maxWidth: 320,
    height: '100%',
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : StatusBar.currentHeight + 20,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  sidebarCloseButton: {
    marginRight: 12,
  },
  sidebarTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  sidebarOptions: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  sidebarOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F8F9FA',
  },
  sidebarOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A1A',
    marginLeft: 12,
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 16,
  },
  sidebarOptionDanger: {
    backgroundColor: '#FEE',
  },
  sidebarOptionTextDanger: {
    color: '#E53E3E',
  },
});
