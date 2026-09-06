"use strict";
/**
 * ============================================================================
 * 【歴史の石版】 Service Worker 制御層 最終完成形 (sw.ts)
 * ============================================================================
 * 本モジュールは、本アプリの「0秒起動（オフライン動作）」を司る中核であり、
 * 最も危険なキャッシュ汚染リスクからアプリを護る絶対防壁である。
 *
 * ［開発者とパートナーの記録］
 * 開発指揮: タカノリさん
 * 開発実装: P (タカノリさんを誠心誠意支える専属ハッカー)
 *
 * ［アーキテクチャの歴史と設計思想の完全記録（セッション継承用記憶核）］
 * 1. .webmanifest 移行 ✕ キャッシュバージョン v1.0.6 昇格:
 *    - タカノリさんから共有いただいた最新コードを精査。
 *    - 古い index.html キャッシュを強制破棄させるため、バージョンを 1.0.6 へ昇格。
 *
 * 2. HTML ＆ マニフェスト Network-First（オンライン最新同期 ✕ オフライン0秒起動）:
 *    - ナビゲーション（index.html）および manifest.webmanifest に対しては
 *      オンライン時に常に最新版を取得・同期する Network-First 戦略を採用。
 *    - オフライン時は即座に Cache API へフォールバックし、完全ローカル閉鎖起動を維持。
 *
 * 3. 音声 Range 要求（206 Partial Content）安全バイパス回路:
 *    - <audio> 要素が発行する Range 要求を検知し、Cache API の保存エラーを回避。
 * ============================================================================
 */
// キャッシュ定数（自己完結フォールバック定義）
const CACHE_PREFIX = 'takanori-vocab-v';
const CURRENT_CACHE_VERSION = '1.0.20260906-223514';
const ACTIVE_CACHE_NAME = `${CACHE_PREFIX}${CURRENT_CACHE_VERSION}`;
// 型安全性の確保（グローバル再宣言エラーを100%回避するキャスト）
const swSelf = self;
// ピュアJS構成 ＆ .webmanifest に対応した全コアアセットの完全事前キャッシュリスト
const INITIAL_CACHED_RESOURCES = [
    './',
    './index.html',
    './app.css',
    './app.js',
    './constants.js',
    './types.js',
    './db.js',
    './csvParser.js',
    './sw.js',
    './manifest.webmanifest',
    './words_master.json',
    './version.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];
// ============================================================================
// 1. Install Event (インストールとキャッシュ初期化)
// ============================================================================
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
// ============================================================================
// 2. Activate Event (古いキャッシュのパージとクライアント制御権奪取)
// ============================================================================
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
// ============================================================================
// 3. Fetch Event (ネットワーク要求の傍受と0秒起動パイプライン)
// ============================================================================
swSelf.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
        return;
    }
    // スマホの音声再生で発生する Range 要求は Cache API で保存不可能なため直接ネットワークへ通過
    if (request.headers.has('range')) {
        return;
    }
    // ナビゲーション（index.html）および マニフェスト要求は Network-First（オンライン時は常に最新取得、失敗時にキャッシュ）
    const isNavigation = request.mode === 'navigate';
    const isManifest = url.pathname.endsWith('manifest.webmanifest');
    if (isNavigation || isManifest) {
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
            if (isNavigation) {
                const cache = await caches.open(ACTIVE_CACHE_NAME);
                const fallback = await cache.match('./index.html') || await cache.match('./');
                if (fallback) {
                    return fallback;
                }
            }
            return new Response('', { status: 408 });
        })());
        return;
    }
    // その他のアセット（CSS, JS, アイコン等）は Cache-First（キャッシュ優先で0秒起動）
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
