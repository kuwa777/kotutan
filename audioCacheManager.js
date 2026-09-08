const CACHE_NAME = 'kotutan-audio-v1';
const MANIFEST_STORAGE_KEY = 'kotutan_audio_manifest_a1';
const CONCURRENCY_LIMIT = 4; // 同時取得数（通信安定性と速度の最適バランス）
const FETCH_TIMEOUT_MS = 5000; // 1ファイルあたりの応答許容時間（5秒）
export class AudioCacheManager {
    /**
     * 自己修復 ＆ 逐次保存つき A1/A2 音声同期メイン処理
     */
    static async syncAudioFiles(words, currentVersion, onProgress) {
        if (!('caches' in window))
            return;
        try {
            const cache = await caches.open(CACHE_NAME);
            // 1. 最新 A2 マニフェスト構築
            const manifestA2 = {};
            words.forEach(w => {
                if (w.audio) {
                    manifestA2[w.audio] = { version: currentVersion, updatedAt: Date.now() };
                }
                if (w.example_audio) {
                    manifestA2[w.example_audio] = { version: currentVersion, updatedAt: Date.now() };
                }
            });
            // 2. 前回記録 (A1) の安全ロード
            let manifestA1 = {};
            const savedA1 = localStorage.getItem(MANIFEST_STORAGE_KEY);
            if (savedA1) {
                try {
                    manifestA1 = JSON.parse(savedA1) || {};
                }
                catch (e) {
                    manifestA1 = {};
                }
            }
            // 3. Mark & Sweep 差分解析
            const downloadList = new Set();
            const deleteList = new Set();
            const checkedKeys = new Set();
            for (const filename in manifestA1) {
                if (filename in manifestA2) {
                    checkedKeys.add(filename);
                    if (manifestA1[filename]?.version !== currentVersion) {
                        downloadList.add(filename);
                    }
                }
                else {
                    deleteList.add(filename);
                }
            }
            for (const filename in manifestA2) {
                if (!checkedKeys.has(filename)) {
                    downloadList.add(filename);
                }
            }
            // 4. 不要音声の物理削除
            for (const filename of deleteList) {
                try {
                    const url = `audio/${filename}`;
                    await cache.delete(url);
                    delete manifestA1[filename];
                }
                catch (e) { }
            }
            const targets = Array.from(downloadList);
            // 差分が一切存在しない場合（全件取得完了済み）
            if (targets.length === 0) {
                localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(manifestA2));
                if (onProgress)
                    onProgress(0, 0, 100);
                return;
            }
            // 未取得が存在する場合、直ちに 0% 進捗を発行してプログレスバー表示へ切り替える
            if (onProgress) {
                onProgress(0, targets.length, 0);
            }
            // 5. 並列取得 ＆ 自己修復 (Self-Healing) ＆ 逐次アトミック保存
            let completed = 0;
            const total = targets.length;
            for (let i = 0; i < targets.length; i += CONCURRENCY_LIMIT) {
                const chunk = targets.slice(i, i + CONCURRENCY_LIMIT);
                await Promise.all(chunk.map(async (filename) => {
                    const url = `audio/${filename}`;
                    try {
                        // 【自己修復】通信前に Cache API 内の存在を確認（無駄な通信を100%回避）
                        const existingMatch = await cache.match(url);
                        const isVersionMismatch = manifestA1[filename]?.version && manifestA1[filename].version !== currentVersion;
                        if (existingMatch && !isVersionMismatch) {
                            manifestA1[filename] = manifestA2[filename];
                            return;
                        }
                        // 5秒タイムアウト保護付きネットワーク取得
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
                        const fetchOptions = {
                            signal: controller.signal,
                            cache: isVersionMismatch ? 'reload' : 'default'
                        };
                        const response = await fetch(url, fetchOptions);
                        clearTimeout(timeoutId);
                        if (response.ok) {
                            await cache.put(url, response);
                            manifestA1[filename] = manifestA2[filename];
                        }
                    }
                    catch (e) {
                        console.warn(`[AudioCache] タイムアウト/スキップ: ${filename} (次回起動時に自動再トライ)`);
                    }
                    finally {
                        completed++;
                        const percent = Math.floor((completed / total) * 100);
                        if (onProgress) {
                            onProgress(completed, total, percent);
                        }
                    }
                }));
                // チャンク（4件）ごとに成功結果を小刻みに保存（途中タスクキル耐性の確立）
                localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(manifestA1));
            }
        }
        catch (e) {
            console.error('[AudioCache] 同期中に安全に捕捉された例外:', e);
        }
    }
    /**
     * キャッシュ優先再生（自動メモリ解放フック付き）
     */
    static async getAudioElement(filename) {
        const url = `audio/${filename}`;
        try {
            if ('caches' in window) {
                const cache = await caches.open(CACHE_NAME);
                const response = await cache.match(url);
                if (response) {
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const audio = new Audio(blobUrl);
                    // 再生完了またはエラー時に Blob URL を破棄してメモリ解放
                    const cleanup = () => {
                        URL.revokeObjectURL(blobUrl);
                        audio.removeEventListener('ended', cleanup);
                        audio.removeEventListener('error', cleanup);
                    };
                    audio.addEventListener('ended', cleanup);
                    audio.addEventListener('error', cleanup);
                    return audio;
                }
            }
        }
        catch (e) { }
        return new Audio(url);
    }
}
