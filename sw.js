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
 * 1. .webmanifest 移行に伴うキャッシュ整合性の完全確保:
 *    - タカノリさんの発見に基づき、GitHub Pages の application/manifest+json 配信仕様
 *      に適合させるため、事前キャッシュリストの参照先を ./manifest.webmanifest へ完全変更。
 *    - キャッシュバージョンを v1.0.5 に更新し、旧キャッシュをパージ。
 *    - オフラインキャッシュ時の 404 例外を防止し、WebAPK 審査を確定で通過させる。
 *
 * 2. 音声 Range 要求（206 Partial Content）安全バイパス回路:
 *    - スマホ端末の <audio> 要素が発行する Range 要求を検知し、Cache API の保存エラーを回避。
 *    - 破綻なき通信例外保護 ＆ 0秒起動パイプラインを強固に防衛。
 * ============================================================================
 */
// キャッシュ定数（自己完結フォールバック定義）
const CACHE_PREFIX = 'takanori-vocab-v';
const CURRENT_CACHE_VERSION = '1.0.5';
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
            if (request.mode === 'navigate') {
                const cache = await caches.open(ACTIVE_CACHE_NAME);
                const fallback = await cache.match('./index.html') || await cache.match('./');
                if (fallback) {
                    return fallback;
                }
                return new Response('<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>コツ単</title></head><body><script>location.reload();</script></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
            }
            return new Response('', { status: 408 });
        }
    })());
});
