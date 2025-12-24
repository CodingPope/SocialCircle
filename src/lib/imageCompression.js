// Description: Client-side image compression and validation utilities
// Ensures images meet size/quality requirements before upload to reduce bandwidth and storage costs

import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import logger from './logger';

// Image size limits (matching server-side Storage rules)
export const IMAGE_LIMITS = Object.freeze({
  PROFILE: {
    maxBytes: 5 * 1024 * 1024, // 5MB (Storage rules)
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 0.85,
    label: 'Profile picture',
  },
  EVENT: {
    maxBytes: 10 * 1024 * 1024, // 10MB (Storage rules)
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 0.85,
    label: 'Event image',
  },
  POST: {
    maxBytes: 10 * 1024 * 1024, // 10MB
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 0.85,
    label: 'Post media',
  },
  BUSINESS: {
    maxBytes: 10 * 1024 * 1024, // 10MB
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 0.85,
    label: 'Business asset',
  },
});

/**
 * Get file size from URI
 * @param {string} uri - File URI (file://, content://, etc.)
 * @returns {Promise<number>} File size in bytes
 */
async function getFileSizeBytes(uri) {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (info.exists && typeof info.size === 'number') {
      return info.size;
    }
    return 0;
  } catch (error) {
    logger.warn('[imageCompression] Failed to get file size:', error?.message);
    return 0;
  }
}

const isValidDimension = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

async function getImageDimensions(uri, metadata = {}) {
  const width = isValidDimension(metadata?.width) ? metadata.width : null;
  const height = isValidDimension(metadata?.height) ? metadata.height : null;
  if (width && height) return { width, height };

  try {
    return await new Promise((resolve) => {
      Image.getSize(
        uri,
        (w, h) => resolve({ width: w, height: h }),
        () => resolve(null)
      );
    });
  } catch {
    return null;
  }
}

function getResizeAction(dimensions, limits) {
  if (!dimensions?.width || !dimensions?.height) return null;
  const widthRatio = limits.maxWidth / dimensions.width;
  const heightRatio = limits.maxHeight / dimensions.height;
  const scale = Math.min(1, widthRatio, heightRatio);
  if (scale >= 1) return null;
  return {
    resize: {
      width: Math.max(1, Math.round(dimensions.width * scale)),
      height: Math.max(1, Math.round(dimensions.height * scale)),
    },
  };
}

/**
 * Validate and compress image to meet size/quality requirements
 * @param {string} uri - Original image URI
 * @param {keyof IMAGE_LIMITS} limitType - Limit profile to use
 * @param {{width?: number, height?: number}} metadata - Optional image dimensions
 * @returns {Promise<{uri: string, compressed: boolean, originalSize: number, finalSize: number}>}
 */
export async function validateAndCompressImage(
  uri,
  limitType = 'EVENT',
  metadata = {}
) {
  const limits = IMAGE_LIMITS[limitType];
  if (!limits) {
    throw new Error(`Invalid limit type: ${limitType}`);
  }

  if (!uri || typeof uri !== 'string') {
    throw new Error('Invalid image URI');
  }

  // Get original file size
  const originalSize = await getFileSizeBytes(uri);
  logger.debug(
    `[imageCompression] ${limits.label}: Original size ${(
      originalSize / 1024
    ).toFixed(1)}KB`
  );

  // If file is already under limit and not too large, return as-is
  if (originalSize > 0 && originalSize <= limits.maxBytes) {
    logger.debug(
      `[imageCompression] ${limits.label}: Within limits, no compression needed`
    );
    return {
      uri,
      compressed: false,
      originalSize,
      finalSize: originalSize,
    };
  }

  // File is too large or size unknown - compress it
  logger.debug(
    `[imageCompression] ${limits.label}: Compressing (${(
      originalSize /
      1024 /
      1024
    ).toFixed(2)}MB -> target <${(limits.maxBytes / 1024 / 1024).toFixed(0)}MB)`
  );

  try {
    const dimensions = await getImageDimensions(uri, metadata);
    const resizeAction = getResizeAction(dimensions, limits);
    const actions = resizeAction ? [resizeAction] : [];

    // Resize (if needed) and compress using expo-image-manipulator
    const compressed = await manipulateAsync(
      uri,
      actions,
      {
        compress: limits.quality,
        format: SaveFormat.JPEG,
      }
    );

    const finalSize = await getFileSizeBytes(compressed.uri);
    logger.debug(
      `[imageCompression] ${limits.label}: Compressed to ${(
        finalSize / 1024
      ).toFixed(1)}KB (${((1 - finalSize / originalSize) * 100).toFixed(
        1
      )}% reduction)`
    );

    // Verify compressed size is within limits
    if (finalSize > limits.maxBytes) {
      // Try again with lower quality
      const secondPass = await manipulateAsync(compressed.uri, [], {
        compress: Math.max(0.5, limits.quality - 0.2),
        format: SaveFormat.JPEG,
      });

      const secondSize = await getFileSizeBytes(secondPass.uri);
      logger.debug(
        `[imageCompression] ${limits.label}: Second pass: ${(
          secondSize / 1024
        ).toFixed(1)}KB`
      );

      if (secondSize > limits.maxBytes) {
        throw new Error(
          `Image is too large even after compression (${(
            secondSize /
            1024 /
            1024
          ).toFixed(1)}MB). Please select a smaller image.`
        );
      }

      return {
        uri: secondPass.uri,
        compressed: true,
        originalSize,
        finalSize: secondSize,
      };
    }

    return {
      uri: compressed.uri,
      compressed: true,
      originalSize,
      finalSize,
    };
  } catch (error) {
    logger.error(
      `[imageCompression] ${limits.label}: Compression failed:`,
      error?.message
    );
    throw new Error(
      `Failed to compress image: ${error?.message || 'Unknown error'}`
    );
  }
}

/**
 * Validate image picker result and compress if needed
 * @param {object} pickerResult - Result from expo-image-picker
 * @param {keyof IMAGE_LIMITS} limitType - Limit profile to use
 * @returns {Promise<string>} Validated and compressed image URI
 */
export async function validatePickerResult(pickerResult, limitType = 'EVENT') {
  if (!pickerResult || pickerResult.canceled) {
    throw new Error('Image selection was canceled');
  }

  if (!pickerResult.assets || pickerResult.assets.length === 0) {
    throw new Error('No image was selected');
  }

  const asset = pickerResult.assets[0];
  if (!asset.uri) {
    throw new Error('Selected image has no URI');
  }

  // Validate and compress
  const result = await validateAndCompressImage(asset.uri, limitType, {
    width: asset.width,
    height: asset.height,
  });
  return result.uri;
}

/**
 * Get human-readable size limit message for UI
 * @param {keyof IMAGE_LIMITS} limitType
 * @returns {string}
 */
export function getSizeLimitMessage(limitType = 'EVENT') {
  const limits = IMAGE_LIMITS[limitType];
  const mb = (limits.maxBytes / 1024 / 1024).toFixed(0);
  const dimensions = `${limits.maxWidth}x${limits.maxHeight}`;
  return `Max ${mb}MB, auto-resized to ${dimensions}px`;
}
