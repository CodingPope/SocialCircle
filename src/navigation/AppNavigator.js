// src/navigation/AppNavigator.js

import React, { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import { Radar } from 'lucide-react-native';

// Import screens
import AuthScreen from '../features/auth/screens/AuthScreen';
import NameDobScreen from '../features/auth/screens/Onboarding/NameDobScreen';
import SexScreen from '../features/auth/screens/Onboarding/SexScreen';
import InterestsScreen from '../features/auth/screens/Onboarding/InterestsScreen';
import ProfileScreen from '../features/events/ProfileScreen';
import OtherUserProfileScreen from '../features/events/OtherUserProfileScreen';
import MapScreen from '../features/events/MapScreen';
import DiscoveryScreen from '../features/events/DiscoveryScreen';
import MyCircle from '../features/events/MyCircle';
import EventChatScreen from '../features/chat/EventChatScreen';
import InterestPostScreen from '../features/interestPosts/InterestPostScreen';
import NotificationScreen from '../features/notifications/NotificationScreen';
import ConfirmationScreen from '../features/events/ConfirmationScreen';
import ManageInterestsScreen from '../features/profile/ManageInterestsScreen';
import PrivacyInfoScreen from '../features/profile/PrivacyInfoScreen';
import InfoArticleScreen from '../features/profile/InfoArticleScreen';
import {
  Step0ChooseType,
  Step1Basics,
  Step2Brand,
  Step3Location,
  Step4Audience,
  Step5Verify,
  Step6Team,
  Step7Privacy,
  Step8Review,
} from '../features/business/onboarding/screens';

// Add imports for business onboarding container and home placeholder
import BusinessOnboardingStack from '../features/business/onboarding/BusinessOnboardingStack';
import BusinessHomePlaceholder from '../features/business/BusinessHomePlaceholder';

// Zustand store
import { useUserStore } from '../features/profile/userStore';
import { useSessionRole } from '../features/profile/sessionRoleStore';

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
  const Location =
    require('../features/auth/screens/Onboarding/LocationScreen').default;
  return (
    <OnboardingStack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={initialRouteName}
    >
      <OnboardingStack.Screen name='NameDob' component={NameDobScreen} />
      <OnboardingStack.Screen name='Sex' component={SexScreen} />
      <OnboardingStack.Screen name='Location' component={Location} />
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
  return (
    <Tab.Navigator
      initialRouteName='Map'
      screenOptions={{ headerShown: false }}
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
            <Icon
              name={focused ? 'person' : 'person-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Business Tabs (separate root)
const BizTab = createBottomTabNavigator();
function BusinessTabs() {
  return (
    <BizTab.Navigator
      initialRouteName='BizMap'
      screenOptions={{ headerShown: false }}
    >
      <BizTab.Screen
        name='BizMap'
        component={
          require('../features/business/screens/BusinessMapScreen').default
        }
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name='map-outline' color={color} size={size} />
          ),
          title: 'Map',
        }}
      />
      <BizTab.Screen
        name='BizDiscover'
        component={
          require('../features/business/screens/BusinessDiscoverScreen').default
        }
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name='search-outline' color={color} size={size} />
          ),
          title: 'Discover',
        }}
      />
      <BizTab.Screen
        name='BizCircle'
        component={
          require('../features/business/screens/BusinessCircleScreen').default
        }
        options={{
          tabBarIcon: ({ color, size }) => <Radar color={color} size={size} />,
          title: 'My Circle',
        }}
      />
      <BizTab.Screen
        name='BizProfile'
        component={
          require('../features/business/screens/BusinessProfileScreen').default
        }
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
