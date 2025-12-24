import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import ImageCropPicker from 'react-native-image-crop-picker';
import { IMAGE_LIMITS, validateAndCompressImage } from './imageCompression';

const IMAGE_ONLY_MEDIA_TYPES = ['photo'];
const DEFAULT_ASPECT = [4, 3];
const PROFILE_ASPECT = [1, 1];

const resolveAspect = (overrides, limitType) => {
  const raw = Array.isArray(overrides?.aspect) ? overrides.aspect : null;
  if (raw && raw.length === 2 && raw[0] > 0 && raw[1] > 0) return raw;
  if (limitType === 'PROFILE') return PROFILE_ASPECT;
  return DEFAULT_ASPECT;
};

const getCropSize = (aspect, limitType) => {
  const limits = IMAGE_LIMITS[limitType] || IMAGE_LIMITS.EVENT;
  const ratio = aspect[0] / aspect[1];
  let width = limits.maxWidth || 1920;
  let height = Math.round(width / ratio);
  if (limits.maxHeight && height > limits.maxHeight) {
    height = limits.maxHeight;
    width = Math.round(height * ratio);
  }
  return { width, height };
};

/**
 * Normalizes the picker options so every flow gets the same "premium" presentation:
 * - forces image-only selection with optional editing
 * - requests full screen modals on iOS instead of the default sheet presentation
 * - keeps the original representation to avoid blurry previews while editing
 * Note: Quality is set to 1.0 here because compression happens AFTER selection via imageCompression.js
 */
export const createImagePickerOptions = (overrides = {}, limitType = 'EVENT') => {
  const aspect = resolveAspect(overrides, limitType);
  const cropSize = getCropSize(aspect, limitType);

  const baseOptions = {
    mediaType: IMAGE_ONLY_MEDIA_TYPES[0],
    cropping: true,
    width: cropSize.width,
    height: cropSize.height,
    cropperToolbarTitle: 'Choose Photo',
    cropperChooseText: 'Choose',
    cropperCancelText: 'Cancel',
    compressImageQuality: 1,
  };

  const { aspect: _ignored, ...restOverrides } = overrides;

  return {
    ...baseOptions,
    ...restOverrides,
  };
};

/**
 * Launch image picker and compress result
 * @param {object} options - Image picker options
 * @param {string} limitType - Compression limit type (PROFILE, EVENT, POST, BUSINESS)
 * @returns {Promise<{uri: string, compressed: boolean}|null>} Compressed image or null if canceled
 */
export const pickAndCompressImage = async (
  options = {},
  limitType = 'EVENT'
) => {
  const pickerOptions = createImagePickerOptions(options, limitType);
  let result = null;

  try {
    if (Platform.OS === 'web') {
      const expoOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1.0,
      };
      const fallback = await ImagePicker.launchImageLibraryAsync(expoOptions);
      if (!fallback.canceled && fallback.assets && fallback.assets[0]) {
        result = {
          path: fallback.assets[0].uri,
          width: fallback.assets[0].width,
          height: fallback.assets[0].height,
        };
      }
    } else {
      result = await ImageCropPicker.openPicker(pickerOptions);
    }
  } catch (error) {
    if (error?.code === 'E_PICKER_CANCELLED') {
      return null;
    }
    throw error;
  }

  if (!result) {
    return null;
  }

  const rawPath = result.path || result.uri;
  if (!rawPath) return null;
  const normalizedUri = rawPath.startsWith('file://')
    ? rawPath
    : `file://${rawPath}`;
  const compressed = await validateAndCompressImage(
    normalizedUri,
    limitType,
    {
      width: result.width,
      height: result.height,
    }
  );

  return compressed;
};

export const imageOnlyMediaTypes = IMAGE_ONLY_MEDIA_TYPES;
