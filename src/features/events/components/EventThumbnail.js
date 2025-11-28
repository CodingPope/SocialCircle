import React, { useMemo } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getCategoryConfig } from '../constants/categoryPins';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const adjustHexColor = (hex, amount = 0) => {
  if (typeof hex !== 'string') return '#E5E7EB';
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return '#E5E7EB';

  const num = parseInt(normalized, 16);
  const factor = clamp(amount, -1, 1);
  const adjust = (shift) => {
    const base = (num >> shift) & 0xff;
    return clamp(Math.round(base + factor * 255), 0, 255);
  };

  const toHex = (value) => value.toString(16).padStart(2, '0');
  return `#${toHex(adjust(16))}${toHex(adjust(8))}${toHex(adjust(0))}`;
};

/**
 * Event thumbnail that mirrors the gradient + emoji fallback used on blip previews.
 */
export default function EventThumbnail({
  event,
  size = 56,
  borderRadius = 14,
  style,
  imageUrl,
}) {
  const thumb =
    imageUrl ||
    event?.imageUrl ||
    event?.cardImage ||
    event?.imageUri ||
    null;

  const fallbackInitial = useMemo(() => {
    const source = (event?.title || event?.interest || '').trim();
    return source ? source.charAt(0).toUpperCase() : '🎉';
  }, [event?.title, event?.interest]);

  const categoryConfig = useMemo(() => getCategoryConfig(event || {}), [event]);
  const placeholderEmoji = categoryConfig?.emoji || fallbackInitial;
  const placeholderColor = categoryConfig?.color || '#E5E7EB';

  const gradientStart = useMemo(
    () => adjustHexColor(placeholderColor, 0.18),
    [placeholderColor]
  );
  const gradientEnd = useMemo(
    () => adjustHexColor(placeholderColor, -0.12),
    [placeholderColor]
  );

  const badgeOuterSize = useMemo(
    () => Math.max(Math.round(size * 0.6), 26),
    [size]
  );
  const badgeInnerSize = useMemo(
    () => Math.max(Math.round(badgeOuterSize - 6), 18),
    [badgeOuterSize]
  );

  return (
    <View
      style={[
        styles.wrapper,
        {
          width: size,
          height: size,
          borderRadius,
        },
        !thumb && { backgroundColor: placeholderColor },
        style,
      ]}
    >
      {thumb ? (
        <Image
          source={{ uri: thumb }}
          style={[styles.image, { borderRadius }]}
          resizeMode='cover'
        />
      ) : (
        <LinearGradient
          colors={[gradientStart, gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, { borderRadius }]}
        >
          <View
            style={[
              styles.badgeOuter,
              {
                width: badgeOuterSize,
                height: badgeOuterSize,
                borderRadius: badgeOuterSize / 2,
              },
            ]}
          >
            <View
              style={[
                styles.badgeInner,
                {
                  width: badgeInnerSize,
                  height: badgeInnerSize,
                  borderRadius: badgeInnerSize / 2,
                  borderColor: gradientStart,
                },
              ]}
            >
              <Text style={styles.badgeEmoji}>{placeholderEmoji}</Text>
            </View>
          </View>
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeOuter: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  badgeInner: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.6,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  badgeEmoji: {
    fontSize: 18,
  },
});
