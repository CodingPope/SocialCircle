// Description: App Check initialization extracted for clarity
export default function initAppCheck({
  appCheck,
  logger,
  Alert,
  APP_CHECK_DISABLED,
  isDevBuild,
  USE_FIREBASE_EMULATORS,
  FORCE_FIREBASE_APPCHECK_DEBUG,
}) {
  let lastAlertedAppCheckToken = null;

  const logAppCheckDebugToken = (source, token) => {
    if (!token) {
      logger?.warn?.(`[Firebase App Check] ${source} returned an empty token`);
      return;
    }
    const lines = [
      '🔑 ═══════════════════════════════════════════════════════════',
      `🔑 APP CHECK DEBUG TOKEN (${source})`,
      `🔑 ${token}`,
      '🔑 ═══════════════════════════════════════════════════════════',
      '🔑 Register this token at:',
      '🔑 https://console.firebase.google.com/project/social-scene1/appcheck/apps',
      '🔑 ═══════════════════════════════════════════════════════════',
    ];
    lines.forEach((line) => console.log(line));
    logger?.info?.(`[Firebase App Check] Debug token (${source}): ${token}`);

    try {
      if (lastAlertedAppCheckToken !== token && Alert?.alert) {
        lastAlertedAppCheckToken = token;
        Alert.alert('Firebase App Check Debug Token', `(${source})\n${token}`, [
          { text: 'Close', style: 'cancel' },
        ]);
      }
    } catch (alertError) {
      console.log(
        '[Firebase App Check] Unable to show token alert:',
        alertError?.message || alertError,
      );
    }
  };

  const shouldUseDebugAppCheck =
    isDevBuild ||
    FORCE_FIREBASE_APPCHECK_DEBUG === '1' ||
    USE_FIREBASE_EMULATORS === '1';

  const scheduleDebugTokenRequest = (reason, delayMs = 0) => {
    setTimeout(() => {
      try {
        console.log(
          `🔐 [Firebase App Check] Requesting debug token (${reason})...`,
        );
        const request = appCheck().getToken(true);
        if (!request?.then) {
          console.log(
            '🔑 [Firebase App Check] getToken returned non-promise value:',
            request,
          );
          logAppCheckDebugToken(`getToken(${reason})`, request?.token || request);
          return;
        }
        request
          .then((result) => {
            console.log(
              `🔐 [Firebase App Check] getToken resolved (${reason}):`,
              result,
            );
            logAppCheckDebugToken(`getToken(${reason})`, result?.token);
          })
          .catch((err) => {
            console.log(`🔑 Error getting App Check token (${reason}):`, err);
          });
      } catch (err) {
        console.log(`🔑 Exception requesting App Check token (${reason}):`, err);
      }
    }, delayMs);
  };

  if (APP_CHECK_DISABLED) {
    logger?.info?.(
      '[Firebase App Check] Disabled via DISABLE_FIREBASE_APPCHECK=1 (skipping initialization)',
    );
    return;
  }

  if (shouldUseDebugAppCheck) {
    try {
      const debugModeSource = isDevBuild ? 'dev build' : 'forced override';
      console.log(
        `🔐 [Firebase App Check] Debug provider enabled (${debugModeSource})`,
      );
      const rnfbProvider = appCheck().newReactNativeFirebaseAppCheckProvider();
      rnfbProvider.configure({
        android: {
          provider: 'debug',
          debugToken:
            process.env.FIREBASE_APPCHECK_DEBUG_TOKEN_ANDROID || 'auto',
        },
        apple: {
          provider: 'debug',
          debugToken: process.env.FIREBASE_APPCHECK_DEBUG_TOKEN_IOS || 'auto',
        },
      });
      appCheck().initializeAppCheck({
        provider: rnfbProvider,
        isTokenAutoRefreshEnabled: true,
      });
      logger?.info?.(
        '🔐 [Firebase App Check] Initialized with debug provider (DEV)',
      );

      scheduleDebugTokenRequest('initial');
      scheduleDebugTokenRequest('retry-2s', 2000);
      scheduleDebugTokenRequest('retry-10s', 10000);
      appCheck().onTokenChanged((tokenResult) => {
        console.log(
          '🔐 [Firebase App Check] onTokenChanged fired:',
          tokenResult,
        );
        if (tokenResult?.token) {
          logAppCheckDebugToken('onTokenChanged', tokenResult.token);
        }
      });
    } catch (error) {
      logger?.warn?.(
        '[Firebase App Check] Failed to initialize debug provider:',
        error,
      );
    }
    return;
  }

  // Production providers
  try {
    console.log('🔐 [Firebase App Check] Using native providers (prod mode)');
    const rnfbProvider = appCheck().newReactNativeFirebaseAppCheckProvider();
    rnfbProvider.configure({
      android: { provider: 'playIntegrity' },
      apple: { provider: 'deviceCheck' },
    });
    appCheck().initializeAppCheck({
      provider: rnfbProvider,
      isTokenAutoRefreshEnabled: true,
    });
    logger?.info?.(
      '🔐 [Firebase App Check] Initialized with native providers (PROD)',
    );
  } catch (error) {
    logger?.error?.('[Firebase App Check] Failed to initialize in production:', error);
  }
}

