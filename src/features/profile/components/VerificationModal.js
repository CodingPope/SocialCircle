import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import Ionicons from '@expo/vector-icons/Ionicons';
import { auth, db } from '../../../services/firebase/config';
import { doc, updateDoc, serverTimestamp } from '../../../services/firebase/firestoreCompat';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
import { useUserStore } from '../stores/userStore';

const COOLDOWN_SECONDS = 60;
const POLL_INTERVAL_MS = 5000;

export default function VerificationModal({ isVisible, onClose, onSuccess }) {
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);

  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setStatus('idle');
      setMessage('');
      setCooldown(0);
      setLoading(false);
    }
  }, [isVisible]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((prev) => Math.max(prev - 1, 0)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const markVerified = useCallback(async () => {
    try {
      const uid = auth().currentUser?.uid || user?.uid;
      if (!uid) return;
      const verification = {
        status: 'verified',
        method: 'email',
        verifiedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'users', uid), { verification });
      setUser({ ...(user || {}), verification });
    } catch (err) {
      console.warn('[VerificationModal] failed to update Firestore', err);
    }
  }, [setUser, user]);

  const checkVerification = useCallback(async () => {
    try {
      const current = auth().currentUser;
      if (!current) return false;
      await current.reload();
      if (auth().currentUser?.emailVerified) {
        await markVerified();
        setStatus('verified');
        setMessage('Email verified! You are all set.');
        onSuccess?.();
        onClose?.();
        return true;
      }
    } catch (err) {
      console.warn('[VerificationModal] reload failed', err);
    }
    return false;
  }, [markVerified, onClose, onSuccess]);

  useEffect(() => {
    if (!isVisible || status !== 'sent') return;
    const interval = setInterval(() => {
      checkVerification();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkVerification, isVisible, status]);

  const handleSendLink = useCallback(async () => {
    const current = auth().currentUser;
    if (!current || !current.email) {
      setMessage('Please sign in again to verify your email.');
      return;
    }

    setLoading(true);
    try {
      await current.sendEmailVerification();
      setStatus('sent');
      setCooldown(COOLDOWN_SECONDS);
      setMessage(`We sent a verification link to ${current.email}.`);
    } catch (err) {
      setMessage(err?.message || 'Failed to send verification link.');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Modal isVisible={isVisible} onBackdropPress={onClose} onBackButtonPress={onClose}>
      <View
        style={[
          styles.container,
          { backgroundColor: theme.colors.backgroundSecondary },
        ]}
      >
        <View style={styles.headerRow}>
          <Ionicons name='mail' size={24} color={theme.colors.primary} />
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Verify your email
          </Text>
        </View>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          We’ll send a verification link to {user?.email || 'your email'}.
          Open it, tap the link, and we’ll verify automatically.
        </Text>

        {message ? (
          <View style={styles.messageCard}>
            <Text style={[styles.messageText, { color: theme.colors.text }]}>
              {message}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: theme.colors.primary },
            (cooldown > 0 || loading) && styles.disabledButton,
          ]}
          onPress={handleSendLink}
          disabled={cooldown > 0 || loading}
        >
          {loading ? (
            <ActivityIndicator color='#fff' />
          ) : (
            <Text style={styles.primaryButtonText}>
              {status === 'sent' ? 'Resend link' : 'Send verification link'}
              {cooldown > 0 ? ` (${cooldown}s)` : ''}
            </Text>
          )}
        </TouchableOpacity>

        {status === 'sent' && (
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: themeMode === 'dark' ? '#0f172a' : '#f8fafc',
              },
            ]}
            onPress={checkVerification}
            disabled={loading}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
              I’ve verified – check again
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  messageCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.1)',
    marginBottom: 12,
  },
  messageText: {
    fontSize: 14,
    fontWeight: '500',
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
});

