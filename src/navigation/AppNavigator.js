// src/navigation/AppNavigator.js

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import { Radar } from 'lucide-react-native';
import { useTheme } from '../theme';
import { useThemeStore } from '../store/themeStore';

// Import screens
import {
  AuthScreen,
  NameDobScreen,
  SexScreen,
  InterestsScreen,
  LocationScreen,
} from '../features/auth';
import {
  ProfileScreen,
  OtherUserProfileScreen,
  MapScreen,
  DiscoveryScreen,
  MyCircle,
  ConfirmationScreen,
} from '../features/events';
import { EventChatScreen } from '../features/chat';
import { InterestPostScreen } from '../features/interestPosts';
import {
  NotificationScreen,
  useNotificationStore,
} from '../features/notifications';
import {
  ManageInterestsScreen,
  PrivacyInfoScreen,
  InfoArticleScreen,
  useUserStore,
  useSessionRole,
} from '../features/profile';
import {
  BusinessHomePlaceholder,
  BusinessOnboardingStack,
  BusinessCircleScreen,
  BusinessDiscoverScreen,
  BusinessMapScreen,
  BusinessProfileScreen,
  Step0ChooseType,
  Step1Basics,
  Step2Brand,
  Step3Location,
  Step4Audience,
  Step5Verify,
  Step6Team,
  Step7Privacy,
  Step8Review,
} from '../features/business';

// --- Auth Stack ---
const AuthStack = createNativeStackNavigator();
function AuthStackScreen() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name='Auth' component={AuthScreen} />
    </AuthStack.Navigator>
  );
}

// --- Onboarding Stack ---
const OnboardingStack = createNativeStackNavigator();
function OnboardingStackScreen({ initialRouteName = 'NameDob' }) {
  // Description: Add Location screen and align route names with getNextOnboardingStep
  return (
    <OnboardingStack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={initialRouteName}
    >
      <OnboardingStack.Screen name='NameDob' component={NameDobScreen} />
      <OnboardingStack.Screen name='Sex' component={SexScreen} />
      <OnboardingStack.Screen name='Location' component={LocationScreen} />
      <OnboardingStack.Screen
        name='InterestsScreen'
        component={InterestsScreen}
      />
    </OnboardingStack.Navigator>
  );
}

// --- Profile Stack (inside Tabs) ---
const ProfileStack = createNativeStackNavigator();
function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name='Profile' component={ProfileScreen} />
      <ProfileStack.Screen
        name='OtherUserProfile'
        component={OtherUserProfileScreen}
      />
    </ProfileStack.Navigator>
  );
}

// --- Main Tabs ---
const Tab = createBottomTabNavigator();
function MainTabs() {
  const hasUnreadNotifications = useNotificationStore((s) => s.hasUnread);
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);

  return (
    <Tab.Navigator
      initialRouteName='Map'
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
      }}
    >
      <Tab.Screen
        name='Map'
        component={MapScreen}
        options={{
          tabBarIcon: ({ focused, color, size }) => (
            <Icon
              name={focused ? 'map' : 'map-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tab.Screen
        name='Discovery'
        component={DiscoveryScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name='list-outline' color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name='MyCircle'
        component={MyCircle}
        options={{
          title: 'My Circle',
          tabBarIcon: ({ color, size }) => (
            // Description: Lucide Radar icon for MyCircle tab
            <Radar color={color} size={size} accessibilityLabel='Radar Icon' />
          ),
        }}
      />
      <Tab.Screen
        name='ProfileStack'
        component={ProfileStackScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color, size }) => (
            <View style={styles.iconWrapper}>
              <Icon
                name={focused ? 'person' : 'person-outline'}
                color={color}
                size={size}
              />
              {hasUnreadNotifications && (
                <View style={styles.notificationDot} />
              )}
            </View>
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('ProfileStack', { screen: 'Profile' });
          },
        })}
      />
    </Tab.Navigator>
  );
}

// Business Tabs (separate root)
const BizTab = createBottomTabNavigator();
function BusinessTabs() {
  const theme = useTheme();

  return (
    <BizTab.Navigator
      initialRouteName='BizMap'
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
      }}
    >
      <BizTab.Screen
        name='BizMap'
        component={BusinessMapScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name='map-outline' color={color} size={size} />
          ),
          title: 'Map',
        }}
      />
      <BizTab.Screen
        name='BizDiscover'
        component={BusinessDiscoverScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name='search-outline' color={color} size={size} />
          ),
          title: 'Discover',
        }}
      />
      <BizTab.Screen
        name='BizCircle'
        component={BusinessCircleScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Radar color={color} size={size} />,
          title: 'My Circle',
        }}
      />
      <BizTab.Screen
        name='BizProfile'
        component={BusinessProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name='briefcase-outline' color={color} size={size} />
          ),
          title: 'Profile',
        }}
      />
    </BizTab.Navigator>
  );
}

const BusinessRoot = createNativeStackNavigator();
function BusinessRootScreen() {
  // Peek so we don't clear before navigator mounts
  const peek = useSessionRole((s) => s.peekNextBusinessRoute);
  const consume = useSessionRole((s) => s.consumeNextBusinessRoute);
  const next = peek();
  const initial =
    next === 'BusinessOnboarding' ? 'BusinessOnboarding' : 'BusinessTabs';
  return (
    <BusinessRoot.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={initial}
    >
      <BusinessRoot.Screen name='BusinessTabs' component={BusinessTabs} />
      <BusinessRoot.Screen
        name='BusinessOnboarding'
        component={BusinessOnboardingStack}
        listeners={{
          focus: () => {
            // Once focused first time, consume flag
            try {
              consume();
            } catch {}
          },
        }}
      />
      <BusinessRoot.Screen
        name='BusinessHome'
        component={BusinessHomePlaceholder}
      />
    </BusinessRoot.Navigator>
  );
}

// --- Root Stack (Wraps Tabs & Non-tab Screens) ---
const RootStack = createNativeStackNavigator();
function RootStackScreen() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name='MainTabs' component={MainTabs} />
      {/* Business routes */}
      <RootStack.Screen
        name='BusinessOnboarding'
        component={BusinessOnboardingStack}
      />
      <RootStack.Screen
        name='BusinessHome'
        component={BusinessHomePlaceholder}
      />
      <RootStack.Screen
        name='EventChat'
        component={EventChatScreen}
        options={{ headerShown: false, title: 'Event Chat' }}
      />
      <RootStack.Screen
        name='Notifications'
        component={NotificationScreen}
        options={{ headerShown: false, title: 'Notifications' }}
      />
      <RootStack.Screen
        name='InterestPost'
        component={InterestPostScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name='Interests'
        component={InterestsScreen}
        options={{ headerShown: true, title: 'Manage Interests' }}
      />
      <RootStack.Screen
        name='ConfirmationScreen'
        component={ConfirmationScreen}
        options={{ title: 'Confirmation' }}
      />
      <RootStack.Screen
        name='ManageInterestsScreen'
        component={ManageInterestsScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name='PrivacyInfo'
        component={PrivacyInfoScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name='InfoArticle'
        component={InfoArticleScreen}
        options={{ headerShown: false }}
      />
    </RootStack.Navigator>
  );
}

// --- AppNavigator ---

// Description: AppNavigator now accepts props from App.js to decide which stack to show
function AppNavigator({ user, profileComplete, initialOnboardingStep }) {
  // Fallback to Zustand store if props are not provided (backward compat)
  const storeUser = useUserStore((state) => state.user);
  const storeProfileComplete = useUserStore((state) => state.profileComplete);

  const effectiveUser = typeof user !== 'undefined' ? user : storeUser;
  const effectiveProfileComplete =
    typeof profileComplete !== 'undefined'
      ? profileComplete
      : storeProfileComplete;

  const sessionRole = useSessionRole((s) => s.role);

  if (!effectiveUser) {
    return <AuthStackScreen />;
  }
  if (!effectiveProfileComplete && sessionRole !== 'business') {
    return (
      <OnboardingStackScreen
        initialRouteName={initialOnboardingStep || 'NameDob'}
      />
    );
  }
  // Choose root by session role
  return sessionRole === 'business' ? (
    <BusinessRootScreen />
  ) : (
    <RootStackScreen />
  );
}

export default AppNavigator;

const styles = StyleSheet.create({
  iconWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: '#fff',
  },
});
