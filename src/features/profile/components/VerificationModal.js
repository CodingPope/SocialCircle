// src/features/profile/components/VerificationModal.js
// Description: User verification modal - email and phone verification options
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Modal from 'react-native-modal';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  requestEmailVerification,
  verifyEmailCode,
  requestPhoneVerification,
  verifyPhoneCode,
} from '../../../firebase/config';
import { useTheme } from '../../../theme';
import { useUserStore } from '../stores/userStore';

export default function VerificationModal({ isVisible, onClose, onSuccess }) {
  const theme = useTheme();
  const user = useUserStore((state) => state.user);

  const [step, setStep] = useState('choose'); // 'choose', 'email-input', 'phone-input', 'email-code', 'phone-code'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [remainingTime, setRemainingTime] = useState(0);

  // Timer for resend cooldown
  useEffect(() => {
    if (remainingTime <= 0) return;
    const timer = setTimeout(() => setRemainingTime(remainingTime - 1), 1000);
    return () => clearTimeout(timer);
  }, [remainingTime]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isVisible) {
      setStep('choose');
      setPhoneNumber('');
      setCode('');
      setSentTo('');
      setRemainingTime(0);
    }
  }, [isVisible]);

  const handleEmailVerification = async () => {
    setLoading(true);
    try {
      const result = await requestEmailVerification();
      console.log('📧 Email verification result:', result);

      if (result.alreadyVerified) {
        Alert.alert('Already Verified', 'Your account is already verified!');
        onSuccess?.();
        onClose();
        return;
      }
      setSentTo(result.email || user?.email || 'your email');
      setStep('email-code');
      setRemainingTime(60); // 60 second cooldown

      // DEVELOPMENT ONLY: Show the code in an alert
      if (result.devCode) {
        console.log('🔑 Showing dev code alert:', result.devCode);
        Alert.alert(
          '🔑 Development Mode',
          `Your verification code is:\n\n${result.devCode}\n\n(In production, this would be sent via email)`,
          [{ text: 'OK' }]
        );
      } else {
        console.warn('⚠️ No devCode in result:', result);
      }
    } catch (err) {
      const message = err?.message || 'Failed to send verification email';
      Alert.alert('Error', message);
      console.error('Email verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneRequest = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter a phone number');
      return;
    }

    // Basic phone validation
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      const result = await requestPhoneVerification(phoneNumber);
      console.log('📱 Phone verification result:', result);

      if (result.alreadyVerified) {
        Alert.alert('Already Verified', 'Your account is already verified!');
        onSuccess?.();
        onClose();
        return;
      }
      setSentTo(phoneNumber);
      setStep('phone-code');
      setRemainingTime(60);

      // DEVELOPMENT ONLY: Show the code in an alert
      if (result.devCode) {
        console.log('🔑 Showing dev code alert:', result.devCode);
        Alert.alert(
          '🔑 Development Mode',
          `Your verification code is:\n\n${result.devCode}\n\n(In production, this would be sent via SMS)`,
          [{ text: 'OK' }]
        );
      } else {
        console.warn('⚠️ No devCode in result:', result);
      }
    } catch (err) {
      const message = err?.message || 'Failed to send verification code';
      Alert.alert('Error', message);
      console.error('Phone verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    if (!code.trim() || code.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyEmailCode(code);
      if (result.verified) {
        Alert.alert(
          '✅ Verified!',
          'Your account has been verified successfully.',
          [
            {
              text: 'OK',
              onPress: () => {
                onSuccess?.();
                onClose();
              },
            },
          ]
        );
      }
    } catch (err) {
      const message = err?.message || 'Invalid code';
      Alert.alert('Verification Failed', message);
      setCode(''); // Clear code on failure
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneCode = async () => {
    if (!code.trim() || code.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyPhoneCode(code);
      if (result.verified) {
        Alert.alert(
          '✅ Verified!',
          'Your account has been verified successfully.',
          [
            {
              text: 'OK',
              onPress: () => {
                onSuccess?.();
                onClose();
              },
            },
          ]
        );
      }
    } catch (err) {
      const message = err?.message || 'Invalid code';
      Alert.alert('Verification Failed', message);
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const renderChooseMethod = () => (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.colors.text }]}>
        Get Verified
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        Verified accounts help build trust in our community. Choose your
        verification method:
      </Text>

      {/* Email Verification */}
      <TouchableOpacity
        style={[
          styles.methodCard,
          { backgroundColor: theme.colors.backgroundSecondary },
        ]}
        onPress={handleEmailVerification}
        disabled={loading}
      >
        <View style={styles.methodIcon}>
          <Ionicons name='mail' size={28} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.methodTitle, { color: theme.colors.text }]}>
            Email Verification
          </Text>
          <Text
            style={[styles.methodDesc, { color: theme.colors.textSecondary }]}
          >
            We'll send a code to {user?.email || 'your email'}
          </Text>
        </View>
        <Ionicons
          name='chevron-forward'
          size={24}
          color={theme.colors.textSecondary}
        />
      </TouchableOpacity>

      {/* Phone Verification */}
      <TouchableOpacity
        style={[
          styles.methodCard,
          { backgroundColor: theme.colors.backgroundSecondary },
        ]}
        onPress={() => setStep('phone-input')}
        disabled={loading}
      >
        <View style={styles.methodIcon}>
          <Ionicons
            name='phone-portrait'
            size={28}
            color={theme.colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.methodTitle, { color: theme.colors.text }]}>
            Phone Verification
          </Text>
          <Text
            style={[styles.methodDesc, { color: theme.colors.textSecondary }]}
          >
            Verify with your phone number (SMS)
          </Text>
        </View>
        <Ionicons
          name='chevron-forward'
          size={24}
          color={theme.colors.textSecondary}
        />
      </TouchableOpacity>

      {loading && (
        <ActivityIndicator
          size='large'
          color={theme.colors.primary}
          style={{ marginTop: 20 }}
        />
      )}
    </View>
  );

  const renderPhoneInput = () => (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => setStep('choose')}
      >
        <Ionicons name='arrow-back' size={24} color={theme.colors.primary} />
      </TouchableOpacity>

      <Text style={[styles.title, { color: theme.colors.text }]}>
        Phone Verification
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        Enter your phone number to receive a verification code via SMS.
      </Text>

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.inputBackground,
            color: theme.colors.text,
            borderColor: theme.colors.border,
          },
        ]}
        placeholder='(555) 123-4567'
        placeholderTextColor={theme.colors.textSecondary}
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        keyboardType='phone-pad'
        autoFocus
      />

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: theme.colors.primary },
          loading && { opacity: 0.6 },
        ]}
        onPress={handlePhoneRequest}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color='#fff' />
        ) : (
          <Text style={styles.buttonText}>Send Code</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderCodeInput = (type) => (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => setStep('choose')}
      >
        <Ionicons name='arrow-back' size={24} color={theme.colors.primary} />
      </TouchableOpacity>

      <Text style={[styles.title, { color: theme.colors.text }]}>
        Enter Verification Code
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        We sent a 6-digit code to {sentTo}
      </Text>

      <TextInput
        style={[
          styles.input,
          styles.codeInput,
          {
            backgroundColor: theme.colors.inputBackground,
            color: theme.colors.text,
            borderColor: theme.colors.border,
          },
        ]}
        placeholder='000000'
        placeholderTextColor={theme.colors.textSecondary}
        value={code}
        onChangeText={setCode}
        keyboardType='number-pad'
        maxLength={6}
        autoFocus
      />

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: theme.colors.primary },
          loading && { opacity: 0.6 },
        ]}
        onPress={
          type === 'email' ? handleVerifyEmailCode : handleVerifyPhoneCode
        }
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color='#fff' />
        ) : (
          <Text style={styles.buttonText}>Verify</Text>
        )}
      </TouchableOpacity>

      {/* Resend button */}
      <TouchableOpacity
        style={styles.resendButton}
        onPress={
          type === 'email' ? handleEmailVerification : handlePhoneRequest
        }
        disabled={remainingTime > 0 || loading}
      >
        <Text
          style={[
            styles.resendText,
            {
              color:
                remainingTime > 0
                  ? theme.colors.textSecondary
                  : theme.colors.primary,
            },
          ]}
        >
          {remainingTime > 0
            ? `Resend code in ${remainingTime}s`
            : 'Resend code'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      isVisible={isVisible}
      onBackdropPress={onClose}
      onSwipeComplete={onClose}
      swipeDirection='down'
      style={styles.modal}
      backdropOpacity={0.5}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View
          style={[
            styles.modalContent,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <View style={styles.dragHandle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps='handled'
          >
            {step === 'choose' && renderChooseMethod()}
            {step === 'phone-input' && renderPhoneInput()}
            {step === 'email-code' && renderCodeInput('email')}
            {step === 'phone-code' && renderCodeInput('phone')}
          </ScrollView>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text
              style={[styles.closeText, { color: theme.colors.textSecondary }]}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  container: {
    paddingVertical: 10,
  },
  backButton: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 24,
    lineHeight: 22,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  methodIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  methodTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  methodDesc: {
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
  },
  codeInput: {
    fontSize: 32,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 8,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  resendButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  resendText: {
    fontSize: 15,
    fontWeight: '500',
  },
  closeButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
