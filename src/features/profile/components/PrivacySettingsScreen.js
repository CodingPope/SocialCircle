// Description: Privacy & Data settings screen — analytics opt-in, notification/location
// deep-links to device settings, and links to legal articles.
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  Linking,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../theme';
import { useUserStore } from '../stores/userStore';
import { db, serverTimestamp } from '../../../services/firebase';
import { setOptIn as analyticsSetOptIn } from '../../../services/analyticsService';
import logger from '../../../lib/logger';
import ROUTES from '../../../navigation/routes';

export default function PrivacySettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation();
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);

  const [analyticsOptIn, setAnalyticsOptIn] = useState(!!user?.analyticsOptIn);
  const [saving, setSaving] = useState(false);

  // Sync if user object changes externally
  useEffect(() => {
    setAnalyticsOptIn(!!user?.analyticsOptIn);
  }, [user?.analyticsOptIn]);

  const handleAnalyticsToggle = async (val) => {
    setAnalyticsOptIn(val);
    if (!user?.uid) return;
    setSaving(true);
    const firestoreTimestamp = serverTimestamp();
    try {
      await db.collection('users').doc(user.uid).update({
        analyticsOptIn: val,
        analyticsUpdatedAt: firestoreTimestamp,
      });
      setUser({ ...user, analyticsOptIn: val, analyticsUpdatedAt: new Date() });
      // Propagate to the analytics service so tracking starts/stops immediately
      try {
        analyticsSetOptIn(val);
      } catch {}
    } catch (err) {
      logger.error(
        '[PrivacySettings] Failed to update analyticsOptIn',
        err?.message,
      );
      // Revert optimistic update
      setAnalyticsOptIn(!val);
      Alert.alert('Error', 'Could not save your preference. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openDeviceSettings = () => {
    try {
      if (Platform.OS === 'ios') {
        Linking.openURL('app-settings:');
      } else {
        Linking.openSettings();
      }
    } catch {
      Alert.alert(
        'Open Settings',
        'Go to your device Settings to manage app permissions.',
      );
    }
  };

  const goToArticle = (article) => {
    navigation.navigate(ROUTES.INFO_ARTICLE, { article });
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <Ionicons name='arrow-back' size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Privacy &amp; Data
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Analytics ──────────────────────────────── */}
        <Text
          style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}
        >
          ANALYTICS
        </Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
                Share usage data
              </Text>
              <Text
                style={[styles.rowDesc, { color: theme.colors.textSecondary }]}
              >
                Help us improve Social Circle. We never share your email,
                precise location, or personal details with analytics.
              </Text>
            </View>
            {saving ? (
              <ActivityIndicator
                size='small'
                color={theme.colors.primary}
                style={styles.spinner}
              />
            ) : (
              <Switch
                value={analyticsOptIn}
                onValueChange={handleAnalyticsToggle}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primary,
                }}
                thumbColor='#fff'
                accessibilityLabel='Toggle analytics opt-in'
              />
            )}
          </View>
        </View>

        {/* ─── Permissions ────────────────────────────── */}
        <Text
          style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}
        >
          DEVICE PERMISSIONS
        </Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <SettingsRow
            icon='notifications-outline'
            title='Push notifications'
            desc='Event reminders, RSVP updates, and new messages.'
            actionLabel='Manage'
            onPress={openDeviceSettings}
            theme={theme}
          />
          <View
            style={[styles.divider, { backgroundColor: theme.colors.border }]}
          />
          <SettingsRow
            icon='location-outline'
            title='Location access'
            desc='Used to show events near you. Foreground only — we never track you in the background.'
            actionLabel='Manage'
            onPress={openDeviceSettings}
            theme={theme}
          />
          <View
            style={[styles.divider, { backgroundColor: theme.colors.border }]}
          />
          <SettingsRow
            icon='images-outline'
            title='Photos &amp; Camera'
            desc='Required to upload profile and event images.'
            actionLabel='Manage'
            onPress={openDeviceSettings}
            theme={theme}
          />
        </View>

        {/* ─── Legal ──────────────────────────────────── */}
        <Text
          style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}
        >
          LEGAL
        </Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <LegalRow
            title='Privacy Policy'
            onPress={() => goToArticle('privacy')}
            theme={theme}
          />
          <View
            style={[styles.divider, { backgroundColor: theme.colors.border }]}
          />
          <LegalRow
            title='Terms of Service'
            onPress={() => goToArticle('terms')}
            theme={theme}
          />
          <View
            style={[styles.divider, { backgroundColor: theme.colors.border }]}
          />
          <LegalRow
            title='Transparency'
            onPress={() => goToArticle('transparency')}
            theme={theme}
          />
        </View>

        {/* ─── Account Deletion Note ───────────────────── */}
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor:
                theme.colors.backgroundSecondary || theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Ionicons
            name='information-circle-outline'
            size={15}
            color={theme.colors.textSecondary}
            style={styles.infoIcon}
          />
          <Text
            style={[styles.infoText, { color: theme.colors.textSecondary }]}
          >
            To delete your account and all associated data, go to{' '}
            <Text style={styles.infoBold}>
              Profile › Settings › Delete Account
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ──────────────────────────────────────

function SettingsRow({ icon, title, desc, actionLabel, onPress, theme }) {
  return (
    <View style={styles.row}>
      <Ionicons
        name={icon}
        size={20}
        color={theme.colors.textSecondary}
        style={styles.rowIcon}
      />
      <View style={styles.rowLeft}>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
          {title}
        </Text>
        <Text style={[styles.rowDesc, { color: theme.colors.textSecondary }]}>
          {desc}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.linkBtn, { borderColor: theme.colors.primary }]}
        onPress={onPress}
        accessibilityLabel={`${actionLabel} ${title}`}
      >
        <Text style={[styles.linkBtnText, { color: theme.colors.primary }]}>
          {actionLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function LegalRow({ title, onPress, theme }) {
  return (
    <TouchableOpacity
      style={[styles.row, styles.legalRow]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
        {title}
      </Text>
      <Ionicons
        name='chevron-forward'
        size={17}
        color={theme.colors.textSecondary}
      />
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────

const createStyles = (theme) => {
  const { colors, spacing, radii } = theme;
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing?.md ?? 16,
      paddingVertical: spacing?.sm ?? 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: { padding: 4 },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '600',
    },
    headerSpacer: { width: 30 },
    content: {
      paddingHorizontal: spacing?.md ?? 16,
      paddingBottom: 40,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      marginTop: spacing?.lg ?? 24,
      marginBottom: spacing?.xs ?? 6,
      marginLeft: 4,
    },
    card: {
      borderRadius: radii?.md ?? 12,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing?.md ?? 16,
      paddingVertical: spacing?.sm ?? 12,
    },
    legalRow: {
      justifyContent: 'space-between',
    },
    rowIcon: {
      marginRight: spacing?.sm ?? 10,
    },
    rowLeft: {
      flex: 1,
      marginRight: spacing?.sm ?? 10,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: '500',
    },
    rowDesc: {
      fontSize: 13,
      marginTop: 2,
      lineHeight: 18,
    },
    spinner: {
      width: 51, // match Switch width so layout doesn't shift
    },
    linkBtn: {
      borderWidth: 1,
      borderRadius: radii?.sm ?? 8,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    linkBtnText: {
      fontSize: 13,
      fontWeight: '500',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: spacing?.md ?? 16,
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radii?.md ?? 12,
      padding: spacing?.sm ?? 12,
      marginTop: spacing?.lg ?? 24,
      gap: 8,
    },
    infoIcon: {
      marginTop: 1,
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
    },
    infoBold: {
      fontWeight: '600',
    },
  });
};
