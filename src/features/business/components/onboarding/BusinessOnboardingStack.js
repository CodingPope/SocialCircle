import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IntroScreen, BasicsScreen, ContactScreen } from './screens';
import BusinessProfileScreen from '../screens/BusinessProfileScreen';
import BusinessHomePlaceholder from '../BusinessHomePlaceholder';
import { useBizOnboarding } from '../../stores/businessOnboardingStore';
import { useSessionRole } from '../../../profile/stores/sessionRoleStore';

const Stack = createNativeStackNavigator();

export default function BusinessOnboardingStack() {
  const bizId = useBizOnboarding((s) => s.bizId);
  const stage = useBizOnboarding((s) => s.stage);
  const role = useSessionRole((s) => s.role);
  const initialRoute =
    stage === 'done' || bizId || role === 'business' ? 'BusinessHome' : 'Intro';

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: true, headerBackTitle: 'Back' }}
      initialRouteName={initialRoute}
    >
      <Stack.Screen
        name='Intro'
        component={IntroScreen}
        options={{ title: 'Business onboarding' }}
      />
      <Stack.Screen
        name='Basics'
        component={BasicsScreen}
        options={{ title: 'Basics' }}
      />
      <Stack.Screen
        name='Contact'
        component={ContactScreen}
        options={{ title: 'Contact & links' }}
      />
      <Stack.Screen
        name='BusinessHome'
        component={BusinessHomePlaceholder}
        options={{ title: 'Business home' }}
      />
      <Stack.Screen
        name='BusinessProfile'
        component={BusinessProfileScreen}
        options={{ title: 'Business profile', headerShown: false }}
      />
    </Stack.Navigator>
  );
}
