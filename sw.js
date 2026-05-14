// ╔══════════════════════════════════════════╗
// ║   Budget Queen — Service Worker v2      ║
// ╚══════════════════════════════════════════╝
// v2: přidán Firebase SDK do pre-cache pro plný offline na mobilu

const CACHE = 'bq-v4';

// Co se předem stáhne při instalaci (app shell + Firebase SDK)
// App shell — tyto soubory musí být dostupné offline
const PRECACHE = [
  '/BudgetQueen/',
  '/BudgetQueen/index.html',
  '/BudgetQueen/style.css',
  '/BudgetQueen/app.js',
  '/BudgetQueen/firebase.js',
  '/BudgetQueen/manifest.json',
  '/BudgetQueen/icon.svg',
];

// Firebase SDK — cachuje se za provozu (stale-while-revalidate), NE při instalaci
// Důvod: selhání CDN při instalaci by zrušilo celý service worker
const PRECACHE_OPTIONAL = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
];

// Tyto URL vždy ze sítě — Firebase API volání (nikoli SDK soubory)
const NETWORK_ONLY_PATTERNS = [
  'firestore.googleapis.com',       // Firestore API
  'identitytoolkit.googleapis.com', // Firebase Auth API
  'securetoken.googleapis.com',     // Token refresh
  'accounts.google.com',            // Google OAuth
];

// ── INSTALL: předem cachuj app shell + Firebase SDK ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: vymaž staré cache + warm-up Firebase SDK ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => caches.open(CACHE).then(cache =>
        // Firebase SDK stáhni na pozadí po aktivaci — chyby ignoruj
        Promise.allSettled(PRECACHE_OPTIONAL.map(url =>
          fetch(url).then(r => { if (r.ok) cache.put(url, r); }).catch(() => {})
        ))
      ))
  );
});

// ── FETCH: obsluž požadavky ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // Pouze GET požadavky
  if (request.method !== 'GET') return;

  // Firebase API volání → vždy ze sítě, nikdy necachuj
  if (NETWORK_ONLY_PATTERNS.some(p => url.includes(p))) return;

  // Stale-while-revalidate:
  // → okamžitě z cache, aktualizuj na pozadí
  // → pokud není v cache, čekej na síť
  // → pokud offline a cache prázdná, vrať app shell
  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(request).then(cached => {
        const networkFetch = fetch(request)
          .then(response => {
            if (response && response.status === 200 && response.type !== 'opaque') {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        return cached ?? networkFetch ?? caches.match('/BudgetQueen/');
      })
    )
  );
});
