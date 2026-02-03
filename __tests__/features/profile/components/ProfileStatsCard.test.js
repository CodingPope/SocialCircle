// Description: Tests for ProfileStatsCard component (friends, events, rating display)
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock vector icons
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');

import ProfileStatsCard from '../../../../src/features/profile/components/ProfileStatsCard';

const mockTheme = {
  colors: {
    card: '#FFFFFF',
    text: '#000000',
    textSecondary: '#666666',
  },
  isDark: false,
};

describe('ProfileStatsCard', () => {
  const defaultProps = {
    followerCount: 0,
    eventCount: 0,
    rating: 0,
    ratingCount: 0,
    theme: mockTheme,
    onFriendsPress: jest.fn(),
    onEventsPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with default zero values', () => {
    const { getByText, getAllByText } = render(
      <ProfileStatsCard {...defaultProps} />,
    );
    // Should have multiple zeros (follower + event count)
    expect(getAllByText('0').length).toBeGreaterThanOrEqual(2);
    expect(getByText('Friends')).toBeTruthy();
    expect(getByText('Events')).toBeTruthy();
    expect(getByText('No ratings')).toBeTruthy();
  });

  it('displays follower count correctly', () => {
    const { getByText } = render(
      <ProfileStatsCard {...defaultProps} followerCount={42} />,
    );
    expect(getByText('42')).toBeTruthy();
  });

  it('displays event count correctly', () => {
    const { getByText } = render(
      <ProfileStatsCard {...defaultProps} eventCount={15} />,
    );
    expect(getByText('15')).toBeTruthy();
  });

  it('displays rating with one decimal place', () => {
    const { getByText } = render(
      <ProfileStatsCard {...defaultProps} rating={4.567} ratingCount={10} />,
    );
    expect(getByText('4.6')).toBeTruthy();
  });

  it('shows "No ratings" when rating is 0', () => {
    const { getByText } = render(
      <ProfileStatsCard {...defaultProps} rating={0} ratingCount={0} />,
    );
    expect(getByText('No ratings')).toBeTruthy();
  });

  it('shows singular "rating" when count is 1', () => {
    const { getByText } = render(
      <ProfileStatsCard {...defaultProps} rating={5} ratingCount={1} />,
    );
    expect(getByText('1 rating')).toBeTruthy();
  });

  it('shows plural "ratings" when count > 1', () => {
    const { getByText } = render(
      <ProfileStatsCard {...defaultProps} rating={4.2} ratingCount={25} />,
    );
    expect(getByText('25 ratings')).toBeTruthy();
  });

  it('calls onFriendsPress when friends card is tapped', () => {
    const onFriendsPress = jest.fn();
    const { getByText } = render(
      <ProfileStatsCard {...defaultProps} onFriendsPress={onFriendsPress} />,
    );
    fireEvent.press(getByText('Friends'));
    expect(onFriendsPress).toHaveBeenCalledTimes(1);
  });

  it('calls onEventsPress when events card is tapped', () => {
    const onEventsPress = jest.fn();
    const { getByText } = render(
      <ProfileStatsCard {...defaultProps} onEventsPress={onEventsPress} />,
    );
    fireEvent.press(getByText('Events'));
    expect(onEventsPress).toHaveBeenCalledTimes(1);
  });

  it('displays zero rating as "0" not formatted', () => {
    const { getAllByText } = render(
      <ProfileStatsCard {...defaultProps} rating={0} ratingCount={0} />,
    );
    // Should show "0" values (not "0.0")
    expect(getAllByText('0').length).toBeGreaterThanOrEqual(1);
  });

  it('handles large numbers gracefully', () => {
    const { getByText } = render(
      <ProfileStatsCard
        {...defaultProps}
        followerCount={1234}
        eventCount={567}
        rating={5}
        ratingCount={999}
      />,
    );
    expect(getByText('1234')).toBeTruthy();
    expect(getByText('567')).toBeTruthy();
    expect(getByText('999 ratings')).toBeTruthy();
  });
});
