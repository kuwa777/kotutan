export class TakanoriAudioEngine {
    ctx = null;
    bufferCache = new Map();
    MAX_BUFFER_COUNT = 50;
    currentSourceNode = null;
    unlock() {
        try {
            if (!this.ctx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioContextClass();
            }
            if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
                this.ctx.resume().catch((err) => {
                    console.warn('[AudioEngine] 解錠時の非同期例外を安全に吸収:', err);
                });
            }
        }
        catch (e) {
            console.warn('[AudioEngine] AudioContext 初期化例外を吸収:', e);
        }
    }
    stop() {
        if (this.currentSourceNode) {
            try {
                this.currentSourceNode.onended = null;
                this.currentSourceNode.stop();
                this.currentSourceNode.disconnect();
            }
            catch (e) { }
            this.currentSourceNode = null;
        }
    }
    setCache(key, buffer) {
        if (this.bufferCache.has(key)) {
            this.bufferCache.delete(key);
        }
        else if (this.bufferCache.size >= this.MAX_BUFFER_COUNT) {
            const oldestKey = this.bufferCache.keys().next().value;
            if (oldestKey) {
                this.bufferCache.delete(oldestKey);
            }
        }
        this.bufferCache.set(key, buffer);
    }
    getCache(key) {
        const buffer = this.bufferCache.get(key);
        if (buffer) {
            this.bufferCache.delete(key);
            this.bufferCache.set(key, buffer);
        }
        return buffer;
    }
    async playArrayBuffer(filename, arrayBuffer, requestId, getLatestRequestId) {
        this.unlock();
        if (!this.ctx)
            return false;
        if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
            try {
                await this.ctx.resume();
            }
            catch (e) {
                console.warn('[AudioEngine] State resume 例外吸収:', e);
            }
        }
        this.stop();
        try {
            let audioBuffer = this.getCache(filename);
            if (!audioBuffer) {
                audioBuffer = await this.ctx.decodeAudioData(arrayBuffer.slice(0));
                this.setCache(filename, audioBuffer);
            }
            if (getLatestRequestId() !== requestId) {
                return false;
            }
            const source = this.ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.ctx.destination);
            source.onended = () => {
                try {
                    source.disconnect();
                }
                catch (e) { }
                if (this.currentSourceNode === source) {
                    this.currentSourceNode = null;
                }
            };
            source.start(0);
            this.currentSourceNode = source;
            return true;
        }
        catch (error) {
            console.warn(`[AudioEngine] Web Audio再生失敗 (${filename}):`, error);
            return false;
        }
    }
}
