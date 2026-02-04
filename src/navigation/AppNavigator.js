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
import ROUTES from './routes';

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
  BusinessEventForm,
  BusinessPerkForm,
  BusinessFab,
  BusinessUpgradeScreen,
} from '../features/business';
import BusinessBottomTabNavigator from './BusinessBottomTabNavigator';
import { useAuth } from '../features/auth/context/AuthContext';

// --- Auth Stack ---
const AuthStack = createNativeStackNavigator();
function AuthStackScreen() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name={ROUTES.AUTH} component={AuthScreen} />
    </AuthStack.Navigator>
  );
}

// --- Onboarding Stack ---
const OnboardingStack = createNativeStackNavigator();
function OnboardingStackScreen({ initialRouteName = ROUTES.NAME_DOB }) {
  // Description: Add Location screen and align route names with getNextOnboardingStep
  return (
    <OnboardingStack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={initialRouteName}
    >
      <OnboardingStack.Screen name={ROUTES.NAME_DOB} component={NameDobScreen} />
      <OnboardingStack.Screen name={ROUTES.SEX} component={SexScreen} />
      <OnboardingStack.Screen name={ROUTES.TOS} component={TOSAcceptanceScreen} />
      <OnboardingStack.Screen name={ROUTES.LOCATION} component={LocationScreen} />
      <OnboardingStack.Screen
        name={ROUTES.INTERESTS}
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
      <ProfileStack.Screen name={ROUTES.PROFILE} component={ProfileScreen} />
      <ProfileStack.Screen
        name={ROUTES.OTHER_USER_PROFILE}
        component={OtherUserProfileScreen}
      />
    </ProfileStack.Navigator>
  );
}

// --- Main Tabs ---
const Tab = createBottomTabNavigator();
function MainTabs({ initialRouteName = ROUTES.MAP, onConsumeConsumerRoute }) {
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
        name={ROUTES.MAP}
        getComponent={() => require('../features/events').MapScreen}
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
        name={ROUTES.DISCOVERY}
        getComponent={() => require('../features/events').DiscoveryScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name='list-outline' color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name={ROUTES.MY_CIRCLE}
        getComponent={() => require('../features/events').MyCircle}
        options={{
          title: 'My Circle',
          tabBarIcon: ({ color, size }) => (
            // Description: Lucide Radar icon for MyCircle tab
            <Radar color={color} size={size} accessibilityLabel='Radar Icon' />
          ),
        }}
      />
      <Tab.Screen
        name={ROUTES.PROFILE_STACK}
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
            navigation.navigate(ROUTES.PROFILE_STACK, { screen: ROUTES.PROFILE });
          },
        })}
      />
    </Tab.Navigator>
  );
}

// Business Bottom Tabs with FAB overlay
function BusinessTabsWithFab() {
  return (
    <View style={{ flex: 1 }}>
      <BusinessBottomTabNavigator />
      <BusinessFab />
    </View>
  );
}

// --- Root Stack (Wraps Tabs & Non-tab Screens) ---
const RootStack = createNativeStackNavigator();
function RootStackScreen() {
  const consumeNextConsumerRoute = useSessionRole(
    (s) => s.consumeNextConsumerRoute,
  );
  const peekNextConsumerRoute = useSessionRole((s) => s.peekNextConsumerRoute);
  const consumerRouteRaw = peekNextConsumerRoute?.() || null;
  const consumerRoute =
    consumerRouteRaw === 'Profile' ? ROUTES.PROFILE : consumerRouteRaw;
  const initialTab =
    consumerRoute === ROUTES.PROFILE ? ROUTES.PROFILE_STACK : consumerRoute || ROUTES.MAP;

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name={ROUTES.MAIN_TABS}>
        {(props) => (
          <MainTabs
            {...props}
            initialRouteName={initialTab}
            onConsumeConsumerRoute={consumeNextConsumerRoute}
          />
        )}
      </RootStack.Screen>
      <RootStack.Screen
        name={ROUTES.EVENT_CHAT}
        getComponent={() => EventChatScreen}
        options={{ headerShown: false, title: 'Event Chat' }}
      />
      <RootStack.Screen
        name={ROUTES.OTHER_USER_PROFILE}
        component={OtherUserProfileScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name={ROUTES.NOTIFICATIONS}
        component={NotificationScreen}
        options={{ headerShown: false, title: 'Notifications' }}
      />
      <RootStack.Screen
        name={ROUTES.INTEREST_POST}
        getComponent={() => InterestPostScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name={ROUTES.INTERESTS_MANAGE}
        component={InterestsScreen}
        options={{ headerShown: true, title: 'Manage Interests' }}
      />
      <RootStack.Screen
        name={ROUTES.CONFIRMATION}
        component={ConfirmationScreen}
        options={{ title: 'Confirmation' }}
      />
      <RootStack.Screen
        name={ROUTES.MANAGE_INTERESTS_SCREEN}
        component={ManageInterestsScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name={ROUTES.ACCOUNT_TYPE}
        component={AccountTypeScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name={ROUTES.PRIVACY_INFO}
        component={PrivacyInfoScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name={ROUTES.INFO_ARTICLE}
        component={InfoArticleScreen}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name={ROUTES.TOS_ACCEPTANCE}
        component={TOSAcceptanceScreen}
        options={{ headerShown: false }}
      />
    </RootStack.Navigator>
  );
}

// --- Business Root Stack (bottom tabs + onboarding + shared screens) ---
const BizRootStack = createNativeStackNavigator();
function BizRootStackScreen() {
  return (
    <BizRootStack.Navigator screenOptions={{ headerShown: false }}>
      <BizRootStack.Screen
        name={ROUTES.BUSINESS_TABS}
        component={BusinessTabsWithFab}
      />
      <BizRootStack.Screen
        name={ROUTES.BUSINESS_ONBOARDING}
        component={BusinessOnboardingStack}
      />
      <BizRootStack.Screen
        name={ROUTES.BUSINESS_EVENT_FORM}
        component={BusinessEventForm}
        options={{ presentation: 'modal' }}
      />
      <BizRootStack.Screen
        name={ROUTES.BUSINESS_PERK_FORM}
        component={BusinessPerkForm}
        options={{ presentation: 'modal' }}
      />
      <BizRootStack.Screen
        name={ROUTES.BUSINESS_SETTINGS}
        component={BusinessSettingsScreen}
        options={{ headerShown: true, title: 'Settings' }}
      />
      <BizRootStack.Screen
        name={ROUTES.BUSINESS_UPGRADE}
        component={BusinessUpgradeScreen}
        options={{ headerShown: true, title: 'Upgrade' }}
      />
      <BizRootStack.Screen name={ROUTES.PRIVACY_INFO} component={PrivacyInfoScreen} />
      <BizRootStack.Screen name={ROUTES.INFO_ARTICLE} component={InfoArticleScreen} />
      <BizRootStack.Screen
        name={ROUTES.TOS_ACCEPTANCE}
        component={TOSAcceptanceScreen}
      />
    </BizRootStack.Navigator>
  );
}

// --- AppNavigator ---

// Description: AppNavigator now checks user.businessId to switch between business and consumer modes
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
  const { user: authUser } = useAuth();

  // Hydration guard: Wait for user data to load before rendering navigator
  // This prevents navigation flicker when switching between business and consumer modes
  const isHydrating = !effectiveUser && authUser;

  if (isHydrating) {
    return null; // or a loading spinner if desired
  }

  if (!effectiveUser) {
    return <AuthStackScreen />;
  }

  if (!effectiveProfileComplete && sessionRole !== 'business') {
    return (
      <OnboardingStackScreen
        initialRouteName={initialOnboardingStep || ROUTES.NAME_DOB}
      />
    );
  }

  // Business mode check: user has a businessId OR sessionRole is explicitly set to 'business'
  const isBusinessMode =
    Boolean(effectiveUser.businessId) || sessionRole === 'business';

  // Use key prop to force remount when switching modes (prevents stale navigation state)
  return isBusinessMode ? (
    <BizRootStackScreen key='business' />
  ) : (
    <RootStackScreen key='consumer' />
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
