import { registerRootComponent } from 'expo';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import App from './App';

const Root = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <App />
  </GestureHandlerRootView>
);

registerRootComponent(Root);
