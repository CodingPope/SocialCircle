import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';

export default function AnalyticsConsentPrompt({
  visible,
  onAccept,
  onDecline,
  busy = false,
}) {
  return (
    <Modal
      visible={!!visible}
      transparent
      animationType='fade'
      onRequestClose={() => {
        if (!busy && typeof onDecline === 'function') onDecline();
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Allow Anonymous Analytics?</Text>
          <Text style={styles.body}>
            We use privacy-safe analytics to understand which features are
            working and to improve the experience. Turn this on to help us make
            the app better. You can change this anytime under Privacy &amp;
            Info.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.noButton]}
              onPress={onDecline}
              disabled={busy}
              accessibilityRole='button'
              accessibilityLabel='No thanks'
            >
              <Text style={[styles.buttonText, styles.noText]}>No thanks</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.yesButton]}
              onPress={onAccept}
              disabled={busy}
              accessibilityRole='button'
              accessibilityLabel='Allow analytics'
            >
              <Text style={[styles.buttonText, styles.yesText]}>Allow</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: Platform.OS === 'ios' ? 0.18 : 0,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#444',
    textAlign: 'center',
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  noButton: {
    backgroundColor: '#EEF1F5',
  },
  yesButton: {
    backgroundColor: '#1E88E5',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  noText: {
    color: '#2F3A4A',
  },
  yesText: {
    color: '#fff',
  },
});
