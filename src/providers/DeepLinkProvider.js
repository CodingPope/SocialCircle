import React, { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { shouldEnableDeepLinking, handleIncomingLink } from '../services/deepLinkingService';

export default function DeepLinkProvider({ children }) {
  useEffect(() => {
    if (!shouldEnableDeepLinking()) return;

    const handleLink = (payload) => {
      const url = typeof payload === 'string' ? payload : payload?.url;
      if (url) handleIncomingLink(url);
    };

    let unsubscribeDynamic = null;
    let linkingSub = null;
    let mounted = true;

    (async () => {
      let dynamicLinksModule = null;
      try {
        dynamicLinksModule =
          require('@react-native-firebase/dynamic-links').default;
      } catch (err) {
        console.warn(
          '[deep-link] Dynamic Links module unavailable',
          err?.message || err,
        );
        return;
      }

      if (!mounted || typeof dynamicLinksModule !== 'function') return;

      const instance = dynamicLinksModule();
      try {
        const initial = await instance.getInitialLink();
        if (mounted && initial?.url) handleLink(initial.url);
      } catch {}

      unsubscribeDynamic = instance.onLink((link) => handleLink(link?.url));
      linkingSub = Linking.addEventListener('url', ({ url }) => handleLink(url));
    })();

    return () => {
      mounted = false;
      try {
        unsubscribeDynamic?.();
      } catch {}
      linkingSub?.remove?.();
    };
  }, []);

  return children;
}
