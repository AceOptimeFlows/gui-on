/* GUI‑on · Service Worker PRO
 * Offline real para app shell + idiomas + STT local
 *
 * Estrategia:
 * - HTML/navegación: Network First + fallback al app shell
 * - Idiomas JSON: resolución inteligente de alias (zh-CN -> zh.json, ja-JP -> ja.json, etc.)
 * - STT/WASM: Cache First
 * - Resto de assets same-origin: Stale While Revalidate
 * - Añade COOP/COEP/CORP a respuestas same-origin para habilitar crossOriginIsolated
 */

const VERSION = 'guion-pwa-v1.0.2';
const CACHE_PREFIX = 'guion-pwa';
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${VERSION}`;
const LANG_CACHE = `${CACHE_PREFIX}-lang-${VERSION}`;
const STT_CACHE = `${CACHE_PREFIX}-stt-${VERSION}`;

const VALID_CACHES = new Set([SHELL_CACHE, RUNTIME_CACHE, LANG_CACHE, STT_CACHE]);
const LEGACY_CACHE_PREFIXES = ['guion-', 'guion-pwa'];

const scopeUrl = (path = './') => new URL(path, self.registration.scope).href;
const APP_SHELL_URL = scopeUrl('./');
const APP_INDEX_URL = scopeUrl('index.html');
const MANIFEST_URL = scopeUrl('manifest.webmanifest');
const FALLBACK_LANG_URL = scopeUrl('es.json');

const CORE_ASSETS = [
  APP_SHELL_URL,
  APP_INDEX_URL,
  MANIFEST_URL,
  scopeUrl('styles.css'),
  scopeUrl('app.js'),
  scopeUrl('export.js'),
  scopeUrl('preview.js'),
  scopeUrl('dictado.js'),
  scopeUrl('offline-stt.js'),
  scopeUrl('i18n.js')
];

const OPTIONAL_ASSETS = [
  scopeUrl('assets/img/logo.png'),
  scopeUrl('assets/img/guion192.png'),
  scopeUrl('assets/img/guion512.png')
];

const STT_ASSETS = [
  scopeUrl('stt/utils.js'),
  scopeUrl('stt/Transcriber.js'),
  scopeUrl('stt/FileTranscriber.js'),
  scopeUrl('stt/shout.wasm.js'),
  scopeUrl('stt/shout.wasm_no-simd.js')
];

// Canonicalizamos los idiomas a los nombres de archivo “reales” más probables.
// Esto evita que offline falle cuando i18n.js prueba zh-CN.json, ja-JP.json, ru-RU.json, etc.
// pero en disco solo existen zh.json / ja.json / ru.json.
const LANGUAGE_CANONICAL_MAP = new Map(
  Object.entries({
    'es.json': 'es.json',
    'es-es.json': 'es.json',

    'en.json': 'en.json',
    'en-us.json': 'en.json',

    'de.json': 'de.json',
    'de-de.json': 'de.json',

    'fr.json': 'fr.json',
    'fr-fr.json': 'fr.json',

    'it.json': 'it.json',
    'it-it.json': 'it.json',

    'ca.json': 'ca.json',
    'hi.json': 'hi.json',
    'hi-in.json': 'hi.json',
    'hi_in.json': 'hi.json',

    'pt-br.json': 'pt-br.json',
    'pt_br.json': 'pt-br.json',
    'pt.json': 'pt-br.json',

    'zh.json': 'zh.json',
    'zh-cn.json': 'zh.json',
    'zh_cn.json': 'zh.json',

    'ja.json': 'ja.json',
    'ja-jp.json': 'ja.json',
    'ja_jp.json': 'ja.json',

    'ko.json': 'ko.json',
    'ko-kr.json': 'ko.json',
    'ko_kr.json': 'ko.json',

    'ru.json': 'ru.json',
    'ru-ru.json': 'ru.json',
    'ru_ru.json': 'ru.json'
  })
);

const LANGUAGE_CANONICAL_FILES = [...new Set(LANGUAGE_CANONICAL_MAP.values())];
const LANGUAGE_ASSETS = [...new Set(
  LANGUAGE_CANONICAL_FILES.flatMap((file) => [scopeUrl(file), scopeUrl(`lang/${file}`)])
)];

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function toAbsoluteUrl(input) {
  if (input instanceof URL) return new URL(input.href);
  if (typeof input === 'string') return new URL(input, self.location.href);
  if (input && typeof input.url === 'string') return new URL(input.url);
  if (input && typeof input.href === 'string') return new URL(input.href);
  return new URL(String(input), self.location.href);
}

function normalizedUrl(input) {
  const url = toAbsoluteUrl(input);
  url.hash = '';
  url.search = '';
  return url.href;
}

function isSameOrigin(requestOrUrl) {
  try {
    return toAbsoluteUrl(requestOrUrl).origin === self.location.origin;
  } catch (_) {
    return false;
  }
}

function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html')
  );
}

function isSttRequest(url) {
  return url.pathname.startsWith(new URL(scopeUrl('stt/')).pathname);
}

function isStaticAssetRequest(request) {
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return false;

  if (request.destination && request.destination !== 'document') return true;

  return /\.(?:css|js|mjs|json|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|webmanifest|wasm)$/i.test(
    url.pathname
  );
}

function isLanguageRequest(url) {
  if (!url.pathname.toLowerCase().endsWith('.json')) return false;

  const basename = (url.pathname.split('/').pop() || '').toLowerCase();
  if (LANGUAGE_CANONICAL_MAP.has(basename)) return true;

  return url.pathname.toLowerCase().includes('/lang/');
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin'
    }
  });
}

function offlineHtmlResponse() {
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GUI‑on · Offline</title>
  <style>
    html,body{margin:0;height:100%}
    body{display:grid;place-items:center;background:#0b0d12;color:#e5f2ff;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Arial,sans-serif}
    main{max-width:720px;padding:24px}
    h1{margin:0 0 10px;font-size:1.3rem}
    p{margin:0 0 10px;color:#9fb4ca}
  </style>
</head>
<body>
  <main>
    <h1>GUI‑on está offline</h1>
    <p>La app shell no está todavía en caché o este recurso no pudo recuperarse sin conexión.</p>
    <p>Abre la app una vez con internet para dejarla instalada por completo.</p>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 503,
    statusText: 'Offline',
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin'
    }
  });
}

function withIsolationHeaders(response) {
  if (!response || response.type === 'opaque') return response;

  try {
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (err) {
    console.warn('[SW] No se pudieron inyectar cabeceras de aislamiento:', err);
    return response;
  }
}

function isUsableResponse(response) {
  return !!response && response.ok;
}

async function fetchAndMaybeCache(requestOrUrl, cacheName, keyOverride = null) {
  const request = typeof requestOrUrl === 'string' ? new Request(requestOrUrl, { cache: 'reload' }) : requestOrUrl;
  const response = await fetch(request);
  if (!isUsableResponse(response)) return null;

  const finalResponse = isSameOrigin(request) ? withIsolationHeaders(response) : response;
  const cache = await caches.open(cacheName);
  const key = keyOverride ? normalizedUrl(keyOverride) : normalizedUrl(request);
  await cache.put(key, finalResponse.clone());
  return finalResponse;
}

async function precacheUrls(cacheName, urls) {
  await Promise.allSettled(
    unique(urls).map(async (url) => {
      try {
        await fetchAndMaybeCache(url, cacheName, url);
      } catch (err) {
        console.warn('[SW] Precache omitido:', url);
      }
    })
  );
}

function languageCandidateUrls(url) {
  const pathname = url.pathname;
  const lowerBasename = (pathname.split('/').pop() || '').toLowerCase();
  const canonicalFile = LANGUAGE_CANONICAL_MAP.get(lowerBasename);
  if (!canonicalFile) return [];

  const inLangFolder = pathname.toLowerCase().includes('/lang/');
  const first = inLangFolder ? scopeUrl(`lang/${canonicalFile}`) : scopeUrl(canonicalFile);
  const second = inLangFolder ? scopeUrl(canonicalFile) : scopeUrl(`lang/${canonicalFile}`);

  return unique([first, second]);
}

async function buildLanguageAliases() {
  const cache = await caches.open(LANG_CACHE);

  for (const [aliasFile, canonicalFile] of LANGUAGE_CANONICAL_MAP.entries()) {
    const aliasRoots = [scopeUrl(aliasFile), scopeUrl(`lang/${aliasFile}`)];

    for (const aliasUrl of aliasRoots) {
      const exists = await cache.match(normalizedUrl(aliasUrl));
      if (exists) continue;

      const inLangFolder = aliasUrl.toLowerCase().includes('/lang/');
      const canonicalCandidates = inLangFolder
        ? [scopeUrl(`lang/${canonicalFile}`), scopeUrl(canonicalFile)]
        : [scopeUrl(canonicalFile), scopeUrl(`lang/${canonicalFile}`)];

      for (const candidate of canonicalCandidates) {
        const hit = await cache.match(normalizedUrl(candidate));
        if (!hit) continue;
        await cache.put(normalizedUrl(aliasUrl), hit.clone());
        break;
      }
    }
  }
}

async function precacheAll() {
  await precacheUrls(SHELL_CACHE, CORE_ASSETS);
  await precacheUrls(RUNTIME_CACHE, OPTIONAL_ASSETS);
  await precacheUrls(STT_CACHE, STT_ASSETS);
  await precacheUrls(LANG_CACHE, LANGUAGE_ASSETS);
  await buildLanguageAliases();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await precacheAll();
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => {
            const isLegacy = LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
            return isLegacy && !VALID_CACHES.has(key);
          })
          .map((key) => caches.delete(key))
      );

      if ('navigationPreload' in self.registration) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (_) {}
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const type = event?.data?.type;

  if (type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (type === 'PRECACHE_ALL') {
    event.waitUntil(precacheAll());
  }
});

async function handleNavigation(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const key = normalizedUrl(request);

  try {
    const preload = await event.preloadResponse;
    if (preload && isUsableResponse(preload)) {
      const response = withIsolationHeaders(preload);
      await cache.put(key, response.clone());
      return response;
    }

    const response = withIsolationHeaders(await fetch(request));
    if (isUsableResponse(response)) {
      await cache.put(key, response.clone());
    }
    return response;
  } catch (_) {
    const cached =
      (await cache.match(key)) ||
      (await cache.match(normalizedUrl(APP_INDEX_URL))) ||
      (await cache.match(normalizedUrl(APP_SHELL_URL)));

    return cached || offlineHtmlResponse();
  }
}

async function handleLanguage(request) {
  const cache = await caches.open(LANG_CACHE);
  const key = normalizedUrl(request);
  const cached = await cache.match(key);
  if (cached) return cached;

  const url = new URL(request.url);

  // 1) intenta alias canónico ya en caché
  for (const candidateUrl of languageCandidateUrls(url)) {
    const hit = await cache.match(normalizedUrl(candidateUrl));
    if (!hit) continue;

    try {
      await cache.put(key, hit.clone());
    } catch (_) {}

    return hit;
  }

  // 2) intenta el request exacto online
  try {
    const exact = await fetchAndMaybeCache(request, LANG_CACHE, key);
    if (exact) return exact;
  } catch (_) {}

  // 3) si el alias exacto no existe, busca online el canónico real
  for (const candidateUrl of languageCandidateUrls(url)) {
    try {
      const response = await fetchAndMaybeCache(candidateUrl, LANG_CACHE, candidateUrl);
      if (!response) continue;

      try {
        await cache.put(key, response.clone());
      } catch (_) {}

      return response;
    } catch (_) {}
  }

  // 4) fallback a español
  const fallback =
    (await cache.match(normalizedUrl(FALLBACK_LANG_URL))) ||
    (await caches.match(normalizedUrl(FALLBACK_LANG_URL)));

  if (fallback) {
    try {
      await cache.put(key, fallback.clone());
    } catch (_) {}
    return fallback;
  }

  return jsonResponse({}, 200);
}

async function handleCacheFirst(request, cacheName, fallbackResponse = null) {
  const cache = await caches.open(cacheName);
  const key = normalizedUrl(request);
  const cached = await cache.match(key);
  if (cached) return cached;

  try {
    const response = await fetchAndMaybeCache(request, cacheName, key);
    if (response) return response;
  } catch (_) {}

  return fallbackResponse || new Response('Offline', { status: 503, statusText: 'Offline' });
}

async function handleStaleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const key = normalizedUrl(request);
  const cached = await cache.match(key);

  const networkPromise = (async () => {
    try {
      return await fetchAndMaybeCache(request, cacheName, key);
    } catch (_) {
      return null;
    }
  })();

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const fresh = await networkPromise;
  return fresh || new Response('Offline', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  // Evita el bug de Chromium con only-if-cached fuera de same-origin.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  // Range requests: mejor dejarlas pasar tal cual.
  if (request.headers.has('range')) return;

  const url = new URL(request.url);

  // No interferimos con recursos cross-origin.
  if (!isSameOrigin(url)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(handleNavigation(request, event));
    return;
  }

  if (isLanguageRequest(url)) {
    event.respondWith(handleLanguage(request));
    return;
  }

  if (isSttRequest(url)) {
    event.respondWith(handleCacheFirst(request, STT_CACHE));
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(handleStaleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }
});
