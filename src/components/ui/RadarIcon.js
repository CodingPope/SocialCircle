// Description: Custom Radar icon for Social Circle (used in MyCircle tab)
import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

export default function RadarIcon({
  size = 28,
  color = '#007AFF',
  style,
  ...props
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox='0 0 28 28'
      fill='none'
      style={style}
      {...props}
      accessibilityLabel='Radar Icon'
    >
      {/* Outer circle */}
      <Circle cx='14' cy='14' r='13' stroke={color} strokeWidth='2' />
      {/* Radar sweep */}
      <Path
        d='M14 14 L14 4'
        stroke={color}
        strokeWidth='2'
        strokeLinecap='round'
      />
      {/* Radar arc */}
      <Path
        d='M14 14 A10 10 0 0 1 24 14'
        stroke={color}
        strokeWidth='2'
        fill='none'
      />
      {/* Center dot */}
      <Circle cx='14' cy='14' r='2' fill={color} />
    </Svg>
  );
}
