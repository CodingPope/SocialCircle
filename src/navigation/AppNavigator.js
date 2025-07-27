// src/navigation/AppNavigator.js

import React from 'react';
import { ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import { Radar } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import EventDetails from '../components/EventDetails';
import ConfirmationScreen from '../screens/ConfirmationScreen';

// Auth Screens
import AuthScreen from '../screens/Auth/AuthScreen';
import NameDobScreen from '../screens/Auth/Onboarding/NameDobScreen';
import SexScreen from '../screens/Auth/Onboarding/SexScreen';
import InterestsScreen from '../screens/Auth/Onboarding/InterestsScreen';
import LocationScreen from '../screens/Auth/Onboarding/LocationScreen';

// Main Screens
import MapScreen from '../screens/Main/MapScreen';
import DiscoveryScreen from '../screens/Main/DiscoveryScreen';
import MyCircle from '../screens/Main/MyCircle';
import ProfileScreen from '../screens/Main/ProfileScreen';
import OtherUserProfileScreen from '../screens/Main/OtherUserProfileScreen';
import EventChatScreen from '../screens/Chat/EventChatScreen';
import NotificationScreen from '../screens/Notification/NotificationScreen';

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
function OnboardingStackScreen() {
  return (
    <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
      <OnboardingStack.Screen name='NameDob' component={NameDobScreen} />
      <OnboardingStack.Screen name='Sex' component={SexScreen} />
      <OnboardingStack.Screen name='Interests' component={InterestsScreen} />
      <OnboardingStack.Screen name='Location' component={LocationScreen} />
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
    <Tab.Navigator screenOptions={{ headerShown: false }}>
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
          tabBarIcon: ({ color, size }) => <Radar color={color} size={size} />,
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

// --- Root Stack (Wraps Tabs & Non-tab Screens) ---
const RootStack = createNativeStackNavigator();
function RootStackScreen() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name='MainTabs' component={MainTabs} />
      <RootStack.Screen
        name='EventChat'
        component={EventChatScreen}
        options={{ headerShown: false, title: 'Event Chat' }}
      />
      <RootStack.Screen
        name='OtherUserProfile'
        component={OtherUserProfileScreen}
        options={{ headerShown: false, title: 'Profile' }}
      />
      <RootStack.Screen
        name='Notifications'
        component={NotificationScreen}
        options={{ headerShown: false, title: 'Notifications' }}
      />
      <RootStack.Screen
        name='EventDetails'
        component={EventDetails}
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
    </RootStack.Navigator>
  );
}

// --- App Navigator ---
export default function AppNavigator({ user, profileComplete }) {
  const { loading } = useAuth();

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  return !user ? (
    <AuthStackScreen />
  ) : !profileComplete ? (
    <OnboardingStackScreen />
  ) : (
    <RootStackScreen />
  );
}
