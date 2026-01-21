import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Share,
  Linking,
  Animated,
  Dimensions,
  Platform,
  StatusBar,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  db,
  switchToPersonalAccount,
} from '../../../../services/firebase/config';
import { useBizOnboarding } from '../../stores/businessOnboardingStore';
import { useAuth } from '../../../auth/context/AuthContext';
import { useTheme } from '../../../../theme';
import { useSessionRole } from '../../../profile/stores/sessionRoleStore';
import { useThemeStore } from '../../../../store/themeStore';
import auth from '@react-native-firebase/auth';

const TAB_KEYS = Object.freeze({
  EVENTS: 'events',
  PERKS: 'perks',
});

export default function BusinessProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const fallbackBizId = useBizOnboarding((s) => s.bizId);
  const start = useBizOnboarding((s) => s.start);
  const { user } = useAuth();
  const setRole = useSessionRole((s) => s.setRole);
  const setNextConsumerRoute = useSessionRole((s) => s.setNextConsumerRoute);
  const toggleTheme = useThemeStore((s) => s.toggleMode);
  const themeMode = useThemeStore((s) => s.mode);
  const bizId = route?.params?.bizId || fallbackBizId || null;
  const [resolvedBizId, setResolvedBizId] = useState(bizId);
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState(null);
  const [primaryLocation, setPrimaryLocation] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_KEYS.EVENTS);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const sidebarAnim = React.useRef(
    new Animated.Value(Dimensions.get('window').width)
  ).current;
  const sidebarClosing = React.useRef(false);

  useEffect(() => {
    if (bizId) {
      setResolvedBizId(bizId);
      return;
    }
    if (!user?.uid) {
      setResolvedBizId(null);
      return;
    }
    let active = true;
    setLoading(true);
    db.collection('businesses')
      .where('ownerId', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
      .then((snap) => {
        if (!active) return;
        const doc = snap.docs[0];
        setResolvedBizId(doc?.id || null);
      })
      .catch(() => {
        if (!active) return;
        setResolvedBizId(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bizId, user?.uid]);

  useEffect(() => {
    let unsub = null;
    if (!resolvedBizId) return;
    setLoading(true);
    try {
      unsub = db
        .collection('businesses')
        .doc(resolvedBizId)
        .onSnapshot((snap) => {
          setBusiness(snap.exists ? { id: snap.id, ...snap.data() } : null);
          setLoading(false);
        });
    } catch {
      setLoading(false);
    }
    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [resolvedBizId]);

  useEffect(() => {
    if (!resolvedBizId) return;
    db.collection('businesses')
      .doc(resolvedBizId)
      .collection('locations')
      .limit(1)
      .get()
      .then((snap) => {
        const doc = snap.docs[0];
        setPrimaryLocation(doc?.data() || null);
      })
      .catch(() => setPrimaryLocation(null));
  }, [resolvedBizId]);

  const displayName =
    business?.displayName || business?.legalName || 'Business';
  const category = business?.category || 'Business';
  const description = business?.description || '';
  const logoUrl = business?.logoUrl || '';
  const verified = business?.verification?.status === 'verified';
  const contact = useMemo(() => buildContactDetails(business), [business]);
  const locationLabel = buildLocationLabel(primaryLocation);

  const hoursLabel = resolveHoursLabel(business);
  const priceLabel = resolvePriceLabel(business);
  const distanceLabel = resolveDistanceLabel(primaryLocation);

  const chips = [
    locationLabel ? { icon: 'location-outline', label: locationLabel } : null,
    hoursLabel ? { icon: 'time-outline', label: hoursLabel } : null,
    priceLabel ? { icon: 'pricetag-outline', label: priceLabel } : null,
    distanceLabel ? { icon: 'navigate-outline', label: distanceLabel } : null,
  ].filter(Boolean);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${displayName} on SocialCircle`,
      });
    } catch {}
  };

  const handleCall = async () => {
    if (!contact?.phone) return;
    const tel = `tel:${contact.phone}`;
    const can = await Linking.canOpenURL(tel);
    if (can) Linking.openURL(tel);
  };

  const handleDirections = async () => {
    if (!primaryLocation) {
      Alert.alert(
        'Add location',
        'Add a business location to enable directions.'
      );
      return;
    }
    const address = [
      primaryLocation.address,
      primaryLocation.city,
      primaryLocation.state,
    ]
      .filter(Boolean)
      .join(', ');
    const url = address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          address
        )}`
      : null;
    if (url) Linking.openURL(url);
  };

  const openSidebar = () => {
    sidebarClosing.current = false;
    sidebarAnim.setValue(Dimensions.get('window').width);
    setSidebarVisible(true);
    requestAnimationFrame(() => {
      Animated.timing(sidebarAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start();
    });
  };

  const closeSidebar = () => {
    sidebarClosing.current = true;
    Animated.timing(sidebarAnim, {
      toValue: Dimensions.get('window').width,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (!sidebarVisible) return;
    const screenWidth = Dimensions.get('window').width;
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

  const confirmLogout = () =>
    Alert.alert('Log out', 'Sign out of this account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await auth().signOut();
          } catch (err) {
            console.warn('Logout failed', err);
          }
        },
      },
    ]);

  const navigateToConsumerRoot = () => {
    let nav = navigation;
    while (nav?.getParent) {
      const parent = nav.getParent();
      if (!parent) break;
      const routeNames = parent?.getState?.()?.routeNames || [];
      if (routeNames.includes('MainTabs') && parent?.reset) {
        parent.reset({
          index: 0,
          routes: [{ name: 'MainTabs', params: { screen: 'ProfileStack' } }],
        });
        return true;
      }
      nav = parent;
    }
    return false;
  };

  const switchToPersonal = async () => {
    try {
      setRole('consumer');
      setNextConsumerRoute('Profile');
      if (user?.uid) {
        await switchToPersonalAccount();
      }
      // Small delay to ensure state updates propagate
      setTimeout(() => {
        navigateToConsumerRoot();
      }, 100);
    } catch (err) {
      console.warn('[business] Failed to switch account type', err);
    }
  };

  const handleMenuOptionClick = async (option) => {
    switch (option) {
      case 'Switch to personal':
        closeSidebar();
        // Wait for sidebar to close before switching
        setTimeout(() => {
          switchToPersonal();
        }, 300);
        break;
      case 'Privacy and Info':
        closeSidebar();
        setTimeout(() => {
          navigation.navigate('PrivacyInfo');
        }, 200);
        break;
      case 'Logout':
        closeSidebar();
        setTimeout(() => {
          confirmLogout();
        }, 200);
        break;
      default:
        closeSidebar();
        break;
    }
  };

  const startEditing = async () => {
    const defaults = {
      displayName: business?.displayName || '',
      category: business?.category || '',
      description: business?.description || '',
      logoUrl: business?.logoUrl || '',
      contactEmail: contact?.email || '',
      phone: contact?.phone || '',
      website: contact?.website || '',
      instagram: contact?.social?.instagram || '',
      facebook: contact?.social?.facebook || '',
      tiktok: contact?.social?.tiktok || '',
    };
    await start(user?.uid, defaults, business?.id);
    const parent = navigation?.getParent?.();
    if (parent?.navigate) {
      parent.navigate('BusinessOnboarding', { screen: 'Basics' });
    } else {
      navigation.navigate('BusinessOnboarding', { screen: 'Basics' });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size='large' color='#2F80ED' />
          <Text style={styles.helper}>Loading your business profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!resolvedBizId || !business) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Animated.View
            style={{
              transform: [{ scale: 1 }],
              opacity: 1,
              alignItems: 'center',
            }}
          >
            {/* Icon with gradient background */}
            <View style={{ marginBottom: 24 }}>
              <LinearGradient
                colors={['#3B82F6', '#8B5CF6', '#EC4899']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#3B82F6',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.3,
                  shadowRadius: 16,
                  elevation: 8,
                }}
              >
                <Ionicons name='briefcase-outline' size={48} color='#FFFFFF' />
              </LinearGradient>
            </View>

            <Text
              style={[
                styles.title,
                { fontSize: 28, fontWeight: '700', marginBottom: 12 },
              ]}
            >
              No business profile
            </Text>
            <Text
              style={[
                styles.helper,
                {
                  fontSize: 16,
                  textAlign: 'center',
                  paddingHorizontal: 16,
                  marginBottom: 32,
                },
              ]}
            >
              Finish setup to see your business profile here.
            </Text>

            <TouchableOpacity
              style={{
                width: '80%',
                maxWidth: 400,
                borderRadius: 14,
                overflow: 'hidden',
                shadowColor: '#2563EB',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 4,
              }}
              onPress={startEditing}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#3B82F6', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 16,
                  paddingHorizontal: 24,
                }}
              >
                <Ionicons
                  name='add-circle-outline'
                  size={22}
                  color='#FFFFFF'
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={[
                    styles.primaryLabel,
                    { fontSize: 17, fontWeight: '700' },
                  ]}
                >
                  Create business profile
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
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
          >
            <SafeAreaView style={styles.sidebarSafeArea}>
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

              <View style={styles.sidebarContentWrapper}>
                <View style={styles.sidebarTopSection}>
                  {['Switch to personal', 'Privacy and Info', 'Logout'].map(
                    (option) => (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.sidebarOption,
                          {
                            backgroundColor: theme.colors.backgroundSecondary,
                            borderBottomColor: theme.colors.border,
                          },
                        ]}
                        onPress={() => handleMenuOptionClick(option)}
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
                    )
                  )}

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
                      trackColor={{ false: '#CBD5E1', true: '#3B82F6' }}
                      thumbColor={themeMode === 'dark' ? '#FFFFFF' : '#F1F5F9'}
                      ios_backgroundColor='#CBD5E1'
                    />
                  </View>
                </View>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient
          colors={['#ff6b6b', '#4dabf7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Business Profile</Text>
            <View style={styles.headerIcons}>
              <TouchableOpacity style={styles.iconButton} onPress={handleShare}>
                <Ionicons name='share-outline' size={22} color='#FFFFFF' />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton}>
                <Ionicons
                  name='notifications-outline'
                  size={22}
                  color='#FFFFFF'
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={openSidebar}>
                <Ionicons name='menu' size={22} color='#FFFFFF' />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.avatarWrapper}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.profileImage} />
            ) : (
              <View style={[styles.profileImage, styles.profileFallback]}>
                <Ionicons name='briefcase-outline' size={32} color='#7C8AA0' />
              </View>
            )}
          </View>

          <View style={styles.nameRow}>
            <Text style={styles.name}>{displayName}</Text>
            {verified && (
              <MaterialIcons
                name='verified'
                size={20}
                color='#3B82F6'
                style={{ marginLeft: 6 }}
              />
            )}
          </View>
          <Text style={styles.tagline}>{category}</Text>
          <Text style={styles.since}>
            Member since {new Date().getFullYear()}
          </Text>
        </LinearGradient>

        {/* Stats Row - overlapping the gradient */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {formatRating(business?.rating)}
            </Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {formatCount(business?.ratingCount)}
            </Text>
            <Text style={styles.statLabel}>Reviews</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
        </View>

        {/* Bio/About Section */}
        <View style={styles.bioSection}>
          <View style={styles.bioCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>About</Text>
              <TouchableOpacity onPress={startEditing}>
                <Ionicons
                  name='create-outline'
                  size={20}
                  color={theme.colors.primary}
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionBody}>
              {description ||
                'Add a description to share what your business offers.'}
            </Text>
          </View>

          {/* Contact Info Card */}
          {(contact?.email || contact?.phone || contact?.website) && (
            <View style={styles.bioCard}>
              <Text style={styles.sectionTitle}>Contact</Text>
              {contact?.email && (
                <View style={styles.contactRow}>
                  <Ionicons
                    name='mail-outline'
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.contactText}>{contact.email}</Text>
                </View>
              )}
              {contact?.phone && (
                <View style={styles.contactRow}>
                  <Ionicons
                    name='call-outline'
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.contactText}>{contact.phone}</Text>
                </View>
              )}
              {contact?.website && (
                <View style={styles.contactRow}>
                  <Ionicons
                    name='globe-outline'
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.contactText}>{contact.website}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Timeline Header with Tabs */}
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineTitle}>Events</Text>
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === TAB_KEYS.EVENTS && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab(TAB_KEYS.EVENTS)}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === TAB_KEYS.EVENTS && styles.tabLabelActive,
              ]}
            >
              Events
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === TAB_KEYS.PERKS && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab(TAB_KEYS.PERKS)}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === TAB_KEYS.PERKS && styles.tabLabelActive,
              ]}
            >
              Perks
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          {(activeTab === TAB_KEYS.EVENTS
            ? buildEventCards(displayName)
            : buildPerkCards(displayName)
          ).map((card) => (
            <View key={card.title} style={styles.card}>
              <View style={styles.cardBadge}>
                <Text style={styles.cardBadgeText}>{card.badge}</Text>
              </View>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const ActionButton = ({ icon, label, onPress }) => (
  <TouchableOpacity style={stylesAction.button} onPress={onPress}>
    <Ionicons name={icon} size={16} color='#1A1A1A' />
    <Text style={stylesAction.label} numberOfLines={1}>
      {label}
    </Text>
  </TouchableOpacity>
);

const RatingTile = ({ rating, count }) => (
  <View style={[stylesAction.button, stylesAction.rating]}>
    <View style={stylesAction.ratingIconRow}>
      <Ionicons name='star' size={16} color='#F4B400' />
      <Text style={stylesAction.ratingValue}>{rating}</Text>
    </View>
    <Text style={stylesAction.ratingMeta}>{count} Reviews</Text>
  </View>
);

const stylesAction = StyleSheet.create({
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
    flexShrink: 1,
  },
  rating: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 6,
  },
  ratingIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingValue: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  ratingMeta: { fontSize: 11, fontWeight: '500', color: '#475569' },
});

function buildLocationLabel(location) {
  if (!location) return '';
  const parts = [location.city, location.state].filter(Boolean);
  return parts.join(', ');
}

function resolveHoursLabel(business) {
  if (!business) return '';
  if (business.hoursLabel) return business.hoursLabel;
  if (business.hours?.label) return business.hours.label;
  if (business.hours?.status) return business.hours.status;
  return '';
}

function resolvePriceLabel(business) {
  if (!business) return '';
  if (typeof business.priceLevel === 'number' && business.priceLevel > 0) {
    return '$'.repeat(Math.min(business.priceLevel, 4));
  }
  if (typeof business.priceRange === 'string' && business.priceRange.trim()) {
    return business.priceRange.trim();
  }
  return '';
}

function resolveDistanceLabel(location) {
  if (!location) return '';
  if (typeof location.distanceMiles === 'number') {
    return `${location.distanceMiles.toFixed(1)} mi`;
  }
  if (
    typeof location.distanceText === 'string' &&
    location.distanceText.trim()
  ) {
    return location.distanceText.trim();
  }
  return '';
}

function formatRating(value) {
  if (typeof value !== 'number') return '0.0';
  return value.toFixed(1);
}

function formatCount(value) {
  if (typeof value !== 'number') return '0';
  return value.toLocaleString();
}

function buildContactDetails(business) {
  if (!business) return {};
  const contact = business.contact || {};
  const social = contact.social || {};
  return {
    email:
      contact.email || business.supportEmail || business.contactEmail || null,
    phone: contact.phone || business.phone || null,
    website: contact.website || business.website || null,
    social: {
      instagram: social.instagram || null,
      facebook: social.facebook || null,
      tiktok: social.tiktok || null,
    },
  };
}

function buildEventCards(name) {
  return [
    {
      badge: 'Today',
      title: 'Events',
      subtitle: `Host a new event for ${name}.`,
    },
    {
      badge: 'Upcoming',
      title: 'Weekly Meetup',
      subtitle: 'Tell guests what is happening this week.',
    },
  ];
}

function buildPerkCards(name) {
  return [
    {
      badge: 'Limited',
      title: 'Special Offer',
      subtitle: `Add perks for ${name} members.`,
    },
    {
      badge: 'Members',
      title: 'Reward',
      subtitle: 'Set a reward for returning guests.',
    },
  ];
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { paddingBottom: 30 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    title: { fontSize: 22, fontWeight: '700', color: theme.colors.text },
    helper: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 20,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 60,
      borderBottomRightRadius: 20,
      borderBottomLeftRadius: 20,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 16,
      marginTop: 10,
    },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
    headerIcons: { flexDirection: 'row', gap: 10 },
    iconButton: {
      padding: 4,
      marginLeft: 12,
    },
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
    profileFallback: { alignItems: 'center', justifyContent: 'center' },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },
    name: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#fff',
      textAlign: 'center',
      marginTop: 6,
    },
    tagline: { fontSize: 15, color: '#fff', textAlign: 'center', marginTop: 4 },
    since: { fontSize: 13, color: '#fff', textAlign: 'center', marginTop: 2 },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.7)',
    },
    chipText: { fontSize: 12, fontWeight: '600', color: '#1A1A1A' },
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
    contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 10,
    },
    contactText: {
      fontSize: 14,
      color: theme.colors.text,
      flex: 1,
    },
    timelineHeader: { marginTop: 20, marginHorizontal: 16, marginBottom: 8 },
    timelineTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
    sectionBody: {
      fontSize: 15,
      color: theme.colors.text,
      lineHeight: 22,
    },
    tabRow: {
      flexDirection: 'row',
      marginHorizontal: 16,
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: 16,
      padding: 4,
      gap: 8,
    },
    tabButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 12,
    },
    tabButtonActive: { backgroundColor: theme.colors.primary },
    tabLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
    tabLabelActive: { color: '#fff', fontWeight: '700' },
    grid: {
      marginTop: 14,
      marginHorizontal: 16,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    card: {
      width: '47%',
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.isDark ? 0.35 : 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    cardBadge: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(59,130,246,0.2)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    cardBadgeText: { fontSize: 11, fontWeight: '600', color: '#2563EB' },
    cardTitle: {
      marginTop: 10,
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
    cardSubtitle: {
      marginTop: 6,
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    primaryButton: {
      marginTop: 20,
      backgroundColor: '#2F80ED',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    primaryLabel: { color: '#FFF', fontWeight: '700', fontSize: 16 },
    sidebarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      position: 'relative',
    },
    sidebarHeaderBack: {
      position: 'absolute',
      left: 0,
      top: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 20,
      zIndex: 1,
    },
    sidebarHeaderTitle: { fontSize: 18, fontWeight: '700' },
    sidebarContentWrapper: {
      flex: 1,
      justifyContent: 'flex-start',
      paddingTop: 12,
      paddingBottom: 24,
    },
    sidebarTopSection: { gap: 8 },
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
      borderTopLeftRadius: 24,
      borderBottomLeftRadius: 24,
      paddingHorizontal: 16,
      paddingBottom: 40,
      shadowColor: '#000',
      shadowOffset: { width: -4, height: 0 },
      shadowOpacity: theme.isDark ? 0.5 : 0.15,
      shadowRadius: 20,
      elevation: 12,
      zIndex: 1000,
    },
    sidebarSafeArea: {
      flex: 1,
    },
    sidebarOption: {
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderRadius: 8,
      marginBottom: 8,
    },
    sidebarOptionWithSwitch: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderRadius: 8,
      marginBottom: 8,
    },
    sidebarOptionText: {
      fontSize: 16,
      fontWeight: '500',
    },
  });
