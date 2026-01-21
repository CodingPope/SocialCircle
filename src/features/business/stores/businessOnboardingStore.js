import { create } from 'zustand';
import { useSessionRole } from '../../profile/stores/sessionRoleStore';
import { createOrUpdateBusiness } from '../../../services/firebase/config';

export const BUSINESS_ONBOARDING_STAGES = Object.freeze({
  INTRO: 'intro',
  BASICS: 'basics',
  CONTACT: 'contact',
  DONE: 'done',
});

const initialForm = {
  displayName: '',
  category: '',
  description: '',
  logoUrl: '',
  contactEmail: '',
  phone: '',
  website: '',
  instagram: '',
  facebook: '',
  tiktok: '',
};

const initialState = {
  bizId: null,
  stage: BUSINESS_ONBOARDING_STAGES.INTRO,
  loading: false,
  error: null,
  form: { ...initialForm },
};

export const useBizOnboarding = create((set, get) => ({
  ...initialState,

  reset: () => set({ ...initialState }),

  clearError: () => set({ error: null }),

  start: async (uid = null, defaults = {}, existingBizId = null) => {
    if (!uid) {
      set({ error: 'Sign in required to start business setup' });
      return null;
    }
    set({ loading: true, error: null });
    try {
      useSessionRole.getState().setRole('business');
    } catch {}
    set({
      stage: BUSINESS_ONBOARDING_STAGES.BASICS,
      error: null,
      form: { ...initialForm, ...defaults },
      bizId: existingBizId || null,
      loading: false,
    });
    return 'started';
  },

  resumeLatestDraft: async (uid = null) => {
    if (!uid) {
      set({ stage: BUSINESS_ONBOARDING_STAGES.INTRO, bizId: null });
      return null;
    }
    set({ loading: true, error: null });
    try {
      useSessionRole.getState().setRole('business');
    } catch {}
    set({
      stage: BUSINESS_ONBOARDING_STAGES.BASICS,
      error: null,
      loading: false,
    });
    return { bizId: null, stage: BUSINESS_ONBOARDING_STAGES.BASICS };
  },

  updateField: (key, value) =>
    set((state) => ({ form: { ...state.form, [key]: value } })),

  submit: async (uid = null) => {
    if (!uid) {
      set({ error: 'Sign in required to submit' });
      return null;
    }
    const { form, bizId } = get();
    if (!form.displayName || !form.category) {
      set({ error: 'Business name and category are required' });
      return null;
    }

    set({ loading: true, error: null });
    try {
      const payload = {
        bizId: bizId || undefined,
        type: 'single',
        displayName: form.displayName,
        category: form.category,
        description: form.description || null,
        logoUrl: form.logoUrl || null,
        contactEmail: form.contactEmail || null,
        phone: form.phone || null,
        website: form.website || null,
        instagram: form.instagram || null,
        facebook: form.facebook || null,
        tiktok: form.tiktok || null,
      };
      const res = await createOrUpdateBusiness(payload);
      const nextBizId = res?.bizId || bizId || null;
      set({
        bizId: nextBizId,
        stage: BUSINESS_ONBOARDING_STAGES.DONE,
        loading: false,
      });
      return nextBizId;
    } catch (err) {
      set({
        error: err?.message || 'Failed to create business profile',
        loading: false,
      });
      return null;
    }
  },
}));
