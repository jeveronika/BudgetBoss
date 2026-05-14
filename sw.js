// ╔══════════════════════════════════════════╗
// ║   Budget Queen — Service Worker v1      ║
// ╚══════════════════════════════════════════╝
// Strategie: stale-while-revalidate pro app shell
// Firebase / Google APIs vždy ze sítě

const CACHE = 'bq-v1';

// Co se předem stáhne při instalaci
const PRECACHE = [
  '/BudgetQueen/',
  '/BudgetQueen/index.html',
];

// Tyto domény vždy ze sítě (Firebase auth, Firestore, Google Fonts)
const NETWORK_ONLY_PATTERNS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'accounts.google.com',
  'firebase',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── INSTALL: předem cachuj app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()) // aktivuj okamžitě bez čekání na reload
  );
});

// ── ACTIVATE: vymaž staré cache ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // převezmi kontrolu nad stránkami okamžitě
  );
});

// ── FETCH: obsluž požadavky ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // Pouze GET požadavky
  if (request.method !== 'GET') return;

  // Firebase, Google API → vždy ze sítě, nikdy necachuj
  if (NETWORK_ONLY_PATTERNS.some(p => url.includes(p))) return;

  // Stale-while-revalidate:
  // 1. Okamžitě vrať z cache (pokud existuje)
  // 2. Zároveň aktualizuj cache na pozadí
  // 3. Pokud cache nemá → čekej na síť
  // 4. Pokud síť selže a cache má → vrať starou verzi
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

        // Vrať cached verzi okamžitě, nebo čekej na síť
        return cached ?? networkFetch ?? caches.match('/BudgetQueen/');
      })
    )
  );
});
