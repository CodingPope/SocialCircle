import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  StatusBar,
  PanResponder,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { db, serverTimestamp } from '../../../firebase/config';
import { useUserStore } from '../stores/userStore';
import {
  setOptIn as analyticsSetOptIn,
  analyticsInit as configureAnalytics,
  event as analyticsEvent,
  deriveUserAnalyticsProps,
} from '../../../services/analytics';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';

// Description: Centralized screen to manage privacy and legal information
export default function PrivacyInfoScreen({ navigation }) {
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [analyticsOptIn, setAnalyticsOptIn] = useState(!!user?.analyticsOptIn);
  useEffect(
    () => setAnalyticsOptIn(!!user?.analyticsOptIn),
    [user?.analyticsOptIn]
  );

  const toggleAnalytics = async () => {
    const next = !analyticsOptIn;
    const now = new Date();
    const firestoreTimestamp = serverTimestamp();
    setAnalyticsOptIn(next);
    let persisted = false;
    if (user?.uid) {
      try {
        await db.collection('users').doc(user.uid).update({
          analyticsOptIn: next,
          analyticsUpdatedAt: firestoreTimestamp,
        });
        persisted = true;
      } catch (error) {
        console.warn(
          'Failed to update analytics preference in Firestore',
          error
        );
      }
    }

    if (!persisted) {
      setAnalyticsOptIn(!next);
      return;
    }

    if (typeof setUser === 'function') {
      try {
        setUser({
          ...user,
          analyticsOptIn: next,
          analyticsUpdatedAt: now,
        });
      } catch (error) {
        console.warn(
          'Failed to update local user store with analytics toggle',
          error
        );
      }
    }

    try {
      await analyticsSetOptIn(next);
      if (user?.uid) {
        await configureAnalytics({
          optedIn: next,
          uid: user.uid,
          props: deriveUserAnalyticsProps({
            ...user,
            analyticsOptIn: next,
          }),
        });
      }
      await analyticsEvent('analytics_personalization_toggle', {
        status: next ? 'enabled' : 'disabled',
      });
    } catch (error) {
      console.warn('Failed to synchronize analytics preference', error);
    }
  };

  const openArticle = (title, contentKey) => {
    navigation.navigate('InfoArticle', { title, contentKey });
  };

  // Description: Swipe right anywhere to go back (iOS-style), works on Android too
  const backSwipe = useRef(null);
  backSwipe.current =
    backSwipe.current ||
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, g) =>
        Math.abs(g.dx) > 20 && Math.abs(g.dy) < 20 && g.vx > 0.1 && g.dx > 0,
      onPanResponderRelease: (evt, g) => {
        if (g.dx > 60 && Math.abs(g.dy) < 40) {
          try {
            navigation.goBack();
          } catch {}
        }
      },
    });

  return (
    <SafeAreaView style={styles.safe} {...backSwipe.current.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityLabel='Go back'
        >
          <Ionicons name='arrow-back' size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy and Info</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Personalization toggle */}
        <View
          style={styles.card}
          accessible
          accessibilityLabel='Analytics personalization'
        >
          <View style={styles.rowBetween}>
            <Text style={styles.title}>Allow personalization</Text>
            <TouchableOpacity
              onPress={toggleAnalytics}
              accessibilityRole='switch'
              accessibilityState={{ checked: analyticsOptIn }}
              style={[
                styles.switchBtn,
                {
                  backgroundColor: analyticsOptIn
                    ? theme.isDark
                      ? '#1E4D2B'
                      : '#E6F5EA'
                    : theme.colors.backgroundSecondary,
                },
              ]}
            >
              <Text
                style={{
                  color: analyticsOptIn
                    ? theme.isDark
                      ? '#4ADE80'
                      : '#2e7d32'
                    : theme.colors.textSecondary,
                  fontWeight: '600',
                }}
              >
                {analyticsOptIn ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            Controls interest/location-based personalization. Turn off to stop
            analytics collection.
          </Text>
        </View>

        {/* Info links */}
        <View style={styles.card}>
          <Text style={[styles.title, { marginBottom: 8 }]}>Information</Text>
          {[
            { label: 'Transparency', key: 'transparency' },
            { label: 'Terms of Service', key: 'terms' },
            { label: 'Privacy Policy', key: 'privacy' },
            { label: 'Community Guidelines', key: 'guidelines' },
          ].map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.linkRow}
              onPress={() => openArticle(item.label, item.key)}
            >
              <Text style={styles.linkText}>{item.label}</Text>
              <Ionicons
                name='chevron-forward'
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Contact */}
        <View style={styles.card}>
          <Text style={styles.title}>Need help?</Text>
          <Text style={styles.subtitle}>
            Reach out at support@socialcircle.app
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Description: Create theme-aware styles for PrivacyInfoScreen
const createStyles = (theme) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.colors.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    content: { padding: 16, gap: 12 },
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
    },
    subtitle: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 6,
    },
    switchBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 16,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    linkText: {
      fontSize: 15,
      color: theme.colors.primary,
    },
  });
