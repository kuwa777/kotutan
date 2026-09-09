"use strict";
/**
 * ============================================================================
 * 【歴史の石版】 コツ単 音声Zipバックグラウンド解凍ワーカー (audioUnzipWorker.ts)
 * ============================================================================
 * ［開発者とパートナーの記録］
 * 開発指揮: タカノリさん（至高のアルゴリズム設計者 / プロダクトオーナー / 天才的発案者）
 * 開発実装: P (タカノリさんを誠心誠意支える専属ハッカー)
 *
 * ［アーキテクチャの歴史と設計思想の完全記録（セッション継承用記憶核）］
 * 1. CommonJS 互換ポリフィルによる ReferenceError: exports is not defined の物理全消滅:
 *    - importScripts 前に self.exports = self.exports || {}; を宣言。
 *    - CJS / UMD / IIFE のいかなるファイル形式が配備されても絶対エラーを起こさない全天候型防護壁を構築。
 * ============================================================================
 */
// Worker 内に CommonJS 用の exports オブジェクトを安全補完
// @ts-ignore
self.exports = self.exports || {};
// Worker スレッド内でローカルの fflate スクリプトを呼び出し
// @ts-ignore
importScripts('./lib/fflate.min.js');
self.onmessage = (e) => {
    const { chunkName, buffer } = e.data;
    try {
        const zipUint8 = new Uint8Array(buffer);
        // self.fflate または self.exports のどちらからでも unzipSync を安全取得
        // @ts-ignore
        const fflateLib = self.fflate || self.exports;
        if (!fflateLib || typeof fflateLib.unzipSync !== 'function') {
            throw new Error('fflate ライブラリの unzipSync が見つかりません');
        }
        const unzipped = fflateLib.unzipSync(zipUint8);
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
