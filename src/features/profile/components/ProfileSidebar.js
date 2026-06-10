/**
 * ProfileSidebar - Settings/menu sidebar for ProfileScreen
 * Extracted from ProfileScreen to improve readability
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

// Description: Single option row in the sidebar
function SidebarOption({
  label,
  onPress,
  theme,
  icon = null,
  isDanger = false,
}) {
  return (
    <TouchableOpacity
      style={[
        styles.option,
        {
          backgroundColor: theme.colors.backgroundSecondary,
          borderBottomColor: theme.colors.border,
        },
        isDanger && {
          backgroundColor: theme.isDark ? 'rgba(239,68,68,0.15)' : '#fff0f0',
          borderColor: theme.isDark ? 'rgba(239,68,68,0.3)' : '#ffd6d6',
          borderWidth: 1,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.optionContent}>
        <Text
          style={[
            styles.optionText,
            { color: theme.colors.text },
            isDanger && {
              color: theme.isDark ? '#F87171' : '#d11a2a',
              fontWeight: '600',
            },
          ]}
        >
          {label}
        </Text>
        {icon}
      </View>
    </TouchableOpacity>
  );
}

// Description: Dark mode toggle row
function DarkModeToggle({ isDarkMode, onToggle, theme }) {
  return (
    <View
      style={[
        styles.optionWithSwitch,
        {
          backgroundColor: theme.colors.backgroundSecondary,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.optionText, { color: theme.colors.text }]}>
        Dark Mode
      </Text>
      <Switch
        value={isDarkMode}
        onValueChange={onToggle}
        trackColor={{ false: '#767577', true: '#34C759' }}
        thumbColor='#FFFFFF'
      />
    </View>
  );
}

export default function ProfileSidebar({
  visible,
  sidebarAnim,
  panHandlers,
  onClose,
  mode,
  theme,
  themeMode,
  toggleTheme,
  hasBusinessProfile,
  verified,
  onOptionSelect,
}) {
  if (!visible) return null;

  const isDarkMode = themeMode === 'dark';

  // Build option list based on mode
  const getOptions = () => {
    if (mode === 'business') {
      return ['Switch to personal', 'Logout', 'Privacy and Info'];
    }

    const options = ['Edit Profile', 'Manage Interests'];

    if (hasBusinessProfile) {
      options.push('Switch to Business');
    } else if (__DEV__) {
      options.push('Account Type');
    }

    options.push('Logout', 'Privacy and Info');
    return options;
  };

  const options = getOptions();

  return (
    <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
      <TouchableOpacity
        style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel='Close sidebar overlay'
      />
      <Animated.View
        style={[
          styles.sidebar,
          {
            transform: [{ translateX: sidebarAnim }],
            backgroundColor: theme.colors.card,
            shadowOpacity: theme.isDark ? 0.5 : 0.15,
          },
        ]}
        {...panHandlers}
      >
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          {/* Header */}
          <View
            style={[styles.header, { borderBottomColor: theme.colors.border }]}
          >
            <TouchableOpacity
              style={styles.backButton}
              onPress={onClose}
              accessibilityLabel='Close sidebar'
            >
              <Ionicons name='arrow-back' size={26} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              Settings
            </Text>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {/* Top Options */}
            <View style={styles.topSection}>
              {options.map((option) => (
                <SidebarOption
                  key={option}
                  label={option}
                  onPress={() => {
                    onClose();
                    setTimeout(() => onOptionSelect(option), 200);
                  }}
                  theme={theme}
                />
              ))}

              {/* Get Verified - only if not verified and not business */}
              {!verified && mode !== 'business' && (
                <SidebarOption
                  label='Get Verified'
                  onPress={() => {
                    onClose();
                    setTimeout(() => onOptionSelect('Get Verified'), 200);
                  }}
                  theme={theme}
                  icon={
                    <Ionicons
                      name='checkmark-circle'
                      size={18}
                      color={theme.colors.primary}
                      style={{ marginLeft: 8 }}
                    />
                  }
                />
              )}

              {/* Dark Mode Toggle */}
              <DarkModeToggle
                isDarkMode={isDarkMode}
                onToggle={toggleTheme}
                theme={theme}
              />
            </View>

            <View style={{ flex: 1 }} />

            {/* Bottom Delete Account */}
            {mode !== 'business' && (
              <View style={styles.bottomSection}>
                <SidebarOption
                  label='Delete Account'
                  onPress={() => {
                    onClose();
                    setTimeout(() => onOptionSelect('Delete Account'), 200);
                  }}
                  theme={theme}
                  isDanger
                />
              </View>
            )}
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '90%',
    maxWidth: 300,
    height: '100%',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowRadius: 20,
    elevation: 12,
    zIndex: 1000,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 12,
    zIndex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  topSection: {
    gap: 8,
  },
  bottomSection: {},
  option: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  optionWithSwitch: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
});
