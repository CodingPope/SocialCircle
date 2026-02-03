// Description: Tests for MapQuickDateFilters component (Today/Tomorrow/This Week buttons)
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock vector icons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

import MapQuickDateFilters from '../../../../../src/features/events/components/map/MapQuickDateFilters';

const mockTheme = {
  colors: {
    card: '#FFFFFF',
    text: '#000000',
    textSecondary: '#666666',
    primary: '#007AFF',
    border: '#E0E0E0',
  },
  isDark: false,
};

describe('MapQuickDateFilters', () => {
  const defaultProps = {
    selectedKey: null,
    onSelect: jest.fn(),
    onClear: jest.fn(),
    theme: mockTheme,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all three filter buttons', () => {
    const { getByText } = render(<MapQuickDateFilters {...defaultProps} />);
    expect(getByText('Today')).toBeTruthy();
    expect(getByText('Tomorrow')).toBeTruthy();
    expect(getByText('This Week')).toBeTruthy();
  });

  it('calls onSelect with filter object when Today is pressed', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <MapQuickDateFilters {...defaultProps} onSelect={onSelect} />,
    );
    fireEvent.press(getByText('Today'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'today', label: 'Today' }),
    );
  });

  it('calls onSelect with filter object when Tomorrow is pressed', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <MapQuickDateFilters {...defaultProps} onSelect={onSelect} />,
    );
    fireEvent.press(getByText('Tomorrow'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'tomorrow', label: 'Tomorrow' }),
    );
  });

  it('calls onSelect with filter object when This Week is pressed', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <MapQuickDateFilters {...defaultProps} onSelect={onSelect} />,
    );
    fireEvent.press(getByText('This Week'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'week', label: 'This Week' }),
    );
  });

  it('calls onClear when active filter is pressed again', () => {
    const onClear = jest.fn();
    const { getByText } = render(
      <MapQuickDateFilters
        {...defaultProps}
        selectedKey='today'
        onClear={onClear}
      />,
    );
    fireEvent.press(getByText('Today'));
    expect(onClear).toHaveBeenCalled();
  });

  it('sets accessibilityState.selected true for active filter', () => {
    const { getByLabelText } = render(
      <MapQuickDateFilters {...defaultProps} selectedKey='week' />,
    );
    const thisWeekButton = getByLabelText('Filter by This Week');
    expect(thisWeekButton.props.accessibilityState.selected).toBe(true);
  });

  it('sets accessibilityState.selected false for inactive filters', () => {
    const { getByLabelText } = render(
      <MapQuickDateFilters {...defaultProps} selectedKey='week' />,
    );
    const todayButton = getByLabelText('Filter by Today');
    expect(todayButton.props.accessibilityState.selected).toBe(false);
  });

  it('handles rapid filter changes', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <MapQuickDateFilters {...defaultProps} onSelect={onSelect} />,
    );

    fireEvent.press(getByText('Today'));
    fireEvent.press(getByText('Tomorrow'));
    fireEvent.press(getByText('This Week'));

    expect(onSelect).toHaveBeenCalledTimes(3);
  });
});
