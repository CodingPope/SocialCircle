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
  TOSAcceptanceScreen,
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
  AccountTypeScreen,
  PrivacyInfoScreen,
  InfoArticleScreen,
  useUserStore,
  useSessionRole,
} from '../features/profile';
import {
  BusinessOnboardingStack,
  BusinessProfileScreen,
  BusinessSettingsScreen,
} from '../features/business';
import { useAuth } from '../features/auth/context/AuthContext';

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
      <OnboardingStack.Screen name='TOS' component={TOSAcceptanceScreen} />
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
function MainTabs({ initialRouteName = 'Map', onConsumeConsumerRoute }) {
  const hasUnreadNotifications = useNotificationStore((s) => s.hasUnread);
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);

  React.useEffect(() => {
    if (typeof onConsumeConsumerRoute === 'function') {
      onConsumeConsumerRoute();
    }
  }, [onConsumeConsumerRoute]);

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
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

// Business Stack (profile + settings via hamburger)
const BizStack = createNativeStackNavigator();
function BusinessTabs() {
  return (
    <BizStack.Navigator screenOptions={{ headerShown: false }}>
      <BizStack.Screen name='BizProfile' component={BusinessProfileScreen} />
      <BizStack.Screen name='BizSettings' component={BusinessSettingsScreen} />
    </BizStack.Navigator>
  );
}

// --- Root Stack (Wraps Tabs & Non-tab Screens) ---
const RootStack = createNativeStackNavigator();
function RootStackScreen() {
  const consumeNextConsumerRoute = useSessionRole(
    (s) => s.consumeNextConsumerRoute
  );
  const peekNextConsumerRoute = useSessionRole((s) => s.peekNextConsumerRoute);
  const consumerRoute = peekNextConsumerRoute?.() || null;
  const initialTab =
    consumerRoute === 'Profile' ? 'ProfileStack' : consumerRoute || 'Map';

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name='MainTabs'>
        {(props) => (
          <MainTabs
            {...props}
            initialRouteName={initialTab}
            onConsumeConsumerRoute={consumeNextConsumerRoute}
          />
        )}
      </RootStack.Screen>
      {/* Business routes */}
      <RootStack.Screen
        name='BusinessOnboarding'
        component={BusinessOnboardingStack}
      />
      <RootStack.Screen
        name='BusinessTabs'
        component={BusinessTabs}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name='BusinessProfile'
        component={BusinessProfileScreen}
        options={{ headerShown: true, title: 'Business profile' }}
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
        name='AccountType'
        component={AccountTypeScreen}
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
      <RootStack.Screen
        name='TOSAcceptance'
        component={TOSAcceptanceScreen}
        options={{ headerShown: false }}
      />
    </RootStack.Navigator>
  );
}

// --- Business Root Stack (profile stack + onboarding) ---
const BizRootStack = createNativeStackNavigator();
function BizRootStackScreen() {
  return (
    <BizRootStack.Navigator screenOptions={{ headerShown: false }}>
      <BizRootStack.Screen name='BusinessTabs' component={BusinessTabs} />
      <BizRootStack.Screen
        name='BusinessOnboarding'
        component={BusinessOnboardingStack}
      />
      <BizRootStack.Screen name='PrivacyInfo' component={PrivacyInfoScreen} />
      <BizRootStack.Screen name='InfoArticle' component={InfoArticleScreen} />
      <BizRootStack.Screen
        name='TOSAcceptance'
        component={TOSAcceptanceScreen}
      />
    </BizRootStack.Navigator>
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
  const setNextConsumerRoute = useSessionRole((s) => s.setNextConsumerRoute);
  const { user: authUser } = useAuth();
  const normalizedUserType = String(authUser?.type || user?.type || '')
    .toLowerCase()
    .trim();
  const roleFromUserDoc =
    normalizedUserType === 'business' ? 'business' : 'consumer';
  const effectiveRole = sessionRole || roleFromUserDoc || 'consumer';
  const effectiveBiz = effectiveRole === 'business';

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
  return effectiveBiz ? <BizRootStackScreen /> : <RootStackScreen />;
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
