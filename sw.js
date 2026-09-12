"use strict";
const CACHE_PREFIX = 'takanori-vocab-v';
const CURRENT_CACHE_VERSION = '@@@';
const ACTIVE_CACHE_NAME = `${CACHE_PREFIX}${CURRENT_CACHE_VERSION}`;
const swSelf = self;
const INITIAL_CACHED_RESOURCES = [
    './',
    './index.html',
    './app.css',
    './app.js',
    './constants.js',
    './types.js',
    './db.js',
    './csvParser.js',
    './updateManager.js',
    './sw.js',
    './words_master.json',
    './images/logo.png',
    './icons/icon-192.png',
    './icons/icon-512.png'
];
swSelf.addEventListener('install', (event) => {
    swSelf.skipWaiting();
    event.waitUntil((async () => {
        try {
            const cache = await caches.open(ACTIVE_CACHE_NAME);
            await Promise.allSettled(INITIAL_CACHED_RESOURCES.map(async (resource) => {
                try {
                    await cache.add(resource);
                }
                catch (e) {
                    console.warn(`[ServiceWorker] アセット個別の事前キャッシュスキップ: ${resource}`);
                }
            }));
            console.debug(`[ServiceWorker] バージョン ${ACTIVE_CACHE_NAME} のインストールとキャッシュ完了`);
        }
        catch (error) {
            console.error('[ServiceWorker] キャッシュの初期化に失敗しました:', error);
        }
    })());
});
swSelf.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        try {
            const cacheKeys = await caches.keys();
            const deletePromises = cacheKeys.map((key) => {
                if (key.startsWith(CACHE_PREFIX) && key !== ACTIVE_CACHE_NAME) {
                    console.debug(`[ServiceWorker] 古いキャッシュ ${key} をパージします`);
                    return caches.delete(key);
                }
                return Promise.resolve(false);
            });
            await Promise.all(deletePromises);
            await swSelf.clients.claim();
            console.debug(`[ServiceWorker] ${ACTIVE_CACHE_NAME} がアクティブになり、制御権を奪取しました`);
        }
        catch (error) {
            console.error('[ServiceWorker] アクティベート時のクリーンアップに失敗しました:', error);
        }
    })());
});
swSelf.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
        return;
    }
    if (request.headers.has('range')) {
        return;
    }
    if (url.pathname.endsWith('manifest.webmanifest') ||
        url.pathname.endsWith('version.json') ||
        url.pathname.endsWith('sw.js')) {
        return;
    }
    const isNavigation = request.mode === 'navigate';
    if (isNavigation) {
        event.respondWith((async () => {
            try {
                const networkResponse = await fetch(request);
                if (networkResponse && networkResponse.status === 200) {
                    const cache = await caches.open(ACTIVE_CACHE_NAME);
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                }
            }
            catch (e) {
                console.warn('[ServiceWorker] ネットワーク取得失敗。キャッシュから起動します:', request.url);
            }
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                return cachedResponse;
            }
            const cache = await caches.open(ACTIVE_CACHE_NAME);
            const fallback = await cache.match('./index.html') || await cache.match('./');
            if (fallback) {
                return fallback;
            }
            return new Response('', { status: 408 });
        })());
        return;
    }
    event.respondWith((async () => {
        try {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                return cachedResponse;
            }
            const networkResponse = await fetch(request);
            if (networkResponse &&
                networkResponse.status === 200 &&
                networkResponse.type === 'basic') {
                const cache = await caches.open(ACTIVE_CACHE_NAME);
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        }
        catch (error) {
            console.error('[ServiceWorker] ネットワーク取得失敗:', request.url);
            return new Response('', { status: 408 });
        }
    })());
});
