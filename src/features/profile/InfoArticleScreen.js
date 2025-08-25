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
    body: 'Your privacy policy goes here. Explain data collection, usage, and retention policies.',
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
        <Text style={styles.body}>{article.body}</Text>
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
});
