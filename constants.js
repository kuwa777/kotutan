/**
 * ============================================================================
 * アプリケーション定数定義
 * ============================================================================
 * セキュリティとパフォーマンスを担保するためのハードリミットや、
 * IndexedDBの静的ストア名（動的生成によるカタログメタデータ破壊防止）を定義。
 */
// ----------------------------------------------------------------------------
// IndexedDB Constants
// ----------------------------------------------------------------------------
export const DB_NAME = 'takanori_vocab_db';
export const DB_VERSION = 1;
// アトミック更新のための静的ストア名定義（動的生成は絶対に行わない）
export const STORE_WORDS_A = 'words_master_a';
export const STORE_WORDS_B = 'words_master_b';
export const STORE_GROUPS = 'groups';
export const STORE_META = 'app_meta';
// Web Locks API で使用する排他制御用ロック名
export const LOCK_NAME_DB_SWAP = 'vocab_db_atomic_swap_lock';
// ----------------------------------------------------------------------------
// Security & Validation Limits (構造的 DoS / Quota 突破防御)
// ----------------------------------------------------------------------------
export const LIMITS = {
    MAX_WORD_TERM_LENGTH: 200, // 単語の最大文字数
    MAX_WORD_DEF_LENGTH: 2000, // 意味・解説の最大文字数
    MAX_GROUP_NAME_LENGTH: 50, // グループ名の最大文字数
    MAX_WORDS_PER_IMPORT: 50000, // 1回のインポートでの最大単語数
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB (JSONパース時のOOM回避)
};
// ----------------------------------------------------------------------------
// Cache Constants (Service Worker)
// ----------------------------------------------------------------------------
// SWのバケット増殖によるQuota Evictionハザードを防ぐための固定プレフィックス
export const CACHE_PREFIX = 'takanori-vocab-v';
export const CURRENT_CACHE_VERSION = '1.0.0';
export const ACTIVE_CACHE_NAME = `${CACHE_PREFIX}${CURRENT_CACHE_VERSION}`;
