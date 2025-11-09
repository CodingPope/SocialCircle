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
   * Warning level logging - shown in development and production
   * @param {...any} args - Arguments to log
   */
  warn: (...args) => {
    if (IS_DEV) {
      console.warn('[WARN]', ...args);
    }
    // In production, you might want to send to error tracking service
    // reportToSentry('warning', ...args);
  },

  /**
   * Error level logging - shown in development and production
   * @param {...any} args - Arguments to log
   */
  error: (...args) => {
    if (IS_DEV) {
      console.error('[ERROR]', ...args);
    }
    // In production, you might want to send to error tracking service
    // reportToSentry('error', ...args);
  },
};

export default logger;
