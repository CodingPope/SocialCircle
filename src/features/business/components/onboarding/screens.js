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
import { useTheme } from '../../../../theme';

const Input = ({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  icon,
}) => {
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
  const theme = useTheme();
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

  const styles = createIntroStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() =>
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            }) || setNextConsumerRoute('Profile')
          }
          style={styles.backButton}
          activeOpacity={0.6}
        >
          <Ionicons name='arrow-back' size={20} color={theme.colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.iconContainer}>
          <LinearGradient
            colors={['#3B82F6', '#8B5CF6', '#EC4899']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <Ionicons name='storefront' size={36} color='#FFFFFF' />
          </LinearGradient>
        </View>

        <Text style={styles.title}>Create a business profile</Text>
        <Text style={styles.description}>
          Share a public profile for your brand, add contact links, and get
          discovered. We'll use your existing account—no extra login needed.
        </Text>

        <View style={styles.featureList}>
          <FeatureBullet
            icon='checkmark-circle'
            text='Use your current account to create a business profile'
            theme={theme}
          />
          <FeatureBullet
            icon='business'
            text='Add a name, category, and a way for people to contact you'
            theme={theme}
          />
          <FeatureBullet
            icon='flash'
            text='Go live in one step—edit anytime'
            theme={theme}
          />
        </View>

        <TouchableOpacity
          onPress={handleStart}
          style={styles.ctaButton}
          disabled={loading}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#3B82F6', '#2563EB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientButton}
          >
            {loading ? (
              <ActivityIndicator color='#FFFFFF' />
            ) : (
              <>
                <Text style={styles.ctaText}>
                  Continue as{' '}
                  {user?.username ? `@${user.username}` : 'your account'}
                </Text>
                <Ionicons name='arrow-forward' size={20} color='#FFFFFF' />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const FeatureBullet = ({ icon, text, theme }) => (
  <View
    style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}
  >
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.chipBackground,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
      }}
    >
      <Ionicons name={icon} size={18} color={theme.colors.primary} />
    </View>
    <Text
      style={{
        flex: 1,
        fontSize: 15,
        color: theme.colors.text,
        lineHeight: 22,
      }}
    >
      {text}
    </Text>
  </View>
);

const createIntroStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      padding: 24,
      flexGrow: 1,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 24,
      alignSelf: 'flex-start',
    },
    backText: {
      color: theme.colors.primary,
      fontWeight: '600',
      fontSize: 16,
      marginLeft: 6,
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: 24,
    },
    iconGradient: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 12,
      textAlign: 'center',
    },
    description: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      lineHeight: 24,
      textAlign: 'center',
      marginBottom: 32,
    },
    featureList: {
      marginBottom: 32,
    },
    ctaButton: {
      borderRadius: 14,
      overflow: 'hidden',
      shadowColor: '#2563EB',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    gradientButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      paddingHorizontal: 24,
    },
    ctaText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 17,
      marginRight: 8,
    },
  });

export const BasicsScreen = () => {
  const navigation = useNavigation();
  const theme = useTheme();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: '700',
            marginBottom: 8,
            color: theme.colors.text,
          }}
        >
          Business basics
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: theme.colors.textSecondary,
            marginBottom: 24,
            lineHeight: 22,
          }}
        >
          Tell us about your business so people can find and connect with you.
        </Text>
        <Input
          label='Business name*'
          value={form.displayName}
          onChangeText={(v) => updateField('displayName', v)}
          placeholder='e.g. Sunrise Cafe'
          icon='business'
        />
        <Input
          label='Category*'
          value={form.category}
          onChangeText={(v) => updateField('category', v)}
          placeholder='Cafe, Venue, Fitness...'
          icon='pricetag'
        />
        <Input
          label='Bio'
          value={form.description}
          onChangeText={(v) => updateField('description', v)}
          placeholder='Short description of your business'
          multiline
          icon='document-text'
        />
        <Input
          label='Logo URL (optional)'
          value={form.logoUrl}
          onChangeText={(v) => updateField('logoUrl', v)}
          placeholder='https://...'
          icon='image'
        />
        <NavButtons
          onNext={() => navigation.navigate('Contact')}
          primaryLabel='Next: Contact'
          theme={theme}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export const ContactScreen = () => {
  const navigation = useNavigation();
  const theme = useTheme();
  const { user } = useAuth();
  const form = useBizOnboarding((s) => s.form);
  const updateField = useBizOnboarding((s) => s.updateField);
  const submit = useBizOnboarding((s) => s.submit);
  const loading = useBizOnboarding((s) => s.loading);
  const error = useBizOnboarding((s) => s.error);
  const clearError = useBizOnboarding((s) => s.clearError);

  useEffect(() => {
    if (error) {
      Alert.alert('Submit failed', error, [
        { text: 'OK', onPress: clearError },
      ]);
    }
  }, [error, clearError]);

  const handleSubmit = async () => {
    const bizId = await submit(user?.uid);
    if (bizId) {
      navigation.navigate('BusinessProfile', { bizId });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: '700',
            marginBottom: 8,
            color: theme.colors.text,
          }}
        >
          Contact & links
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: theme.colors.textSecondary,
            marginBottom: 24,
            lineHeight: 22,
          }}
        >
          Add ways for people to reach you and discover your online presence.
        </Text>
        <Input
          label='Email'
          value={form.contactEmail}
          onChangeText={(v) => updateField('contactEmail', v)}
          placeholder='hello@business.com'
          icon='mail'
        />
        <Input
          label='Phone'
          value={form.phone}
          onChangeText={(v) => updateField('phone', v)}
          placeholder='+1 (555) 123-4567'
          icon='call'
        />
        <Input
          label='Website'
          value={form.website}
          onChangeText={(v) => updateField('website', v)}
          placeholder='https://your-site.com'
          icon='globe'
        />
        <Input
          label='Instagram'
          value={form.instagram}
          onChangeText={(v) => updateField('instagram', v)}
          placeholder='@yourhandle'
          icon='logo-instagram'
        />
        <Input
          label='Facebook'
          value={form.facebook}
          onChangeText={(v) => updateField('facebook', v)}
          placeholder='facebook.com/yourpage'
          icon='logo-facebook'
        />
        <Input
          label='TikTok'
          value={form.tiktok}
          onChangeText={(v) => updateField('tiktok', v)}
          placeholder='@yourtiktok'
          icon='logo-tiktok'
        />
        <NavButtons
          onBack={() => navigation.goBack()}
          onNext={handleSubmit}
          primaryLabel='Create business profile'
          loading={loading}
          theme={theme}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const NavButtons = ({ onBack, onNext, primaryLabel, loading, theme }) => (
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 24,
      gap: 12,
    }}
  >
    {onBack && (
      <TouchableOpacity
        onPress={onBack}
        style={{
          flex: 1,
          paddingVertical: 14,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: theme.colors.border,
          alignItems: 'center',
          backgroundColor: theme.colors.backgroundSecondary,
        }}
        disabled={loading}
        activeOpacity={0.7}
      >
        <Text
          style={{ fontWeight: '600', color: theme.colors.text, fontSize: 16 }}
        >
          Back
        </Text>
      </TouchableOpacity>
    )}
    <TouchableOpacity
      onPress={onNext}
      style={{
        flex: onBack ? 2 : 1,
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
      }}
      disabled={loading}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={['#3B82F6', '#2563EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          paddingVertical: 14,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
        }}
      >
        {loading ? (
          <ActivityIndicator color='#FFFFFF' />
        ) : (
          <>
            <Text style={{ fontWeight: '700', color: '#FFFFFF', fontSize: 16 }}>
              {primaryLabel || 'Continue'}
            </Text>
            {!onBack && (
              <Ionicons
                name='arrow-forward'
                size={18}
                color='#FFFFFF'
                style={{ marginLeft: 6 }}
              />
            )}
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  </View>
);
