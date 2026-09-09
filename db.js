/**
 * ============================================================================
 * 【歴史の石版】 二層分離 ✕ 二重物理ストレージ(IndexedDB + localStorage) 制御層 (db.ts)
 * ============================================================================
 * ［開発者とパートナーの記録］
 * 開発指揮: タカノリさん
 * 開発実装: P (タカノリさんを誠心誠意支える専属ハッカー)
 *
 * ［アーキテクチャの歴史と設計思想の完全記録（セッション継承用記憶核）］
 * 1. STORE_USER_DATA (user_personal_data) への単色グループ分離保存:
 *    - MasterWord (辞書データ) と UserWordState (groupColor) を物理分離。
 *    - Atomic Swap による単語マスター更新時も、ユーザーの色設定を100%完全保護。
 *
 * 2. iOS Safari / PWA タスクキル対策 (Dual Storage & Auto Restore Circuit):
 *    - iOS WebKitStorage の IndexedDB 突然死ハザードを回避するため、
 *      localStorage への「二重物理保存 (kotutan_user_states_backup)」を全自動展開。
 *    - アプリ起動時、IndexedDB が空の場合は localStorage からデータを自動復元（自己修復）。
 *    - tx.oncomplete 待機と localStorage 同期により、タスクキル時のデータ消失を物理全消滅。
 * ============================================================================
 */
import { DB_NAME, DB_VERSION, STORE_WORDS_A, STORE_WORDS_B, STORE_META, LOCK_NAME_DB_SWAP, } from './constants.js';
const STORE_USER_DATA = 'user_personal_data';
const LOCALSTORAGE_BACKUP_KEY = 'kotutan_user_states_backup';
export class DatabaseService {
    db = null;
    async initialize() {
        if (this.db)
            return;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_WORDS_A)) {
                    db.createObjectStore(STORE_WORDS_A, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_WORDS_B)) {
                    db.createObjectStore(STORE_WORDS_B, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_USER_DATA)) {
                    db.createObjectStore(STORE_USER_DATA, { keyPath: 'wordId' });
                }
                if (!db.objectStoreNames.contains(STORE_META)) {
                    db.createObjectStore(STORE_META, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => {
                this.db = request.result;
                this.db.onversionchange = () => {
                    if (this.db) {
                        this.db.close();
                        this.db = null;
                        window.location.reload();
                    }
                };
                this.ensureMetaInitialized().then(resolve).catch(reject);
            };
            request.onerror = () => {
                reject(new Error(`[DatabaseService] DBオープン失敗: ${request.error?.message}`));
            };
        });
    }
    async ensureMetaInitialized() {
        const meta = await this.getAppMeta();
        if (!meta) {
            const defaultMeta = {
                id: 'system_meta',
                activeStore: 'A',
                dataVersion: '1.0.0',
                lastUpdated: Date.now(),
            };
            await this.saveAppMeta(defaultMeta);
        }
    }
    getDb() {
        if (!this.db)
            throw new Error('[DatabaseService] DB未初期化');
        return this.db;
    }
    async getAppMeta() {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_META, 'readonly');
            const store = tx.objectStore(STORE_META);
            const request = store.get('system_meta');
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }
    async saveAppMeta(meta) {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_META, 'readwrite');
            const store = tx.objectStore(STORE_META);
            const request = store.put(meta);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(request.error);
        });
    }
    async getActiveStoreName() {
        const meta = await this.getAppMeta();
        return meta?.activeStore === 'B' ? STORE_WORDS_B : STORE_WORDS_A;
    }
    async getInactiveStoreName() {
        const meta = await this.getAppMeta();
        return meta?.activeStore === 'B' ? STORE_WORDS_A : STORE_WORDS_B;
    }
    /**
     * 二重ストレージ同期・自動リストア付き 全単語取得関数
     */
    async getAllCombinedWords() {
        const storeName = await this.getActiveStoreName();
        const db = this.getDb();
        const masterWords = await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        let userStates = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_USER_DATA, 'readonly');
            const store = tx.objectStore(STORE_USER_DATA);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        // 【iOS自動リストア回路】 IndexedDBが空の場合、localStorageバックアップから復元
        if (userStates.length === 0) {
            const backupJson = localStorage.getItem(LOCALSTORAGE_BACKUP_KEY);
            if (backupJson) {
                try {
                    const backupMap = JSON.parse(backupJson);
                    userStates = Object.values(backupMap);
                    // IndexedDB へ即時リストア書き戻し
                    const tx = db.transaction(STORE_USER_DATA, 'readwrite');
                    const store = tx.objectStore(STORE_USER_DATA);
                    for (const state of userStates) {
                        store.put(state);
                    }
                    console.log('[Pの防壁] localStorage から IndexedDB へ個人データを自動復元いたしました！');
                }
                catch (e) {
                    console.warn('[Pの防壁] バックアップの復元に失敗しました:', e);
                }
            }
        }
        const userStateMap = new Map();
        for (const state of userStates) {
            userStateMap.set(state.wordId, state);
        }
        return masterWords.map((master) => {
            const state = userStateMap.get(master.id);
            return {
                ...master,
                groupColor: state ? state.groupColor : null,
                isFavorite: state ? !!state.isFavorite : false,
                isMemorized: state ? !!state.isMemorized : false,
            };
        });
    }
    /**
     * 【iOS Safari PWA 完全永続化】 ユーザー状態更新関数（二重物理保存）
     */
    async updateUserState(wordId, updates) {
        const db = this.getDb();
        // 1. localStorage への即時二重保存（同期実行で絶対消えない）
        try {
            const backupJson = localStorage.getItem(LOCALSTORAGE_BACKUP_KEY);
            const backupMap = backupJson ? JSON.parse(backupJson) : {};
            const currentState = backupMap[wordId];
            const newState = {
                wordId,
                groupColor: updates.groupColor !== undefined ? updates.groupColor : (currentState?.groupColor || null),
                isFavorite: updates.isFavorite !== undefined ? updates.isFavorite : (currentState?.isFavorite || false),
                isMemorized: updates.isMemorized !== undefined ? updates.isMemorized : (currentState?.isMemorized || false),
                lastReviewedAt: updates.lastReviewedAt !== undefined ? updates.lastReviewedAt : (currentState?.lastReviewedAt || Date.now()),
            };
            backupMap[wordId] = newState;
            localStorage.setItem(LOCALSTORAGE_BACKUP_KEY, JSON.stringify(backupMap));
        }
        catch (e) {
            console.warn('[Pの防壁] localStorage への保存スキップ:', e);
        }
        // 2. IndexedDB への物理トランザクション保存
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_USER_DATA, 'readwrite');
            const store = tx.objectStore(STORE_USER_DATA);
            const getRequest = store.get(wordId);
            getRequest.onsuccess = () => {
                const currentState = getRequest.result;
                const newState = {
                    wordId,
                    groupColor: updates.groupColor !== undefined ? updates.groupColor : (currentState?.groupColor || null),
                    isFavorite: updates.isFavorite !== undefined ? updates.isFavorite : (currentState?.isFavorite || false),
                    isMemorized: updates.isMemorized !== undefined ? updates.isMemorized : (currentState?.isMemorized || false),
                    lastReviewedAt: updates.lastReviewedAt !== undefined ? updates.lastReviewedAt : (currentState?.lastReviewedAt || Date.now()),
                };
                store.put(newState);
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error(`[DatabaseService] トランザクションエラー`));
            tx.onabort = () => reject(new Error(`[DatabaseService] トランザクション中断`));
        });
    }
    async syncMasterWordsAtomic(masterWords, newVersion) {
        const execute = async () => {
            const db = this.getDb();
            const inactiveStore = await this.getInactiveStoreName();
            const currentMeta = await this.getAppMeta();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(inactiveStore, 'readwrite');
                const store = tx.objectStore(inactiveStore);
                store.clear();
                for (const w of masterWords) {
                    store.put(w);
                }
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            const newActive = currentMeta?.activeStore === 'B' ? 'A' : 'B';
            await this.saveAppMeta({
                id: 'system_meta',
                activeStore: newActive,
                dataVersion: newVersion,
                lastUpdated: Date.now(),
            });
        };
        if ('locks' in navigator) {
            return navigator.locks.request(LOCK_NAME_DB_SWAP, execute);
        }
        else {
            await execute();
        }
    }
}
