// Shared date/time helpers for EventChatScreen and related components

export const MIN_LEAD_MINUTES = 30;
export const MAX_LEAD_DAYS = 7;
export const MINUTE_INCREMENT = 5;

const MIN_MILLIS = MIN_LEAD_MINUTES * 60 * 1000;
const MAX_MILLIS = MAX_LEAD_DAYS * 24 * 60 * 60 * 1000;

export const roundUpToMinuteIncrement = (inputDate) => {
  const date = new Date(inputDate);
  date.setSeconds(0);
  date.setMilliseconds(0);
  if (!MINUTE_INCREMENT || MINUTE_INCREMENT < 1) return date;
  const minutes = date.getMinutes();
  const remainder = minutes % MINUTE_INCREMENT;
  if (remainder !== 0) {
    date.setMinutes(minutes + (MINUTE_INCREMENT - remainder));
  }
  return date;
};

export const getEditDateBounds = () => {
  const now = new Date();
  return {
    min: new Date(now.getTime() + MIN_MILLIS),
    max: new Date(now.getTime() + MAX_MILLIS),
  };
};

export const coerceDateWithinBounds = (rawDate) => {
  if (!rawDate) return null;
  const { min, max } = getEditDateBounds();
  const rounded = roundUpToMinuteIncrement(rawDate);
  if (rounded < min) return roundUpToMinuteIncrement(min);
  if (rounded > max) return roundUpToMinuteIncrement(max);
  return rounded;
};

export const isWithinDateBounds = (candidate) => {
  if (!(candidate instanceof Date)) return false;
  const { min, max } = getEditDateBounds();
  return candidate >= min && candidate <= max;
};
