// Description: Simplified Zustand store powering the streamlined business onboarding flow.
import { create } from 'zustand';
import {
  createBusinessDraft,
  updateBusinessBasics,
  addBusinessLocation,
  submitBusiness,
  db,
} from '../../../services/firebase/config';
import { useSessionRole } from '../../profile';
import logger from '../../../lib/logger';

export const BUSINESS_ONBOARDING_STAGES = Object.freeze({
  INTRO: 'intro',
  BASICS: 'basics',
  LOCATION: 'location',
  REVIEW: 'review',
  DONE: 'done',
});

const deriveStage = (draft = {}, locations = []) => {
  if (!draft || Object.keys(draft).length === 0) {
    return BUSINESS_ONBOARDING_STAGES.INTRO;
  }
  if (!draft.displayName || !draft.category) {
    return BUSINESS_ONBOARDING_STAGES.BASICS;
  }
  if (!Array.isArray(locations) || locations.length === 0) {
    return BUSINESS_ONBOARDING_STAGES.LOCATION;
  }
  const status = String(draft.status || 'draft').toLowerCase();
  if (status === 'active') {
    return BUSINESS_ONBOARDING_STAGES.DONE;
  }
  return BUSINESS_ONBOARDING_STAGES.REVIEW;
};

const loadDraftFromFirestore = async (bizId) => {
  if (!bizId || !db) return null;
  try {
    const ref = db.collection('businesses').doc(bizId);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    let locations = [];
    try {
      const locSnap = await ref.collection('locations').get();
      locations = locSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() || {}),
      }));
    } catch (err) {
      logger.warn(
        '[bizOnboarding] Failed to load locations',
        err?.message || err
      );
    }
    return { id: snap.id, data, locations };
  } catch (err) {
    logger.warn(
      '[bizOnboarding] loadDraftFromFirestore error',
      err?.message || err
    );
    return null;
  }
};

const sessionRoleStore = useSessionRole;

const initialState = {
  bizId: null,
  type: 'single',
  loading: false,
  error: null,
  draft: null,
  locations: [],
  hydrated: false,
  stage: BUSINESS_ONBOARDING_STAGES.INTRO,
  primaryLocationId: null,
};

export const useBizOnboarding = create((set, get) => ({
  ...initialState,

  clearError: () => set({ error: null }),

  resumeLatestDraft: async (uid, { force = false } = {}) => {
    if (!uid) {
      set({
        hydrated: true,
        stage: BUSINESS_ONBOARDING_STAGES.INTRO,
        bizId: null,
      });
      return null;
    }

    const state = get();
    if (!force && state.hydrated && state.bizId) {
      return {
        bizId: state.bizId,
        draft: state.draft,
        locations: state.locations,
        stage: state.stage,
      };
    }

    set({ loading: true, error: null });
    try {
      const query = await db
        .collection('businesses')
        .where('ownerId', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();

      if (query.empty) {
        set({
          ...initialState,
          hydrated: true,
          loading: false,
        });
        try {
          sessionRoleStore
            .getState()
            .setNextBusinessRoute('BusinessOnboarding');
        } catch {}
        return null;
      }

      const preferred = query.docs.find((doc) => {
        const status = String(doc.data()?.status || 'draft').toLowerCase();
        return status === 'draft' || status === 'pending_review';
      });

      const targetDoc = preferred || query.docs[0];
      const draftSnapshot = await loadDraftFromFirestore(targetDoc.id);

      if (!draftSnapshot) {
        set({ ...initialState, hydrated: true, loading: false });
        try {
          sessionRoleStore
            .getState()
            .setNextBusinessRoute('BusinessOnboarding');
        } catch {}
        return null;
      }

      const { data, locations } = draftSnapshot;
      const stage = deriveStage(data, locations);

      set({
        bizId: draftSnapshot.id,
        type: data.type || 'single',
        draft: data,
        locations,
        stage,
        hydrated: true,
        loading: false,
        error: null,
        primaryLocationId: locations?.[0]?.id || null,
      });

      try {
        sessionRoleStore.getState().setRole('business');
        const status = String(data.status || 'draft').toLowerCase();
        sessionRoleStore
          .getState()
          .setNextBusinessRoute(
            status === 'active' || status === 'pending_review'
              ? 'BusinessTabs'
              : 'BusinessOnboarding'
          );
      } catch {}

      return { ...draftSnapshot, stage };
    } catch (err) {
      set({
        error: err?.message || 'Failed to load business draft',
        loading: false,
        hydrated: true,
      });
      try {
        sessionRoleStore.getState().setNextBusinessRoute('BusinessOnboarding');
      } catch {}
      return null;
    }
  },

  refreshDraft: async ({ silent = false } = {}) => {
    const { bizId } = get();
    if (!bizId) return null;

    if (!silent) {
      set({ loading: true, error: null });
    }

    try {
      const draftSnapshot = await loadDraftFromFirestore(bizId);
      if (!draftSnapshot) {
        throw new Error('Business draft not found');
      }

      const { data, locations } = draftSnapshot;
      const stage = deriveStage(data, locations);

      set({
        draft: data,
        locations,
        type: data.type || get().type || 'single',
        stage,
        hydrated: true,
        primaryLocationId: locations?.[0]?.id || null,
      });

      try {
        sessionRoleStore.getState().setRole('business');
        const status = String(data.status || 'draft').toLowerCase();
        sessionRoleStore
          .getState()
          .setNextBusinessRoute(
            status === 'active' || status === 'pending_review'
              ? 'BusinessTabs'
              : 'BusinessOnboarding'
          );
      } catch {}

      return { ...draftSnapshot, stage };
    } catch (err) {
      set({ error: err?.message || 'Failed to refresh business draft' });
      return null;
    } finally {
      if (!silent) {
        set({ loading: false });
      }
    }
  },

  start: async (uid = null) => {
    set({ loading: true, error: null });
    try {
      // Description: Validate uid is provided (should come from AuthContext)
      if (!uid) {
        throw new Error('Not authenticated. Please sign in to continue.');
      }

      logger.debug('[bizOnboarding] Starting business draft');

      // Description: Call createBusinessDraft - auth validation happens in callCallable
      const res = await createBusinessDraft('single');

      if (!res?.bizId) {
        throw new Error('Business draft could not be created');
      }

      logger.debug(`[bizOnboarding] Business draft created: ${res.bizId}`);

      const draft = { type: 'single', status: 'draft' };

      set({
        bizId: res.bizId,
        type: 'single',
        draft,
        locations: [],
        stage: BUSINESS_ONBOARDING_STAGES.BASICS,
        hydrated: true,
        primaryLocationId: null,
      });

      try {
        sessionRoleStore.getState().setRole('business');
        sessionRoleStore.getState().setNextBusinessRoute('BusinessOnboarding');
      } catch {}

      return res.bizId;
    } catch (err) {
      const errorMsg = err?.message || 'Failed to start business setup';
      console.error('[bizOnboarding] start error:', errorMsg, err);
      set({ error: errorMsg });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  saveBasics: async (payload = {}) => {
    const { bizId, draft, locations } = get();
    if (!bizId) {
      set({ error: 'Missing business draft. Start onboarding again.' });
      return false;
    }

    const normalized = {
      displayName: String(payload.displayName || '').trim(),
      category: String(payload.category || '').trim(),
      description: String(payload.description || '').trim() || null,
      website: String(payload.website || '').trim() || null,
      supportEmail: String(payload.supportEmail || '').trim() || null,
      phone: String(payload.phone || '').trim() || null,
    };

    if (!normalized.displayName || !normalized.category) {
      set({ error: 'Business name and category are required.' });
      return false;
    }

    set({ loading: true, error: null });
    try {
      // Description: Auth validation happens in callCallable
      await updateBusinessBasics({ bizId, ...normalized });
      const nextDraft = { ...(draft || {}), ...normalized };
      const stage = deriveStage(nextDraft, locations);
      set({ draft: nextDraft, stage });
      return true;
    } catch (err) {
      set({ error: err?.message || 'Failed to save basics' });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  saveLocation: async (payload = {}) => {
    const { bizId, primaryLocationId } = get();
    if (!bizId) {
      set({ error: 'Missing business draft. Start onboarding again.' });
      return false;
    }

    if (
      typeof payload.latitude !== 'number' ||
      typeof payload.longitude !== 'number'
    ) {
      set({ error: 'Location coordinates are required.' });
      return false;
    }

    const body = {
      label: String(payload.label || '').trim(),
      address: String(payload.address || '').trim(),
      city: String(payload.city || '').trim(),
      state: String(payload.state || '').trim(),
      country: String(payload.country || 'US').trim() || 'US',
      latitude: payload.latitude,
      longitude: payload.longitude,
    };

    if (!body.address || !body.city) {
      set({ error: 'Address and city are required.' });
      return false;
    }

    set({ loading: true, error: null });
    try {
      // Description: Auth validation happens in callCallable
      await addBusinessLocation({
        bizId,
        ...body,
        locId: primaryLocationId || undefined,
      });
      await get().refreshDraft({ silent: true });
      const nextStage = deriveStage(get().draft, get().locations);
      set({
        stage: nextStage,
        primaryLocationId: get().locations?.[0]?.id || primaryLocationId,
      });
      return true;
    } catch (err) {
      set({ error: err?.message || 'Failed to save location' });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  submit: async (review = true) => {
    const { bizId } = get();
    if (!bizId) {
      set({ error: 'Missing business draft. Start onboarding again.' });
      return null;
    }

    set({ loading: true, error: null });
    try {
      // Description: Auth validation happens in callCallable
      const res = await submitBusiness({ bizId, review });
      await get().refreshDraft({ silent: true });
      return res;
    } catch (err) {
      set({ error: err?.message || 'Failed to submit' });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  reset: () => set({ ...initialState }),
}));
