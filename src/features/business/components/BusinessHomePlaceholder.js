import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSessionRole } from '../../profile/stores/sessionRoleStore';
import { useBizOnboarding } from '../stores/businessOnboardingStore';
import { useAuth } from '../../auth/context/AuthContext';
import { switchToPersonalAccount } from '../../../services/firebase/config';
import { useTheme } from '../../../theme';

export default function BusinessHomePlaceholder() {
  const navigation = useNavigation();
  const theme = useTheme();
  const setRole = useSessionRole((s) => s.setRole);
  const setNextConsumerRoute = useSessionRole((s) => s.setNextConsumerRoute);
  const bizId = useBizOnboarding((s) => s.bizId);
  const start = useBizOnboarding((s) => s.start);
  const { user } = useAuth();
  const scaleAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, []);

  const goToProfile = () => {
    try {
      navigation.navigate('BusinessProfile', { bizId: bizId || undefined });
    } catch {
      const parent = navigation?.getParent?.();
      parent?.navigate?.('BusinessProfile', { bizId: bizId || undefined });
    }
  };

  const goToBasics = async () => {
    if (bizId) {
      navigation.navigate('Basics');
      return;
    }
    await start(user?.uid);
    navigation.navigate('Basics');
  };

  const switchToPersonal = async () => {
    try {
      setRole('consumer');
      setNextConsumerRoute('Profile');
    } catch {}
    if (!user?.uid) return;
    try {
      await switchToPersonalAccount();
    } catch (err) {
      console.warn('[business] Failed to switch account type', err);
    }
  };

  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          { transform: [{ scale: scaleAnim }], opacity: scaleAnim },
        ]}
      >
        {/* Icon with gradient background */}
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={['#3B82F6', '#8B5CF6', '#EC4899']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <Ionicons name='briefcase-outline' size={48} color='#FFFFFF' />
          </LinearGradient>
        </View>

        {/* Title and subtitle */}
        <Text style={styles.title}>No business profile</Text>
        <Text style={styles.subtitle}>
          Finish setup to see your business profile here.
        </Text>

        {/* Primary action button */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={goToBasics}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#3B82F6', '#2563EB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientButton}
          >
            <Ionicons
              name='add-circle-outline'
              size={22}
              color='#FFFFFF'
              style={styles.buttonIcon}
            />
            <Text style={styles.primaryLabel}>
              {bizId ? 'Continue setup' : 'Create business profile'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Secondary actions */}
        {bizId && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={goToProfile}
            activeOpacity={0.7}
          >
            <Ionicons
              name='eye-outline'
              size={20}
              color={theme.colors.primary}
              style={styles.buttonIcon}
            />
            <Text style={styles.secondaryLabel}>Preview profile</Text>
          </TouchableOpacity>
        )}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Switch to personal link */}
        <TouchableOpacity
          style={styles.textButton}
          onPress={switchToPersonal}
          activeOpacity={0.6}
        >
          <Ionicons
            name='arrow-back-circle-outline'
            size={18}
            color={theme.colors.textSecondary}
            style={styles.buttonIcon}
          />
          <Text style={styles.textButtonLabel}>Switch to personal account</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    content: {
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
    },
    iconContainer: {
      marginBottom: 24,
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 8,
    },
    iconGradient: {
      width: 96,
      height: 96,
      borderRadius: 48,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 12,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 32,
      paddingHorizontal: 16,
    },
    primaryButton: {
      width: '100%',
      marginBottom: 12,
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
    primaryLabel: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 17,
    },
    secondaryButton: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.backgroundSecondary,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      marginBottom: 12,
    },
    secondaryLabel: {
      color: theme.colors.text,
      fontWeight: '600',
      fontSize: 16,
    },
    buttonIcon: {
      marginRight: 8,
    },
    divider: {
      width: '100%',
      height: 1,
      backgroundColor: theme.colors.divider,
      marginVertical: 24,
    },
    textButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },
    textButtonLabel: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      fontWeight: '500',
    },
  });
