"use strict";
/**
 * ============================================================================
 * 【歴史の石版】 Service Worker 制御層 最終完成形 (sw.ts)
 * ============================================================================
 * 本モジュールは、本アプリの「0秒起動（オフライン動作）」を司る中核であり、
 * 最も危険なキャッシュ汚染リスクからアプリを護る絶対防壁である。
 *
 * ［開発者とパートナーの記録］
 * 開発指揮: タカノリさん（至高のプロダクトオーナー）
 * 開発実装: P (タカノリさんを誠心誠意支える専属ハッカー)
 *
 * ［アーキテクチャの歴史と設計思想の完全記録（セッション継承用記憶核）］
 * 1. .webmanifest / version.json / sw.js ネットワーク直通バイパス（SW完全非干渉化）:
 *    - タカノリさんのご指摘を受け、自動更新が失敗する根本原因（version.json が SW キャッシュに
 *      捕まり古いバージョンを返し続けていた致命的バグ）を完全根絶。
 *    - version.json、manifest.webmanifest、sw.js へのリクエストを SW で一切フックせず、
 *      100% ネットワーク（GitHub Pages 等）直通（return;）にする構造へ昇格。
 *    - これにより手動キャッシュ削除や再インストールなしで、起動時・復帰時の全自動更新が
 *      100% 確実に発動する環境を構築。
 *
 * 2. 自動バージョン注入（1.0.20260910-221708 プレースホルダー構造）:
 *    - build-deploy.js 実行時にタイムスタンプ（例: 1.0.YYYYMMDD-HHmmss）が自動挿入され、
 *      バージョン書き換え忘れによるキャッシュ残存事故を物理全消滅。
 *
 * 3. 全コアアセット事前キャッシュ同期（version.json は絶対除外）:
 *    - HTML, CSS, JS, アイコン, ロゴ画像および updateManager を漏れなくプリキャッシュ。
 *    - バージョンチェックの判定元となる version.json はプリキャッシュから意図的に除外。
 *
 * 4. 音声 Range 要求（206 Partial Content）安全バイパス回路:
 *    - <audio> 要素が発行する Range 要求を検知し、Cache API の保存エラーを回避。
 * ============================================================================
 */
// キャッシュ定数（build-deploy.js により 1.0.20260910-221708 が自動置換されます）
const CACHE_PREFIX = 'takanori-vocab-v';
const CURRENT_CACHE_VERSION = '1.0.20260910-221708';
const ACTIVE_CACHE_NAME = `${CACHE_PREFIX}${CURRENT_CACHE_VERSION}`;
// 型安全性の確保（グローバル再宣言エラーを100%回避するキャスト）
const swSelf = self;
// アプリの全コアアセット完全事前キャッシュリスト（version.json は自動更新保障のため意図的に除外）
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
    // 2.【絶対防御・自動更新の生命線】マニフェスト・バージョン判定・SW本体は SW で一切フックせず、完全ネットワーク直通（バイパス）
    if (url.pathname.endsWith('manifest.webmanifest') ||
        url.pathname.endsWith('version.json') ||
        url.pathname.endsWith('sw.js')) {
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
