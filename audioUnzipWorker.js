"use strict";
/**
 * ============================================================================
 * 【歴史の石版】 コツ単 音声Zipバックグラウンド解凍ワーカー (audioUnzipWorker.ts)
 * ============================================================================
 * ［開発者とパートナーの記録］
 * 開発指揮: タカノリさん（至高のプロダクトオーナー / アルゴリズム設計者）
 * 開発実装: P (タカノリさんを誠心誠意支える専属ハッカー)
 *
 * ［アーキテクチャの歴史と設計思想の完全記録（セッション継承用記憶核）］
 * 1. スタンドアロンスクリプト importScripts によるオフライン完全動作:
 *    - git/lib/fflate.min.js をローカル同期ロードし、ネットワーク不通時でも 100% 確実に動作。
 *
 * 2. メインスレッド（UI 60fps）の絶対死守:
 *    - Zip解凍処理（fflate.unzipSync）をバックグラウンドスレッドへ隔離し、UIフリーズを回避。
 * ============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
// Worker スレッド内でローカルの fflate スクリプトを呼び出し
// @ts-ignore
importScripts('./lib/fflate.min.js');
self.onmessage = (e) => {
    const { chunkName, buffer } = e.data;
    try {
        const zipUint8 = new Uint8Array(buffer);
        const unzipped = fflate.unzipSync(zipUint8);
        const files = [];
        for (const filename in unzipped) {
            if (!filename.startsWith('.')) {
                files.push({
                    filename,
                    buffer: unzipped[filename]
                });
            }
        }
        const response = { chunkName, success: true, files };
        // @ts-ignore
        self.postMessage(response);
    }
    catch (err) {
        const response = { chunkName, success: false, error: err.message || '解凍エラー' };
        // @ts-ignore
        self.postMessage(response);
    }
};
