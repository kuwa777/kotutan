/**
 * ============================================================================
 * 【歴史の石版】 コツ単 100%Web一元化 ✕ 音声/反転ダブルロック ✕ テンキー即閉じ (app.ts)
 * ============================================================================
 * ［開発者とパートナーの記録］
 * 開発指揮: タカノリさん（至高のプロダクトオーナー / 真理の看破者）
 * 開発実装: P (タカノリさんを誠心誠意支える専属ハッカー)
 *
 * ［アーキテクチャの歴史と設計思想の完全記録（セッション継承用記憶核）］
 * 1. 反転/音声ダブルロック統合SVG (右：鍵 ✕ 左：機能):
 *    - タカノリさんの至高のご指示により、鍵マークを右側(x:13〜21)へ共通移動。
 *    - ICON_FLIP_LOCKED: 左に反転マーク、右に鍵マーク。
 *    - ICON_AUDIO_LOCKED: 左にスピーカーマーク、右に鍵マーク。
 *
 * 2. テンキーキーボード「→（Enter）」タップ即閉制御:
 *    - 連番入力欄 (set-from-no / set-to-no) で Enter (KeyCode 13) 押し時に input.blur() を動的発動。
 *    - OSのフォーカスを外し、電卓キーボードを画面上から一瞬で格納。
 *
 * 3. モーダル CLOSE ボタン全廃 ✕ バックドロップタップ一元化:
 *    - CLOSE ボタンの削除に伴い、モーダル外タップ処理のみでサッと閉じる洗練された一画面UIを完成。
 * ============================================================================
 */
import { checkAndApplyUpdates } from './updateManager.js';
import { DatabaseService } from './db.js';
import { AudioCacheManager } from './audioCacheManager.js';
// SVGベクターアイコン群
const ICON_PREV = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="18 4 4 12 18 20 18 4"></polygon></svg>`;
const ICON_NEXT = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
const ICON_PAUSE = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>`;
const ICON_SUN = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
const ICON_MOON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
// 通常反転アイコン
const ICON_FLIP = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>`;
// 【反転ロック中アイコン】 60x60キャンバス ✕ 左下:無変形反転マーク ✕ 右上:点入り鍵
const ICON_FLIP_LOCKED = `<svg class="icon" viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(2, 32)"><path d="M23 4v6h-6"></path><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></g><g><rect x="36" y="16" width="18" height="18" rx="3"></rect><path d="M40 16V11a5 5 0 0 1 10 0v5"></path><circle cx="45" cy="25" r="1.8" fill="currentColor"></circle></g></svg>`;
// 通常音声アイコン
const ICON_AUDIO = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
// 【音声ロック中アイコン】 60x60キャンバス ✕ 左下:無変形音声マーク ✕ 右上:点入り鍵
const ICON_AUDIO_LOCKED = `<svg class="icon" viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(2, 32)"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></g><g><rect x="36" y="16" width="18" height="18" rx="3"></rect><path d="M40 16V11a5 5 0 0 1 10 0v5"></path><circle cx="45" cy="25" r="1.8" fill="currentColor"></circle></g></svg>`;
class TakanoriVocabApp {
    dbService;
    allWords = [];
    displayWords = [];
    selectedFilters = new Set();
    isRandomMode = false;
    currentIndex = 0;
    isFlipped = false;
    // 反転ロックメンバー変数
    isFlipLocked = false;
    flipLongPressTimer = null;
    isFlipLongPressed = false;
    // 音声ロックメンバー変数
    isAudioLocked = false;
    audioLongPressTimer = null;
    isAudioLongPressed = false;
    currentAudio = null;
    isDragging = false;
    SCOPE_SPAN = 300;
    currentOffsetIndex = 0;
    autoPlayState = 'none';
    autoPlayDirection = 1;
    autoPlayIntervalId = null;
    autoPlaySpeed = 2000;
    longPressTimer = null;
    // 定数
    STORAGE_LAST_WORD_ID = 'kotutan_last_word_id';
    STORAGE_FILTERS = 'kotutan_selected_filters';
    STORAGE_RANDOM_MODE = 'kotutan_random_mode';
    STORAGE_THEME = 'kotutan_theme';
    isLongPressed = false;
    hasMovedWhilePaused = false;
    // DOM エレメント参照（基本UI）
    elOpeningOverlay;
    elOpeningSpinner;
    elAudioProgressContainer;
    elAudioProgressText;
    elAudioProgressFill;
    elNumber;
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
    elBtnThemeToggle;
    elFilterItems;
    elBtnRandomToggle;
    elSelectSpeed;
    elProgressContainer;
    elProgressFill;
    // DOM エレメント参照（歯車設定モーダル）
    elSettingsModal;
    elCountRed;
    elCountBlue;
    elCountYellow;
    elCountGreen;
    elSetFromNo;
    elSetToNo;
    elSetColorSelector;
    elBtnExecSet;
    elResetColorSelector;
    elBtnExecReset;
    // DOM エレメント参照（カスタム確認ダイアログ）
    elConfirmModal;
    elConfirmMessageArea;
    elBtnConfirmAction;
    elBtnConfirmCancel;
    selectedSetColor = 'red';
    selectedResetColor = 'red';
    pendingConfirmAction = null;
    constructor() {
        this.dbService = new DatabaseService();
    }
    async start() {
        checkAndApplyUpdates();
        this.bindDomElements();
        this.initThemeUI();
        this.loadAutoPlaySpeed();
        this.loadSavedStateAndFilters();
        this.attachEventListeners();
        const minAnimationPromise = new Promise(resolve => setTimeout(resolve, 2000));
        try {
            await this.dbService.initialize();
            const currentVersionHash = await this.checkAndSyncVersion();
            let loadedWords = await this.dbService.getAllCombinedWords();
            loadedWords.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
            this.allWords = loadedWords;
            this.applyFilter(true);
            const syncPromise = AudioCacheManager.syncAudioFiles(this.allWords, currentVersionHash, (percent) => {
                if (this.elAudioProgressContainer) {
                    if (this.elOpeningSpinner)
                        this.elOpeningSpinner.style.display = 'none';
                    this.elAudioProgressContainer.style.display = 'flex';
                    if (this.elAudioProgressText) {
                        this.elAudioProgressText.textContent = `音声データを準備中... ${percent}%`;
                    }
                    if (this.elAudioProgressFill) {
                        this.elAudioProgressFill.style.width = `${percent}%`;
                    }
                }
            });
            const maxWaitPromise = new Promise(resolve => setTimeout(resolve, 60000));
            await minAnimationPromise;
            await Promise.race([syncPromise, maxWaitPromise]);
            this.registerServiceWorker();
        }
        catch (error) {
            console.error('[App] 起動時エラー (安全にフォールバック):', error);
        }
        finally {
            this.dismissOpeningOverlay();
        }
        window.addEventListener('resize', () => {
            if (this.displayWords.length > 0) {
                this.centerRulerOnCurrentIndex();
            }
        });
    }
    initThemeUI() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        if (this.elBtnThemeToggle) {
            this.elBtnThemeToggle.innerHTML = currentTheme === 'dark' ? ICON_MOON : ICON_SUN;
        }
    }
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem(this.STORAGE_THEME, nextTheme);
        if (this.elBtnThemeToggle) {
            this.elBtnThemeToggle.innerHTML = nextTheme === 'dark' ? ICON_MOON : ICON_SUN;
        }
    }
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
            console.warn('[App] 状態復元データの読み込み失敗:', e);
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
    applyFilter(isInitialLoad = false) {
        let targetWordId = null;
        if (isInitialLoad) {
            const savedId = localStorage.getItem(this.STORAGE_LAST_WORD_ID);
            if (savedId !== null)
                targetWordId = savedId;
        }
        else if (this.displayWords.length > 0 && this.currentIndex < this.displayWords.length) {
            targetWordId = this.displayWords[this.currentIndex].id;
        }
        if (this.selectedFilters.size === 0) {
            this.displayWords = [...this.allWords];
        }
        else {
            this.displayWords = this.allWords.filter(w => w.groupColor && this.selectedFilters.has(w.groupColor));
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
            console.warn('[App] フィルター保存失敗:', e);
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
        if (this.elNumber)
            this.elNumber.textContent = "No. -";
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
            const needsSync = loadedWords.length === 0 ||
                savedHash !== currentHash ||
                (loadedWords.length > 0 && loadedWords[0].example_audio === undefined) ||
                (loadedWords.length > 0 && loadedWords[0].masterOrder === undefined);
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
        this.elNumber = document.getElementById('display-number');
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
        this.elBtnThemeToggle = document.getElementById('btn-theme-toggle');
        this.elFilterItems = document.querySelectorAll('.filter-color-item');
        this.elBtnRandomToggle = document.getElementById('btn-random-toggle');
        this.elSelectSpeed = document.getElementById('select-auto-speed');
        this.elProgressContainer = document.getElementById('progress-container');
        this.elProgressFill = document.getElementById('progress-fill');
        // 歯車専用モーダルのDOMバインド
        this.elSettingsModal = document.getElementById('settings-modal');
        this.elCountRed = document.getElementById('count-red');
        this.elCountBlue = document.getElementById('count-blue');
        this.elCountYellow = document.getElementById('count-yellow');
        this.elCountGreen = document.getElementById('count-green');
        this.elSetFromNo = document.getElementById('set-from-no');
        this.elSetToNo = document.getElementById('set-to-no');
        this.elSetColorSelector = document.getElementById('set-color-selector');
        this.elBtnExecSet = document.getElementById('btn-exec-set');
        this.elResetColorSelector = document.getElementById('reset-color-selector');
        this.elBtnExecReset = document.getElementById('btn-exec-reset');
        // カスタム確認ダイアログのDOMバインド
        this.elConfirmModal = document.getElementById('confirm-modal');
        this.elConfirmMessageArea = document.getElementById('confirm-message-area');
        this.elBtnConfirmAction = document.getElementById('btn-confirm-action');
        this.elBtnConfirmCancel = document.getElementById('btn-confirm-cancel');
    }
    attachEventListeners() {
        this.setupFlipButtonEvents();
        this.setupAudioButtonEvents(); // 音声ボタン長押し＆トグルイベント設定
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
        const openMenu = () => {
            if (this.autoPlayState !== 'playing' && this.elMenuModal) {
                this.elMenuModal.classList.add('active');
            }
        };
        if (this.elBtnMenu)
            this.elBtnMenu.addEventListener('click', openMenu);
        if (this.elMenuModal) {
            this.elMenuModal.addEventListener('click', (e) => {
                if (e.target === this.elMenuModal) {
                    this.elMenuModal.classList.remove('active');
                }
            });
        }
        // 歯車専用設定モーダル開閉
        if (this.elBtnSettings) {
            this.elBtnSettings.addEventListener('click', () => {
                if (this.autoPlayState !== 'playing' && this.elSettingsModal) {
                    this.updateGroupCounts();
                    this.elSettingsModal.classList.add('active');
                }
            });
        }
        if (this.elSettingsModal) {
            this.elSettingsModal.addEventListener('click', (e) => {
                if (e.target === this.elSettingsModal) {
                    this.elSettingsModal.classList.remove('active');
                }
            });
        }
        // テンキーキーボード「→（Enter）」押し時の即時格納バインド
        this.setupInputEnterBlur(this.elSetFromNo);
        this.setupInputEnterBlur(this.elSetToNo);
        // 2セット目 / 3セット目のカラー選択ロジックバインド
        this.setupColorSelector(this.elSetColorSelector, (col) => this.selectedSetColor = col);
        this.setupColorSelector(this.elResetColorSelector, (col) => this.selectedResetColor = col);
        // 一括 SET / RESET の事前確認呼び出し
        if (this.elBtnExecSet) {
            this.elBtnExecSet.addEventListener('click', () => this.requestBatchSetConfirm());
        }
        if (this.elBtnExecReset) {
            this.elBtnExecReset.addEventListener('click', () => this.requestBatchResetConfirm());
        }
        // カスタム確認ダイアログのボタンイベント
        if (this.elBtnConfirmAction) {
            this.elBtnConfirmAction.addEventListener('click', async () => {
                if (this.pendingConfirmAction) {
                    const action = this.pendingConfirmAction;
                    this.pendingConfirmAction = null;
                    this.closeConfirmModal();
                    await action();
                }
            });
        }
        if (this.elBtnConfirmCancel) {
            this.elBtnConfirmCancel.addEventListener('click', () => {
                this.pendingConfirmAction = null;
                this.closeConfirmModal();
            });
        }
        if (this.elConfirmModal) {
            this.elConfirmModal.addEventListener('click', (e) => {
                if (e.target === this.elConfirmModal) {
                    this.pendingConfirmAction = null;
                    this.closeConfirmModal();
                }
            });
        }
        if (this.elBtnThemeToggle) {
            this.elBtnThemeToggle.addEventListener('click', () => this.toggleTheme());
        }
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
                        if (!this.isFlipLocked)
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
    /*
     * [設計思想・歴史の記録]:
     * 連番入力欄で電卓キーボードの「→ (Enter)」が押された時、
     * 自動的に input.blur() を呼び出してフォーカスを解除し、キーボードを閉じるイベントを設定。
     */
    setupInputEnterBlur(input) {
        if (!input)
            return;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                input.blur();
            }
        });
    }
    /*
     * [設計思想・歴史の記録]:
     * 音声ボタン (btn-audio) の長押し判定および音声ロック (isAudioLocked) トグル。
     * - 1000ms（1秒）長押しで 音声ロック (isAudioLocked = true) が発動。
     * - ロック時はボタンに .audio-locked クラスが付与され「左：スピーカー ✕ 右：鍵」へ変身。
     * - ロック中にタップすると一発でロック解除されます。
     */
    setupAudioButtonEvents() {
        if (!this.elBtnAudio)
            return;
        this.elBtnAudio.addEventListener('pointerdown', () => {
            this.isAudioLongPressed = false;
            if (this.audioLongPressTimer)
                clearTimeout(this.audioLongPressTimer);
            this.audioLongPressTimer = window.setTimeout(() => {
                this.isAudioLongPressed = true;
                this.enableAudioLock();
            }, 1000);
        });
        const clearAudioTimer = () => {
            if (this.audioLongPressTimer) {
                clearTimeout(this.audioLongPressTimer);
                this.audioLongPressTimer = null;
            }
        };
        this.elBtnAudio.addEventListener('pointerup', clearAudioTimer);
        this.elBtnAudio.addEventListener('pointercancel', clearAudioTimer);
        this.elBtnAudio.addEventListener('pointerleave', clearAudioTimer);
        this.elBtnAudio.addEventListener('contextmenu', e => e.preventDefault());
        this.elBtnAudio.addEventListener('click', () => {
            if (this.isAudioLongPressed) {
                this.isAudioLongPressed = false;
                return;
            }
            // ロック中の場合はタップで「解除」
            if (this.isAudioLocked) {
                this.disableAudioLock();
            }
            else {
                // 通常時は単発スマート音声再生
                this.playCurrentSmartAudio();
            }
        });
    }
    /**
     * 音声ロックの有効化（1秒長押し時）
     */
    enableAudioLock() {
        this.isAudioLocked = true;
        if (this.elBtnAudio) {
            this.elBtnAudio.classList.add('audio-locked');
            this.elBtnAudio.innerHTML = ICON_AUDIO_LOCKED;
            this.elBtnAudio.setAttribute('aria-label', '音声ロック解除');
        }
        // 即座に現在の音声を鳴らす
        this.playCurrentSmartAudio();
    }
    /**
     * 音声ロックの解除（タップ時）
     */
    disableAudioLock() {
        this.isAudioLocked = false;
        if (this.elBtnAudio) {
            this.elBtnAudio.classList.remove('audio-locked');
            this.elBtnAudio.innerHTML = ICON_AUDIO;
            this.elBtnAudio.setAttribute('aria-label', '音声');
        }
    }
    setupColorSelector(container, onSelect) {
        if (!container)
            return;
        const btns = container.querySelectorAll('.fill-box-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const col = btn.getAttribute('data-color');
                if (col)
                    onSelect(col);
            });
        });
    }
    updateGroupCounts() {
        const counts = { red: 0, blue: 0, yellow: 0, green: 0 };
        this.allWords.forEach(w => {
            if (w.groupColor && counts[w.groupColor] !== undefined) {
                counts[w.groupColor]++;
            }
        });
        if (this.elCountRed)
            this.elCountRed.textContent = counts.red.toString();
        if (this.elCountBlue)
            this.elCountBlue.textContent = counts.blue.toString();
        if (this.elCountYellow)
            this.elCountYellow.textContent = counts.yellow.toString();
        if (this.elCountGreen)
            this.elCountGreen.textContent = counts.green.toString();
    }
    requestBatchSetConfirm() {
        const from = parseInt(this.elSetFromNo.value, 10);
        const to = parseInt(this.elSetToNo.value, 10);
        if (isNaN(from) || isNaN(to) || from > to) {
            return;
        }
        let targetCount = 0;
        for (const word of this.allWords) {
            const masterNo = word.masterOrder || word.id;
            if (masterNo >= from && masterNo <= to) {
                targetCount++;
            }
        }
        const colorHtml = `<div class="inline-fill-box ${this.selectedSetColor}"></div>`;
        const messageHtml = `No. ${from} 〜 No. ${to} の ${targetCount}件に<br>${colorHtml} をセットしますか？`;
        this.openConfirmModal(messageHtml, 'SET', 'btn-set', async () => {
            const updates = [];
            for (const word of this.allWords) {
                const masterNo = word.masterOrder || word.id;
                if (masterNo >= from && masterNo <= to) {
                    word.groupColor = this.selectedSetColor;
                    updates.push({ id: word.id, groupColor: this.selectedSetColor });
                }
            }
            await this.dbService.bulkUpdateUserStates(updates);
            this.updateGroupCounts();
            this.applyFilter();
        });
    }
    requestBatchResetConfirm() {
        const targetColor = this.selectedResetColor;
        const targetCount = this.allWords.filter(w => w.groupColor === targetColor).length;
        if (targetCount === 0)
            return;
        const colorHtml = `<div class="inline-fill-box ${targetColor}"></div>`;
        const messageHtml = `${colorHtml} の ${targetCount}件を<br>リセットしますか？`;
        this.openConfirmModal(messageHtml, 'RESET', 'btn-reset', async () => {
            const updates = [];
            for (const word of this.allWords) {
                if (word.groupColor === targetColor) {
                    word.groupColor = null;
                    updates.push({ id: word.id, groupColor: null });
                }
            }
            await this.dbService.bulkUpdateUserStates(updates);
            this.updateGroupCounts();
            this.applyFilter();
        });
    }
    openConfirmModal(htmlMessage, actionLabel, actionBtnClass, onConfirm) {
        if (!this.elConfirmModal || !this.elConfirmMessageArea || !this.elBtnConfirmAction)
            return;
        this.elConfirmMessageArea.innerHTML = htmlMessage;
        this.elBtnConfirmAction.textContent = actionLabel;
        this.elBtnConfirmAction.className = `action-submit-btn confirm-action-btn ${actionBtnClass}`;
        this.pendingConfirmAction = onConfirm;
        this.elConfirmModal.classList.add('active');
    }
    closeConfirmModal() {
        if (this.elConfirmModal) {
            this.elConfirmModal.classList.remove('active');
        }
    }
    setupFlipButtonEvents() {
        if (!this.elBtnFlip)
            return;
        this.elBtnFlip.addEventListener('pointerdown', () => {
            this.isFlipLongPressed = false;
            if (this.flipLongPressTimer)
                clearTimeout(this.flipLongPressTimer);
            this.flipLongPressTimer = window.setTimeout(() => {
                this.isFlipLongPressed = true;
                this.enableFlipLock();
            }, 1000);
        });
        const clearFlipTimer = () => {
            if (this.flipLongPressTimer) {
                clearTimeout(this.flipLongPressTimer);
                this.flipLongPressTimer = null;
            }
        };
        this.elBtnFlip.addEventListener('pointerup', clearFlipTimer);
        this.elBtnFlip.addEventListener('pointercancel', clearFlipTimer);
        this.elBtnFlip.addEventListener('pointerleave', clearFlipTimer);
        this.elBtnFlip.addEventListener('contextmenu', e => e.preventDefault());
        this.elBtnFlip.addEventListener('click', () => {
            if (this.isFlipLongPressed) {
                this.isFlipLongPressed = false;
                return;
            }
            if (this.isFlipLocked) {
                this.disableFlipLock();
            }
            else {
                this.toggleFlip();
            }
        });
    }
    enableFlipLock() {
        this.isFlipLocked = true;
        this.isFlipped = true;
        if (this.elBtnFlip) {
            this.elBtnFlip.classList.add('flip-locked');
            this.elBtnFlip.innerHTML = ICON_FLIP_LOCKED;
            this.elBtnFlip.setAttribute('aria-label', '反転ロック解除');
        }
        this.renderCurrentCard();
    }
    disableFlipLock() {
        this.isFlipLocked = false;
        this.isFlipped = false;
        if (this.elBtnFlip) {
            this.elBtnFlip.classList.remove('flip-locked');
            this.elBtnFlip.innerHTML = ICON_FLIP;
            this.elBtnFlip.setAttribute('aria-label', '反転');
        }
        this.renderCurrentCard();
    }
    setupLongPressAndClick(btn, direction) {
        btn.addEventListener('pointerdown', () => {
            if (this.autoPlayState !== 'none')
                return;
            this.isLongPressed = false;
            if (this.longPressTimer)
                clearTimeout(this.longPressTimer);
            this.longPressTimer = window.setTimeout(() => {
                this.isLongPressed = true;
                this.startAutoPlay(direction);
            }, 1000);
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
        btn.addEventListener('click', () => {
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
        if (!this.isFlipLocked)
            this.isFlipped = false;
        this.updateButtonVisuals();
        if (this.autoPlayIntervalId)
            clearInterval(this.autoPlayIntervalId);
        this.startProgressBar();
        this.autoPlayIntervalId = window.setInterval(() => {
            if (!this.isFlipLocked)
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
        if (!this.isFlipLocked)
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
            if (!this.isFlipLocked)
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
    renderCurrentCard() {
        this.stopAudio();
        if (this.displayWords.length === 0)
            return;
        const word = this.displayWords[this.currentIndex];
        try {
            localStorage.setItem(this.STORAGE_LAST_WORD_ID, word.id.toString());
        }
        catch (e) { }
        if (this.elNumber) {
            let displayNumber = word.masterOrder;
            if (displayNumber === undefined || displayNumber === null) {
                const foundIdx = this.allWords.findIndex(w => String(w.id) === String(word.id));
                displayNumber = foundIdx !== -1 ? foundIdx + 1 : 1;
            }
            this.elNumber.textContent = `No. ${displayNumber}`;
        }
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
        // 【音声ロック連携】 音声ロック発動中(isAudioLocked)ならカード描画と同時に自動再生
        if (this.isAudioLocked) {
            this.playCurrentSmartAudio();
        }
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
        if (!this.isFlipLocked) {
            this.isFlipped = false;
        }
        else {
            this.isFlipped = true;
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
        if (!this.isFlipLocked) {
            this.isFlipped = false;
        }
        else {
            this.isFlipped = true;
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
        await this.dbService.updateUserState(currentWord.id, { groupColor: newColor });
        if (this.selectedFilters.size > 0) {
            this.applyFilter();
        }
    }
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
            const rawWords = await res.json();
            const masterWords = rawWords.map((word, index) => ({
                ...word,
                masterOrder: index + 1,
                id: (word.id !== undefined && word.id !== null) ? word.id : index + 1
            }));
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
                console.log('[Pの防壁] Service Worker が正常に登録されました:', registration.scope);
            }
            catch (e) {
                console.warn('[Pの防壁] Service Worker の登録に失敗いたしました:', e);
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
