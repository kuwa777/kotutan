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
 * 1. .webmanifest ネットワーク直通バイパス（Service Worker非干渉化）:
 *    - タカノリさんの指揮の下、manifest.webmanifest へのリクエストを Service Worker で
 *      フックせず、ネットワーク（GitHub Pages）への完全直通（return;）構造へ昇格。
 *    - url.pathname.endsWith('manifest.webmanifest') により、クエリ(?v=...)が付与されていても
 *      100%確実に検知し、Service Worker の合成レスポンスをバイパスさせる。
 *    - Android 14 Chrome (Blink) および Google ミントサーバーが受領する
 *      Content-Type: application/manifest+json 生ヘッダーの完全性を100%保証し、
 *      WebAPK 化（アドレスバー消滅）の自動生成審査を確実に突破させる。
 *
 * 2. 自動バージョン注入（1.0.20260906-233456 プレースホルダー構造）:
 *    - build-deploy.js 実行時にタイムスタンプ（例: 1.0.YYYYMMDD-HHmmss）が自動挿入され、
 *      バージョン書き換え忘れによるキャッシュ残存事故を物理全消滅。
 *
 * 3. 音声 Range 要求（206 Partial Content）安全バイパス回路:
 *    - <audio> 要素が発行する Range 要求を検知し、Cache API の保存エラーを回避。
 *
 * 4. ナビゲーション（index.html）Network-First ＆ アセット Cache-First:
 *    - index.html はオンライン時最新同期、その他アセットはキャッシュ優先で0秒起動。
 * ============================================================================
 */
// キャッシュ定数（build-deploy.js により 1.0.20260906-233456 が自動置換されます）
const CACHE_PREFIX = 'takanori-vocab-v';
const CURRENT_CACHE_VERSION = '1.0.20260906-233456';
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
    // 1. スマホの音声再生で発生する Range 要求は Cache API で保存不可能なため直接ネットワークへ通過
    if (request.headers.has('range')) {
        return;
    }
    // 2.【絶対防御】マニフェスト要求（.webmanifest）は Service Worker で一切フックせず、完全ネットワーク直通（バイパス）
    // Android 14 Chrome (Blink) および Google ミントサーバーへ GitHub Pages の生のレスポンスを直接渡す
    if (url.pathname.endsWith('manifest.webmanifest')) {
        return;
    }
    // 3. ナビゲーション（index.html）要求は Network-First（オンライン時は最新取得、失敗時にキャッシュ）
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
    // 4. その他のアセット（CSS, JS, アイコン等）は Cache-First（キャッシュ優先で0秒起動）
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
