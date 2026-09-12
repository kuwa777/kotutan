"use strict";
self.exports = self.exports || {};
importScripts('./lib/fflate.min.js');
self.onmessage = (e) => {
    const { chunkName, buffer } = e.data;
    try {
        const zipUint8 = new Uint8Array(buffer);
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
        self.postMessage(response);
    }
    catch (err) {
        const response = { chunkName, success: false, error: err.message || '解凍エラー' };
        self.postMessage(response);
    }
};
