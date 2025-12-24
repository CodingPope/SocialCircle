// Description: Environment-aware logger that strips logs in production builds
import { __DEV__ } from 'react-native';

const IS_DEV = __DEV__;

/**
 * Production-safe logger
 * Logs are automatically stripped in production builds
 */
export const logger = {
  /**
   * Debug level logging - only in development
   * @param {...any} args - Arguments to log
   */
  debug: (...args) => {
    if (IS_DEV) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info level logging - only in development
   * @param {...any} args - Arguments to log
   */
  info: (...args) => {
    if (IS_DEV) {
      console.log('[INFO]', ...args);
    }
  },

  /**
   * Warning level logging - only in development (production logs suppressed)
   * Use error() for critical issues that need production visibility
   * @param {...any} args - Arguments to log
   */
  warn: (...args) => {
    if (IS_DEV) {
      console.warn('[WARN]', ...args);
    }
    // In production, critical warnings should use logger.error() instead
    // For error tracking, use: reportToSentry('warning', ...args);
  },

  /**
   * Error level logging - shown in development and production
   * Critical errors are logged even in production builds
   * @param {...any} args - Arguments to log
   */
  error: (...args) => {
    console.error('[ERROR]', ...args);
    // In production, send to error tracking service
    // reportToSentry('error', ...args);
  },
};

export default logger;
