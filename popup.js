'use strict';

document.addEventListener('DOMContentLoaded', () => {
    // Inputs
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('fileInput');

    // UI Elements
    const resultsSection = document.getElementById('results-section');
    const detectedSection = document.getElementById('detected-section');
    const detectedList = document.getElementById('detected-list');
    const convertBtn = document.getElementById('convert-detected-btn');
    const convertBtnLabel = document.getElementById('convert-btn-label');
    const selectAllBtn = document.getElementById('select-all-btn');
    const inlineNotice = document.getElementById('inline-notice');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const downloadAllLabel = document.getElementById('download-all-label');
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const displayModeRow = document.getElementById('display-mode-row');
    const displayModeToggle = document.getElementById('display-mode-toggle');
    const themeModeToggle = document.getElementById('theme-mode-toggle');
    const uiLanguageToggle = document.getElementById('ui-language-toggle');
    const pdfLanguageToggle = document.getElementById('pdf-language-toggle');
    const retentionRange = document.getElementById('retention-range');
    const retentionValue = document.getElementById('retention-value');
    const pdfColorInput = document.getElementById('pdf-color-input');
    const pdfLogoInput = document.getElementById('pdf-logo-input');
    const pdfLogoButton = document.getElementById('pdf-logo-button');
    const pdfLogoClear = document.getElementById('pdf-logo-clear');
    const pdfLogoPreview = document.getElementById('pdf-logo-preview');
    const previewOverlay = document.getElementById('preview-overlay');
    const previewClose = document.getElementById('preview-close');
    const previewFrame = document.getElementById('preview-iframe');
    const previewTitle = document.getElementById('preview-title');
    let previewModal = null;

    const DAY_MS = 24 * 60 * 60 * 1000;

    const DEFAULT_SETTINGS = {
        displayMode: 'sidepanel',
        themeMode: 'auto',
        uiLanguage: 'hr',
        pdfLanguage: 'hr',
        pdfRetentionDays: 8,
        pdfAccentColor: '#2c3e50',
        pdfLogoDataUrl: ''
    };

    const displayModeSupported = !!chrome.sidePanel;

    const prefersDarkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    let settings = { ...DEFAULT_SETTINGS };
    let uiMessages = {};
    let pdfMessages = {};
    const pdfMessagesCache = {};

    // State
    let detectedFiles = []; // { url, name, content, checked }
    let processedFiles = []; // { pdfName, xmlName, recipientName, invoiceTotal, invoiceCurrency, xmlContent, processedAt, isPdfDownloaded, isXmlDownloaded, pdfLanguage, pdfAccentColor, pdfLogoDataUrl }
    let pdfBlobs = {}; // Map pdfName -> Blob (Runtime only)
    let selectedFileIds = new Set();
    let activePreviewUrl = '';
    let activePreviewId = '';

    init();

    async function init() {
        await loadSettings();
        await loadMessages();
        bindEvents();
        applyI18n();
        initTheme();
        initDisplayMode();
        updateSettingsUI();
        await loadState();
        scanPageForXmls();
    }

    function bindEvents() {
        settingsToggle.addEventListener('click', toggleSettingsPanel);

        zone.addEventListener('click', () => input.click());

        zone.addEventListener('dragover', (event) => {
            event.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));

        zone.addEventListener('drop', (event) => {
            event.preventDefault();
            zone.classList.remove('dragover');
            handleLocalFiles(event.dataTransfer.files);
        });

        input.addEventListener('change', (event) => handleLocalFiles(event.target.files));

        convertBtn.addEventListener('click', () => processDetectedFiles());

        selectAllBtn.addEventListener('click', () => {
            const allChecked = detectedFiles.every((file) => file.checked);
            detectedFiles.forEach((file) => {
                file.checked = !allChecked;
            });
            renderDetectedList();
        });

        document.getElementById('clear-btn').addEventListener('click', () => {
            processedFiles = [];
            pdfBlobs = {};
            selectedFileIds.clear();
            chrome.storage.local.remove('processingState');
            updateResultsVisibility();
            updateDownloadButtonLabel();
            closePreview();
            clearInlineNotice();
        });

        if (downloadAllBtn) {
            downloadAllBtn.addEventListener('click', handleBulkDownload);
        }

        displayModeToggle.addEventListener('click', toggleDisplayMode);
        themeModeToggle.addEventListener('click', toggleThemeMode);
        uiLanguageToggle.addEventListener('click', toggleUiLanguage);
        pdfLanguageToggle.addEventListener('click', togglePdfLanguage);

        retentionRange.addEventListener('input', () => {
            settings.pdfRetentionDays = clampRetention(Number(retentionRange.value));
            updateRetentionValue();
        });

        retentionRange.addEventListener('change', async () => {
            settings.pdfRetentionDays = clampRetention(Number(retentionRange.value));
            await chrome.storage.local.set({ pdfRetentionDays: settings.pdfRetentionDays });
        });

        pdfColorInput.addEventListener('input', async () => {
            settings.pdfAccentColor = pdfColorInput.value;
            await chrome.storage.local.set({ pdfAccentColor: settings.pdfAccentColor });
        });

        pdfLogoButton.addEventListener('click', () => pdfLogoInput.click());

        pdfLogoInput.addEventListener('change', async () => {
            const file = pdfLogoInput.files && pdfLogoInput.files[0];
            if (!file) return;
            const dataUrl = await readFileAsDataUrl(file);
            settings.pdfLogoDataUrl = dataUrl || '';
            await chrome.storage.local.set({ pdfLogoDataUrl: settings.pdfLogoDataUrl });
            updateLogoUI();
            pdfLogoInput.value = '';
        });

        pdfLogoClear.addEventListener('click', async () => {
            settings.pdfLogoDataUrl = '';
            await chrome.storage.local.set({ pdfLogoDataUrl: '' });
            updateLogoUI();
        });

        if (prefersDarkQuery) {
            if (prefersDarkQuery.addEventListener) {
                prefersDarkQuery.addEventListener('change', handleSystemThemeChange);
            } else if (prefersDarkQuery.addListener) {
                prefersDarkQuery.addListener(handleSystemThemeChange);
            }
        }

        if (previewOverlay && window.AppShared && window.AppShared.Modal) {
            previewModal = window.AppShared.Modal.create(previewOverlay, {
                initialFocus: () => previewClose,
                onClose: () => {
                    if (previewFrame) previewFrame.src = '';
                    if (activePreviewUrl) {
                        URL.revokeObjectURL(activePreviewUrl);
                        activePreviewUrl = '';
                        activePreviewId = '';
                    }
                }
            });
        }
        if (previewClose) {
            previewClose.addEventListener('click', () => closePreview());
        }
    }

    function toggleSettingsPanel() {
        const isOpen = settingsPanel.classList.toggle('open');
        settingsToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        settingsPanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        document.body.classList.toggle('settings-open', isOpen);
    }

    async function loadSettings() {
        const result = await chrome.storage.local.get([
            'displayMode',
            'themeMode',
            'uiLanguage',
            'pdfLanguage',
            'pdfRetentionDays',
            'pdfAccentColor',
            'pdfLogoDataUrl'
        ]);

        const legacyTheme = localStorage.getItem('theme');

        settings.displayMode = result.displayMode || DEFAULT_SETTINGS.displayMode;
        settings.themeMode = result.themeMode || legacyTheme || DEFAULT_SETTINGS.themeMode;
        settings.uiLanguage = result.uiLanguage || DEFAULT_SETTINGS.uiLanguage;
        settings.pdfLanguage = result.pdfLanguage || settings.uiLanguage || DEFAULT_SETTINGS.pdfLanguage;
        settings.pdfRetentionDays = clampRetention(
            Number.isFinite(result.pdfRetentionDays) ? result.pdfRetentionDays : DEFAULT_SETTINGS.pdfRetentionDays
        );
        
        settings.pdfAccentColor = result.pdfAccentColor || DEFAULT_SETTINGS.pdfAccentColor;
        settings.pdfLogoDataUrl = result.pdfLogoDataUrl || DEFAULT_SETTINGS.pdfLogoDataUrl;
    }

    async function loadMessages() {
        uiMessages = await loadLocaleMessages(settings.uiLanguage);
        pdfMessages = await loadLocaleMessages(settings.pdfLanguage);
        if (settings.pdfLanguage) {
            pdfMessagesCache[settings.pdfLanguage] = pdfMessages;
        }
    }

    function loadLocaleMessages(language) {
        if (!language) return Promise.resolve({});
        return window.AppShared.loadLocaleMessages(language);
    }

    function normalizeLanguage(language) {
        return window.AppShared.normalizeLanguage(language);
    }

    async function getPdfMessagesForLanguage(language) {
        const lang = normalizeLanguage(language);
        if (pdfMessagesCache[lang]) return pdfMessagesCache[lang];
        const messages = await loadLocaleMessages(lang);
        pdfMessagesCache[lang] = messages;
        return messages;
    }

    function formatMessage(template, substitutions) {
        return window.AppShared.formatMessage(template, substitutions);
    }

    function getMessage(messages, key, substitutions) {
        if (!messages || !messages[key] || !messages[key].message) return '';
        return formatMessage(messages[key].message, substitutions);
    }

    function uiI18n(key, substitutions) {
        const message = getMessage(uiMessages, key, substitutions);
        if (message) return message;
        if (chrome.i18n && chrome.i18n.getMessage) {
            return chrome.i18n.getMessage(key, substitutions);
        }
        return '';
    }

    function pdfI18n(key, substitutions) {
        const message = getMessage(pdfMessages, key, substitutions);
        if (message) return message;
        if (chrome.i18n && chrome.i18n.getMessage) {
            return chrome.i18n.getMessage(key, substitutions);
        }
        return '';
    }

    function applyI18n() {
        document.documentElement.setAttribute('lang', settings.uiLanguage || 'en');

        const pageTitle = uiI18n('pageTitle');
        if (pageTitle) {
            document.title = pageTitle;
        }

        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            const message = uiI18n(key);
            if (message) {
                el.textContent = message;
            }
        });

        document.querySelectorAll('[data-i18n-html]').forEach((el) => {
            const key = el.getAttribute('data-i18n-html');
            const message = uiI18n(key);
            if (message) {
                el.innerHTML = message;
            }
        });

        document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
            const pairs = el.getAttribute('data-i18n-attr').split(',');
            pairs.forEach((pair) => {
                const [attr, key] = pair.split(':').map((part) => part.trim());
                if (!attr || !key) return;
                const message = uiI18n(key);
                if (message) {
                    el.setAttribute(attr, message);
                }
            });
        });

        if (detectedFiles.length > 0) {
            renderDetectedList();
        } else {
            updateConvertButtonLabel(0);
            updateSelectAllLabel();
        }
        updateSettingsUI();
        updateDownloadButtonLabel();

        if (previewClose) {
            const closeLabel = uiI18n('closePreview') || 'Close preview';
            previewClose.setAttribute('aria-label', closeLabel);
            previewClose.setAttribute('title', closeLabel);
        }
        if (previewFrame) {
            previewFrame.setAttribute('title', uiI18n('previewPdf') || 'PDF preview');
        }

        if (processedFiles.length > 0) {
            showResults();
        }
    }

    function updateSettingsUI() {
        if (!displayModeSupported) {
            displayModeRow.style.display = 'none';
            settings.displayMode = 'popup';
        } else {
            displayModeRow.style.display = 'flex';
        }

        const displayLabel = settings.displayMode === 'sidepanel'
            ? uiI18n('displayModeSidepanel')
            : uiI18n('displayModePopup');
        displayModeToggle.textContent = displayLabel;

        const themeLabelKey = settings.themeMode === 'dark'
            ? 'themeDark'
            : settings.themeMode === 'light'
                ? 'themeLight'
                : 'themeAuto';
        themeModeToggle.textContent = uiI18n(themeLabelKey);

        const uiLangLabel = settings.uiLanguage === 'hr'
            ? uiI18n('languageCroatian')
            : uiI18n('languageEnglish');
        uiLanguageToggle.textContent = uiLangLabel;

        const pdfLangLabel = settings.pdfLanguage === 'hr'
            ? uiI18n('languageCroatian')
            : uiI18n('languageEnglish');
        pdfLanguageToggle.textContent = pdfLangLabel;

        retentionRange.value = String(settings.pdfRetentionDays);
        updateRetentionValue();

        pdfColorInput.value = settings.pdfAccentColor || DEFAULT_SETTINGS.pdfAccentColor;
        updateLogoUI();
    }

    function updateRetentionValue() {
        retentionValue.textContent = formatRetentionValue(settings.pdfRetentionDays) + (settings.pdfRetentionDays>0 && settings.pdfRetentionDays<2 ? uiI18n("retentionDaysSingle") : (settings.pdfRetentionDays<1 ? "" : uiI18n("retentionDaysPlural")));
    }

    function formatRetentionValue(days) {
        if (days === 0) {
            return uiI18n('retentionImmediate');
        }
        else if (days === 1){
            return 1;
        }
        
        return uiI18n('retentionDays', [String(days)]);
    }

    function updateLogoUI() {
        const hasLogo = Boolean(settings.pdfLogoDataUrl);
        pdfLogoButton.textContent = hasLogo ? uiI18n('pdfLogoChange') : uiI18n('pdfLogoUpload');
        pdfLogoClear.style.display = hasLogo ? 'inline-flex' : 'none';
        pdfLogoPreview.classList.toggle('hidden', !hasLogo);
        if (hasLogo) {
            pdfLogoPreview.innerHTML = '';
            const img = document.createElement('img');
            img.alt = uiI18n('settingPdfLogo');
            img.src = settings.pdfLogoDataUrl;
            pdfLogoPreview.appendChild(img);
        } else {
            pdfLogoPreview.innerHTML = '';
        }
    }

    function clampRetention(value) {
        if (!Number.isFinite(value)) return DEFAULT_SETTINGS.pdfRetentionDays;
        if (value < 0) return 0;
        if (value > 32) return 32;
        return value;
    }

    async function toggleDisplayMode() {
        if (!displayModeSupported) return;
        settings.displayMode = settings.displayMode === 'sidepanel' ? 'popup' : 'sidepanel';
        updateSettingsUI();
        await chrome.storage.local.set({ displayMode: settings.displayMode });

        const tabId = await getActiveTabId();

        if (settings.displayMode === 'sidepanel' && tabId) {
            try {
                // 1. Enable globally first to ensure path is registered
                if (chrome.sidePanel.setOptions) {
                    await chrome.sidePanel.setOptions({ path: 'popup.html', enabled: true });
                }
                
                // 2. Enable specifically for this tab to override any previous disabled state
                if (chrome.sidePanel.setOptions) {
                    await chrome.sidePanel.setOptions({ path: 'popup.html', enabled: true, tabId: tabId });
                }

                // 3. Open it (user gesture context)
                await chrome.sidePanel.open({ tabId: tabId });
            } catch (e) {
                console.error('Failed to open side panel from popup:', e);
            }
        }

        chrome.runtime.sendMessage(
            { 
                action: 'setDisplayMode', 
                mode: settings.displayMode, 
                tabId, 
                openPopup: settings.displayMode === 'popup',
                skipOpen: settings.displayMode === 'sidepanel' // We handled it here
            },
            () => {
                if (chrome.runtime.lastError) {
                    // ignore
                }
            }
        );

        if (settings.displayMode === 'sidepanel') {
            window.close();
        }
    }

    async function toggleThemeMode() {
        const order = ['auto', 'light', 'dark'];
        const currentIndex = order.indexOf(settings.themeMode);
        const nextMode = order[(currentIndex + 1) % order.length];
        settings.themeMode = nextMode;
        await chrome.storage.local.set({ themeMode: settings.themeMode });
        applyTheme(settings.themeMode);
        updateSettingsUI();
    }

    async function toggleUiLanguage() {
        settings.uiLanguage = settings.uiLanguage === 'hr' ? 'en' : 'hr';
        await chrome.storage.local.set({ uiLanguage: settings.uiLanguage });
        uiMessages = await loadLocaleMessages(settings.uiLanguage);
        applyI18n();
    }

    async function togglePdfLanguage() {
        settings.pdfLanguage = settings.pdfLanguage === 'hr' ? 'en' : 'hr';
        await chrome.storage.local.set({ pdfLanguage: settings.pdfLanguage });
        pdfMessages = await loadLocaleMessages(settings.pdfLanguage);
        pdfMessagesCache[settings.pdfLanguage] = pdfMessages;
        updateSettingsUI();
    }

    function initTheme() {
        applyTheme(settings.themeMode);
    }

    function applyTheme(mode) {
        const prefersDark = prefersDarkQuery ? prefersDarkQuery.matches : false;
        const useDark = mode === 'dark' || (mode === 'auto' && prefersDark);

        if (useDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    function handleSystemThemeChange() {
        if (settings.themeMode === 'auto') {
            applyTheme('auto');
        }
    }

    async function initDisplayMode() {
        if (!displayModeSupported) {
            displayModeRow.style.display = 'none';
            settings.displayMode = 'popup';
            await chrome.storage.local.set({ displayMode: 'popup' });
            return;
        }

        const result = await chrome.storage.local.get(['displayMode']);
        settings.displayMode = result.displayMode || DEFAULT_SETTINGS.displayMode;
        updateSettingsUI();
    }

    function getActiveTabId() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs && tabs[0] ? tabs[0].id : null);
            });
        });
    }

    async function buildPdfOptionsForFile(file) {
        const language = normalizeLanguage(file && file.pdfLanguage ? file.pdfLanguage : settings.pdfLanguage);
        const messages = await getPdfMessagesForLanguage(language);
        return {
            accentColor: file && file.pdfAccentColor ? file.pdfAccentColor : settings.pdfAccentColor,
            logoDataUrl: file && file.pdfLogoDataUrl ? file.pdfLogoDataUrl : settings.pdfLogoDataUrl,
            language,
            messages
        };
    }

    // --- Persistence ---

    async function saveState() {
        const state = processedFiles
            .filter((file) => getRetentionDaysForFile(file) > 0)
              .map((file) => ({
              internalId: file.internalId,
              invoiceId: file.invoiceId,
              pdfName: file.pdfName,
              xmlName: file.xmlName,
              recipientName: file.recipientName || '',
              invoiceTotal: Number.isFinite(file.invoiceTotal) ? file.invoiceTotal : null,
              invoiceCurrency: file.invoiceCurrency || '',
              xmlContent: file.xmlContent,
              processedAt: file.processedAt,
              isPdfDownloaded: file.isPdfDownloaded,
              isXmlDownloaded: file.isXmlDownloaded,
            pdfLanguage: file.pdfLanguage,
            pdfAccentColor: file.pdfAccentColor,
            pdfLogoDataUrl: file.pdfLogoDataUrl,
            pdfRetentionDays: file.pdfRetentionDays
        }));

        if (state.length === 0) {
            await chrome.storage.local.remove('processingState');
            return;
        }

        try {
            await chrome.storage.local.set({ processingState: state });
        } catch (e) {
            console.warn('Could not save state (quota exceeded?):', e);
        }
    }

    async function loadState() {
        try {
            const result = await chrome.storage.local.get(['processingState']);
            const stored = Array.isArray(result.processingState) ? result.processingState : [];

            if (stored.length === 0) {
                return;
            }

            const now = Date.now();
            const normalized = stored.map((file) => {
                const pdfName = file.pdfName || file.name || 'Invoice.pdf';
                const xmlName = file.xmlName || file.sourceName || file.originalName || deriveXmlName(pdfName);
                const internalId = file.internalId || Date.now().toString(36) + Math.random().toString(36).slice(2);
                const totalValue = (file.invoiceTotal === null || file.invoiceTotal === undefined)
                    ? NaN
                    : Number(file.invoiceTotal);
                return {
                    internalId,
                    invoiceId: file.invoiceId,
                    pdfName,
                    xmlName,
                    recipientName: file.recipientName || '',
                    invoiceTotal: Number.isFinite(totalValue) ? totalValue : null,
                    invoiceCurrency: file.invoiceCurrency || '',
                    xmlContent: file.xmlContent,
                    processedAt: file.processedAt || now,
                    isPdfDownloaded: Boolean(file.isPdfDownloaded || file.isDownloaded),
                    isXmlDownloaded: Boolean(file.isXmlDownloaded),
                    pdfLanguage: normalizeLanguage(file.pdfLanguage || settings.pdfLanguage),
                    pdfAccentColor: file.pdfAccentColor || settings.pdfAccentColor,
                    pdfLogoDataUrl: file.pdfLogoDataUrl || '',
                    pdfRetentionDays: Number.isFinite(file.pdfRetentionDays)
                        ? file.pdfRetentionDays
                        : settings.pdfRetentionDays
                };
            });

            const filtered = filterByRetention(normalized);
            processedFiles = filtered;

            let didUpdate = false;
            if (processedFiles.length > 0) {
                didUpdate = await regenerateBlobs();
                showResults();
            }

            if (filtered.length !== stored.length || didUpdate) {
                await saveState();
            }
        } catch (e) {
            console.error('Error loading state:', e);
        }
    }

    function filterByRetention(files) {
        return files.filter((file) => {
            const days = getRetentionDaysForFile(file);
            if (days <= 0) return false;
            const cutoff = Date.now() - days * DAY_MS;
            return (file.processedAt || 0) >= cutoff;
        });
    }

    function getRetentionDaysForFile(file) {
        if (file && Number.isFinite(file.pdfRetentionDays)) {
            return file.pdfRetentionDays;
        }
        return settings.pdfRetentionDays;
    }

    async function regenerateBlobs() {
        pdfBlobs = {};
        let didUpdate = false;

        for (const file of processedFiles) {
            try {
                const options = await buildPdfOptionsForFile(file);
                const parser = new InvoiceParser(file.xmlContent, options.language);
                const data = parser.parse();

                if (!file.invoiceId) {
                    file.invoiceId = data.invoiceId || 'unknown';
                    didUpdate = true;
                }

                if (enrichFileFromData(file, data)) {
                    didUpdate = true;
                }

                const doc = await createPdf(data, options);
                pdfBlobs[file.internalId] = doc.output('blob');
            } catch (e) {
                console.error('Error regenerating PDF:', file.pdfName, e);
            }
        }

        return didUpdate;
    }

    // --- Processing ---

    async function handleLocalFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        clearInlineNotice();
        try {
            const { files, zipStats, zipOrder } = await expandInputFiles(Array.from(fileList));
            const stats = await processBatch(files, zipStats);
            const lines = buildNoticeLines(stats, zipStats, zipOrder);
            showInlineNotice(lines);
        } catch (e) {
            console.error('Error handling local files:', e);
        } finally {
            if (input) {
                input.value = '';
            }
        }
    }

    async function expandInputFiles(files) {
        const expanded = [];
        const zipStats = {};
        const zipOrder = [];

        for (const file of files) {
            if (isZipFile(file)) {
                const extracted = await extractXmlFilesFromArchive(file);
                zipStats[file.name] = { valid: extracted.length, converted: 0, duplicates: 0 };
                zipOrder.push(file.name);
                expanded.push(...extracted);
            } else {
                expanded.push(file);
            }
        }

        return { files: expanded, zipStats, zipOrder };
    }

    function isZipFile(file) {
        if (!file) return false;
        const name = (file.name || '').toLowerCase();
        if (name.endsWith('.zip')) return true;
        const type = (file.type || '').toLowerCase();
        return type === 'application/zip' || type === 'application/x-zip-compressed' || type === 'multipart/x-zip';
    }

    function isXmlPath(path) {
        return Boolean(path) && String(path).toLowerCase().endsWith('.xml');
    }

    function getBaseName(path) {
        if (!path) return '';
        const normalized = String(path).replace(/\\/g, '/');
        const parts = normalized.split('/');
        return parts[parts.length - 1];
    }

    async function extractXmlFilesFromArchive(file) {
        try {
            const zip = await JSZip.loadAsync(file);
            const xmlEntries = [];

            zip.forEach((relativePath, entry) => {
                if (entry.dir) return;
                if (!isXmlPath(relativePath)) return;
                xmlEntries.push({ path: relativePath, entry });
            });

            const extracted = [];

            for (const item of xmlEntries) {
                const content = await item.entry.async('string');
                if (!InvoiceParser.isUBL(content)) continue;
                extracted.push({
                    name: getBaseName(item.path) || file.name,
                    content,
                    source: file.name,
                    path: item.path
                });
            }

            return extracted;
        } catch (e) {
            console.error('Error reading archive:', file && file.name, e);
            showError(uiI18n('errorProcessingFile', [file && file.name ? file.name : 'archive']));
            return [];
        }
    }

    async function processDetectedFiles() {
        const toProcess = detectedFiles.filter((file) => file.checked);
        if (toProcess.length === 0) return;

        clearInlineNotice();
        const batch = toProcess.map((file) => ({
            name: file.name,
            content: file.content
        }));

        const stats = await processBatch(batch);
        const lines = buildNoticeLines(stats);
        showInlineNotice(lines);
    }

    async function processBatch(files, zipStats = null) {
        const options = await buildPdfOptionsForFile(null);
        const stats = {
            invalidCount: 0,
            duplicateCountNonZip: 0
        };
        const issuerCandidates = [];
        let didUpdate = false;

        for (const file of files) {
            try {
                let xmlString = '';

                if (file && typeof file.content === 'string') {
                    xmlString = file.content;
                } else {
                    xmlString = await readFileAsync(file);
                }

                if (!xmlString || !InvoiceParser.isUBL(xmlString)) {
                    stats.invalidCount += 1;
                    continue;
                }

                const parser = new InvoiceParser(xmlString, options.language);
                const data = parser.parse();
                const issuerCandidate = extractIssuerCandidateFromInvoice(data);
                if (issuerCandidate) {
                    issuerCandidates.push(issuerCandidate);
                }
                const invoiceId = data.invoiceId || pdfI18n('unknownInvoiceId') || 'unknown';
                const recipientName = data.customer && data.customer.name ? data.customer.name.trim() : '';
                const invoiceTotal = Number.isFinite(data.totals && data.totals.total) ? data.totals.total : null;
                const invoiceCurrency = data.totals && data.totals.currency ? data.totals.currency : '';

                // Check for duplicates (same invoice + same settings + same content)
                const duplicate = processedFiles.find((item) =>
                    item.invoiceId === invoiceId &&
                    item.pdfLanguage === options.language &&
                    item.pdfAccentColor === options.accentColor &&
                    item.pdfLogoDataUrl === options.logoDataUrl &&
                    item.xmlContent === xmlString
                );

                if (duplicate) {
                    if (enrichFileFromData(duplicate, data)) {
                        didUpdate = true;
                    }
                    if (zipStats && file && file.source && zipStats[file.source]) {
                        zipStats[file.source].duplicates += 1;
                    } else {
                        stats.duplicateCountNonZip += 1;
                    }
                    flashItem(duplicate.internalId);
                    continue;
                }

                const doc = await createPdf(data, options);

                const pdfName = buildPdfFileName(invoiceId, recipientName);
                const xmlName = file.name || deriveXmlName(pdfName);
                const blob = doc.output('blob');
                
                const internalId = Date.now().toString(36) + Math.random().toString(36).slice(2);

                const nextEntry = {
                    internalId,
                    invoiceId,
                    pdfName,
                    xmlName,
                    recipientName,
                    invoiceTotal,
                    invoiceCurrency,
                    xmlContent: xmlString,
                    processedAt: Date.now(),
                    isPdfDownloaded: false,
                    isXmlDownloaded: false,
                    pdfLanguage: options.language,
                    pdfAccentColor: options.accentColor,
                    pdfLogoDataUrl: options.logoDataUrl,
                    pdfRetentionDays: settings.pdfRetentionDays
                };

                processedFiles.push(nextEntry);
                pdfBlobs[internalId] = blob;
                didUpdate = true;

                if (zipStats && file && file.source && zipStats[file.source]) {
                    zipStats[file.source].converted += 1;
                }
            } catch (e) {
                const name = file && file.name ? file.name : 'file';
                console.error('Error processing:', name, e);
                stats.invalidCount += 1;
            }
        }

        if (processedFiles.length > 0 && didUpdate) {
            await saveState();
            showResults();
        }

        if (issuerCandidates.length > 0) {
            await mergeOfferIssuerCandidates(issuerCandidates);
        }

        return stats;
    }

    function normalizeIssuerIdentityValue(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    function normalizeOfferIssuerCandidate(candidate) {
        const source = candidate && candidate.source === 'manual' ? 'manual' : 'xml';
        return {
            id: candidate && candidate.id ? String(candidate.id) : '',
            source,
            name: candidate && candidate.name ? String(candidate.name).trim() : '',
            address: candidate && candidate.address ? String(candidate.address).trim() : '',
            city: candidate && candidate.city ? String(candidate.city).trim() : '',
            oib: candidate && candidate.oib ? String(candidate.oib).trim() : '',
            iban: candidate && candidate.iban ? String(candidate.iban).trim() : '',
            contact: candidate && candidate.contact ? String(candidate.contact).trim() : '',
            email: candidate && candidate.email ? String(candidate.email).trim() : '',
            web: candidate && candidate.web ? String(candidate.web).trim() : '',
            createdAt: Number.isFinite(Number(candidate && candidate.createdAt)) ? Number(candidate.createdAt) : Date.now(),
            updatedAt: Number.isFinite(Number(candidate && candidate.updatedAt)) ? Number(candidate.updatedAt) : Date.now()
        };
    }

    function extractIssuerCandidateFromInvoice(data) {
        if (!data || !data.supplier) return null;
        const supplier = data.supplier || {};
        const payment = data.payment || {};
        const candidate = normalizeOfferIssuerCandidate({
            source: 'xml',
            name: supplier.name,
            address: supplier.address,
            city: supplier.city,
            oib: supplier.vatId,
            iban: payment.account,
            contact: supplier.contact,
            email: '',
            web: ''
        });
        return candidate.name ? candidate : null;
    }

    function buildIssuerMatchKey(issuer) {
        const normalized = normalizeOfferIssuerCandidate(issuer);
        const oibKey = normalizeIssuerIdentityValue(normalized.oib);
        if (oibKey) return `oib:${oibKey}`;
        const nameKey = normalizeIssuerIdentityValue(normalized.name);
        const addressKey = normalizeIssuerIdentityValue(normalized.address);
        const cityKey = normalizeIssuerIdentityValue(normalized.city);
        return `name:${nameKey}|address:${addressKey}|city:${cityKey}`;
    }

    async function mergeOfferIssuerCandidates(candidates) {
        if (!Array.isArray(candidates) || candidates.length === 0) return;

        try {
            const storage = await chrome.storage.local.get(['offerIssuers']);
            const existingRaw = Array.isArray(storage.offerIssuers) ? storage.offerIssuers : [];
            const issuers = existingRaw.map((issuer) => normalizeOfferIssuerCandidate(issuer)).filter((issuer) => issuer.name);
            const now = Date.now();

            candidates.forEach((candidateRaw) => {
                const candidate = normalizeOfferIssuerCandidate(candidateRaw);
                if (!candidate.name) return;
                const candidateKey = buildIssuerMatchKey(candidate);
                const existingIndex = issuers.findIndex((issuer) => buildIssuerMatchKey(issuer) === candidateKey);

                if (existingIndex >= 0) {
                    const current = issuers[existingIndex];
                    issuers[existingIndex] = normalizeOfferIssuerCandidate({
                        ...current,
                        ...candidate,
                        id: current.id || `issuer-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                        source: current.source === 'manual' ? 'manual' : 'xml',
                        name: candidate.name || current.name,
                        address: candidate.address || current.address,
                        city: candidate.city || current.city,
                        oib: candidate.oib || current.oib,
                        iban: candidate.iban || current.iban,
                        contact: candidate.contact || current.contact,
                        email: candidate.email || current.email,
                        web: candidate.web || current.web,
                        createdAt: current.createdAt || now,
                        updatedAt: now
                    });
                } else {
                    issuers.push(normalizeOfferIssuerCandidate({
                        ...candidate,
                        id: candidate.id || `issuer-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                        source: 'xml',
                        createdAt: now,
                        updatedAt: now
                    }));
                }
            });

            await chrome.storage.local.set({ offerIssuers: issuers });
        } catch (error) {
            console.warn('Could not merge issuer candidates from XML2PDF processing:', error);
        }
    }

    function flashItem(internalId) {
        const item = document.getElementById(`file-${internalId}`);
        if (!item) return;

        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        const originalTransition = item.style.transition;
        
        item.style.transition = 'background-color 0.3s ease';
        item.style.backgroundColor = 'var(--primary-hover)';
        // Ensure text is readable on dark background
        const originalColor = item.style.color;
        item.style.color = '#ffffff'; 

        setTimeout(() => {
            item.style.backgroundColor = '';
            item.style.color = originalColor;
            setTimeout(() => {
                item.style.transition = originalTransition;
            }, 300);
        }, 600);
    }

    function readFileAsync(file) {
        return new Promise((resolve, reject) => {
            const target = file && file.file ? file.file : file;
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = reject;
            reader.readAsText(target, 'UTF-8');
        });
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
        });
    }

    function deriveXmlName(pdfName) {
        if (!pdfName) return 'invoice.xml';
        if (pdfName.toLowerCase().endsWith('.pdf')) {
            return `${pdfName.slice(0, -4)}.xml`;
        }
        return `${pdfName}.xml`;
    }

    function sanitizeFileNamePart(value) {
        if (!value) return '';
        const normalized = String(value)
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '');
        const cleaned = normalized
            .replace(/[^A-Za-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        return cleaned.toLowerCase();
    }

    function buildPdfFileName(invoiceId, recipientName) {
        const safeId = invoiceId || 'unknown';
        let base = pdfI18n('pdfFileName', [safeId]) || `eRacun-${safeId}.pdf`;
        base = base.replace(/^Invoice-/i, 'eRacun-').replace(/^Racun-/i, 'eRacun-');
        if (!base.toLowerCase().endsWith('.pdf')) {
            base = `${base}.pdf`;
        }
        const companySlug = sanitizeFileNamePart(recipientName);
        return companySlug ? `${companySlug}-${base}` : base;
    }

    function getUiLocale() {
        return normalizeLanguage(settings.uiLanguage) === 'en' ? 'en-US' : 'hr-HR';
    }

    function formatInvoiceTotal(file) {
        if (!file || !Number.isFinite(file.invoiceTotal)) return '';
        const amount = file.invoiceTotal;
        const currency = file.invoiceCurrency || '';
        try {
            if (currency) {
                return new Intl.NumberFormat(getUiLocale(), {
                    style: 'currency',
                    currency
                }).format(amount);
            }
        } catch (e) {
            // fallback below
        }
        const formatted = amount.toFixed(2);
        return currency ? `${formatted} ${currency}` : formatted;
    }

    function enrichFileFromData(file, data) {
        if (!file || !data) return false;
        let changed = false;
        const recipientName = data.customer && data.customer.name ? data.customer.name.trim() : '';
        if (recipientName && file.recipientName !== recipientName) {
            file.recipientName = recipientName;
            changed = true;
        }
        const total = Number.isFinite(data.totals && data.totals.total) ? data.totals.total : null;
        if (total !== null && file.invoiceTotal !== total) {
            file.invoiceTotal = total;
            changed = true;
        }
        const currency = data.totals && data.totals.currency ? data.totals.currency : '';
        if (currency && file.invoiceCurrency !== currency) {
            file.invoiceCurrency = currency;
            changed = true;
        }
        if (data.invoiceId && file.invoiceId !== data.invoiceId) {
            file.invoiceId = data.invoiceId;
            changed = true;
        }
        const nextPdfName = buildPdfFileName(file.invoiceId || data.invoiceId || 'unknown', recipientName || file.recipientName || '');
        if (nextPdfName && file.pdfName !== nextPdfName) {
            file.pdfName = nextPdfName;
            changed = true;
        }
        return changed;
    }

    function showInlineNotice(lines) {
        if (!inlineNotice) return;
        inlineNotice.innerHTML = '';

        if (!lines || lines.length === 0) {
            inlineNotice.classList.remove('visible');
            return;
        }

        lines.forEach((line) => {
            const item = document.createElement('div');
            item.className = 'notice-line';

            const icon = document.createElement('i');
            icon.className = 'fas fa-info-circle';
            icon.setAttribute('aria-hidden', 'true');

            const text = document.createElement('span');
            text.textContent = line;

            item.appendChild(icon);
            item.appendChild(text);
            inlineNotice.appendChild(item);
        });

        inlineNotice.classList.add('visible');
    }

    function clearInlineNotice() {
        showInlineNotice([]);
    }

    function buildNoticeLines(stats, zipStats, zipOrder) {
        const lines = [];

        if (zipOrder && zipOrder.length > 0 && zipStats) {
            zipOrder.forEach((name) => {
                const summary = zipStats[name];
                if (!summary) return;
                if (summary.valid === 0) {
                    lines.push(
                        uiI18n('noticeZipNoValid', [name]) ||
                        `ZIP "${name}": no valid e-Ra\u010dun XML found.`
                    );
                    return;
                }

                if (summary.duplicates > 0) {
                    lines.push(
                        uiI18n('noticeZipSummary', [
                            name,
                            String(summary.valid),
                            String(summary.converted),
                            String(summary.duplicates)
                        ]) ||
                        `ZIP "${name}": valid XMLs ${summary.valid}, converted ${summary.converted}, skipped ${summary.duplicates} (already exists).`
                    );
                } else {
                    lines.push(
                        uiI18n('noticeZipSummaryNoDuplicates', [
                            name,
                            String(summary.valid),
                            String(summary.converted)
                        ]) ||
                        `ZIP "${name}": valid XMLs ${summary.valid}, converted ${summary.converted}.`
                    );
                }
            });
        }

        if (stats && stats.invalidCount > 0) {
            lines.push(
                uiI18n('noticeInvalidXml', [String(stats.invalidCount)]) ||
                `Skipped ${stats.invalidCount} file(s): not valid e-Ra\u010dun XML.`
            );
        }

        if (stats && stats.duplicateCountNonZip > 0) {
            lines.push(
                uiI18n('noticeDuplicateSkipped', [String(stats.duplicateCountNonZip)]) ||
                `Skipped ${stats.duplicateCountNonZip} duplicate file(s) (identical file + settings already exist).`
            );
        }

        return lines;
    }

    function updateDownloadButtonLabel() {
        if (!downloadAllLabel) return;
        const selectedCount = selectedFileIds.size;
        if (selectedCount === 0) {
            downloadAllLabel.textContent = uiI18n('downloadAllZip');
            return;
        }
        downloadAllLabel.textContent =
            uiI18n('downloadSelectedCount', [String(selectedCount)]) ||
            `Download selected (${selectedCount})`;
    }

    function getSelectedFiles() {
        if (selectedFileIds.size === 0) return [];
        return processedFiles.filter((file) => selectedFileIds.has(file.internalId));
    }

    function toggleFileSelection(file) {
        if (!file || !file.internalId) return;
        if (selectedFileIds.has(file.internalId)) {
            selectedFileIds.delete(file.internalId);
        } else {
            selectedFileIds.add(file.internalId);
        }
        showResults();
    }

    function handleBulkDownload() {
        if (processedFiles.length === 0) return;
        const selected = getSelectedFiles();
        if (selected.length === 1) {
            saveSingle(selected[0]);
            return;
        }
        const target = selected.length > 0 ? selected : processedFiles;
        downloadZip(target);
    }

    function openPreview(file, triggerEl) {
        if (!file || !file.internalId) return;
        const blob = pdfBlobs[file.internalId];
        if (!blob) {
            showError(uiI18n('errorFileNotFound'));
            return;
        }

        closePreview();

        activePreviewUrl = URL.createObjectURL(blob);
        activePreviewId = file.internalId;
        if (previewFrame) {
            previewFrame.src = `${activePreviewUrl}#view=FitH`;
        }
        if (previewTitle) {
            previewTitle.textContent = file.pdfName || 'PDF';
        }
        if (previewModal) {
            previewModal.open(triggerEl || (document.activeElement instanceof HTMLElement ? document.activeElement : null));
        } else if (previewOverlay) {
            previewOverlay.classList.add('open');
            previewOverlay.setAttribute('aria-hidden', 'false');
        }
    }

    function closePreview() {
        if (previewModal && previewModal.isOpen()) {
            previewModal.close();
            return;
        }
        if (previewOverlay) {
            previewOverlay.classList.remove('open');
            previewOverlay.setAttribute('aria-hidden', 'true');
        }
        if (previewFrame) {
            previewFrame.src = '';
        }
        if (activePreviewUrl) {
            URL.revokeObjectURL(activePreviewUrl);
            activePreviewUrl = '';
        }
        activePreviewId = '';
    }

    // --- UI Rendering ---

    function scanPageForXmls() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || !tabs[0] || !tabs[0].id) return;

            try {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'scan_xmls' }, async (response) => {
                    if (chrome.runtime.lastError) return;

                    if (response && response.xmls && response.xmls.length > 0) {
                        const uniqueUrls = [...new Set(response.xmls)];
                        detectedFiles = [];

                        for (const url of uniqueUrls) {
                            try {
                                const res = await fetch(url);
                                const text = await res.text();
                                if (InvoiceParser.isUBL(text)) {
                                    detectedFiles.push({
                                        url: url,
                                        name: decodeURIComponent(url.split('/').pop()),
                                        content: text,
                                        checked: true
                                    });
                                }
                            } catch (e) {
                                // ignore
                            }
                        }

                        if (detectedFiles.length > 0) {
                            detectedSection.classList.remove('is-hidden');
                            renderDetectedList();
                            return;
                        }
                    }

                    detectedSection.classList.add('is-hidden');
                    detectedList.innerHTML = '';
                    updateSelectAllLabel();
                });
            } catch (e) {
                // ignore
            }
        });
    }

    function renderDetectedList() {
        detectedList.innerHTML = '';
        let checkedCount = 0;

        detectedFiles.forEach((file) => {
            const div = document.createElement('div');
            div.className = 'file-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = file.checked;
            checkbox.onchange = (event) => {
                file.checked = event.target.checked;
                renderDetectedList();
            };

            const span = document.createElement('span');
            span.className = 'file-name';
            span.textContent = file.name;
            span.title = file.name;

            div.appendChild(checkbox);
            div.appendChild(span);
            detectedList.appendChild(div);

            if (file.checked) checkedCount++;
        });

        updateConvertButtonLabel(checkedCount);
        updateSelectAllLabel();
        convertBtn.disabled = checkedCount === 0;
    }

    function updateConvertButtonLabel(count) {
        if (!convertBtnLabel) return;
        convertBtnLabel.textContent = uiI18n('convertSelectedCount', [String(count)]) || '';
    }

    function updateSelectAllLabel() {
        if (!selectAllBtn) return;

        if (detectedFiles.length === 0) {
            selectAllBtn.textContent = uiI18n('selectAll');
            selectAllBtn.disabled = true;
            return;
        }

        const allChecked = detectedFiles.every((file) => file.checked);
        selectAllBtn.textContent = uiI18n(allChecked ? 'deselectAll' : 'selectAll');
        selectAllBtn.disabled = false;
    }

    function updateResultsVisibility() {
        if (!resultsSection) return;
        resultsSection.classList.toggle('is-hidden', processedFiles.length === 0);
        if (downloadAllBtn) {
            downloadAllBtn.disabled = processedFiles.length === 0;
        }
        updateDownloadButtonLabel();
    }

    function formatPdfLanguageLabel(language) {
        const normalized = normalizeLanguage(language);
        if (normalized === 'hr') {
            return uiI18n('languageCroatian') || 'Croatian';
        }
        if (normalized === 'en') {
            return uiI18n('languageEnglish') || 'English';
        }
        return normalized.toUpperCase();
    }

    function formatUiDate(value) {
        if (!value) return '';
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const locale = settings.uiLanguage === 'hr' ? 'hr-HR' : 'en-GB';
        try {
            return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
        } catch (e) {
            return date.toISOString().slice(0, 10);
        }
    }

    function formatExpiryDate(file) {
        const days = getRetentionDaysForFile(file);
        if (!Number.isFinite(days) || days <= 0) {
            return uiI18n('retentionImmediate') || '';
        }
        const processedAt = file.processedAt || Date.now();
        const expiresAt = new Date(processedAt + days * DAY_MS);
        return formatUiDate(expiresAt);
    }

    function showResults() {
        updateResultsVisibility();
        if (processedFiles.length === 0) return;

        const list = document.getElementById('results-list');
        list.innerHTML = '';

        Array.from(selectedFileIds).forEach((id) => {
            if (!processedFiles.find((file) => file.internalId === id)) {
                selectedFileIds.delete(id);
            }
        });

        processedFiles.forEach((file) => {
            const div = document.createElement('div');
            div.className = 'file-item selectable';
            div.id = `file-${file.internalId}`;
            if (selectedFileIds.has(file.internalId)) {
                div.classList.add('selected');
            }
            div.addEventListener('click', () => toggleFileSelection(file));

            const info = document.createElement('div');
            info.className = 'file-info';

            const pdfNameRow = document.createElement('div');
            pdfNameRow.className = 'file-line';
            const pdfIcon = document.createElement('i');
            pdfIcon.className = 'fas fa-file-pdf file-icon';
            pdfIcon.setAttribute('aria-hidden', 'true');
            const pdfName = document.createElement('div');
            pdfName.className = 'file-name';
            pdfName.textContent = file.pdfName;
            pdfNameRow.appendChild(pdfIcon);
            pdfNameRow.appendChild(pdfName);

            const xmlRow = document.createElement('div');
            xmlRow.className = 'file-sub file-line';
            const xmlIcon = document.createElement('i');
            xmlIcon.className = 'fas fa-file-code file-icon';
            xmlIcon.setAttribute('aria-hidden', 'true');
            const xmlName = document.createElement('div');
            xmlName.textContent = file.xmlName;
            xmlRow.appendChild(xmlIcon);
            xmlRow.appendChild(xmlName);

            const recipientText = (file.recipientName || '').trim();
            const totalText = formatInvoiceTotal(file);
            if (recipientText || totalText) {

                if (totalText) {
                    const totalGroup = document.createElement('span');
                    totalGroup.className = 'file-meta-group';
                    const totalSpan = document.createElement('span');
                    totalSpan.className = 'file-total';
                    totalSpan.textContent = totalText;
                    totalGroup.appendChild(totalSpan);
                    pdfNameRow.appendChild(totalGroup);
                }

            }

            info.appendChild(pdfNameRow);
            info.appendChild(xmlRow);

            const meta = document.createElement('div');
            meta.className = 'file-meta';

            const legendColor = uiI18n('legendColor') || 'Color';
            const legendLanguage = uiI18n('legendLanguage') || 'Language';
            const legendExpires = uiI18n('legendExpires') || 'Expires';

            const metaRowMain = document.createElement('div');
            metaRowMain.className = 'meta-row';

            const colorItem = document.createElement('span');
            colorItem.className = 'meta-item';
            const colorDot = document.createElement('span');
            colorDot.className = 'meta-dot';
            const accentColor = file.pdfAccentColor || settings.pdfAccentColor || '#2c3e50';
            colorDot.style.background = accentColor;
            colorItem.title = `${legendColor}: ${accentColor}`;
            colorItem.appendChild(colorDot);

            const languageItem = document.createElement('span');
            languageItem.className = 'meta-item';
            languageItem.title = legendLanguage;
            const languageIcon = document.createElement('i');
            languageIcon.className = 'fas fa-globe meta-icon';
            languageIcon.setAttribute('aria-hidden', 'true');
            const languageText = document.createElement('span');
            languageText.textContent = formatPdfLanguageLabel(file.pdfLanguage);
            languageItem.appendChild(languageIcon);
            languageItem.appendChild(languageText);

            const expiryItem = document.createElement('span');
            expiryItem.className = 'meta-item';
            expiryItem.title = legendExpires;
            const expiryIcon = document.createElement('i');
            expiryIcon.className = 'fas fa-clock meta-icon';
            expiryIcon.setAttribute('aria-hidden', 'true');
            const expiryText = document.createElement('span');
            expiryText.textContent = formatExpiryDate(file);
            expiryItem.appendChild(expiryIcon);
            expiryItem.appendChild(expiryText);

            metaRowMain.appendChild(colorItem);
            metaRowMain.appendChild(languageItem);
            metaRowMain.appendChild(expiryItem);

            const actions = document.createElement('div');
            actions.className = 'file-actions';
            const buttonsWrap = document.createElement('div');
            buttonsWrap.className = 'action-buttons';
            buttonsWrap.addEventListener('click', (event) => event.stopPropagation());

            const pdfBtn = document.createElement('button');
            pdfBtn.className = `download-btn${file.isPdfDownloaded ? ' downloaded' : ''}`;
            const pdfLabel = document.createElement('span');
            pdfLabel.textContent = uiI18n('downloadPdf');
            const previewTrigger = document.createElement('span');
            previewTrigger.className = 'pdf-preview-trigger';
            previewTrigger.setAttribute('title', uiI18n('previewPdf') || 'Preview PDF');
            previewTrigger.setAttribute('aria-hidden', 'true');
            const previewIcon = document.createElement('i');
            previewIcon.className = 'fas fa-search-plus';
            previewIcon.setAttribute('aria-hidden', 'true');
            previewTrigger.appendChild(previewIcon);
            pdfBtn.appendChild(pdfLabel);
            pdfBtn.appendChild(previewTrigger);
            pdfBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (event.target && event.target.closest('.pdf-preview-trigger')) {
                    openPreview(file);
                    return;
                }
                saveSingle(file);
            });

            const xmlBtn = document.createElement('button');
            xmlBtn.className = `download-btn${file.isXmlDownloaded ? ' downloaded' : ''}`;
            xmlBtn.textContent = uiI18n('downloadXml');
            xmlBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                saveXml(file);
            });

            buttonsWrap.appendChild(pdfBtn);
            buttonsWrap.appendChild(xmlBtn);

            const trashBtn = document.createElement('button');
            trashBtn.type = 'button';
            trashBtn.className = 'btn-icon btn-icon-danger item-trash';
            const removeLabel = uiI18n('removeFile') || 'Remove file';
            trashBtn.setAttribute('title', removeLabel);
            trashBtn.setAttribute('aria-label', removeLabel);
            const trashIcon = document.createElement('i');
            trashIcon.className = 'fas fa-trash';
            trashIcon.setAttribute('aria-hidden', 'true');
            trashBtn.appendChild(trashIcon);
            trashBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                removeProcessedFile(file);
            });

            buttonsWrap.appendChild(trashBtn);

            meta.appendChild(metaRowMain);
            actions.appendChild(meta);
            actions.appendChild(buttonsWrap);

            div.appendChild(info);
            div.appendChild(actions);
            list.appendChild(div);
        });
    }

    function saveSingle(file) {
        const blob = pdfBlobs[file.internalId];
        if (!blob) {
            showError(uiI18n('errorFileNotFound'));
            return;
        }

        downloadBlob(blob, file.pdfName);
        file.isPdfDownloaded = true;
        saveState();
        showResults();
    }

    function saveXml(file) {
        if (!file.xmlContent) {
            showError(uiI18n('errorFileNotFound'));
            return;
        }

        const blob = new Blob([file.xmlContent], { type: 'application/xml' });
        downloadBlob(blob, file.xmlName);
        file.isXmlDownloaded = true;
        saveState();
        showResults();
    }

    async function removeProcessedFile(file) {
        if (!file || !file.internalId) return;
        processedFiles = processedFiles.filter((item) => item.internalId !== file.internalId);
        selectedFileIds.delete(file.internalId);
        if (pdfBlobs[file.internalId]) {
            delete pdfBlobs[file.internalId];
        }
        if (activePreviewId === file.internalId) {
            closePreview();
        }
        await saveState();
        showResults();
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function downloadZip(filesToZip) {
        const targetFiles = Array.isArray(filesToZip) ? filesToZip : processedFiles;
        if (!targetFiles || targetFiles.length === 0) return;
        const zip = new JSZip();
        let count = 0;
        targetFiles.forEach((file) => {
            const blob = pdfBlobs[file.internalId];
            if (blob) {
                zip.file(file.pdfName, blob);
                count++;
            }
        });

        if (count === 0) return;

        zip.generateAsync({ type: 'blob' }).then((content) => {
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            const dateString = new Date().toISOString().slice(0, 10);
            a.download = uiI18n('zipFileName', [dateString]) || `eInvoices_All_${dateString}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            targetFiles.forEach((file) => {
                file.isPdfDownloaded = true;
            });
            saveState();
            showResults();
        });
    }

    function showError(message) {
        window.AppShared.Toast.show(message, { variant: 'error' });
    }
});
