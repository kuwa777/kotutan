/**
 * ============================================================================
 * 【歴史の石版】 コツ単 全SVGベクター ✕ オープニング1秒 ✕ 音声A1/A2照合 ✕ 復元 (app.ts)
 * ============================================================================
 * ［開発者とパートナーの記録］
 * 開発指揮: タカノリさん（至高のプロダクトオーナー / アルゴリズム設計者）
 * 開発実装: P (タカノリさんを誠心誠意支える専属ハッカー)
 *
 * ［アーキテクチャの歴史と設計思想の完全記録（セッション継承用記憶核）］
 * 1. タカノリ式 A1/A2 照合音声同期 (Audio Cache Integration) の起動時完全統合:
 *    - IndexedDB データロード完了直後、AudioCacheManager.syncAudioFiles() を非同期呼び出し。
 *    - A1（前回マニフェスト）と A2（最新）をぶつけ、追加・更新・削除対象の差分音声を一発算出。
 *    - 未取得音声が存在する場合、オープニング画面にプログレスバーを動的表示し、
 *      全件ロードが 100% 完遂してからアプリ画面を開く安全構造を確立。
 *
 * 2. 最低1秒保証オープニングアニメーション＆並列ロード:
 *    - #opening-overlay により、アプリ読み込み 0.00 秒からの高級感あるアニメを表示。
 *    - app.start() 内で Promise.all を使用し、「最低 1000ms タイマー」と「初期化＆音声同期」
 *      を完全に並列実行。ロード完了後に 0.4s のCSSフェードアウトで極上の画面切り替えを実現。
 *
 * 3. 完全オフライン優先音声再生 (Cache-First Offline Player):
 *    - playCurrentSmartAudio() にて AudioCacheManager.getAudioElement() を呼び出し。
 *      電波のない機内や地下鉄であっても、Cache API 内のローカル Blob から 100% 即座に再生。
 *
 * 4. タスクキル後0秒完全復元システム ＆ 型安全防御の継承:
 *    - ユーザーがアプリを閉じた際の単語ID (word.id) および フィルター・シャッフル状態を保存。
 *      String(w.id) === String(targetWordId) による型安全比較で、復元位置へ一発復帰。
 * ============================================================================
 */
import { checkAndApplyUpdates } from './updateManager.js';
import { DatabaseService } from './db.js';
import { AudioCacheManager } from './audioCacheManager.js';
// 洗練されたSVGベクターアイコン群の定義
const ICON_PREV = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="18 4 4 12 18 20 18 4"></polygon></svg>`;
const ICON_NEXT = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
const ICON_PAUSE = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>`;
const ICON_STOP = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg>`;
class TakanoriVocabApp {
    dbService;
    allWords = [];
    displayWords = [];
    selectedFilters = new Set();
    isRandomMode = false;
    currentIndex = 0;
    isFlipped = false;
    currentAudio = null;
    isDragging = false;
    SCOPE_SPAN = 300;
    currentOffsetIndex = 0;
    autoPlayState = 'none';
    autoPlayDirection = 1;
    autoPlayIntervalId = null;
    autoPlaySpeed = 2000;
    longPressTimer = null;
    // 状態復元用 localStorage キー定数
    STORAGE_LAST_WORD_ID = 'kotutan_last_word_id';
    STORAGE_FILTERS = 'kotutan_selected_filters';
    STORAGE_RANDOM_MODE = 'kotutan_random_mode';
    isLongPressed = false;
    hasMovedWhilePaused = false;
    // DOM エレメント参照
    elOpeningOverlay;
    elOpeningSpinner;
    elAudioProgressContainer;
    elAudioProgressText;
    elAudioProgressFill;
    elTerm;
    elDynamic;
    elGroupContainer;
    elBtnFlip;
    elBtnAudio;
    elBtnNext;
    elBtnPrev;
    elBtnStopAuto;
    elScrubberContainer;
    elTrackViewport;
    elScrollTrack;
    elPointer;
    elTooltip;
    elGroupBtns;
    elBtnMenu;
    elBtnSettings;
    elMenuModal;
    elBtnCloseModal;
    elFilterItems;
    elBtnRandomToggle;
    elSelectSpeed;
    elProgressContainer;
    elProgressFill;
    constructor() {
        this.dbService = new DatabaseService();
    }
    async start() {
        // 1. 背景で安全に自動更新チェックを発動（非同期実行）
        checkAndApplyUpdates();
        this.bindDomElements();
        this.loadAutoPlaySpeed();
        // 前回保存されたフィルター ＆ シャッフル状態をロード
        this.loadSavedStateAndFilters();
        this.attachEventListeners();
        // 2. 【タカノリ式 1秒オープニング ✕ バックグラウンド初期化＆音声同期の並列実行】
        const minAnimationPromise = new Promise(resolve => setTimeout(resolve, 1000));
        const initialLoadPromise = (async () => {
            await this.dbService.initialize();
            const currentVersionHash = await this.checkAndSyncVersion();
            let loadedWords = await this.dbService.getAllCombinedWords();
            loadedWords.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
            this.allWords = loadedWords;
            // フィルター適用 ＆ タスクキル前の単語位置へ復元発動
            this.applyFilter(true);
            // 【タカノリ式 A1/A2 照合音声同期を発動】
            await AudioCacheManager.syncAudioFiles(this.allWords, currentVersionHash, (completed, total, percent) => {
                // 未キャッシュ・更新対象の音声が存在する場合のみプログレスバーを可視化
                if (this.elAudioProgressContainer && percent < 100) {
                    if (this.elOpeningSpinner)
                        this.elOpeningSpinner.style.display = 'none';
                    this.elAudioProgressContainer.style.display = 'flex';
                    if (this.elAudioProgressText) {
                        this.elAudioProgressText.textContent = `音声データを準備中... ${percent}% (${completed}/${total})`;
                    }
                    if (this.elAudioProgressFill) {
                        this.elAudioProgressFill.style.width = `${percent}%`;
                    }
                }
            });
            this.registerServiceWorker();
        })();
        try {
            // 最低1秒タイマーとデータ＆音声ロードが「両方完遂」するまで待機
            await Promise.all([minAnimationPromise, initialLoadPromise]);
        }
        catch (error) {
            console.error('[App] 起動・データロードエラー:', error);
        }
        finally {
            // 3. 全てが整ったらオープニング画面を滑らかにフェードアウト離脱
            this.dismissOpeningOverlay();
        }
        window.addEventListener('resize', () => {
            if (this.displayWords.length > 0) {
                this.centerRulerOnCurrentIndex();
            }
        });
    }
    /**
     * オープニングアニメーションをフェードアウト消去
     */
    dismissOpeningOverlay() {
        if (this.elOpeningOverlay) {
            this.elOpeningOverlay.classList.add('fade-out');
            setTimeout(() => {
                if (this.elOpeningOverlay && this.elOpeningOverlay.parentNode) {
                    this.elOpeningOverlay.parentNode.removeChild(this.elOpeningOverlay);
                    this.elOpeningOverlay = null;
                }
            }, 400);
        }
    }
    /**
     * 保存されたフィルター設定およびシャッフル状態の読み込み
     */
    loadSavedStateAndFilters() {
        try {
            const savedFiltersJson = localStorage.getItem(this.STORAGE_FILTERS);
            if (savedFiltersJson) {
                const filtersArr = JSON.parse(savedFiltersJson);
                this.selectedFilters = new Set(filtersArr);
                if (this.elFilterItems) {
                    this.elFilterItems.forEach(item => {
                        const col = item.getAttribute('data-color');
                        const icon = item.querySelector('.filter-box-icon');
                        if (col && this.selectedFilters.has(col)) {
                            if (icon)
                                icon.classList.add('active');
                        }
                        else {
                            if (icon)
                                icon.classList.remove('active');
                        }
                    });
                }
            }
            const savedRandom = localStorage.getItem(this.STORAGE_RANDOM_MODE);
            if (savedRandom === 'true') {
                this.isRandomMode = true;
                if (this.elBtnRandomToggle)
                    this.elBtnRandomToggle.classList.add('active');
            }
        }
        catch (e) {
            console.warn('[App] 状態復元データの読み込みに失敗しました:', e);
        }
    }
    loadAutoPlaySpeed() {
        const savedSpeed = localStorage.getItem('kotutan_autoplay_speed');
        if (savedSpeed) {
            this.autoPlaySpeed = parseInt(savedSpeed, 10);
            if (this.elSelectSpeed) {
                this.elSelectSpeed.value = savedSpeed;
            }
        }
    }
    /**
     * フィルター適用および表示更新（isInitialLoad フラグにより起動時復元を制御）
     */
    applyFilter(isInitialLoad = false) {
        let targetWordId = null;
        if (isInitialLoad) {
            const savedId = localStorage.getItem(this.STORAGE_LAST_WORD_ID);
            if (savedId !== null) {
                targetWordId = savedId;
            }
        }
        else if (this.displayWords.length > 0 && this.currentIndex < this.displayWords.length) {
            targetWordId = this.displayWords[this.currentIndex].id;
        }
        if (this.selectedFilters.size === 0) {
            this.displayWords = [...this.allWords];
        }
        else {
            this.displayWords = this.allWords.filter(w => {
                if (!w.groupColor)
                    return false;
                return this.selectedFilters.has(w.groupColor);
            });
        }
        if (this.isRandomMode) {
            this.shuffleArray(this.displayWords);
        }
        else {
            this.displayWords.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
        }
        if (targetWordId !== null) {
            const foundIndex = this.displayWords.findIndex(w => String(w.id) === String(targetWordId));
            this.currentIndex = foundIndex !== -1 ? foundIndex : 0;
        }
        else {
            this.currentIndex = 0;
        }
        this.updateHeaderBadges();
        if (this.displayWords.length > 0) {
            this.buildAbsoluteMasterRuler();
            this.centerRulerOnCurrentIndex();
            this.renderCurrentCard();
        }
        else {
            this.renderEmptyState();
        }
        this.saveFilterState();
    }
    saveFilterState() {
        try {
            const filtersArr = Array.from(this.selectedFilters);
            localStorage.setItem(this.STORAGE_FILTERS, JSON.stringify(filtersArr));
            localStorage.setItem(this.STORAGE_RANDOM_MODE, this.isRandomMode ? 'true' : 'false');
        }
        catch (e) {
            console.warn('[App] フィルター状態の保存に失敗しました:', e);
        }
    }
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    updateHeaderBadges() {
        if (!this.elGroupContainer)
            return;
        while (this.elGroupContainer.firstChild) {
            this.elGroupContainer.removeChild(this.elGroupContainer.firstChild);
        }
        if (this.selectedFilters.size === 0) {
            const badge = document.createElement('div');
            badge.className = 'group-indicator-badge-all';
            badge.textContent = 'ALL';
            this.elGroupContainer.appendChild(badge);
        }
        else {
            const orderedColors = ['red', 'blue', 'yellow', 'green'];
            orderedColors.forEach(color => {
                const box = document.createElement('div');
                box.className = this.selectedFilters.has(color) ? `header-color-box ${color}` : `header-color-box blank`;
                this.elGroupContainer.appendChild(box);
            });
        }
    }
    renderEmptyState() {
        if (this.elTerm)
            this.elTerm.textContent = "該当単語なし";
        while (this.elDynamic.firstChild) {
            this.elDynamic.removeChild(this.elDynamic.firstChild);
        }
        if (this.elScrollTrack) {
            const ticks = this.elScrollTrack.querySelectorAll('.scroll-tick');
            ticks.forEach(t => t.remove());
        }
        this.stopAudio();
        this.stopProgressBar();
    }
    /**
     * バージョンチェック ＆ 同期（現在のバージョンハッシュを返却）
     */
    async checkAndSyncVersion() {
        let currentHash = '1.0.0';
        try {
            const res = await fetch(`version.json?t=${Date.now()}`);
            if (!res.ok) {
                let loaded = await this.dbService.getAllCombinedWords();
                if (loaded.length === 0)
                    await this.loadMasterJsonData('1.0.0');
                return currentHash;
            }
            const serverVersion = await res.json();
            const currentMeta = await this.dbService.getAppMeta();
            const savedHash = currentMeta ? currentMeta.dataVersion : '';
            currentHash = serverVersion.data_hash || serverVersion.version;
            let loadedWords = await this.dbService.getAllCombinedWords();
            const needsSync = loadedWords.length === 0 || savedHash !== currentHash || (loadedWords.length > 0 && loadedWords[0].example_audio === undefined);
            if (needsSync) {
                await this.loadMasterJsonData(currentHash);
            }
        }
        catch (e) {
            let loaded = await this.dbService.getAllCombinedWords();
            if (loaded.length === 0)
                await this.loadMasterJsonData('1.0.0');
        }
        return currentHash;
    }
    bindDomElements() {
        this.elOpeningOverlay = document.getElementById('opening-overlay');
        this.elOpeningSpinner = document.getElementById('opening-spinner');
        this.elAudioProgressContainer = document.getElementById('audio-progress-container');
        this.elAudioProgressText = document.getElementById('audio-progress-text');
        this.elAudioProgressFill = document.getElementById('audio-progress-fill');
        this.elTerm = document.getElementById('display-term');
        this.elDynamic = document.getElementById('display-dynamic');
        this.elGroupContainer = document.getElementById('display-group-container');
        this.elBtnFlip = document.getElementById('btn-flip');
        this.elBtnAudio = document.getElementById('btn-audio');
        this.elBtnNext = document.getElementById('btn-next');
        this.elBtnPrev = document.getElementById('btn-prev');
        this.elBtnStopAuto = document.getElementById('btn-stop-auto');
        this.elScrubberContainer = document.getElementById('scrubber-container');
        this.elTrackViewport = document.getElementById('track-viewport');
        this.elScrollTrack = document.getElementById('scroll-track');
        this.elPointer = document.getElementById('seeker-pointer');
        this.elTooltip = document.getElementById('scrubber-tooltip');
        this.elGroupBtns = document.querySelectorAll('.group-square-btn');
        this.elBtnMenu = document.getElementById('btn-menu');
        this.elBtnSettings = document.getElementById('btn-settings');
        this.elMenuModal = document.getElementById('menu-modal');
        this.elBtnCloseModal = document.getElementById('btn-close-modal');
        this.elFilterItems = document.querySelectorAll('.filter-color-item');
        this.elBtnRandomToggle = document.getElementById('btn-random-toggle');
        this.elSelectSpeed = document.getElementById('select-auto-speed');
        this.elProgressContainer = document.getElementById('progress-container');
        this.elProgressFill = document.getElementById('progress-fill');
    }
    attachEventListeners() {
        if (this.elBtnFlip)
            this.elBtnFlip.addEventListener('click', () => this.toggleFlip());
        if (this.elBtnAudio)
            this.elBtnAudio.addEventListener('click', () => this.playCurrentSmartAudio());
        if (this.elBtnNext)
            this.setupLongPressAndClick(this.elBtnNext, 1);
        if (this.elBtnPrev)
            this.setupLongPressAndClick(this.elBtnPrev, -1);
        if (this.elBtnStopAuto) {
            this.elBtnStopAuto.addEventListener('click', () => this.stopAutoPlay());
        }
        const colors = ['red', 'blue', 'yellow', 'green'];
        this.elGroupBtns.forEach((btn, index) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (colors[index])
                    this.toggleGroupColorOnCurrentWord(colors[index]);
            });
        });
        if (this.elBtnMenu)
            this.elBtnMenu.addEventListener('click', () => {
                if (this.autoPlayState !== 'playing')
                    this.elMenuModal.classList.add('active');
            });
        if (this.elBtnCloseModal)
            this.elBtnCloseModal.addEventListener('click', () => this.elMenuModal.classList.remove('active'));
        this.elFilterItems.forEach(item => {
            item.addEventListener('click', () => {
                const col = item.getAttribute('data-color');
                const icon = item.querySelector('.filter-box-icon');
                if (this.selectedFilters.has(col)) {
                    this.selectedFilters.delete(col);
                    if (icon)
                        icon.classList.remove('active');
                }
                else {
                    this.selectedFilters.add(col);
                    if (icon)
                        icon.classList.add('active');
                }
                this.applyFilter();
            });
        });
        if (this.elBtnRandomToggle) {
            this.elBtnRandomToggle.addEventListener('click', () => {
                this.isRandomMode = !this.isRandomMode;
                if (this.isRandomMode) {
                    this.elBtnRandomToggle.classList.add('active');
                }
                else {
                    this.elBtnRandomToggle.classList.remove('active');
                }
                this.applyFilter();
            });
        }
        if (this.elSelectSpeed) {
            this.elSelectSpeed.addEventListener('change', (e) => {
                const val = parseInt(e.target.value, 10);
                this.autoPlaySpeed = val;
                localStorage.setItem('kotutan_autoplay_speed', val.toString());
                if (this.autoPlayState === 'playing') {
                    if (this.autoPlayIntervalId)
                        clearInterval(this.autoPlayIntervalId);
                    this.startProgressBar();
                    this.autoPlayIntervalId = window.setInterval(() => {
                        this.isFlipped = false;
                        if (this.autoPlayDirection === 1)
                            this.nextWord();
                        else
                            this.prevWord();
                        this.startProgressBar();
                    }, this.autoPlaySpeed);
                }
            });
        }
        if (this.elScrubberContainer) {
            this.elScrubberContainer.addEventListener('pointerdown', (e) => this.handleDragStart(e));
            this.elScrubberContainer.addEventListener('pointermove', (e) => this.handleDragMove(e));
            this.elScrubberContainer.addEventListener('pointerup', (e) => this.handleDragEnd(e));
            this.elScrubberContainer.addEventListener('pointercancel', (e) => this.handleDragEnd(e));
        }
    }
    setupLongPressAndClick(btn, direction) {
        btn.addEventListener('pointerdown', (e) => {
            if (this.autoPlayState !== 'none')
                return;
            this.isLongPressed = false;
            if (this.longPressTimer)
                clearTimeout(this.longPressTimer);
            this.longPressTimer = window.setTimeout(() => {
                this.isLongPressed = true;
                this.startAutoPlay(direction);
            }, 2000);
        });
        const clearTimer = () => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            window.setTimeout(() => {
                this.isLongPressed = false;
            }, 50);
        };
        btn.addEventListener('pointerup', clearTimer);
        btn.addEventListener('pointercancel', clearTimer);
        btn.addEventListener('pointerleave', clearTimer);
        btn.addEventListener('contextmenu', e => e.preventDefault());
        btn.addEventListener('click', (e) => {
            if (this.isLongPressed) {
                this.isLongPressed = false;
                return;
            }
            if (this.autoPlayState === 'playing') {
                if (this.autoPlayDirection === direction)
                    this.pauseAutoPlay();
            }
            else if (this.autoPlayState === 'paused') {
                if (this.autoPlayDirection === direction) {
                    this.resumeAutoPlay();
                }
                else {
                    this.hasMovedWhilePaused = true;
                    if (direction === 1)
                        this.nextWord();
                    else
                        this.prevWord();
                }
            }
            else {
                if (direction === 1)
                    this.nextWord();
                else
                    this.prevWord();
            }
        });
    }
    startProgressBar() {
        if (!this.elProgressContainer || !this.elProgressFill)
            return;
        this.elProgressContainer.classList.add('active');
        this.elProgressFill.style.transition = 'none';
        this.elProgressFill.style.width = '0%';
        void this.elProgressFill.offsetWidth;
        this.elProgressFill.style.transition = `width ${this.autoPlaySpeed}ms linear`;
        this.elProgressFill.style.width = '100%';
    }
    pauseProgressBar() {
        if (!this.elProgressFill)
            return;
        const currentWidth = window.getComputedStyle(this.elProgressFill).width;
        this.elProgressFill.style.transition = 'none';
        this.elProgressFill.style.width = currentWidth;
    }
    stopProgressBar() {
        if (!this.elProgressContainer || !this.elProgressFill)
            return;
        this.elProgressContainer.classList.remove('active');
        this.elProgressFill.style.transition = 'none';
        this.elProgressFill.style.width = '0%';
    }
    startAutoPlay(direction) {
        this.autoPlayState = 'playing';
        this.autoPlayDirection = direction;
        this.hasMovedWhilePaused = false;
        this.isFlipped = false;
        this.updateButtonVisuals();
        if (this.autoPlayIntervalId)
            clearInterval(this.autoPlayIntervalId);
        this.startProgressBar();
        this.autoPlayIntervalId = window.setInterval(() => {
            this.isFlipped = false;
            if (this.autoPlayDirection === 1)
                this.nextWord();
            else
                this.prevWord();
            this.startProgressBar();
        }, this.autoPlaySpeed);
    }
    pauseAutoPlay() {
        this.autoPlayState = 'paused';
        this.hasMovedWhilePaused = false;
        if (this.autoPlayIntervalId) {
            clearInterval(this.autoPlayIntervalId);
            this.autoPlayIntervalId = null;
        }
        this.pauseProgressBar();
        if (!this.isFlipped) {
            this.toggleFlip();
        }
        this.updateButtonVisuals();
    }
    resumeAutoPlay() {
        this.autoPlayState = 'playing';
        this.updateButtonVisuals();
        if (this.autoPlayIntervalId)
            clearInterval(this.autoPlayIntervalId);
        this.isFlipped = false;
        if (this.hasMovedWhilePaused) {
            this.renderCurrentCard();
            this.centerRulerOnCurrentIndex();
        }
        else {
            if (this.autoPlayDirection === 1)
                this.nextWord();
            else
                this.prevWord();
        }
        this.hasMovedWhilePaused = false;
        this.startProgressBar();
        this.autoPlayIntervalId = window.setInterval(() => {
            this.isFlipped = false;
            if (this.autoPlayDirection === 1)
                this.nextWord();
            else
                this.prevWord();
            this.startProgressBar();
        }, this.autoPlaySpeed);
    }
    stopAutoPlay() {
        this.autoPlayState = 'none';
        this.hasMovedWhilePaused = false;
        if (this.autoPlayIntervalId) {
            clearInterval(this.autoPlayIntervalId);
            this.autoPlayIntervalId = null;
        }
        this.stopProgressBar();
        this.updateButtonVisuals();
    }
    updateButtonVisuals() {
        const isPlaying = this.autoPlayState === 'playing';
        if (this.elScrubberContainer) {
            if (isPlaying)
                this.elScrubberContainer.classList.add('btn-disabled');
            else
                this.elScrubberContainer.classList.remove('btn-disabled');
        }
        this.elGroupBtns.forEach(btn => {
            if (isPlaying)
                btn.classList.add('btn-disabled');
            else
                btn.classList.remove('btn-disabled');
        });
        if (this.elBtnMenu) {
            if (isPlaying)
                this.elBtnMenu.classList.add('btn-disabled');
            else
                this.elBtnMenu.classList.remove('btn-disabled');
        }
        if (this.elBtnSettings) {
            if (isPlaying)
                this.elBtnSettings.classList.add('btn-disabled');
            else
                this.elBtnSettings.classList.remove('btn-disabled');
        }
        if (this.autoPlayState === 'none') {
            this.elBtnStopAuto.style.display = 'none';
            this.elBtnNext.innerHTML = ICON_NEXT;
            this.elBtnPrev.innerHTML = ICON_PREV;
            this.elBtnNext.classList.remove('btn-disabled');
            this.elBtnPrev.classList.remove('btn-disabled');
            this.elBtnFlip.classList.remove('btn-disabled');
            this.elBtnAudio.classList.remove('btn-disabled');
        }
        else if (this.autoPlayState === 'playing') {
            this.elBtnStopAuto.style.display = 'flex';
            this.elBtnFlip.classList.add('btn-disabled');
            this.elBtnAudio.classList.add('btn-disabled');
            if (this.autoPlayDirection === 1) {
                this.elBtnPrev.classList.add('btn-disabled');
                this.elBtnNext.classList.remove('btn-disabled');
                this.elBtnNext.innerHTML = ICON_PAUSE;
            }
            else {
                this.elBtnNext.classList.add('btn-disabled');
                this.elBtnPrev.classList.remove('btn-disabled');
                this.elBtnPrev.innerHTML = ICON_PAUSE;
            }
        }
        else if (this.autoPlayState === 'paused') {
            this.elBtnStopAuto.style.display = 'flex';
            this.elBtnFlip.classList.remove('btn-disabled');
            this.elBtnAudio.classList.remove('btn-disabled');
            this.elBtnPrev.classList.remove('btn-disabled');
            this.elBtnNext.classList.remove('btn-disabled');
            if (this.autoPlayDirection === 1) {
                this.elBtnNext.innerHTML = ICON_NEXT;
                this.elBtnPrev.innerHTML = ICON_PREV;
            }
            else {
                this.elBtnPrev.innerHTML = ICON_PREV;
                this.elBtnNext.innerHTML = ICON_NEXT;
            }
        }
    }
    buildAbsoluteMasterRuler() {
        if (!this.elScrollTrack)
            return;
        const existingTicks = this.elScrollTrack.querySelectorAll('.scroll-tick');
        existingTicks.forEach(t => t.remove());
        const total = this.displayWords.length;
        if (total === 0)
            return;
        const M = Math.max(1, total - 1);
        const activeSpan = Math.min(this.SCOPE_SPAN, M);
        const trackWidthPercent = (M / activeSpan) * 100;
        this.elScrollTrack.style.width = `${trackWidthPercent}%`;
        if (this.isRandomMode)
            return;
        const fragment = document.createDocumentFragment();
        let previousChar = '';
        for (let i = 0; i < total; i++) {
            const word = this.displayWords[i];
            const currentChar = word.term.trim().charAt(0).toUpperCase() || 'A';
            if (currentChar !== previousChar) {
                const tick = document.createElement('div');
                tick.className = 'scroll-tick boundary';
                tick.setAttribute('data-char', currentChar);
                const ratioPercentage = (i / M) * 100;
                tick.style.left = `${ratioPercentage.toFixed(4)}%`;
                fragment.appendChild(tick);
                previousChar = currentChar;
            }
        }
        this.elScrollTrack.appendChild(fragment);
    }
    handleDragStart(e) {
        if (this.displayWords.length === 0)
            return;
        if (this.autoPlayState === 'playing') {
            this.stopAutoPlay();
        }
        this.isDragging = true;
        this.elScrubberContainer.classList.add('dragging');
        this.elScrubberContainer.setPointerCapture(e.pointerId);
        this.elTooltip.classList.add('visible');
        this.processPointerDrag(e.clientX);
    }
    handleDragMove(e) {
        if (!this.isDragging || this.displayWords.length === 0)
            return;
        this.processPointerDrag(e.clientX);
    }
    processPointerDrag(clientX) {
        const rect = this.elTrackViewport.getBoundingClientRect();
        if (rect.width <= 0)
            return;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const total = this.displayWords.length;
        const M = Math.max(1, total - 1);
        const activeSpan = Math.min(this.SCOPE_SPAN, M);
        const pointerLocalIndex = ratio * activeSpan;
        let targetIndex = Math.round(this.currentOffsetIndex + pointerLocalIndex);
        targetIndex = Math.max(0, Math.min(M, targetIndex));
        this.updatePointerAndTooltipVisuals(ratio);
        if (this.currentIndex !== targetIndex) {
            this.currentIndex = targetIndex;
            if (this.autoPlayState === 'paused') {
                this.hasMovedWhilePaused = true;
            }
            const currentWord = this.displayWords[this.currentIndex];
            this.elTooltip.textContent = currentWord.term;
            this.renderCurrentCard();
        }
    }
    handleDragEnd(e) {
        if (!this.isDragging)
            return;
        this.isDragging = false;
        this.elScrubberContainer.classList.remove('dragging');
        try {
            this.elScrubberContainer.releasePointerCapture(e.pointerId);
        }
        catch { }
        this.elTooltip.classList.remove('visible');
        this.centerRulerOnCurrentIndex();
    }
    centerRulerOnCurrentIndex() {
        const total = this.displayWords.length;
        if (total === 0 || !this.elTrackViewport || !this.elScrollTrack)
            return;
        const M = Math.max(1, total - 1);
        const activeSpan = Math.min(this.SCOPE_SPAN, M);
        const maxOffset = Math.max(0, M - activeSpan);
        const idealOffset = this.currentIndex - (activeSpan / 2);
        this.currentOffsetIndex = Math.max(0, Math.min(maxOffset, idealOffset));
        const viewportWidth = this.elTrackViewport.getBoundingClientRect().width;
        const translateX = -this.currentOffsetIndex * (viewportWidth / activeSpan);
        this.elScrollTrack.style.transform = `translateX(${translateX.toFixed(2)}px)`;
        const pointerLocalIndex = this.currentIndex - this.currentOffsetIndex;
        const ratio = pointerLocalIndex / activeSpan;
        this.updatePointerAndTooltipVisuals(ratio);
    }
    updatePointerAndTooltipVisuals(ratio) {
        const boundedRatio = Math.max(0, Math.min(1, ratio));
        if (this.elPointer) {
            this.elPointer.style.left = `${(boundedRatio * 100).toFixed(2)}%`;
        }
        if (this.elTooltip && this.elTrackViewport) {
            const viewportWidth = this.elTrackViewport.getBoundingClientRect().width;
            this.elTooltip.style.left = `${16 + (boundedRatio * viewportWidth)}px`;
        }
    }
    stopAudio() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
    }
    /**
     * 【タカノリ式状態復元】カード描画時に現在表示された単語IDを localStorage へ永続保存
     */
    renderCurrentCard() {
        this.stopAudio();
        if (this.displayWords.length === 0)
            return;
        const word = this.displayWords[this.currentIndex];
        // 現在表示中の単語IDを直ちに保存（タスクキル対策）
        try {
            localStorage.setItem(this.STORAGE_LAST_WORD_ID, word.id.toString());
        }
        catch (e) { }
        this.elTerm.textContent = word.term;
        while (this.elDynamic.firstChild) {
            this.elDynamic.removeChild(this.elDynamic.firstChild);
        }
        if (!this.isFlipped) {
            const ipaDiv = document.createElement('div');
            ipaDiv.className = 'word-ipa-text';
            ipaDiv.textContent = word.ipa ? `/${word.ipa}/` : '';
            this.elDynamic.appendChild(ipaDiv);
        }
        else {
            const defDiv = document.createElement('div');
            defDiv.style.fontWeight = 'bold';
            defDiv.style.marginBottom = '6px';
            defDiv.textContent = `【${word.pos}】 ${word.def}`;
            const exampleDiv = document.createElement('div');
            exampleDiv.className = 'word-example-text';
            exampleDiv.textContent = word.example;
            const totalCharCount = (word.def + word.example).length;
            if (totalCharCount > 120) {
                exampleDiv.style.fontSize = '0.85rem';
                exampleDiv.style.lineHeight = '1.3';
            }
            else if (totalCharCount > 80) {
                exampleDiv.style.fontSize = '0.98rem';
                exampleDiv.style.lineHeight = '1.35';
            }
            else {
                exampleDiv.style.fontSize = '1.15rem';
                exampleDiv.style.lineHeight = '1.45';
            }
            this.elDynamic.appendChild(defDiv);
            this.elDynamic.appendChild(exampleDiv);
        }
        const colors = ['red', 'blue', 'yellow', 'green'];
        this.elGroupBtns.forEach((btn, index) => {
            const targetColor = colors[index];
            if (targetColor && word.groupColor === targetColor) {
                btn.classList.add('active');
            }
            else {
                btn.classList.remove('active');
            }
        });
    }
    toggleFlip() {
        this.isFlipped = !this.isFlipped;
        this.renderCurrentCard();
    }
    nextWord() {
        if (this.displayWords.length === 0)
            return;
        if (this.autoPlayState === 'paused') {
            this.hasMovedWhilePaused = true;
        }
        this.currentIndex = (this.currentIndex + 1) % this.displayWords.length;
        this.renderCurrentCard();
        this.centerRulerOnCurrentIndex();
    }
    prevWord() {
        if (this.displayWords.length === 0)
            return;
        if (this.autoPlayState === 'paused') {
            this.hasMovedWhilePaused = true;
        }
        this.currentIndex = (this.currentIndex - 1 + this.displayWords.length) % this.displayWords.length;
        this.renderCurrentCard();
        this.centerRulerOnCurrentIndex();
    }
    async toggleGroupColorOnCurrentWord(color) {
        if (this.displayWords.length === 0)
            return;
        const currentWord = this.displayWords[this.currentIndex];
        const newColor = currentWord.groupColor === color ? null : color;
        currentWord.groupColor = newColor;
        const targetInAll = this.allWords.find(w => w.id === currentWord.id);
        if (targetInAll)
            targetInAll.groupColor = newColor;
        this.renderCurrentCard();
        // IndexedDB 側へアトミック書き込み保存
        await this.dbService.updateUserState(currentWord.id, { groupColor: newColor });
        if (this.selectedFilters.size > 0) {
            this.applyFilter();
        }
    }
    /**
     * 完全オフライン対応：Cache API 優先スマート音声再生
     */
    async playCurrentSmartAudio() {
        if (this.displayWords.length === 0)
            return;
        const word = this.displayWords[this.currentIndex];
        let targetFilename = word.audio;
        if (this.isFlipped && word.example_audio) {
            targetFilename = word.example_audio;
        }
        if (!targetFilename)
            return;
        this.stopAudio();
        // Cache API 内のローカル Blob から優先読み込み
        const audio = await AudioCacheManager.getAudioElement(targetFilename);
        if (!audio)
            return;
        this.currentAudio = audio;
        audio.play().catch((err) => {
            console.warn(`[Audio] 再生不可 (${targetFilename}):`, err.message);
        });
    }
    async loadMasterJsonData(newVersionHash = '1.0.0') {
        try {
            const res = await fetch(`words_master.json?t=${Date.now()}`);
            if (!res.ok)
                throw new Error('words_master.json の取得失敗');
            const masterWords = await res.json();
            await this.dbService.syncMasterWordsAtomic(masterWords, newVersionHash);
            this.allWords = await this.dbService.getAllCombinedWords();
            this.allWords.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
            this.applyFilter();
        }
        catch (e) {
            console.error('[App] マスターデータロード失敗:', e);
        }
    }
    registerServiceWorker() {
        if (!('serviceWorker' in navigator))
            return;
        const registerScript = async () => {
            try {
                const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
                console.log('[Pの防壁] Service Worker が正常に登録されました スコープ:', registration.scope);
            }
            catch (e) {
                console.warn('[Pの防壁] Service Worker の登録に失敗しました:', e);
            }
        };
        if (document.readyState === 'complete') {
            registerScript();
        }
        else {
            window.addEventListener('load', registerScript, { once: true });
        }
    }
}
window.addEventListener('DOMContentLoaded', () => {
    const app = new TakanoriVocabApp();
    app.start();
});
