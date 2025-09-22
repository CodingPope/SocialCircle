import React, { useEffect, useState, useRef } from 'react';
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
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useUserStore } from '../stores/userStore';
import { setOptIn as analyticsSetOptIn } from '../../../services/analytics';

// Description: Centralized screen to manage privacy and legal information
export default function PrivacyInfoScreen({ navigation }) {
  const user = useUserStore((s) => s.user);
  const [analyticsOptIn, setAnalyticsOptIn] = useState(!!user?.analyticsOptIn);
  useEffect(
    () => setAnalyticsOptIn(!!user?.analyticsOptIn),
    [user?.analyticsOptIn]
  );

  const toggleAnalytics = async () => {
    const next = !analyticsOptIn;
    setAnalyticsOptIn(next); // optimistic
    try {
      if (user?.uid) {
        await updateDoc(doc(db, 'users', user.uid), {
          analyticsOptIn: next,
          analyticsUpdatedAt: new Date(),
        });
      }
    } catch {}
    try {
      await analyticsSetOptIn(next);
    } catch {}
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
          <Ionicons name='arrow-back' size={26} color='#111' />
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
                { backgroundColor: analyticsOptIn ? '#E6F5EA' : '#f2f2f2' },
              ]}
            >
              <Text
                style={{
                  color: analyticsOptIn ? '#2e7d32' : '#555',
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
              <Ionicons name='chevron-forward' size={20} color='#777' />
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
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 16, fontWeight: '600', color: '#222' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 6 },
  switchBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  linkText: { fontSize: 15, color: '#007AFF' },
});
