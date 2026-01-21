import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../../auth/context/AuthContext';
import { useBizOnboarding } from '../../stores/businessOnboardingStore';
import { useSessionRole } from '../../../profile/stores/sessionRoleStore';
import { useTheme } from '../../../theme';

const Input = ({ label, value, onChangeText, placeholder, multiline, icon }) => {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: 8,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          backgroundColor: theme.colors.inputBackground,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: theme.colors.border,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
        }}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={theme.colors.textSecondary}
            style={{ marginRight: 10, marginTop: multiline ? 2 : 0 }}
          />
        )}
        <TextInput
          value={value}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSecondary}
          onChangeText={onChangeText}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          style={{
            flex: 1,
            fontSize: 16,
            color: theme.colors.text,
            paddingVertical: multiline ? 0 : 14,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
      </View>
    </View>
  );
};

export const IntroScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const start = useBizOnboarding((s) => s.start);
  const loading = useBizOnboarding((s) => s.loading);
  const setNextConsumerRoute = useSessionRole((s) => s.setNextConsumerRoute);

  const handleStart = async () => {
    const defaults = {
      displayName: user?.displayName || user?.username || '',
      contactEmail: user?.email || '',
    };
    await start(user?.uid, defaults);
    navigation.navigate('Basics');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        <TouchableOpacity
          onPress={() =>
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            }) || setNextConsumerRoute('Profile')
          }
          style={{ marginBottom: 12, alignSelf: 'flex-start' }}
        >
          <Text style={{ color: '#2F80ED', fontWeight: '600' }}>Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>
          Create a business profile
        </Text>
        <Text style={{ fontSize: 15, color: '#555', lineHeight: 22 }}>
          Share a public profile for your brand, add contact links, and get
          discovered. We’ll use your existing account—no extra login needed.
        </Text>
        <View style={{ marginTop: 24, gap: 10 }}>
          <Bullet text='Use your current account to create a business profile.' />
          <Bullet text='Add a name, category, and a way for people to contact you.' />
          <Bullet text='Go live in one step—edit anytime.' />
        </View>
        <TouchableOpacity
          onPress={handleStart}
          style={{
            marginTop: 32,
            backgroundColor: '#2F80ED',
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
          }}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color='#FFF' />
          ) : (
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>
              Continue as {user?.username ? `@${user.username}` : 'your account'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const Bullet = ({ text }) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
    <Text style={{ color: '#2F80ED', fontSize: 18 }}>•</Text>
    <Text style={{ flex: 1, color: '#333', lineHeight: 20 }}>{text}</Text>
  </View>
);

export const BasicsScreen = () => {
  const navigation = useNavigation();
  const form = useBizOnboarding((s) => s.form);
  const updateField = useBizOnboarding((s) => s.updateField);
  const error = useBizOnboarding((s) => s.error);
  const clearError = useBizOnboarding((s) => s.clearError);

  useEffect(() => {
    if (error) {
      Alert.alert('Save failed', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error, clearError]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>
          Basics
        </Text>
        <Input
          label='Business name'
          value={form.displayName}
          onChangeText={(v) => updateField('displayName', v)}
          placeholder='e.g. Sunrise Cafe'
        />
        <Input
          label='Category'
          value={form.category}
          onChangeText={(v) => updateField('category', v)}
          placeholder='Cafe, Venue, Fitness...'
        />
        <Input
          label='Bio'
          value={form.description}
          onChangeText={(v) => updateField('description', v)}
          placeholder='Short description'
          multiline
        />
        <Input
          label='Logo URL (optional)'
          value={form.logoUrl}
          onChangeText={(v) => updateField('logoUrl', v)}
          placeholder='https://...'
        />
        <NavButtons
          onNext={() => navigation.navigate('Contact')}
          primaryLabel='Next: Contact'
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export const ContactScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const form = useBizOnboarding((s) => s.form);
  const updateField = useBizOnboarding((s) => s.updateField);
  const submit = useBizOnboarding((s) => s.submit);
  const loading = useBizOnboarding((s) => s.loading);
  const error = useBizOnboarding((s) => s.error);
  const clearError = useBizOnboarding((s) => s.clearError);

  useEffect(() => {
    if (error) {
      Alert.alert('Submit failed', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error, clearError]);

  const handleSubmit = async () => {
    const bizId = await submit(user?.uid);
    if (bizId) {
      navigation.navigate('BusinessProfile', { bizId });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>
          Contact & links
        </Text>
        <Input
          label='Email'
          value={form.contactEmail}
          onChangeText={(v) => updateField('contactEmail', v)}
          placeholder='hello@business.com'
        />
        <Input
          label='Phone'
          value={form.phone}
          onChangeText={(v) => updateField('phone', v)}
          placeholder='+1 (555) 123-4567'
        />
        <Input
          label='Website'
          value={form.website}
          onChangeText={(v) => updateField('website', v)}
          placeholder='https://your-site.com'
        />
        <Input
          label='Instagram'
          value={form.instagram}
          onChangeText={(v) => updateField('instagram', v)}
          placeholder='@yourhandle'
        />
        <Input
          label='Facebook'
          value={form.facebook}
          onChangeText={(v) => updateField('facebook', v)}
          placeholder='facebook.com/yourpage'
        />
        <Input
          label='TikTok'
          value={form.tiktok}
          onChangeText={(v) => updateField('tiktok', v)}
          placeholder='@yourtiktok'
        />
        <NavButtons
          onBack={() => navigation.goBack()}
          onNext={handleSubmit}
          primaryLabel='Create business profile'
          loading={loading}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const NavButtons = ({ onBack, onNext, primaryLabel, loading }) => (
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 16,
      gap: 10,
    }}
  >
    {onBack && (
      <TouchableOpacity
        onPress={onBack}
        style={{
          padding: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: '#E0E0E0',
          flex: 1,
          alignItems: 'center',
        }}
        disabled={loading}
      >
        <Text style={{ fontWeight: '600', color: '#333' }}>Back</Text>
      </TouchableOpacity>
    )}
    <TouchableOpacity
      onPress={onNext}
      style={{
        padding: 14,
        borderRadius: 10,
        backgroundColor: '#2F80ED',
        flex: onBack ? 2 : 1,
        alignItems: 'center',
      }}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color='#FFF' />
      ) : (
        <Text style={{ fontWeight: '700', color: '#FFF' }}>
          {primaryLabel || 'Continue'}
        </Text>
      )}
    </TouchableOpacity>
  </View>
);
