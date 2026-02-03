// src/navigation/BusinessBottomTabNavigator.js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme';
import {
  BusinessOverviewScreen,
  BusinessInsightsScreen,
  BusinessProfileScreen,
} from '../features/business';

const Tab = createBottomTabNavigator();

// Description: Bottom tab navigator for business users with Overview, Insights, and Profile tabs
export default function BusinessBottomTabNavigator() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      initialRouteName='BusinessOverview'
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
        name='BusinessOverview'
        component={BusinessOverviewScreen}
        options={{
          title: 'Overview',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'analytics' : 'analytics-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tab.Screen
        name='BusinessInsights'
        component={BusinessInsightsScreen}
        options={{
          title: 'Insights',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tab.Screen
        name='BusinessProfile'
        component={BusinessProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'business' : 'business-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
