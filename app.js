/**
 * ============================================================================
 * 【歴史の石版】 コツ単 全SVGベクター化 ✕ 動的アイコン制御層 (app.ts)
 * ============================================================================
 * ［開発者とパートナーの記録］
 * 開発指揮: タカノリさん
 * 開発実装: P (タカノリさんを誠心誠意支える専属ハッカー)
 *
 * ［アーキテクチャの歴史と設計思想の完全記録（セッション継承用記憶核）］
 * 1. テキスト撤廃とSVG動的インジェクション (Dynamic SVG Injection):
 *    - 絵文字やテキスト文字の依存を完全に排除するため、ICON_PREV, ICON_NEXT, ICON_PAUSE などの
 *      高解像度SVG文字列を定数として定義。
 *    - updateButtonVisuals において、textContent ではなく innerHTML を用いて
 *      安全にSVGをボタン内へ流し込み、再生状態(playing/paused)に完璧に連従させる。
 *
 * 2. 完璧なる絶対神挙動の継承 (Legacy of Perfection):
 *    - 一時停止中のワープ位置保持、一発不発防止の自動フラグ消滅防護壁、蛍光プログレスバーの
 *      タイムラグなし完全同期、定規と覗き窓の 1px=1語 ヌルヌルスライドは1ミリの狂いもなく防衛。
 * ============================================================================
 */
import { DatabaseService } from './db.js';
// 【Pの精査】 洗練されたSVGベクターアイコン群の定義
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
    isLongPressed = false;
    hasMovedWhilePaused = false;
    // DOM エレメント参照
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
        this.bindDomElements();
        this.loadAutoPlaySpeed();
        this.attachEventListeners();
        try {
            await this.dbService.initialize();
            await this.checkAndSyncVersion();
            let loadedWords = await this.dbService.getAllCombinedWords();
            loadedWords.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
            this.allWords = loadedWords;
            this.applyFilter();
            this.registerServiceWorker();
            window.addEventListener('resize', () => {
                if (this.displayWords.length > 0) {
                    this.centerRulerOnCurrentIndex();
                }
            });
        }
        catch (error) {
            console.error('[App] 起動エラー:', error);
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
    applyFilter() {
        const currentWordId = this.displayWords.length > 0 ? this.displayWords[this.currentIndex].id : null;
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
        if (currentWordId) {
            const foundIndex = this.displayWords.findIndex(w => w.id === currentWordId);
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
    async checkAndSyncVersion() {
        try {
            const res = await fetch(`version.json?t=${Date.now()}`);
            if (!res.ok) {
                let loaded = await this.dbService.getAllCombinedWords();
                if (loaded.length === 0)
                    await this.loadMasterJsonData('1.0.0');
                return;
            }
            const serverVersion = await res.json();
            const currentMeta = await this.dbService.getAppMeta();
            const currentHash = currentMeta ? currentMeta.dataVersion : '';
            const newHash = serverVersion.data_hash || serverVersion.version;
            let loadedWords = await this.dbService.getAllCombinedWords();
            const needsSync = loadedWords.length === 0 || currentHash !== newHash || (loadedWords.length > 0 && loadedWords[0].example_audio === undefined);
            if (needsSync) {
                await this.loadMasterJsonData(newHash);
            }
        }
        catch (e) {
            let loaded = await this.dbService.getAllCombinedWords();
            if (loaded.length === 0)
                await this.loadMasterJsonData('1.0.0');
        }
    }
    bindDomElements() {
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
    /**
     * 【Pの精査】 テキストを完全撤廃し、SVGコードの流し込みによる美しいボタン状態制御
     */
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
                this.elBtnNext.innerHTML = ICON_PAUSE; // SVGで一時停止
            }
            else {
                this.elBtnNext.classList.add('btn-disabled');
                this.elBtnPrev.classList.remove('btn-disabled');
                this.elBtnPrev.innerHTML = ICON_PAUSE; // SVGで一時停止
            }
        }
        else if (this.autoPlayState === 'paused') {
            this.elBtnStopAuto.style.display = 'flex';
            this.elBtnFlip.classList.remove('btn-disabled');
            this.elBtnAudio.classList.remove('btn-disabled');
            this.elBtnPrev.classList.remove('btn-disabled');
            this.elBtnNext.classList.remove('btn-disabled');
            if (this.autoPlayDirection === 1) {
                this.elBtnNext.innerHTML = ICON_NEXT; // 再開 (Play) SVG
                this.elBtnPrev.innerHTML = ICON_PREV;
            }
            else {
                this.elBtnPrev.innerHTML = ICON_PREV; // 再開 (Play) SVG
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
        await this.dbService.updateUserState(currentWord.id, { groupColor: newColor });
        if (this.selectedFilters.size > 0) {
            this.applyFilter();
        }
    }
    playCurrentSmartAudio() {
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
        const audioPath = `audio/${targetFilename}`;
        const audio = new Audio(audioPath);
        this.currentAudio = audio;
        audio.play().catch((err) => {
            console.warn(`[Audio] 再生不可 (${audioPath}):`, err.message);
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
    /**
     * ============================================================================
     * 【歴史の石版】 Service Worker 登録・即時覚醒層 (app.ts)
     * ============================================================================
     * ［設計思想 ＆ 防衛ロジック］
     * - window.addEventListener('load') のみで登録を行うと、DOMContentLoaded 実行時に
     *   すでに load イベントが完了していた場合、登録ハンドラが永遠に発火しないリスク（レースコンディション）が存在する。
     * - document.readyState === 'complete' による事前判定を導入し、
     *   ロード完了後であれば即時登録、未完了であれば load イベント待機という二重防護を展開。
     * - これにより、いかなる通信速度や端末環境でも100%確実に sw.js を登録・動作させる。
     * ============================================================================
     */
    /**
     * ============================================================================
     * 【歴史の石版】 Service Worker 登録・即時覚醒層 (app.ts)
     * ============================================================================
     * ［開発者とパートナーの記録］
     * 開発指揮: タカノリさん
     * 開発実装: P (タカノリさんを誠心誠意支える専属ハッカー)
     *
     * ［アーキテクチャの歴史と設計思想の完全記録（セッション継承用記憶核）］
     * 1. 参照透明性と SSOT (Single Source of Truth) の厳格化:
     *    - 登録対象スクリプトを単一バンドル成果物である ./sw.min.js に原本レベルで直接固定。
     *    - ビルドパイプラインの文字列置換処理への暗黙依存を完全脱却し、
     *      404 非存在参照による接続拒絶エラーおよび「このサイトにアクセスできません」を物理根絶。
     *
     * 2. レースコンディション（登録制御漏れ）完全防衛:
     *    - window.addEventListener('load') のみで登録を行うと、DOMContentLoaded 実行時に
     *      すでに load イベントが完了していた場合、登録ハンドラが永遠に発火しないリスクが存在する。
     *    - document.readyState === 'complete' による事前判定を導入し、
     *      ロード完了後であれば即時登録、未完了であれば load イベント待機という二重防護を展開。
     * ============================================================================
     */
    registerServiceWorker() {
        if (!('serviceWorker' in navigator))
            return;
        const registerScript = async () => {
            try {
                // コンパイル・バンドル後の sw.min.js を直接指定して完全安全登録
                const registration = await navigator.serviceWorker.register('./sw.min.js', { scope: './' });
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
