// Description: Firebase Auth error handler with user-friendly messages
// Maps Firebase Auth error codes to actionable, friendly messages

/**
 * Gets a user-friendly error message for Firebase Auth errors
 * @param {Error} error - The Firebase Auth error object
 * @param {string} operation - The operation being performed ('login', 'signup', 'reset')
 * @returns {Object} - { title: string, message: string }
 */
export function getAuthErrorMessage(error, operation = 'login') {
  const errorCode = error?.code || '';
  const isLogin = operation === 'login';
  const isSignup = operation === 'signup';
  const isReset = operation === 'reset';

  // Description: Map Firebase Auth error codes to user-friendly messages
  switch (errorCode) {
    // Invalid credentials
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return {
        title: 'Login Failed',
        message:
          'The email or password you entered is incorrect. Please try again.',
      };

    // Email issues
    case 'auth/invalid-email':
      return {
        title: 'Invalid Email',
        message: 'Please enter a valid email address.',
      };

    case 'auth/email-already-in-use':
      return {
        title: 'Account Exists',
        message:
          'An account with this email already exists. Please log in instead.',
      };

    // Password issues
    case 'auth/weak-password':
      return {
        title: 'Weak Password',
        message: 'Your password must be at least 6 characters long.',
      };

    // Account issues
    case 'auth/user-disabled':
      return {
        title: 'Account Disabled',
        message:
          'This account has been disabled. Please contact support for assistance.',
      };

    case 'auth/account-exists-with-different-credential':
      return {
        title: 'Account Conflict',
        message:
          'An account already exists with this email using a different sign-in method. Try signing in with Google or Apple.',
      };

    // Network issues
    case 'auth/network-request-failed':
      return {
        title: 'Connection Error',
        message:
          'Unable to connect to the server. Please check your internet connection and try again.',
      };

    // Too many attempts
    case 'auth/too-many-requests':
      return {
        title: 'Too Many Attempts',
        message:
          'Too many failed login attempts. Please wait a few minutes and try again, or reset your password.',
      };

    // Expired credentials
    case 'auth/expired-action-code':
      return {
        title: 'Link Expired',
        message:
          'This verification link has expired. Please request a new one.',
      };

    case 'auth/invalid-action-code':
      return {
        title: 'Invalid Link',
        message: 'This verification link is invalid or has already been used.',
      };

    // Popup/redirect issues (for social auth)
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return {
        title: 'Sign-In Cancelled',
        message: 'The sign-in process was cancelled. Please try again.',
      };

    case 'auth/popup-blocked':
      return {
        title: 'Popup Blocked',
        message: 'Please allow popups for this site and try again.',
      };

    // Internal/configuration errors
    case 'auth/internal-error':
      return {
        title: 'Service Error',
        message:
          'Something went wrong on our end. Please try again in a moment.',
      };

    case 'auth/configuration-not-found':
    case 'auth/invalid-api-key':
      return {
        title: 'Configuration Error',
        message:
          'There is a problem with the app configuration. Please contact support.',
      };

    // Missing required information
    case 'auth/missing-email':
      return {
        title: 'Email Required',
        message: 'Please enter your email address.',
      };

    case 'auth/missing-password':
      return {
        title: 'Password Required',
        message: 'Please enter your password.',
      };

    // Operation not allowed
    case 'auth/operation-not-allowed':
      return {
        title: 'Sign-In Method Disabled',
        message:
          'This sign-in method is not currently available. Please try another method.',
      };

    // Credential issues (for linking/reauthentication)
    case 'auth/invalid-credential':
      if (isLogin) {
        return {
          title: 'Login Failed',
          message:
            'The email or password you entered is incorrect. Please try again.',
        };
      }
      return {
        title: 'Invalid Credentials',
        message: 'The credentials provided are invalid. Please try again.',
      };

    case 'auth/credential-already-in-use':
      return {
        title: 'Credential In Use',
        message:
          'This credential is already associated with a different account.',
      };

    case 'auth/requires-recent-login':
      return {
        title: 'Session Expired',
        message:
          'For security reasons, please log out and log back in to continue.',
      };

    // Apple Sign In specific errors
    case 'auth/invalid-verification-code':
    case 'auth/invalid-verification-id':
      return {
        title: 'Apple Sign-In Failed',
        message: 'Unable to verify your Apple ID. Please try signing in again.',
      };

    case 'auth/missing-verification-code':
    case 'auth/missing-verification-id':
      return {
        title: 'Apple Sign-In Failed',
        message: 'Apple sign-in information is incomplete. Please try again.',
      };

    // Default fallback
    default:
      // Log unknown errors for debugging
      if (__DEV__) {
        console.warn(
          '[Auth Error Handler] Unknown error code:',
          errorCode,
          error
        );
      }

      return {
        title: isLogin ? 'Login Failed' : isSignup ? 'Sign Up Failed' : 'Error',
        message: 'Something went wrong. Please try again.',
      };
  }
}

/**
 * Validates email format
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  // More robust email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validates password strength
 * @param {string} password
 * @returns {Object} - { isValid: boolean, message: string }
 */
export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { isValid: false, message: 'Password is required' };
  }

  if (password.length < 6) {
    return {
      isValid: false,
      message: 'Password must be at least 6 characters',
    };
  }

  // Add more validation rules if needed (uppercase, numbers, special chars, etc.)
  // For now, Firebase requires minimum 6 characters

  return { isValid: true, message: '' };
}

/**
 * Logs auth errors in development with detailed information
 * @param {Error} error
 * @param {string} operation
 * @param {Object} context - Additional context like email (without password!)
 */
export function logAuthError(error, operation, context = {}) {
  if (!__DEV__) return; // Only log in development

  const errorCode = error?.code || '';

  // Description: Determine if this is an expected user error vs system error
  const expectedUserErrors = [
    'auth/invalid-credential',
    'auth/wrong-password',
    'auth/user-not-found',
    'auth/invalid-email',
    'auth/weak-password',
    'auth/email-already-in-use',
    'auth/too-many-requests',
  ];

  const isExpectedError = expectedUserErrors.includes(errorCode);
  const friendlyMessage = getAuthErrorMessage(error, operation);

  // Description: Use warn for expected errors (user typos), error for unexpected ones (system issues)
  if (isExpectedError) {
    console.group(`⚠️ [Auth] ${operation} - Expected user error`);
    console.warn(`Code: ${errorCode}`);
    console.warn(
      `User will see: "${friendlyMessage.title} - ${friendlyMessage.message}"`
    );
    console.groupEnd();
  } else {
    console.group(`❌ [Auth] ${operation} - Unexpected error`);
    console.error('Code:', error?.code);
    console.error('Message:', error?.message);
    if (error?.nativeErrorMessage) {
      console.error('Native:', error.nativeErrorMessage);
    }
    console.error(
      `User will see: "${friendlyMessage.title} - ${friendlyMessage.message}"`
    );
    console.groupEnd();
  }
}
