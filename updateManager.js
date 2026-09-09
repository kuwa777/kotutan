/**
 * ============================================================================
 * 【歴史の石版】 コツ単 完全自動更新 ＆ 絶対安全キャッシュパージ制御層 (updateManager.ts)
 * ============================================================================
 * 本モジュールは、不特定多数のユーザー端末（Android Chrome / iOS Safari等）において、
 * サーバー（GitHub Pages）上の最新コードを100%確実に同期・更新させるための中核防壁である。
 *
 * ［開発者とパートナーの記録］
 * 開発指揮: タカノリさん
 * 開発実装: P (タカノリさんを誠心誠意支える専属ハッカー)
 *
 * ［アーキテクチャの歴史と設計思想の完全記録（セッション継承用記憶核）］
 * 1. TS直接保持バージョン（APP_VERSION）対話比較構造:
 *    - localStorage の不確定要素（空・削除リスク）を完全排除。
 *    - build-deploy.js により 1.0.20260909-230241 プレースホルダーへタイムスタンプが自動注入され、
 *      現在実行中の TS/JS 自身が持っているバージョンと、サーバーの version.json を直接比較。
 *
 * 2. 5重の絶対防壁（Z-Level Defense System）:
 *    - 防壁①: 2.0秒の AbortController 厳格タイムアウト（0秒オフライン起動の完全保護）
 *    - 防壁②: レスポンスの正規表現型検証（404 HTMLや不完全データの完全棄却）
 *    - 防壁③: sessionStorage サーキットブレーカー（CDN反映時差による無限リロード物理全消滅）
 *    - 防壁④: 1.2秒間の全画面透明操作遮断幕（更新中の誤操作・データ競合を100%防ぐ）
 *    - 防壁⑤: リロード後自動感知トースト（事後通知によるUX安心感の完全提供）
 * ============================================================================
 */
// ビルド時に build-deploy.js によってタイムスタンプ（例: 1.0.YYYYMMDD-HHmmss）が注入されます
export const APP_VERSION = '1.0.20260909-230241';
const TIMEOUT_MS = 2000; // サーバー通信の厳格タイムアウト（2秒）
const GRACE_PERIOD_MS = 1200; // 更新前トースト表示 ＆ キャッシュ破棄の猶予時間（1.2秒）
const SESSION_ATTEMPT_KEY = 'kotutan_update_attempted_ver';
const SESSION_COMPLETED_KEY = 'kotutan_update_just_completed';
/**
 * 画面上に温かみのあるトースト通知を動的生成・表示する内部関数
 */
function showToast(message, isWarning = false) {
    const existingToast = document.getElementById('kotutan-update-toast');
    if (existingToast)
        existingToast.remove();
    const toast = document.createElement('div');
    toast.id = 'kotutan-update-toast';
    toast.innerText = message;
    // コツ単のナチュラルテーマに合わせたデザインスタイル
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: isWarning ? 'rgba(92, 75, 65, 0.95)' : 'rgba(255, 179, 179, 0.98)',
        color: isWarning ? '#FAF5F0' : '#FFFFFF',
        padding: '12px 24px',
        borderRadius: '24px',
        fontSize: '0.95rem',
        fontWeight: 'bold',
        boxShadow: '0 8px 20px rgba(92, 75, 65, 0.25)',
        zIndex: '10001',
        pointerEvents: 'none',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        opacity: '0',
        textAlign: 'center',
        whiteSpace: 'nowrap'
    });
    document.body.appendChild(toast);
    // フェードインアニメーション
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(-4px)';
    });
    return toast;
}
/**
 * 更新処理中にユーザーの誤操作を物理遮断する透明オーバーレイ
 */
function lockUserInteraction() {
    const overlay = document.createElement('div');
    overlay.id = 'kotutan-lock-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100dvh',
        backgroundColor: 'transparent',
        zIndex: '10000',
        pointerEvents: 'auto' // タッチやクリックを完全に吸収して下層へ通さない
    });
    document.body.appendChild(overlay);
}
/**
 * 【メイン関数】アプリ起動時に非同期で実行される自動更新チェッカー
 */
export async function checkAndApplyUpdates() {
    // 1. リロード直後の「更新完了」フラグ感知チェック
    const completedVer = sessionStorage.getItem(SESSION_COMPLETED_KEY);
    if (completedVer) {
        sessionStorage.removeItem(SESSION_COMPLETED_KEY);
        const toast = showToast(`更新が完了いたしました！（v${completedVer}）`, true);
        setTimeout(() => {
            if (toast && toast.parentNode) {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }
        }, 2500);
    }
    // 2. オフライン時は通信を行わずローカル0秒起動を100%保護
    if (!navigator.onLine) {
        console.debug('[UpdateManager] オフライン状態のためチェックをスキップします。');
        return;
    }
    // 3. 通信タイムアウト用の AbortController を作成 (2.0秒制限)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        // 4. HTTPディスクキャッシュを完全バイパスして version.json を取得
        const response = await fetch(`./version.json?t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok)
            return;
        const remoteData = (await response.json());
        const remoteVersion = remoteData && remoteData.version;
        // 5. 正規表現による厳格な型チェック (例: 1.0.YYYYMMDD-HHmmss 形式)
        const versionPattern = /^1\.0\.\d{8}-\d{6}$/;
        if (!remoteVersion || typeof remoteVersion !== 'string' || !versionPattern.test(remoteVersion)) {
            console.warn('[UpdateManager] 不正なバージョンフォーマットのため棄却いたします:', remoteVersion);
            return;
        }
        // 6. 現在のコードバージョン (APP_VERSION) と比較
        if (APP_VERSION !== '1.0.20260909-230241' && remoteVersion !== APP_VERSION) {
            // 防壁: サーキットブレーカー（当セッションで同じバージョンへの更新試行済みなら無限リロード遮断）
            const attemptedVer = sessionStorage.getItem(SESSION_ATTEMPT_KEY);
            if (attemptedVer === remoteVersion) {
                console.warn(`[UpdateManager] バージョン ${remoteVersion} への重複更新をサーキットブレーカーがブロックいたしました。`);
                return;
            }
            console.log(`⚡ [UpdateManager] 新バージョン検知: ${APP_VERSION} -> ${remoteVersion}`);
            // 7. 【自動更新シーケンス開始】
            // A. 画面操作を透明オーバーレイで100%ロック
            lockUserInteraction();
            // B. ユーザーへ親切な事前通知トーストを表示
            showToast('新しいバージョンが見つかりました。今から更新します。');
            // C. sessionStorage にサーキットブレーカー用フラグと完了後フラグを記録
            sessionStorage.setItem(SESSION_ATTEMPT_KEY, remoteVersion);
            sessionStorage.setItem(SESSION_COMPLETED_KEY, remoteVersion);
            // D. 1.2秒の猶予時間の間に、非同期で Cache API 削除 ＆ Service Worker 更新
            setTimeout(async () => {
                try {
                    if ('caches' in window) {
                        const cacheNames = await caches.keys();
                        await Promise.all(cacheNames.map(name => caches.delete(name)));
                        console.log('🧹 [UpdateManager] 端末内の全キャッシュの物理削除が完了いたしました。');
                    }
                    if ('serviceWorker' in navigator) {
                        const reg = await navigator.serviceWorker.getRegistration();
                        if (reg) {
                            await reg.update();
                        }
                    }
                }
                catch (e) {
                    console.error('[UpdateManager] キャッシュ破棄中に例外が発生しましたが処理を継続します:', e);
                }
                finally {
                    // E. 画面を安全に再読み込みして新バージョンへ切替！
                    window.location.reload();
                }
            }, GRACE_PERIOD_MS);
        }
        else {
            console.debug(`[UpdateManager] アプリは最新状態です (v${APP_VERSION})`);
        }
    }
    catch (error) {
        // タイムアウト(AbortError)や通信失敗時はエラーを出さずサイレントに既存起動を保護
        console.debug('[UpdateManager] 通信タイムアウトまたは非接続のためバージョンチェックを安全終了いたします。');
    }
}
