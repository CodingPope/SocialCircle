import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';

const createStyles = (theme) => {
  const { colors, radii, spacing } = theme;
  return StyleSheet.create({
    base: {
      paddingVertical: spacing.sm + 4,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    primary: {
      backgroundColor: colors.primary,
    },
    secondary: {
      backgroundColor: colors.neutral200,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.primary,
    },
    disabled: {
      opacity: 0.5,
    },
    textBase: {
      fontWeight: '600',
      fontSize: 16,
    },
    textPrimary: {
      color: colors.neutral100,
    },
    textSecondary: {
      color: colors.primary,
    },
    textOutline: {
      color: colors.primary,
    },
  });
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  style,
  textStyle,
  disabled = false,
  children,
  ...touchableProps
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const buttonVariantStyle = styles[variant] || styles.primary;
  const textVariantKey = `text${variant.charAt(0).toUpperCase()}${variant.slice(1)}`;
  const textVariantStyle = styles[textVariantKey] || styles.textPrimary;

  return (
    <TouchableOpacity
      style={[styles.base, buttonVariantStyle, disabled && styles.disabled, style]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
      {...touchableProps}
    >
      {children ? (
        children
      ) : (
        <Text style={[styles.textBase, textVariantStyle, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}
