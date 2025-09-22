// Description: Utility to add event to user's calendar using Expo Calendar API

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

export async function addEventToCalendar({
  title,
  description,
  startDate,
  endDate,
}) {
  // Request permissions
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') {
    alert('Calendar permission not granted');
    return;
  }

  // Get default calendar
  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT
  );
  const defaultCalendar =
    calendars.find(
      (cal) =>
        cal.source.name ===
        (Platform.OS === 'ios' ? 'Default' : 'Local Account')
    ) || calendars[0];

  // Create event
  await Calendar.createEventAsync(defaultCalendar.id, {
    title,
    notes: description,
    startDate,
    endDate,
    timeZone: 'local',
  });
  alert('Event added to your calendar!');
}
