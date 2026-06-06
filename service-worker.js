/**
 * 香川手冊 Service Worker v29
 * 策略：NetworkFirst（主要），CacheFirst（靜態資源）
 * 離線時從 Cache 回退，確保手冊可完整閱讀
 */

const CACHE_NAME = 'kagawa-handbook-v29';

// 安裝時預快取的核心檔案
const CORE_FILES = [
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
];

// ── Install：預快取核心檔 ─────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing v29...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_FILES).catch(err => {
        console.warn('[SW] 部分核心檔快取失敗（可忽略）:', err);
      });
    })
  );
  // 立即啟用，不等舊 SW 結束
  self.skipWaiting();
});

// ── Activate：清理舊 Cache ───────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating v29...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] 刪除舊 Cache:', k);
            return caches.delete(k);
          })
      )
    )
  );
  return self.clients.claim();
});

// ── Fetch：NetworkFirst + Cache Fallback ────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;

  // 只處理 GET、跳過 chrome-extension 等非 http 請求
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;

  // Google Fonts：CacheFirst（字型不常更新）
  if (req.url.includes('fonts.googleapis.com') ||
      req.url.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // 其餘：NetworkFirst（取最新，失敗才從 Cache）
  event.respondWith(networkFirst(req));
});

// NetworkFirst：嘗試網路，失敗從 Cache 回退
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // 若連離線頁都沒有，回傳簡單提示
    return new Response(
      '<h2 style="font-family:sans-serif;padding:20px">📴 離線模式：請先連線載入一次手冊</h2>',
      { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }
}

// CacheFirst：先從 Cache，沒有才去網路
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    return new Response('', { status: 503 });
  }
}
