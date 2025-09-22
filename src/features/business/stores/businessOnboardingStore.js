// Description: Zustand store to drive business onboarding steps, persisting via Cloud Functions.
import { create } from 'zustand';
import {
  createBusinessDraft,
  updateBusinessBasics,
  updateBrandAssets,
  addBusinessLocation,
  updateAudiencePolicies,
  startBusinessVerification,
  verifyBusinessCode,
  addBusinessMember,
  setBusinessPrivacy,
  submitBusiness,
} from '../../../firebase/config';

export const useBizOnboarding = create((set, get) => ({
  bizId: null,
  type: 'single',
  step: 0,
  loading: false,
  error: null,
  draft: {},
  locations: [],

  start: async (type = 'single') => {
    set({ loading: true, error: null });
    try {
      const res = await createBusinessDraft(type);
      if (res?.bizId) set({ bizId: res.bizId, type, step: 1 });
    } catch (e) {
      set({ error: e?.message || 'Failed to start business setup' });
    }
    set({ loading: false });
  },

  saveBasics: async (payload) => {
    const { bizId } = get();
    if (!bizId) return;
    set({ loading: true, error: null });
    try {
      await updateBusinessBasics({ bizId, ...payload });
      set({ draft: { ...get().draft, ...payload }, step: 2 });
    } catch (e) {
      set({ error: e?.message || 'Failed to save basics' });
    }
    set({ loading: false });
  },

  saveBrand: async (payload) => {
    const { bizId } = get();
    if (!bizId) return;
    set({ loading: true, error: null });
    try {
      await updateBrandAssets({ bizId, ...payload });
      set({ draft: { ...get().draft, ...payload }, step: 3 });
    } catch (e) {
      set({ error: e?.message || 'Failed to save brand assets' });
    }
    set({ loading: false });
  },

  addLocation: async (payload) => {
    const { bizId } = get();
    if (!bizId) return;
    set({ loading: true, error: null });
    try {
      const res = await addBusinessLocation({ bizId, ...payload });
      if (res?.locId)
        set({
          locations: [...get().locations, { id: res.locId, ...payload }],
          step: 4,
        });
    } catch (e) {
      set({ error: e?.message || 'Failed to add location' });
    }
    set({ loading: false });
  },

  saveAudience: async (payload) => {
    const { bizId } = get();
    if (!bizId) return;
    set({ loading: true, error: null });
    try {
      await updateAudiencePolicies({ bizId, ...payload });
      set({ draft: { ...get().draft, ...payload }, step: 5 });
    } catch (e) {
      set({ error: e?.message || 'Failed to save audience' });
    }
    set({ loading: false });
  },

  startVerification: async (method) => {
    const { bizId } = get();
    if (!bizId) return;
    set({ loading: true, error: null });
    try {
      const res = await startBusinessVerification({ bizId, method });
      set({
        draft: {
          ...get().draft,
          verificationMethod: method,
          devCode: res?.devCode || null,
        },
        step: 6,
      });
    } catch (e) {
      set({ error: e?.message || 'Failed to start verification' });
    }
    set({ loading: false });
  },

  verifyCode: async (code) => {
    const { bizId } = get();
    if (!bizId) return;
    set({ loading: true, error: null });
    try {
      await verifyBusinessCode({ bizId, code });
      set({ draft: { ...get().draft, verified: true }, step: 6 });
    } catch (e) {
      set({ error: e?.message || 'Invalid verification code' });
    }
    set({ loading: false });
  },

  addMember: async (payload) => {
    const { bizId } = get();
    if (!bizId) return;
    set({ loading: true, error: null });
    try {
      await addBusinessMember({ bizId, ...payload });
      set({ step: 7 });
    } catch (e) {
      set({ error: e?.message || 'Failed to add member' });
    }
    set({ loading: false });
  },

  setPrivacy: async (analyticsShare) => {
    const { bizId } = get();
    if (!bizId) return;
    set({ loading: true, error: null });
    try {
      await setBusinessPrivacy({ bizId, analyticsShare });
      set({ draft: { ...get().draft, privacy: { analyticsShare } }, step: 8 });
    } catch (e) {
      set({ error: e?.message || 'Failed to save privacy' });
    }
    set({ loading: false });
  },

  submit: async (review = false) => {
    const { bizId } = get();
    if (!bizId) return;
    set({ loading: true, error: null });
    try {
      const res = await submitBusiness({ bizId, review });
      set({ step: 9 });
      return res;
    } catch (e) {
      set({ error: e?.message || 'Failed to submit' });
    }
    set({ loading: false });
  },

  reset: () =>
    set({
      bizId: null,
      type: 'single',
      step: 0,
      draft: {},
      locations: [],
      loading: false,
      error: null,
    }),
}));
