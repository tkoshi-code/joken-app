const CACHE = 'joken-v34';
const FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function fetchWithTimeout(req, ms){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(r => { clearTimeout(t); resolve(r); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const isShared = e.request.url.includes('/data/shared.json');
  const isHTML = e.request.mode === 'navigate' || e.request.url.endsWith('/index.html');
  if (isHTML || isShared) {
    // ネットワーク優先(3秒でキャッシュへフォールバック): 常に最新版・オフラインでも動作
    // shared.jsonはキャッシュ回避クエリが毎回変わるため、クエリなしのキーで保存/参照する
    const cacheKey = isShared ? new URL(e.request.url).pathname : e.request;
    e.respondWith(
      fetchWithTimeout(e.request, 3000).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(cacheKey, clone));
        }
        return res;
      }).catch(() => caches.match(cacheKey).then(c => c || (isHTML ? caches.match('./index.html') : Response.error())))
    );
    return;
  }
  // その他の静的ファイルはキャッシュ優先 + バックグラウンド更新
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
