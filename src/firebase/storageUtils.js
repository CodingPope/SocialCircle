// Description: Helper utilities for handling Firebase Storage errors and diagnostics
import { Platform } from 'react-native';

const loggedWarnings = new Set();

function normalizeMessage(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  try {
    return JSON.stringify(msg);
  } catch {
    return String(msg);
  }
}

export function interpretStorageError(
  error,
  { context = 'storage', path } = {}
) {
  const code = error?.code || error?.nativeErrorCode || 'unknown';
  const message = normalizeMessage(error?.message || error?.nativeErrorMessage);
  const lowerMessage = message.toLowerCase();
  const extra = { code, message, context, path };

  const result = {
    developerMessage: message,
    userMessage: 'We hit a storage error while uploading your image.',
    needsConsoleFix: false,
    retryable: false,
    code,
    details: extra,
  };

  if (code === 'storage/unauthorized') {
    result.userMessage = 'You are not authorized to upload to this bucket.';
    result.retryable = false;
  }

  if (code === 'storage/canceled') {
    result.userMessage = 'Upload was canceled.';
    result.retryable = true;
  }

  if (
    lowerMessage.includes('missing necessary permissions') ||
    lowerMessage.includes('re-linking your firebase bucket') ||
    lowerMessage.includes('code": 412')
  ) {
    result.userMessage =
      'Our Firebase Storage bucket needs to be re-linked in the console before uploads will work.';
    result.needsConsoleFix = true;
  }

  if (code === 'storage/retry-limit-exceeded') {
    result.userMessage =
      'Upload timed out due to network issues. Please try again.';
    result.retryable = true;
  }

  return result;
}

export function logStorageDiagnostic(kind, info) {
  const key = `${kind}:${info?.code || 'unknown'}`;
  if (loggedWarnings.has(key)) return;
  loggedWarnings.add(key);

  const payload = {
    platform: Platform.OS,
    ...info,
  };

  console.warn(`[Storage Diagnostic] ${kind}`, payload);
}
