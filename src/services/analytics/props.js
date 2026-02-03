// Analytics prop derivation helpers

function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  return null;
}

function computeAge(dob) {
  const date = toDateSafe(dob);
  if (!date) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 120 ? age : null;
}

function getAgeBracket(dob) {
  const age = computeAge(dob);
  if (age == null) return null;
  if (age < 18) return 'under_18';
  if (age <= 24) return '18_24';
  if (age <= 34) return '25_34';
  if (age <= 44) return '35_44';
  if (age <= 54) return '45_54';
  return '55_plus';
}

function normalizeSex(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return null;
  if (['female', 'f', 'woman'].includes(raw)) return 'female';
  if (['male', 'm', 'man'].includes(raw)) return 'male';
  if (['nonbinary', 'non-binary', 'non_binary', 'nb'].includes(raw))
    return 'non_binary';
  if (['prefer_not_say', 'prefer not to say'].includes(raw))
    return 'prefer_not_say';
  return 'other';
}

function sanitizePropValue(value, { lowercase = false, max = 24 } = {}) {
  if (value == null) return null;
  let str = String(value).trim();
  if (!str) return null;
  if (lowercase) str = str.toLowerCase();
  if (str.length > max) str = str.slice(0, max);
  return str;
}

export function deriveUserAnalyticsProps(user = {}) {
  const props = {};
  const plan = sanitizePropValue(user?.plan || 'free', {
    lowercase: true,
    max: 24,
  });
  if (plan) props.plan = plan;

  const interestCount = Array.isArray(user?.interests)
    ? Math.min(user.interests.length, 99)
    : 0;
  props.interests_count = String(interestCount);

  const ageBracket = getAgeBracket(user?.dob);
  if (ageBracket) props.age_bracket = ageBracket;

  const sex = normalizeSex(user?.sex);
  if (sex) props.sex = sex;
  else props.sex = 'unknown';

  const cityCandidate =
    sanitizePropValue(user?.city, { max: 24 }) ||
    sanitizePropValue(user?.location?.city, { max: 24 }) ||
    sanitizePropValue(user?.location?.label, { max: 24 });
  if (cityCandidate) props.home_city = cityCandidate;

  props.push_opt_in = user?.pushOptIn ? 'true' : 'false';

  return props;
}

export default deriveUserAnalyticsProps;

