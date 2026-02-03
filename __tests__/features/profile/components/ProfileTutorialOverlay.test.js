// Description: Tests for ProfileTutorialOverlay component (first-time user tutorial)
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import ProfileTutorialOverlay from '../../../../src/features/profile/components/ProfileTutorialOverlay';

describe('ProfileTutorialOverlay', () => {
  const defaultProps = {
    highlightStyle: { top: 50, left: 20, width: 40, height: 40 },
    tooltipPosition: { top: 100, left: 20, width: 280 },
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the overlay', () => {
    const { getByText } = render(<ProfileTutorialOverlay {...defaultProps} />);
    expect(getByText('Profile menu')).toBeTruthy();
  });

  it('displays tutorial title', () => {
    const { getByText } = render(<ProfileTutorialOverlay {...defaultProps} />);
    expect(getByText('Profile menu')).toBeTruthy();
  });

  it('displays tutorial description', () => {
    const { getByText } = render(<ProfileTutorialOverlay {...defaultProps} />);
    expect(getByText(/Open the menu to add a profile photo/)).toBeTruthy();
  });

  it('displays Got it button', () => {
    const { getByText } = render(<ProfileTutorialOverlay {...defaultProps} />);
    expect(getByText('Got it')).toBeTruthy();
  });

  it('calls onDismiss when Got it button is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <ProfileTutorialOverlay {...defaultProps} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByText('Got it'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders without highlight when highlightStyle is null', () => {
    const { getByText } = render(
      <ProfileTutorialOverlay {...defaultProps} highlightStyle={null} />,
    );
    // Should still render tooltip
    expect(getByText('Profile menu')).toBeTruthy();
  });

  it('renders without tooltip when tooltipPosition is null', () => {
    const { queryByText } = render(
      <ProfileTutorialOverlay {...defaultProps} tooltipPosition={null} />,
    );
    // Tooltip content should not render
    expect(queryByText('Profile menu')).toBeNull();
  });

  it('has correct accessibility label on tooltip', () => {
    const { getByLabelText } = render(
      <ProfileTutorialOverlay {...defaultProps} />,
    );
    expect(getByLabelText('Profile tutorial tooltip')).toBeTruthy();
  });

  it('has correct accessibility label on dismiss button', () => {
    const { getByLabelText } = render(
      <ProfileTutorialOverlay {...defaultProps} />,
    );
    expect(getByLabelText('Got it, close profile tutorial')).toBeTruthy();
  });

  it('renders backdrop for darkening background', () => {
    const { UNSAFE_getAllByType } = render(
      <ProfileTutorialOverlay {...defaultProps} />,
    );
    const views = UNSAFE_getAllByType(require('react-native').View);
    // Should have overlay, backdrop, highlight, and tooltip views
    expect(views.length).toBeGreaterThan(1);
  });
});
