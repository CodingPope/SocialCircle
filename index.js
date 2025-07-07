import { registerRootComponent } from 'expo';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import App from './App';
import { AuthProvider } from './src/context/AuthContext';

const Root = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <AuthProvider>
      <App />
    </AuthProvider>
  </GestureHandlerRootView>
);

registerRootComponent(Root);
