import React from 'react';
import AnalyticsProvider from './AnalyticsProvider';
import NotificationProvider from './NotificationProvider';
import DeepLinkProvider from './DeepLinkProvider';

export default function AppProviders({ user, sessionRole, setUser, children }) {
  return (
    <AnalyticsProvider user={user} sessionRole={sessionRole} setUser={setUser}>
      <NotificationProvider user={user}>
        <DeepLinkProvider>{children}</DeepLinkProvider>
      </NotificationProvider>
    </AnalyticsProvider>
  );
}
