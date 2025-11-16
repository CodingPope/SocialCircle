import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const IOS_FULL_SCREEN_MODAL =
  ImagePicker.UIImagePickerPresentationStyle?.FULL_SCREEN ??
  ImagePicker.UIImagePickerPresentationStyle?.FULLSCREEN ??
  undefined;

const IOS_CURRENT_REPRESENTATION =
  ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Current ??
  ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.CURRENT ??
  undefined;

const IMAGE_ONLY_MEDIA_TYPES = ['images'];

/**
 * Normalizes the picker options so every flow gets the same "premium" presentation:
 * - forces image-only selection with optional editing
 * - requests full screen modals on iOS instead of the default sheet presentation
 * - keeps the original representation to avoid blurry previews while editing
 */
export const createImagePickerOptions = (overrides = {}) => {
  const baseOptions = {
    mediaTypes: IMAGE_ONLY_MEDIA_TYPES,
    allowsEditing: true,
    quality: Platform.select({ ios: 1, android: 0.9, default: 0.85 }),
    copyToCacheDirectory: true,
  };

  if (Platform.OS === 'ios') {
    if (!overrides.presentationStyle && IOS_FULL_SCREEN_MODAL) {
      baseOptions.presentationStyle = IOS_FULL_SCREEN_MODAL;
    }
    if (
      !overrides.preferredAssetRepresentationMode &&
      IOS_CURRENT_REPRESENTATION
    ) {
      baseOptions.preferredAssetRepresentationMode =
        IOS_CURRENT_REPRESENTATION;
    }
  }

  return {
    ...baseOptions,
    ...overrides,
  };
};

export const imageOnlyMediaTypes = IMAGE_ONLY_MEDIA_TYPES;
