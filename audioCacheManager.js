const CACHE_NAME = 'kotutan-audio-v1';
const CHUNKS_STORAGE_KEY = 'kotutan_audio_chunks_a1';
const FETCH_TIMEOUT_MS = 15000;
/**
 * ファイル拡張子から安全な MIME タイプを判定
 */
function getMimeType(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'm4a':
        case 'mp4':
            return 'audio/mp4';
        case 'wav':
            return 'audio/wav';
        case 'ogg':
            return 'audio/ogg';
        case 'aac':
            return 'audio/aac';
        case 'mp3':
        default:
            return 'audio/mpeg';
    }
}
export class AudioCacheManager {
    /**
     * 分割Zipチャンクのダウンロード ＆ 解凍同期処理（ざっくりパーセンテージ進捗通知）
     */
    static async syncAudioFiles(words, currentVersion, onProgress) {
        if (!('caches' in window) || !('Worker' in window))
            return;
        try {
            const cache = await caches.open(CACHE_NAME);
            // 1. chunks_info.json から各Zipのサイズメタデータを取得
            const infoRes = await fetch(`audio/chunks_info.json?t=${Date.now()}`);
            if (!infoRes.ok)
                return;
            const chunks = await infoRes.json();
            if (!Array.isArray(chunks) || chunks.length === 0)
                return;
            const totalBytes = chunks.reduce((sum, c) => sum + (c.size || 0), 0);
            if (totalBytes === 0)
                return;
            // 2. localStorage から取得済みチャンクをロード
            let completedChunksMap = {};
            const savedMap = localStorage.getItem(CHUNKS_STORAGE_KEY);
            if (savedMap) {
                try {
                    completedChunksMap = JSON.parse(savedMap) || {};
                }
                catch (e) { }
            }
            let currentCompletedBytes = chunks
                .filter(c => completedChunksMap[c.name])
                .reduce((sum, c) => sum + c.size, 0);
            const pendingChunks = chunks.filter(c => !completedChunksMap[c.name]);
            if (pendingChunks.length === 0) {
                if (onProgress)
                    onProgress(100);
                return;
            }
            // 進捗逆戻り防止ガード用変数
            let lastReportedPercent = 0;
            const reportProgress = (calculatedPercent) => {
                if (!onProgress)
                    return;
                const safePercent = Math.max(lastReportedPercent, Math.min(99, calculatedPercent));
                lastReportedPercent = safePercent;
                onProgress(safePercent);
            };
            const initialPercent = Math.floor((currentCompletedBytes / totalBytes) * 100);
            reportProgress(initialPercent);
            // 3. Web Worker の開始 (Classic Worker として読み込み)
            const worker = new Worker('audioUnzipWorker.js');
            try {
                for (const chunk of pendingChunks) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
                        const res = await fetch(`audio/${chunk.name}`, { signal: controller.signal });
                        clearTimeout(timeoutId);
                        if (!res.ok)
                            continue;
                        // ダウンロード完了時点（該打包サイズの 50% 重みを進捗加算）
                        const downloadWeightBytes = Math.floor(chunk.size * 0.5);
                        let interimBytes = currentCompletedBytes + downloadWeightBytes;
                        reportProgress(Math.floor((interimBytes / totalBytes) * 100));
                        const zipBuffer = await res.arrayBuffer();
                        // Worker へ解凍要求（10秒解凍タイムアウト保護付き）
                        const unzipResult = await new Promise((resolve) => {
                            let workerTimeoutId;
                            const handleMessage = (e) => {
                                if (e.data.chunkName === chunk.name) {
                                    clearTimeout(workerTimeoutId);
                                    worker.removeEventListener('message', handleMessage);
                                    resolve(e.data);
                                }
                            };
                            workerTimeoutId = window.setTimeout(() => {
                                worker.removeEventListener('message', handleMessage);
                                resolve({ chunkName: chunk.name, success: false, error: '解凍タイムアウト' });
                            }, 10000);
                            worker.addEventListener('message', handleMessage);
                            worker.postMessage({ chunkName: chunk.name, buffer: zipBuffer }, [zipBuffer]);
                        });
                        if (unzipResult.success && unzipResult.files) {
                            for (const file of unzipResult.files) {
                                const audioUrl = `audio/${file.filename}`;
                                const mimeType = getMimeType(file.filename);
                                const response = new Response(file.buffer, {
                                    headers: { 'Content-Type': mimeType }
                                });
                                await cache.put(audioUrl, response);
                            }
                            completedChunksMap[chunk.name] = true;
                            localStorage.setItem(CHUNKS_STORAGE_KEY, JSON.stringify(completedChunksMap));
                            // 解凍・格納完了時点（残り 50% 重みを確定加算）
                            currentCompletedBytes += chunk.size;
                            reportProgress(Math.floor((currentCompletedBytes / totalBytes) * 100));
                        }
                    }
                    catch (e) {
                        console.warn(`[AudioCache] チャンク処理スキップ (${chunk.name}):`, e);
                    }
                }
                if (onProgress)
                    onProgress(100);
            }
            finally {
                worker.terminate();
            }
        }
        catch (e) {
            console.error('[AudioCache] チャンク同期例外:', e);
        }
    }
    /**
     * キャッシュ優先再生（Blob URL メモリ全自動解放付き）
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
