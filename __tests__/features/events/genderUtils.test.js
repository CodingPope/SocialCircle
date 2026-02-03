// Description: Tests for gender gating helpers
import { normalizeSex, eventPassesGenderGate } from '../../../src/features/events/utils/genderUtils';

describe('normalizeSex', () => {
  it('normalizes common variants', () => {
    expect(normalizeSex('M')).toBe('male');
    expect(normalizeSex('female')).toBe('female');
    expect(normalizeSex('Non-Binary')).toBe('nonbinary');
  });

  it('returns unknown for empty', () => {
    expect(normalizeSex('')).toBe('unknown');
    expect(normalizeSex(null)).toBe('unknown');
  });
});

describe('eventPassesGenderGate', () => {
  const eventBase = { privacy: 'public' };

  it('allows public events', () => {
    expect(eventPassesGenderGate(eventBase, { sex: 'female' })).toBe(true);
  });

  it('enforces male-only', () => {
    expect(
      eventPassesGenderGate({ privacy: 'male-only' }, { sex: 'male' })
    ).toBe(true);
    expect(
      eventPassesGenderGate({ privacy: 'male-only' }, { sex: 'female' })
    ).toBe(false);
  });

  it('enforces female-only', () => {
    expect(
      eventPassesGenderGate({ privacy: 'female-only' }, { sex: 'female' })
    ).toBe(true);
    expect(
      eventPassesGenderGate({ privacy: 'female-only' }, { sex: 'male' })
    ).toBe(false);
  });

  it('enforces nonbinary-only', () => {
    expect(
      eventPassesGenderGate({ privacy: 'nonbinary-only' }, { sex: 'nonbinary' })
    ).toBe(true);
    expect(
      eventPassesGenderGate({ privacy: 'nonbinary-only' }, { sex: 'male' })
    ).toBe(false);
  });
});
