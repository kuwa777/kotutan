import { LIMITS } from './constants.js';
export function decodeCsvBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        return utf8Decoder.decode(bytes);
    }
    catch {
        const sjisDecoder = new TextDecoder('shift-jis');
        return sjisDecoder.decode(bytes);
    }
}
export function parseWordCsv(csvText) {
    if (!csvText || typeof csvText !== 'string') {
        return { words: [], totalCount: 0 };
    }
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
            audio: '',
        });
    }
    return {
        words: parsedWords,
        totalCount: parsedWords.length,
    };
}
