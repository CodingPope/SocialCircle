import React, { useRef } from 'react';
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
  Linking,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

// Description: Simple reusable article viewer for legal/transparent info
const CONTENT = {
  transparency: {
    title: 'Transparency',
    body: 'We strive to be transparent about how Social Circle works. This page describes data practices, moderation, and how events are surfaced. Replace with your real copy.',
  },
  terms: {
    title: 'Terms of Service',
    body: 'Your terms go here. Add sections, links, and contact details as needed.',
  },
  privacy: {
    title: 'Privacy Policy',
    body: `Effective date: December 25, 2025

Social Circle is a location-based social app. This policy explains what data we collect, why we collect it, where it is stored, and the choices you have.

Age requirement
Social Circle is intended for adults 18+. We do not knowingly collect personal data from minors.

Data we collect
- Account and profile: email address, auth provider identifiers, name, date of birth, sex, profile photo, bio, interests, and verification status.
- Location: precise location (latitude/longitude) if you allow it, or a city/ZIP you enter; we also store a coarse geohash for nearby discovery.
- Events and activity: events you create (title, description, time, address, location, privacy settings, images), RSVPs, waitlists, saved events, follows, and blocks.
- Messages and content: chat messages, posts, comments, and reports you submit.
- Business accounts (optional): business name, category, description, website, support email/phone, and business locations.
- Support communications: if you contact us, we receive your message and email address.
- Device and app data: Expo push token, device platform, and your analytics consent setting.
- Analytics (optional): in-app usage events and coarse attributes (e.g., interests count, age bracket, city). We do not send email, phone, or precise location to analytics.

Why we use it
- Create and secure your account.
- Show nearby events and people, and enable RSVPs, chats, and notifications.
- Power discovery and personalization.
- Provide support and respond to requests.
- Maintain safety (reports and moderation) and service integrity.
- Improve the app when you opt in to analytics.

Permissions we may request
- Location (foreground): to show nearby events and friends.
- Photos: to upload profile, event, and post images.
- Camera (optional): only if you choose to take a photo inside the app.
- Calendar: to add events to your device calendar.
- Notifications: to send event and message updates.

Where it is stored
- Firebase Authentication: login credentials (email/password or Apple/Google sign-in).
- Firebase Firestore: user profiles, events, chats, posts, notifications, reports, and analytics events.
- Firebase Storage: images you upload (profile, event, post).
- Cloud Functions (us-central1): server-side actions like notifications and analytics logging.
- On your device: cached event data, user snippets, and preferences (AsyncStorage).
- Third-party services for specific functions:
  - Expo Push Notifications plus Apple/Google push services to deliver notifications.
  - Google Maps Geocoding API when you enter a city/ZIP manually.

Sharing
- We share data with the service providers above to operate Social Circle.
- Your profile, events, and messages are visible to other users based on in-app features and privacy settings.
- We do not sell your personal data.

Tracking and ads
We do not use third-party advertising SDKs and do not track you across other companies' apps or websites.

Your choices
- Edit your profile, interests, bio, and photo anytime.
- Control location access in device settings; you can enter a city/ZIP instead of sharing GPS.
- Turn analytics on or off in Privacy & Info.
- Disable push notifications in device settings.
- Revoke any permission (photos, camera, calendar) in device settings.
- Delete your account in Profile Settings. When you delete your account:
  • Your account and profile are permanently deleted within 24 hours
  • All your events, messages, and user-generated content are removed
  • If you signed in with Apple, your Sign in with Apple tokens are revoked
  • Some data may be retained for legal, safety, or operational reasons (reports, event attendance records for safety)
  • This action cannot be undone
  • For questions, email support@findyourcircle.app

Retention
We keep data as long as your account is active and as needed for safety and legal obligations.

Contact
Questions or requests? Email support@findyourcircle.app.`,
  },
  guidelines: {
    title: 'Community Guidelines',
    body: 'Guidelines for safe, respectful in-person connections. Keep it friendly and report issues.',
  },
};

export default function InfoArticleScreen({ navigation, route }) {
  const { title, contentKey } = route.params || {};
  const article = CONTENT[contentKey] || {
    title: title || 'Info',
    body: 'Content coming soon.',
  };

  // Description: For Terms of Service, open production URL instead of showing placeholder text
  const openTOSLink = async () => {
    const tosUrl = 'https://www.findyourcircle.app/terms';
    const canOpen = await Linking.canOpenURL(tosUrl);
    if (canOpen) {
      try {
        await Linking.openURL(tosUrl);
      } catch (err) {
        Alert.alert(
          'Unable to Open',
          'Please visit socialcircle.app/legal/terms-of-service in your browser.'
        );
      }
    } else {
      Alert.alert(
        'Unable to Open',
        'Please visit socialcircle.app/legal/terms-of-service in your browser.'
      );
    }
  };

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
          <Ionicons name='arrow-back' size={26} color='#111' />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title || article.title}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.articleTitle}>{article.title}</Text>
        {contentKey === 'terms' ? (
          // Description: Terms of Service - show link to production document
          <View>
            <Text style={styles.body}>
              To view the complete Terms of Service, please tap the button
              below:
            </Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={openTOSLink}
              accessibilityLabel='Open Terms of Service'
              accessibilityRole='button'
            >
              <Text style={styles.linkButtonText}>View Terms of Service</Text>
              <Ionicons name='open-outline' size={20} color='#fff' />
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.body}>{article.body}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  content: { padding: 16 },
  articleTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  body: { fontSize: 15, color: '#333', lineHeight: 22 },
  linkButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  linkButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
