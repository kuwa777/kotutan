/**
 * ============================================================================
 * 【歴史の石版】 CSV自動解析モジュール (csvParser.ts)
 * ============================================================================
 * ［開発者とパートナーの記録］
 * 開発指揮: タカノリさん
 * 開発実装: P (タカノリさんを誠心誠意支える専属ハッカー)
 *
 * ［アーキテクチャの歴史と設計思想の完全記録（セッション継承用記憶核）］
 * 1. MasterWord 型体系への完全適合 (TS2305 エラー物理排除):
 *    - 旧 Word インターフェースから、二層分離アーキテクチャの中核である MasterWord 型へ移行。
 *    - import パスへ '.js' 拡張子を付与し、Native ES Modules 環境での 404 エラーを完全防衛。
 *
 * 2. 高堅牢 CSV パース機構:
 *    - Shift-JIS (CP932) / UTF-8 エンコーディングの自動判別。
 *    - セル内改行（マルチライン）およびエスケープされたダブルクォーテーションの完全解析。
 *    - Unicode NFC 正規化によるインデックス不全および DoS 攻撃の物理防御。
 * ============================================================================
 */
import { LIMITS } from './constants.js';
/**
 * ArrayBuffer から UTF-8 / Shift-JIS (CP932) を自動判定して文字列にデコードする
 */
export function decodeCsvBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    // 1. UTF-8 BOM (\uFEFF) の存在確認
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    // 2. UTF-8 厳格デコードの試行
    try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        return utf8Decoder.decode(bytes);
    }
    catch {
        // 3. 失敗した場合は Excel (Windows) 標準の Shift-JIS (CP932) として解凍
        const sjisDecoder = new TextDecoder('shift-jis');
        return sjisDecoder.decode(bytes);
    }
}
/**
 * CSVテキストをパースし、MasterWord オブジェクト配列へ安全に変換する
 */
export function parseWordCsv(csvText) {
    if (!csvText || typeof csvText !== 'string') {
        return { words: [], totalCount: 0 };
    }
    // 文字単位の完全ステートメント解析 (セル内改行対応)
    const rows = [];
    let currentRow = [];
    let currentCell = [];
    let inQuotes = false;
    let text = csvText.startsWith('\ufeff') ? csvText.slice(1) : csvText;
    const len = text.length;
    for (let i = 0; i < len; i++) {
        const char = text[i];
        if (char === '"') {
            if (inQuotes && i + 1 < len && text[i + 1] === '"') {
                currentCell.push('"');
                i++;
            }
            else {
                inQuotes = !inQuotes;
            }
        }
        else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell.join(''));
            currentCell = [];
        }
        else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && i + 1 < len && text[i + 1] === '\n') {
                i++;
            }
            currentRow.push(currentCell.join(''));
            currentCell = [];
            if (currentRow.some(cell => cell.trim().length > 0)) {
                rows.push(currentRow);
            }
            currentRow = [];
        }
        else {
            currentCell.push(char);
        }
    }
    if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell.join(''));
        if (currentRow.some(cell => cell.trim().length > 0)) {
            rows.push(currentRow);
        }
    }
    if (rows.length === 0) {
        return { words: [], totalCount: 0 };
    }
    // ヘッダー行の解析と動的マッピング
    const header = rows[0];
    let termIdx = -1;
    let ipaIdx = -1;
    let posIdx = -1;
    let defIdx = -1;
    let exIdx = -1;
    let startRowIndex = 0;
    header.forEach((cell, idx) => {
        const lower = cell.toLowerCase().trim();
        if (lower.includes('単語') || lower === 'term' || lower === 'word')
            termIdx = idx;
        if (lower.includes('発音') || lower.includes('ipa'))
            ipaIdx = idx;
        if (lower.includes('品詞') || lower.includes('pos') || lower.includes('partofspeech'))
            posIdx = idx;
        if (lower.includes('意味') || lower.includes('definition') || lower.includes('def'))
            defIdx = idx;
        if (lower.includes('例文') || lower.includes('example') || lower.includes('sentence'))
            exIdx = idx;
    });
    if (termIdx === -1 && defIdx === -1) {
        // ヘッダーなしCSVのデフォルト割り当て (0:単語, 1:発音記号, 2:品詞, 3:意味, 4:例文)
        termIdx = 0;
        ipaIdx = header.length > 1 ? 1 : -1;
        posIdx = header.length > 2 ? 2 : -1;
        defIdx = header.length > 3 ? 3 : 1;
        exIdx = header.length > 4 ? 4 : -1;
        startRowIndex = 0;
    }
    else {
        startRowIndex = 1;
    }
    const parsedWords = [];
    for (let i = startRowIndex; i < rows.length; i++) {
        const row = rows[i];
        if (parsedWords.length >= LIMITS.MAX_WORDS_PER_IMPORT)
            break;
        const rawTerm = termIdx !== -1 && row[termIdx] ? row[termIdx] : '';
        const rawIpa = ipaIdx !== -1 && row[ipaIdx] ? row[ipaIdx] : '';
        const rawPos = posIdx !== -1 && row[posIdx] ? row[posIdx] : '';
        const rawDef = defIdx !== -1 && row[defIdx] ? row[defIdx] : '';
        const rawEx = exIdx !== -1 && row[exIdx] ? row[exIdx] : '';
        if (!rawTerm.trim() && !rawDef.trim())
            continue;
        parsedWords.push({
            term: rawTerm.normalize('NFC').trim().slice(0, LIMITS.MAX_WORD_TERM_LENGTH),
            ipa: rawIpa ? rawIpa.normalize('NFC').trim() : '',
            pos: rawPos ? rawPos.normalize('NFC').trim() : '',
            def: rawDef.normalize('NFC').trim().slice(0, LIMITS.MAX_WORD_DEF_LENGTH),
            example: rawEx ? rawEx.normalize('NFC').trim() : '',
            audio: '', // CSV読み込み時はデフォルト空文字
        });
    }
    return {
        words: parsedWords,
        totalCount: parsedWords.length,
    };
}
