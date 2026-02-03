const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { SHARE_CONFIG, JOIN_CALLABLE_OPTIONS } = require('../shared/config');
const { truncate } = require('../shared/helpers');
const admin = require('firebase-admin');
const { logger } = require('firebase-functions/v2');
const fetch = require('node-fetch');

const db = admin.firestore();

const buildShareTargetUrl = (type, id) => {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'event') return `${SHARE_CONFIG.previewBase}/event/${id}`;
  if (normalized === 'post') return `${SHARE_CONFIG.previewBase}/post/${id}`;
  return `${SHARE_CONFIG.previewBase}/user/${id}`;
};

const createShortDynamicLink = async ({ link, title, description, imageUrl }) => {
  if (!SHARE_CONFIG.apiKey || !SHARE_CONFIG.domainUriPrefix) return null;
  const body = {
    dynamicLinkInfo: {
      domainUriPrefix: SHARE_CONFIG.domainUriPrefix,
      link,
      iosInfo: {
        iosBundleId: SHARE_CONFIG.iosBundleId,
        iosAppStoreId: SHARE_CONFIG.iosAppStoreId,
        iosFallbackLink: SHARE_CONFIG.iosFallbackUrl || undefined,
      },
      androidInfo: {
        androidPackageName: SHARE_CONFIG.androidPackageName,
        androidFallbackLink: SHARE_CONFIG.androidFallbackUrl || undefined,
      },
      socialMetaTagInfo: {
        socialTitle: title || undefined,
        socialDescription: description || undefined,
        socialImageLink: imageUrl || undefined,
      },
    },
  };

  const url = `https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=${SHARE_CONFIG.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.warn('[shareGenerateLink] shortLink failed', res.status, text);
    return null;
  }
  const json = await res.json();
  return json?.shortLink || null;
};

async function buildEventPreview(eventId) {
  const snap = await db.collection('events').doc(eventId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Event not found');
  const data = snap.data() || {};
  const title = truncate(data.title || 'Social Circle Event', 80);
  const description = truncate(data.description || '', 160);
  const imageUrl = data.imageUrl || data.coverImage || null;
  return { title, description, imageUrl };
}

async function buildPostPreview(postId) {
  const snap = await db.collection('interestPosts').doc(postId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Post not found');
  const data = snap.data() || {};
  const title = truncate(data.title || data.topic || 'Social Circle Post', 80);
  const description = truncate(data.content || '', 160);
  const imageUrl = data.imageUrl || data.mediaUrl || null;
  return { title, description, imageUrl };
}

async function buildProfilePreview(userId) {
  const snap = await db.collection('users').doc(userId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const data = snap.data() || {};
  const title = truncate(
    data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Social Circle Profile',
    80,
  );
  const description = truncate(data.bio || data.tagline || '', 160);
  const imageUrl = data.photoURL || data.avatarURL || data.profileImage || null;
  return { title, description, imageUrl };
}

const shareGenerateLink = onCall(JOIN_CALLABLE_OPTIONS, async (req) => {
  const { type, id } = req.data || {};
  if (!type || !id) {
    throw new HttpsError('invalid-argument', 'type and id are required');
  }
  const normalized = type.toString().toLowerCase();

  let preview;
  if (normalized === 'event') {
    preview = await buildEventPreview(id);
  } else if (normalized === 'post') {
    preview = await buildPostPreview(id);
  } else if (normalized === 'profile' || normalized === 'user') {
    preview = await buildProfilePreview(id);
  } else {
    throw new HttpsError('invalid-argument', 'Unsupported share type');
  }

  const targetUrl = buildShareTargetUrl(normalized, id);
  const shortLink = await createShortDynamicLink({
    link: targetUrl,
    title: preview.title,
    description: preview.description,
    imageUrl: preview.imageUrl,
  });

  return {
    url: shortLink || targetUrl,
    target: targetUrl,
    preview,
    shareable: { type: normalized, id },
  };
});

const sharePreview = onRequest({ region: 'us-central1' }, async (req, res) => {
  try {
    const type = req.query?.type || req.query?.t;
    const id = req.query?.id;
    if (!type || !id) {
      res.status(400).send('Missing type or id');
      return;
    }
    const normalized = type.toString().toLowerCase();
    let preview;
    if (normalized === 'event') {
      preview = await buildEventPreview(id);
    } else if (normalized === 'post') {
      preview = await buildPostPreview(id);
    } else if (normalized === 'profile' || normalized === 'user') {
      preview = await buildProfilePreview(id);
    } else {
      res.status(400).send('Unsupported type');
      return;
    }

    const title = truncate(preview.title, 70) || 'Social Circle';
    const description = truncate(preview.description, 160);
    const image = preview.imageUrl;
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    ${image ? `<meta property="og:image" content="${image}" />` : ''}
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${image ? `<meta name="twitter:image" content="${image}" />` : ''}
    <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #111827, #1f2937); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #fff; }
      .card { max-width: 520px; padding: 32px; background: rgba(17, 24, 39, 0.85); border-radius: 20px; text-align: center; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45); }
      h1 { font-size: 26px; margin-bottom: 12px; }
      p { font-size: 17px; line-height: 1.5; margin-bottom: 28px; color: rgba(229, 231, 235, 0.9); }
      a { display: inline-flex; align-items: center; justify-content: center; padding: 14px 22px; border-radius: 999px; background: linear-gradient(135deg, #2563eb, #9333ea); color: #fff; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${description}</p>
      <a href="https://apps.apple.com/us/app/id000000000">Open in Social Circle</a>
    </div>
  </body>
</html>`;

    res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.status(200).send(html);
  } catch (err) {
    logger.error('[sharePreview] failed', err);
    res.status(500).send('Unable to render preview');
  }
});

module.exports = {
  shareGenerateLink,
  sharePreview,
};

