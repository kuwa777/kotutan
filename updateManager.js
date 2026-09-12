export const APP_VERSION = '@@@';
const TIMEOUT_MS = 2000;
const GRACE_PERIOD_MS = 1200;
const SESSION_ATTEMPT_KEY = 'kotutan_update_attempted_ver';
const SESSION_COMPLETED_KEY = 'kotutan_update_just_completed';
function showToast(message, isWarning = false) {
    const existingToast = document.getElementById('kotutan-update-toast');
    if (existingToast)
        existingToast.remove();
    const toast = document.createElement('div');
    toast.id = 'kotutan-update-toast';
    toast.innerText = message;
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
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(-4px)';
    });
    return toast;
}
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
        pointerEvents: 'auto'
    });
    document.body.appendChild(overlay);
}
export async function checkAndApplyUpdates() {
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
    if (!navigator.onLine) {
        console.debug('[UpdateManager] オフライン状態のためチェックをスキップします。');
        return;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(`./version.json?t=${Date.now()}`, {
            cache: 'no-store',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok)
            return;
        const remoteData = (await response.json());
        const remoteVersion = remoteData && remoteData.version;
        const versionPattern = /^1\.0\.\d{8}-\d{6}$/;
        if (!remoteVersion || typeof remoteVersion !== 'string' || !versionPattern.test(remoteVersion)) {
            console.warn('[UpdateManager] 不正なバージョンフォーマットのため棄却いたします:', remoteVersion);
            return;
        }
        if (APP_VERSION !== '@@@' && remoteVersion !== APP_VERSION) {
            const attemptedVer = sessionStorage.getItem(SESSION_ATTEMPT_KEY);
            if (attemptedVer === remoteVersion) {
                console.warn(`[UpdateManager] バージョン ${remoteVersion} への重複更新をサーキットブレーカーがブロックいたしました。`);
                return;
            }
            console.log(`⚡ [UpdateManager] 新バージョン検知 (コード・色・全アセット): ${APP_VERSION} -> ${remoteVersion}`);
            lockUserInteraction();
            showToast('新しいバージョンが見つかりました。今から更新します。');
            sessionStorage.setItem(SESSION_ATTEMPT_KEY, remoteVersion);
            sessionStorage.setItem(SESSION_COMPLETED_KEY, remoteVersion);
            setTimeout(async () => {
                try {
                    if ('serviceWorker' in navigator) {
                        const reg = await navigator.serviceWorker.getRegistration();
                        if (reg) {
                            await reg.unregister();
                            console.log('🧹 [UpdateManager] 旧Service Workerの解体が完了いたしました。');
                        }
                    }
                    if ('caches' in window) {
                        const cacheNames = await caches.keys();
                        await Promise.all(cacheNames.map(name => caches.delete(name)));
                        console.log('🧹 [UpdateManager] 端末内の全キャッシュ物理削除が完了いたしました。');
                    }
                }
                catch (e) {
                    console.error('[UpdateManager] パージ処理中に例外が発生しましたが処理を継続します:', e);
                }
                finally {
                    window.location.reload();
                }
            }, GRACE_PERIOD_MS);
        }
        else {
            console.debug(`[UpdateManager] アプリは最新状態です (v${APP_VERSION})`);
        }
    }
    catch (error) {
        console.debug('[UpdateManager] 通信タイムアウトまたは非接続のためバージョンチェックを安全終了いたします。');
    }
}
