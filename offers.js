'use strict';

document.addEventListener('DOMContentLoaded', () => {
    initOffersModule().catch((error) => {
        console.error('Offers module init failed:', error);
    });
});

async function initOffersModule() {
    const DAY_MS = 24 * 60 * 60 * 1000;

    const STORAGE_KEYS = {
        config: 'offerConfig',
        issuers: 'offerIssuers',
        selectedIssuerId: 'offerSelectedIssuerId',
        buyers: 'offerBuyers',
        generatedOffers: 'offerGeneratedState',
        counters: 'offerNumberCounters',
        activeTab: 'activeMainTab',
        uiLanguage: 'uiLanguage',
        pdfLanguage: 'pdfLanguage',
        pdfAccentColor: 'pdfAccentColor',
        pdfLogoDataUrl: 'pdfLogoDataUrl'
    };

    const DEFAULT_CONFIG = {
        numberPrefix: '',
        defaultVatRate: 25,
        defaultValidityDays: 15,
        defaultNote: ''
    };

    const state = {
        uiLanguage: 'hr',
        uiMessages: {},
        pdfLanguage: 'hr',
        pdfMessagesByLanguage: {},
        pdfAccentColor: '#2c3e50',
        pdfLogoDataUrl: '',
        pdfRetentionDays: 8,
        activeTabViewId: 'xml2pdf-view',
        config: { ...DEFAULT_CONFIG },
        issuers: [],
        selectedIssuerId: '',
        buyers: [],
        generatedOffers: [],
        offerBlobs: {},
        offerNumberCounters: {},
        pendingImportIssuer: null,
        activePreviewUrl: '',
        itemCounter: 0,
        validUntilManuallySet: false,
        issuerEditorMode: 'create',
        issuerCreateMode: 'import',
        editingIssuerId: ''
    };

    const elements = {
        tabButtons: Array.from(document.querySelectorAll('.tab-btn')),
        tabViews: Array.from(document.querySelectorAll('.tab-view')),

        issuerSelect: getById('offer-issuer-select'),
        issuerNewBtn: getById('offer-issuer-new-btn'),
        issuerEditBtn: getById('offer-issuer-edit-btn'),
        issuerRemoveBtn: getById('offer-issuer-remove-btn'),
        issuerChipList: getById('offer-issuer-chip-list'),
        selectedIssuerPill: getById('offer-selected-issuer-pill'),
        formIssuerCard: getById('offer-form-issuer-card'),
        importIssuerBtn: getById('offer-import-issuer-btn'),
        importXmlInput: getById('offer-import-xml-input'),

        issuerEditor: getById('offer-issuer-editor'),
        issuerModeSwitch: getById('offer-issuer-mode-switch'),
        issuerModeImportBtn: getById('offer-issuer-mode-import-btn'),
        issuerModeManualBtn: getById('offer-issuer-mode-manual-btn'),
        issuerCreateImport: getById('offer-issuer-create-import'),
        issuerEditorGrid: getById('offer-issuer-editor-grid'),
        issuerEditorActions: getById('offer-issuer-editor-actions'),
        issuerEditorTitle: getById('offer-issuer-editor-title'),
        issuerFieldName: getById('offer-issuer-field-name'),
        issuerFieldAddress: getById('offer-issuer-field-address'),
        issuerFieldCity: getById('offer-issuer-field-city'),
        issuerFieldOib: getById('offer-issuer-field-oib'),
        issuerFieldIban: getById('offer-issuer-field-iban'),
        issuerFieldContact: getById('offer-issuer-field-contact'),
        issuerFieldEmail: getById('offer-issuer-field-email'),
        issuerFieldWeb: getById('offer-issuer-field-web'),
        issuerSaveBtn: getById('offer-issuer-save-btn'),
        issuerCancelBtn: getById('offer-issuer-cancel-btn'),

        numberPrefixInput: getById('offer-setting-number-prefix'),
        defaultNoteInput: getById('offer-setting-default-note'),
        defaultVatSlider: getById('offer-setting-default-vat-slider'),
        defaultVatValue: getById('offer-setting-default-vat-value'),
        defaultValiditySlider: getById('offer-setting-validity-days-slider'),
        defaultValidityValue: getById('offer-setting-validity-days-value'),

        offerNumberInput: getById('offer-number'),
        issueDateInput: getById('offer-issue-date'),
        validUntilInput: getById('offer-valid-until'),
        customerNameInput: getById('offer-customer-name'),
        customerOibInput: getById('offer-customer-oib'),
        customerAddressInput: getById('offer-customer-address'),
        buyerNameSuggestions: getById('buyer-name-suggestions'),
        buyerOibSuggestions: getById('buyer-oib-suggestions'),

        introInput: getById('offer-intro'),
        specificationInput: getById('offer-specification'),
        noteInput: getById('offer-note'),
        itemsBody: getById('offer-items-body'),
        addItemBtn: getById('offer-add-item'),
        vatInput: getById('offer-vat-rate'),
        vatValue: getById('offer-vat-rate-value'),
        standardPriceValue: getById('offer-standard-price'),
        discountAmountValue: getById('offer-discount-amount'),
        netBaseValue: getById('offer-net-base'),
        vatAmountValue: getById('offer-vat-amount'),
        totalAmountValue: getById('offer-total-amount'),
        generateBtn: getById('offer-generate-btn'),
        resetBtn: getById('offer-reset-btn'),
        clearGeneratedBtn: getById('offer-clear-generated-btn'),
        resultsSection: getById('offer-results-section'),
        resultsList: getById('offer-results-list'),

        importOverlay: getById('offer-import-overlay'),
        importList: getById('offer-import-list'),
        importCloseBtn: getById('offer-import-close'),
        importCancelBtn: getById('offer-import-cancel'),
        importApplyBtn: getById('offer-import-apply'),

        previewOverlay: getById('offer-preview-overlay'),
        previewCloseBtn: getById('offer-preview-close'),
        previewFrame: getById('offer-preview-iframe'),
        previewTitle: getById('offer-preview-title'),
        openSettingsBtn: getById('offer-open-settings-btn'),

        sectionToggles: Array.from(document.querySelectorAll('[data-offer-section-toggle]')),
        detailsExcerpt: getById('offer-details-excerpt')
    };

    const modals = {};

    if (!elements.offerNumberInput || !elements.itemsBody) {
        return;
    }

    await loadStateFromStorage();
    await loadMessages();
    initModals();
    bindEvents();
    initCollapsibleSections();
    applyConfigInputs();
    renderIssuers();
    initFormDefaults();
    ensureAtLeastOneItemRow();
    renderGeneratedOffers();
    updateSummary();
    updateSectionExcerpts();
    updateOfferNumberSuggestion(false);
    applyActiveTab(state.activeTabViewId, false);

    async function loadStateFromStorage() {
        const result = await chrome.storage.local.get([
            STORAGE_KEYS.config,
            STORAGE_KEYS.issuers,
            STORAGE_KEYS.selectedIssuerId,
            STORAGE_KEYS.buyers,
            STORAGE_KEYS.generatedOffers,
            STORAGE_KEYS.counters,
            STORAGE_KEYS.activeTab,
            STORAGE_KEYS.uiLanguage,
            STORAGE_KEYS.pdfLanguage,
            STORAGE_KEYS.pdfAccentColor,
            STORAGE_KEYS.pdfLogoDataUrl,
            'pdfRetentionDays',

            // Legacy keys from the previous iteration
            'offerNumberPrefix',
            'offerDefaultVatRate',
            'offerDefaultValidityDays',
            'offerDefaultNote',
            'offerIssuerName',
            'offerIssuerAddress',
            'offerIssuerCity',
            'offerIssuerOib',
            'offerIssuerIban',
            'offerIssuerContact',
            'offerIssuerEmail',
            'offerIssuerWeb'
        ]);
        const originalGeneratedLength = Array.isArray(result[STORAGE_KEYS.generatedOffers])
            ? result[STORAGE_KEYS.generatedOffers].length
            : 0;

        state.uiLanguage = normalizeLanguage(result[STORAGE_KEYS.uiLanguage] || 'hr');
        state.pdfLanguage = normalizeLanguage(result[STORAGE_KEYS.pdfLanguage] || state.uiLanguage || 'hr');
        state.pdfAccentColor = String(result[STORAGE_KEYS.pdfAccentColor] || '#2c3e50');
        state.pdfLogoDataUrl = String(result[STORAGE_KEYS.pdfLogoDataUrl] || '');
        state.pdfRetentionDays = clampInt(result.pdfRetentionDays, 0, 32, 8);
        state.activeTabViewId = result[STORAGE_KEYS.activeTab] === 'offers-view' ? 'offers-view' : 'xml2pdf-view';

        state.config = normalizeConfig(result[STORAGE_KEYS.config], result);
        state.offerNumberCounters = normalizeCounters(result[STORAGE_KEYS.counters]);
        state.issuers = normalizeIssuers(result[STORAGE_KEYS.issuers]);
        state.buyers = normalizeBuyers(result[STORAGE_KEYS.buyers]);
        state.generatedOffers = normalizeGeneratedOffers(result[STORAGE_KEYS.generatedOffers]);
        state.generatedOffers = filterGeneratedOffersByRetention(state.generatedOffers);

        if (state.issuers.length === 0) {
            const legacyIssuer = normalizeIssuer({
                source: 'manual',
                name: result.offerIssuerName,
                address: result.offerIssuerAddress,
                city: result.offerIssuerCity,
                oib: result.offerIssuerOib,
                iban: result.offerIssuerIban,
                contact: result.offerIssuerContact,
                email: result.offerIssuerEmail,
                web: result.offerIssuerWeb
            });
            if (legacyIssuer && legacyIssuer.name) {
                state.issuers = [legacyIssuer];
            }
        }

        state.selectedIssuerId = normalizeString(result[STORAGE_KEYS.selectedIssuerId]);
        if (!state.issuers.find((issuer) => issuer.id === state.selectedIssuerId)) {
            state.selectedIssuerId = state.issuers[0] ? state.issuers[0].id : '';
        }

        if (state.generatedOffers.length !== originalGeneratedLength) {
            await persistGeneratedOffers();
        }
    }

    async function loadMessages() {
        state.uiMessages = await loadLocaleMessages(state.uiLanguage);
        state.pdfMessagesByLanguage[state.pdfLanguage] = await loadLocaleMessages(state.pdfLanguage);
    }

    function bindEvents() {
        elements.tabButtons.forEach((button) => {
            button.addEventListener('click', () => {
                applyActiveTab(button.getAttribute('data-tab-target'), true);
            });
        });

        if (elements.openSettingsBtn) {
            elements.openSettingsBtn.addEventListener('click', () => {
                const settingsPanel = document.getElementById('settings-panel');
                const settingsToggle = document.getElementById('settings-toggle');
                if (settingsPanel && settingsToggle && !settingsPanel.classList.contains('open')) {
                    settingsToggle.click();
                }
                settingsPanel && settingsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        elements.issuerSelect.addEventListener('change', async () => {
            state.selectedIssuerId = normalizeString(elements.issuerSelect.value);
            await persistSelectedIssuer();
            renderIssuers();
            updateOfferNumberSuggestion(false);
        });

        elements.issuerNewBtn.addEventListener('click', () => {
            openIssuerEditor('create');
        });

        elements.issuerEditBtn.addEventListener('click', () => {
            if (!getSelectedIssuer()) {
                showToast(i18n('offerIssuerSelectFirst') || 'Select an issuer first.');
                return;
            }
            openIssuerEditor('edit', state.selectedIssuerId);
        });

        elements.issuerRemoveBtn.addEventListener('click', () => {
            if (!state.selectedIssuerId) return;
            if (elements.issuerRemoveBtn.classList.contains('is-confirming')) return;
            const current = getSelectedIssuer();
            if (!current) return;
            const referenced = state.generatedOffers.some((offer) =>
                offer && offer.offerData && offer.offerData.issuer
                && offer.offerData.issuer.oib && current.oib
                && offer.offerData.issuer.oib === current.oib);
            if (referenced) {
                showToast(i18n('offerIssuerHasReferences') || 'Existing offers still reference this issuer.', { variant: 'warn' });
            }
        });
        window.AppShared.ConfirmInline.attach(elements.issuerRemoveBtn, {
            confirmLabel: i18n('confirmActionRepeat'),
            onConfirm: async () => {
                if (!state.selectedIssuerId) return;
                await removeIssuer(state.selectedIssuerId);
            }
        });

        elements.issuerChipList.addEventListener('click', async (event) => {
            const selectBtn = event.target.closest('[data-issuer-select]');
            if (selectBtn) {
                const issuerId = normalizeString(selectBtn.getAttribute('data-issuer-select'));
                if (issuerId) {
                    state.selectedIssuerId = issuerId;
                    await persistSelectedIssuer();
                    renderIssuers();
                    updateOfferNumberSuggestion(false);
                }
            }
        });

        elements.importIssuerBtn.addEventListener('click', () => {
            elements.importXmlInput.click();
        });

        elements.importXmlInput.addEventListener('change', async () => {
            await handleIssuerImport();
        });

        elements.issuerModeImportBtn.addEventListener('click', () => {
            setIssuerCreateMode('import');
        });

        elements.issuerModeManualBtn.addEventListener('click', () => {
            setIssuerCreateMode('manual');
            elements.issuerFieldName.focus();
        });

        elements.issuerSaveBtn.addEventListener('click', async () => {
            await window.AppShared.withBusy(elements.issuerSaveBtn, i18n('saving') || 'Saving…', async () => {
                await saveIssuerFromEditor();
            });
        });
        elements.issuerCancelBtn.addEventListener('click', () => {
            closeIssuerEditor();
        });

        elements.numberPrefixInput.addEventListener('input', async () => {
            elements.numberPrefixInput.value = sanitizePrefix(elements.numberPrefixInput.value);
            state.config.numberPrefix = elements.numberPrefixInput.value;
            await persistConfig();
            updateOfferNumberSuggestion(false);
        });

        elements.defaultNoteInput.addEventListener('input', async () => {
            state.config.defaultNote = normalizeString(elements.defaultNoteInput.value);
            await persistConfig();
        });

        elements.defaultVatSlider.addEventListener('input', async () => {
            state.config.defaultVatRate = clampInt(elements.defaultVatSlider.value, 0, 25, 25);
            updateConfigValueLabels();
            await persistConfig();
            if (!normalizeString(elements.vatInput.value)) {
                elements.vatInput.value = String(state.config.defaultVatRate);
                updateSummary();
            }
        });

        elements.defaultValiditySlider.addEventListener('input', async () => {
            state.config.defaultValidityDays = clampInt(elements.defaultValiditySlider.value, 1, 30, 15);
            updateConfigValueLabels();
            await persistConfig();
            if (!state.validUntilManuallySet) {
                syncValidUntilFromDefaults();
                updateSectionExcerpts();
            }
        });

        elements.issueDateInput.addEventListener('change', () => {
            if (!state.validUntilManuallySet) {
                syncValidUntilFromDefaults();
            }
            updateSectionExcerpts();
            updateOfferNumberSuggestion(false);
        });

        elements.validUntilInput.addEventListener('change', () => {
            state.validUntilManuallySet = true;
            updateSectionExcerpts();
        });

        elements.offerNumberInput.addEventListener('input', () => {
            updateSectionExcerpts();
            if (!normalizeString(elements.offerNumberInput.value)) {
                updateOfferNumberSuggestion(false);
            }
        });

        elements.vatInput.addEventListener('input', () => {
            updateVatRateLabel();
            updateSummary();
        });

        elements.introInput.addEventListener('input', updateSectionExcerpts);
        elements.specificationInput.addEventListener('input', updateSectionExcerpts);
        elements.noteInput.addEventListener('input', updateSectionExcerpts);

        elements.customerNameInput.addEventListener('input', () => {
            window.AppShared.clearFieldError(elements.customerNameInput);
        });

        elements.addItemBtn.addEventListener('click', () => {
            addItemRow();
            updateSummary();
        });

        elements.generateBtn.addEventListener('click', async () => {
            await generateOffer();
        });

        window.AppShared.ConfirmInline.attach(elements.resetBtn, {
            confirmLabel: i18n('confirmActionRepeat'),
            onConfirm: () => resetOfferForm()
        });

        window.AppShared.ConfirmInline.attach(elements.clearGeneratedBtn, {
            confirmLabel: i18n('confirmActionRepeat'),
            onConfirm: async () => {
                state.generatedOffers = [];
                state.offerBlobs = {};
                await persistGeneratedOffers();
                renderGeneratedOffers();
                closeOfferPreview();
            }
        });

        bindBuyerAutocomplete(elements.customerNameInput, elements.buyerNameSuggestions, 'name');
        bindBuyerAutocomplete(elements.customerOibInput, elements.buyerOibSuggestions, 'oib');

        elements.importCloseBtn.addEventListener('click', closeImportOverlay);
        elements.importCancelBtn.addEventListener('click', closeImportOverlay);
        elements.importApplyBtn.addEventListener('click', async () => {
            await window.AppShared.withBusy(elements.importApplyBtn, i18n('saving') || 'Saving…', async () => {
                await applyImportedIssuer();
            });
        });

        elements.previewCloseBtn.addEventListener('click', closeOfferPreview);

        chrome.storage.onChanged.addListener(async (changes, areaName) => {
            if (areaName !== 'local') return;

            if (changes[STORAGE_KEYS.uiLanguage]) {
                state.uiLanguage = normalizeLanguage(changes[STORAGE_KEYS.uiLanguage].newValue || 'hr');
                state.uiMessages = await loadLocaleMessages(state.uiLanguage);
                updateConfigValueLabels();
                renderIssuers();
                renderImportPreview();
                renderGeneratedOffers();
                updateSummary();
            }

            if (changes[STORAGE_KEYS.pdfLanguage]) {
                state.pdfLanguage = normalizeLanguage(changes[STORAGE_KEYS.pdfLanguage].newValue || state.uiLanguage);
                if (!state.pdfMessagesByLanguage[state.pdfLanguage]) {
                    state.pdfMessagesByLanguage[state.pdfLanguage] = await loadLocaleMessages(state.pdfLanguage);
                }
            }

            if (changes[STORAGE_KEYS.pdfAccentColor]) {
                state.pdfAccentColor = normalizeString(changes[STORAGE_KEYS.pdfAccentColor].newValue) || '#2c3e50';
            }

            if (changes[STORAGE_KEYS.pdfLogoDataUrl]) {
                state.pdfLogoDataUrl = normalizeString(changes[STORAGE_KEYS.pdfLogoDataUrl].newValue || '');
            }

            if (changes.pdfRetentionDays) {
                state.pdfRetentionDays = clampInt(changes.pdfRetentionDays.newValue, 0, 32, 8);
                const retained = filterGeneratedOffersByRetention(state.generatedOffers);
                if (retained.length !== state.generatedOffers.length) {
                    const retainedIds = new Set(retained.map((offer) => offer.id));
                    Object.keys(state.offerBlobs).forEach((id) => {
                        if (!retainedIds.has(id)) {
                            delete state.offerBlobs[id];
                        }
                    });
                    state.generatedOffers = retained;
                    await persistGeneratedOffers();
                    renderGeneratedOffers();
                }
            }

            if (changes[STORAGE_KEYS.issuers]) {
                state.issuers = normalizeIssuers(changes[STORAGE_KEYS.issuers].newValue);
                if (!state.issuers.find((issuer) => issuer.id === state.selectedIssuerId)) {
                    state.selectedIssuerId = state.issuers[0] ? state.issuers[0].id : '';
                    await persistSelectedIssuer();
                }
                renderIssuers();
            }
        });
    }

    function applyConfigInputs() {
        elements.numberPrefixInput.value = state.config.numberPrefix;
        elements.defaultNoteInput.value = state.config.defaultNote;
        elements.defaultVatSlider.value = String(state.config.defaultVatRate);
        elements.defaultValiditySlider.value = String(state.config.defaultValidityDays);
        updateConfigValueLabels();
    }

    function updateConfigValueLabels() {
        elements.defaultVatValue.textContent = `${state.config.defaultVatRate}%`;
        elements.defaultValidityValue.textContent = `${state.config.defaultValidityDays} ${i18n('retentionDaysPlural') || ''}`.trim();
    }

    function updateVatRateLabel() {
        elements.vatValue.textContent = `${clampInt(elements.vatInput.value, 0, 25, state.config.defaultVatRate)}%`;
    }

    function initCollapsibleSections() {
        elements.sectionToggles.forEach((toggle) => {
            toggle.addEventListener('click', () => {
                const section = toggle.closest('.offer-collapsible');
                if (!section) return;
                section.classList.toggle('is-collapsed');
                syncCollapsibleHeaders();
            });
        });
        syncCollapsibleHeaders();
    }

    function syncCollapsibleHeaders() {
        elements.sectionToggles.forEach((toggle) => {
            const section = toggle.closest('.offer-collapsible');
            const expanded = section ? !section.classList.contains('is-collapsed') : false;
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        });
    }

    function updateSectionExcerpts() {
        const meta = buildMetaExcerpt();
        const content = buildContentExcerpt();
        const parts = [meta];
        if (content && content !== '-') parts.push(content);
        setExcerpt(elements.detailsExcerpt, parts.join(' | '));
    }

    function setExcerpt(element, value) {
        if (!element) return;
        const text = normalizeString(value) || '-';
        element.textContent = text;
        element.title = text;
    }

    function buildMetaExcerpt() {
        const offerNumber = normalizeString(elements.offerNumberInput.value) || '#';
        const issueDate = formatUiDate(elements.issueDateInput.value);
        const validUntil = formatUiDate(elements.validUntilInput.value);
        return `${offerNumber} | ${issueDate} | ${validUntil}`;
    }

    function buildContentExcerpt() {
        const combined = [
            normalizeString(elements.introInput.value),
            normalizeString(elements.specificationInput.value),
            normalizeString(elements.noteInput.value)
        ]
            .filter(Boolean)
            .join(' | ');
        return truncateInline(combined || '-', 120);
    }

    function truncateInline(value, maxLength) {
        const text = normalizeString(value);
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
    }

    function initFormDefaults() {
        const today = formatDateInputValue(new Date());
        elements.issueDateInput.value = today;
        state.validUntilManuallySet = false;
        syncValidUntilFromDefaults();

        elements.vatInput.value = String(state.config.defaultVatRate);
        elements.noteInput.value = state.config.defaultNote || '';
        updateVatRateLabel();
        updateSectionExcerpts();
    }

    function renderIssuers() {
        ensureIssuerSelection();

        elements.issuerSelect.innerHTML = '';
        if (state.issuers.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = i18n('offerIssuerNoneAvailable') || 'No issuer';
            elements.issuerSelect.appendChild(option);
            elements.issuerSelect.value = '';
            elements.issuerEditBtn.disabled = true;
            elements.issuerRemoveBtn.disabled = true;
            elements.issuerChipList.innerHTML = '';
            setIssuerCard(elements.selectedIssuerPill, null);
            setIssuerSummaryCard(elements.formIssuerCard, null);
            updateSectionExcerpts();
            return;
        }

        state.issuers.forEach((issuer) => {
            const option = document.createElement('option');
            option.value = issuer.id;
            const sourceText = issuer.source === 'manual'
                ? i18n('offerIssuerSourceManualShort') || 'MAN'
                : i18n('offerIssuerSourceXmlShort') || 'XML';
            option.textContent = `[${sourceText}] ${issuer.name}`;
            elements.issuerSelect.appendChild(option);
        });
        elements.issuerSelect.value = state.selectedIssuerId;
        elements.issuerEditBtn.disabled = false;
        elements.issuerRemoveBtn.disabled = false;

        renderIssuerChips();
        setIssuerCard(elements.selectedIssuerPill, getSelectedIssuer());
        setIssuerSummaryCard(elements.formIssuerCard, getSelectedIssuer());
        updateSectionExcerpts();
    }

    function renderIssuerChips() {
        elements.issuerChipList.innerHTML = '';
        state.issuers.forEach((issuer) => {
            const chip = document.createElement('div');
            chip.className = `issuer-chip${issuer.id === state.selectedIssuerId ? ' current' : ''}`;

            const selectBtn = document.createElement('button');
            selectBtn.type = 'button';
            selectBtn.className = 'issuer-chip-main';
            selectBtn.setAttribute('data-issuer-select', issuer.id);

            const name = document.createElement('span');
            name.textContent = issuer.name;
            const badge = buildSourceBadge(issuer.source);
            selectBtn.appendChild(name);
            selectBtn.appendChild(badge);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'issuer-chip-remove';
            removeBtn.setAttribute('data-issuer-remove', issuer.id);
            removeBtn.setAttribute('title', i18n('offerIssuerRemove') || 'Remove issuer');
            removeBtn.setAttribute('aria-label', removeBtn.getAttribute('title'));
            removeBtn.innerHTML = '&times;';
            window.AppShared.ConfirmInline.attach(removeBtn, {
                confirmLabel: i18n('confirmActionRepeat'),
                onConfirm: async () => {
                    await removeIssuer(issuer.id);
                }
            });

            chip.appendChild(selectBtn);
            chip.appendChild(removeBtn);
            elements.issuerChipList.appendChild(chip);
        });
    }

    function setIssuerCard(container, issuer) {
        container.innerHTML = '';
        if (!issuer) {
            container.textContent = i18n('offerIssuerNoneSelected') || 'No issuer selected.';
            return;
        }

        const titleRow = document.createElement('div');
        titleRow.className = 'issuer-pill-title';
        const title = document.createElement('span');
        title.textContent = issuer.name;
        titleRow.appendChild(title);
        titleRow.appendChild(buildSourceBadge(issuer.source));

        const details = [];
        if (issuer.oib) details.push(`OIB: ${issuer.oib}`);
        if (issuer.address) details.push(issuer.address);
        if (issuer.city) details.push(issuer.city);
        if (issuer.iban) details.push(`IBAN: ${issuer.iban}`);
        if (issuer.contact) details.push(issuer.contact);
        if (issuer.email) details.push(issuer.email);
        if (issuer.web) details.push(issuer.web);

        container.appendChild(titleRow);
        details.forEach((line) => {
            const row = document.createElement('div');
            row.textContent = line;
            container.appendChild(row);
        });
    }

    function setIssuerSummaryCard(container, issuer) {
        container.innerHTML = '';
        if (!issuer) {
            container.textContent = i18n('offerIssuerNoneSelected') || 'No issuer selected.';
            return;
        }

        const titleRow = document.createElement('div');
        titleRow.className = 'issuer-pill-title';
        const title = document.createElement('span');
        title.textContent = issuer.name;
        titleRow.appendChild(title);
        titleRow.appendChild(buildSourceBadge(issuer.source));
        container.appendChild(titleRow);

        const details = [];
        if (issuer.oib) details.push(`OIB: ${issuer.oib}`);
        if (issuer.city) details.push(issuer.city);
        if (issuer.iban) details.push(`IBAN: ${issuer.iban}`);
        if (details.length) {
            const summary = document.createElement('div');
            summary.textContent = details.join(' | ');
            container.appendChild(summary);
        }
    }

    function buildSourceBadge(source) {
        const badge = document.createElement('span');
        const normalizedSource = source === 'manual' ? 'manual' : 'xml';
        badge.className = `source-badge ${normalizedSource}`;
        badge.textContent = normalizedSource === 'manual'
            ? (i18n('offerIssuerSourceManualShort') || 'MAN')
            : (i18n('offerIssuerSourceXmlShort') || 'XML');
        return badge;
    }

    function ensureIssuerSelection() {
        if (!state.issuers.find((issuer) => issuer.id === state.selectedIssuerId)) {
            state.selectedIssuerId = state.issuers[0] ? state.issuers[0].id : '';
            persistSelectedIssuer();
        }
    }

    function getSelectedIssuer() {
        return state.issuers.find((issuer) => issuer.id === state.selectedIssuerId) || null;
    }

    function setIssuerCreateMode(mode) {
        const isCreate = state.issuerEditorMode === 'create';
        state.issuerCreateMode = isCreate && mode === 'manual' ? 'manual' : 'import';

        const showImport = isCreate && state.issuerCreateMode === 'import';
        const showManual = !isCreate || state.issuerCreateMode === 'manual';

        elements.issuerModeSwitch.classList.toggle('is-hidden', !isCreate);
        elements.issuerCreateImport.classList.toggle('is-hidden', !showImport);
        elements.issuerEditorGrid.classList.toggle('is-hidden', !showManual);
        elements.issuerSaveBtn.classList.toggle('is-hidden', !showManual);

        const importActive = showImport;
        const manualActive = isCreate && state.issuerCreateMode === 'manual';
        elements.issuerModeImportBtn.classList.toggle('active', importActive);
        elements.issuerModeImportBtn.setAttribute('aria-pressed', importActive ? 'true' : 'false');
        elements.issuerModeManualBtn.classList.toggle('active', manualActive);
        elements.issuerModeManualBtn.setAttribute('aria-pressed', manualActive ? 'true' : 'false');
    }

    function openIssuerEditor(mode, issuerId) {
        state.issuerEditorMode = mode === 'edit' ? 'edit' : 'create';
        state.editingIssuerId = state.issuerEditorMode === 'edit' ? normalizeString(issuerId) : '';

        const current = state.issuerEditorMode === 'edit'
            ? state.issuers.find((issuer) => issuer.id === state.editingIssuerId)
            : null;

        elements.issuerEditorTitle.textContent = state.issuerEditorMode === 'edit'
            ? (i18n('offerIssuerEditorTitleEdit') || 'Edit issuer')
            : (i18n('offerIssuerEditorTitleNew') || 'New issuer');

        elements.issuerFieldName.value = current ? current.name : '';
        elements.issuerFieldAddress.value = current ? current.address : '';
        elements.issuerFieldCity.value = current ? current.city : '';
        elements.issuerFieldOib.value = current ? current.oib : '';
        elements.issuerFieldIban.value = current ? current.iban : '';
        elements.issuerFieldContact.value = current ? current.contact : '';
        elements.issuerFieldEmail.value = current ? current.email : '';
        elements.issuerFieldWeb.value = current ? current.web : '';

        if (state.issuerEditorMode === 'edit') {
            setIssuerCreateMode('manual');
        } else {
            setIssuerCreateMode('import');
        }

        elements.issuerEditor.classList.remove('is-hidden');
        if (state.issuerEditorMode === 'edit') {
            elements.issuerFieldName.focus();
        } else {
            elements.importIssuerBtn.focus();
        }
    }

    function closeIssuerEditor() {
        elements.issuerEditor.classList.add('is-hidden');
        state.issuerEditorMode = 'create';
        state.issuerCreateMode = 'import';
        state.editingIssuerId = '';
    }

    async function saveIssuerFromEditor() {
        if (state.issuerEditorMode === 'create' && state.issuerCreateMode !== 'manual') {
            showToast(i18n('offerImportHint') || 'Upload one e-invoice XML or switch to manual mode.');
            return;
        }

        const name = normalizeString(elements.issuerFieldName.value);
        if (!name) {
            showToast(i18n('offerErrorIssuerNameRequired') || 'Issuer company name is required.');
            return;
        }

        const nextData = {
            name,
            address: normalizeString(elements.issuerFieldAddress.value),
            city: normalizeString(elements.issuerFieldCity.value),
            oib: normalizeString(elements.issuerFieldOib.value),
            iban: normalizeString(elements.issuerFieldIban.value),
            contact: normalizeString(elements.issuerFieldContact.value),
            email: normalizeString(elements.issuerFieldEmail.value),
            web: normalizeString(elements.issuerFieldWeb.value)
        };

        if (state.issuerEditorMode === 'edit' && state.editingIssuerId) {
            const index = state.issuers.findIndex((issuer) => issuer.id === state.editingIssuerId);
            if (index >= 0) {
                state.issuers[index] = normalizeIssuer({
                    ...state.issuers[index],
                    ...nextData,
                    updatedAt: Date.now()
                });
                state.selectedIssuerId = state.issuers[index].id;
            }
        } else {
            const created = normalizeIssuer({
                ...nextData,
                id: buildId('issuer'),
                source: 'manual',
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            state.issuers.push(created);
            state.selectedIssuerId = created.id;
        }

        await persistIssuers();
        await persistSelectedIssuer();
        closeIssuerEditor();
        renderIssuers();
        updateOfferNumberSuggestion(false);
    }

    async function removeIssuer(issuerId) {
        const targetId = normalizeString(issuerId);
        if (!targetId) return;
        state.issuers = state.issuers.filter((issuer) => issuer.id !== targetId);
        if (state.selectedIssuerId === targetId) {
            state.selectedIssuerId = state.issuers[0] ? state.issuers[0].id : '';
        }
        await persistIssuers();
        await persistSelectedIssuer();
        renderIssuers();
        updateOfferNumberSuggestion(false);
    }

    async function handleIssuerImport() {
        const file = elements.importXmlInput.files && elements.importXmlInput.files[0];
        elements.importXmlInput.value = '';
        if (!file) return;

        try {
            const xmlContent = await file.text();
            if (!xmlContent || !InvoiceParser.isUBL(xmlContent)) {
                showToast(i18n('offerErrorInvalidXml') || 'Provided file is not a valid e-invoice XML.');
                return;
            }

            const parser = new InvoiceParser(xmlContent, state.uiLanguage);
            const data = parser.parse();
            const supplier = data && data.supplier ? data.supplier : {};
            const payment = data && data.payment ? data.payment : {};

            const candidate = normalizeIssuer({
                source: 'xml',
                name: normalizeString(supplier.name),
                address: normalizeString(supplier.address),
                city: normalizeString(supplier.city),
                oib: normalizeString(supplier.vatId),
                iban: normalizeString(payment.account),
                contact: normalizeString(supplier.contact),
                email: '',
                web: ''
            });

            if (!candidate.name) {
                showToast(i18n('offerErrorImportNoIssuerData') || 'No issuer details were found in the XML.');
                return;
            }

            state.pendingImportIssuer = candidate;
            renderImportPreview();
            openImportOverlay();
        } catch (error) {
            console.error('Issuer import failed:', error);
            showToast(i18n('offerErrorInvalidXml') || 'Provided file is not a valid e-invoice XML.');
        }
    }

    function initModals() {
        if (!window.AppShared || !window.AppShared.Modal) return;
        if (elements.importOverlay) {
            modals.import = window.AppShared.Modal.create(elements.importOverlay, {
                initialFocus: () => elements.importCancelBtn || elements.importApplyBtn
            });
        }
        if (elements.previewOverlay) {
            modals.preview = window.AppShared.Modal.create(elements.previewOverlay, {
                initialFocus: () => elements.previewCloseBtn,
                onClose: () => {
                    if (elements.previewFrame) elements.previewFrame.src = '';
                    if (state.activePreviewUrl) {
                        URL.revokeObjectURL(state.activePreviewUrl);
                        state.activePreviewUrl = '';
                    }
                }
            });
        }
    }

    function openImportOverlay(triggerEl) {
        if (modals.import) {
            modals.import.open(triggerEl);
            return;
        }
        elements.importOverlay.classList.add('open');
        elements.importOverlay.setAttribute('aria-hidden', 'false');
    }

    function closeImportOverlay() {
        if (modals.import && modals.import.isOpen()) {
            modals.import.close();
            return;
        }
        elements.importOverlay.classList.remove('open');
        elements.importOverlay.setAttribute('aria-hidden', 'true');
    }

    function renderImportPreview() {
        elements.importList.innerHTML = '';
        if (!state.pendingImportIssuer) return;

        const rows = [
            ['offerSettingIssuerName', state.pendingImportIssuer.name],
            ['offerSettingIssuerAddress', state.pendingImportIssuer.address],
            ['offerSettingIssuerCity', state.pendingImportIssuer.city],
            ['offerSettingIssuerOib', state.pendingImportIssuer.oib],
            ['offerSettingIssuerIban', state.pendingImportIssuer.iban],
            ['offerSettingIssuerContact', state.pendingImportIssuer.contact]
        ].filter((entry) => normalizeString(entry[1]));

        rows.forEach(([labelKey, value]) => {
            const row = document.createElement('li');
            row.className = 'import-row';
            const key = document.createElement('span');
            key.className = 'import-key';
            key.textContent = i18n(labelKey) || labelKey;
            const val = document.createElement('span');
            val.className = 'import-value';
            val.textContent = value;
            row.appendChild(key);
            row.appendChild(val);
            elements.importList.appendChild(row);
        });
    }

    async function applyImportedIssuer() {
        if (!state.pendingImportIssuer) {
            closeImportOverlay();
            return;
        }

        const issuerId = upsertIssuer(state.pendingImportIssuer);
        state.selectedIssuerId = issuerId;
        state.pendingImportIssuer = null;

        await persistIssuers();
        await persistSelectedIssuer();
        renderIssuers();
        updateOfferNumberSuggestion(false);
        closeImportOverlay();
        closeIssuerEditor();
    }

    function upsertIssuer(candidate) {
        const incoming = normalizeIssuer(candidate);
        const incomingOib = normalizeIdentityValue(incoming.oib);
        const incomingNameKey = normalizeIdentityValue(incoming.name);
        const incomingAddressKey = normalizeIdentityValue(incoming.address);
        const incomingCityKey = normalizeIdentityValue(incoming.city);

        const index = state.issuers.findIndex((issuer) => {
            const issuerOib = normalizeIdentityValue(issuer.oib);
            if (incomingOib && issuerOib && incomingOib === issuerOib) return true;
            const issuerNameKey = normalizeIdentityValue(issuer.name);
            const issuerAddressKey = normalizeIdentityValue(issuer.address);
            const issuerCityKey = normalizeIdentityValue(issuer.city);
            return incomingNameKey && issuerNameKey === incomingNameKey &&
                issuerAddressKey === incomingAddressKey &&
                issuerCityKey === incomingCityKey;
        });

        if (index >= 0) {
            const current = state.issuers[index];
            const merged = normalizeIssuer({
                ...current,
                ...incoming,
                id: current.id,
                source: current.source === 'manual' ? 'manual' : incoming.source,
                name: incoming.name || current.name,
                address: incoming.address || current.address,
                city: incoming.city || current.city,
                oib: incoming.oib || current.oib,
                iban: incoming.iban || current.iban,
                contact: incoming.contact || current.contact,
                email: incoming.email || current.email,
                web: incoming.web || current.web,
                updatedAt: Date.now()
            });
            state.issuers[index] = merged;
            return merged.id;
        }

        const created = normalizeIssuer({
            ...incoming,
            id: buildId('issuer'),
            source: incoming.source || 'xml',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        state.issuers.push(created);
        return created.id;
    }

    function syncValidUntilFromDefaults() {
        const issueDate = parseDateInput(elements.issueDateInput.value) || new Date();
        const days = clampInt(state.config.defaultValidityDays, 1, 30, 15);
        const validUntil = new Date(issueDate.getTime() + days * DAY_MS);
        elements.validUntilInput.value = formatDateInputValue(validUntil);
    }

    function ensureAtLeastOneItemRow() {
        if (!elements.itemsBody.children.length) {
            addItemRow();
        }
    }

    function bindIntegerArrowStep(input, minValue) {
        const lower = typeof minValue === 'number' ? minValue : 0;
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            const current = window.AppShared.toNumber(input.value, 0);
            const delta = event.key === 'ArrowUp' ? 1 : -1;
            const next = Math.max(lower, current + delta);
            input.value = String(window.AppShared.roundMoney(next));
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    function addItemRow(item = null) {
        const row = document.createElement('tr');
        row.dataset.rowId = `offer-row-${++state.itemCounter}`;

        const descriptionCell = document.createElement('td');
        const descriptionInput = document.createElement('input');
        descriptionInput.type = 'text';
        descriptionInput.className = 'text-input';
        descriptionInput.placeholder = i18n('offerItemDescriptionPlaceholder') || '';
        descriptionInput.value = normalizeString(item && item.description);
        descriptionCell.appendChild(descriptionInput);

        const qtyCell = document.createElement('td');
        qtyCell.className = 'td-num';
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.className = 'number-input';
        qtyInput.min = '0';
        qtyInput.step = 'any';
        qtyInput.inputMode = 'decimal';
        qtyInput.value = String(clampFloat(item && item.quantity, 0, 1e9, 1, 2));
        bindIntegerArrowStep(qtyInput, 0);
        qtyCell.appendChild(qtyInput);

        const unitCell = document.createElement('td');
        unitCell.className = 'td-num';
        const unitInput = document.createElement('input');
        unitInput.type = 'text';
        unitInput.className = 'text-input';
        unitInput.placeholder = i18n('offerItemUnitPlaceholder') || '';
        unitInput.value = normalizeString(item && item.unit);
        unitCell.appendChild(unitInput);

        const unitPriceCell = document.createElement('td');
        unitPriceCell.className = 'td-num';
        const unitPriceInput = document.createElement('input');
        unitPriceInput.type = 'number';
        unitPriceInput.className = 'number-input';
        unitPriceInput.min = '0';
        unitPriceInput.step = 'any';
        unitPriceInput.inputMode = 'decimal';
        unitPriceInput.value = String(clampFloat(item && item.unitPrice, 0, 1e9, 0, 2));
        bindIntegerArrowStep(unitPriceInput, 0);
        unitPriceCell.appendChild(unitPriceInput);

        const discountCell = document.createElement('td');
        const discountWrap = document.createElement('div');
        discountWrap.className = 'item-discount-stack';
        const discountInput = document.createElement('input');
        discountInput.type = 'range';
        discountInput.className = 'range-input';
        discountInput.min = '0';
        discountInput.max = '100';
        discountInput.step = '1';
        discountInput.value = String(item && Number.isFinite(item.discountRate) ? clampInt(item.discountRate, 0, 100, 0) : 0);
        const discountValue = document.createElement('span');
        discountValue.className = 'item-discount-value';
        discountWrap.appendChild(discountInput);
        discountWrap.appendChild(discountValue);
        discountCell.appendChild(discountWrap);

        const lineTotalCell = document.createElement('td');
        lineTotalCell.className = 'td-num';
        const lineTotal = document.createElement('span');
        lineTotal.className = 'file-sub';
        lineTotal.textContent = formatCurrency(0);
        lineTotalCell.appendChild(lineTotal);

        const removeCell = document.createElement('td');
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-icon btn-icon-danger item-trash';
        removeBtn.title = i18n('offerItemRemove') || 'Remove';
        removeBtn.setAttribute('aria-label', removeBtn.title);
        removeBtn.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i>';
        removeCell.appendChild(removeBtn);

        row.appendChild(descriptionCell);
        row.appendChild(qtyCell);
        row.appendChild(unitCell);
        row.appendChild(unitPriceCell);
        row.appendChild(discountCell);
        row.appendChild(lineTotalCell);
        row.appendChild(removeCell);
        elements.itemsBody.appendChild(row);

        const recalc = () => {
            const quantity = window.AppShared.roundMoney(toNumber(qtyInput.value));
            const unitPrice = window.AppShared.roundMoney(toNumber(unitPriceInput.value));
            const lineGross = window.AppShared.roundMoney(quantity * unitPrice);
            const discountRate = clampInt(discountInput.value, 0, 100, 0);
            const lineDiscount = window.AppShared.roundMoney(lineGross * (discountRate / 100));
            discountValue.textContent = `${discountRate}%`;
            lineTotal.textContent = formatCurrency(window.AppShared.roundMoney(lineGross - lineDiscount));
            updateSummary();
        };

        descriptionInput.addEventListener('input', updateSummary);
        qtyInput.addEventListener('input', recalc);
        unitInput.addEventListener('input', updateSummary);
        unitPriceInput.addEventListener('input', recalc);
        discountInput.addEventListener('input', recalc);
        removeBtn.addEventListener('click', () => {
            row.remove();
            ensureAtLeastOneItemRow();
            updateSummary();
        });

        recalc();
    }

    function collectOfferItems() {
        return Array.from(elements.itemsBody.querySelectorAll('tr'))
            .map((row) => {
                const fields = row.querySelectorAll('input');
                return {
                    description: normalizeString(fields[0] && fields[0].value),
                    quantity: toNumber(fields[1] && fields[1].value),
                    unit: normalizeString(fields[2] && fields[2].value),
                    unitPrice: toNumber(fields[3] && fields[3].value),
                    discountRate: clampInt(fields[4] && fields[4].value, 0, 100, 0)
                };
            })
            .filter((item) => item.description || item.quantity || item.unitPrice);
    }

    function computeTotals() {
        const items = collectOfferItems();
        const vatRate = clampInt(elements.vatInput.value, 0, 25, state.config.defaultVatRate);
        if (!window.OfferPdfGenerator || typeof window.OfferPdfGenerator.computeOfferTotals !== 'function') {
            return {
                items,
                vatRate,
                standardPrice: 0,
                discountAmount: 0,
                netBase: 0,
                vatAmount: 0,
                total: 0
            };
        }
        return window.OfferPdfGenerator.computeOfferTotals(items, vatRate);
    }

    function updateSummary() {
        const totals = computeTotals();
        updateVatRateLabel();
        updateSectionExcerpts();
        elements.standardPriceValue.textContent = formatCurrency(totals.standardPrice);
        elements.discountAmountValue.textContent = formatCurrency(totals.discountAmount);
        elements.netBaseValue.textContent = formatCurrency(totals.netBase);
        elements.vatAmountValue.textContent = formatCurrency(totals.vatAmount);
        elements.totalAmountValue.textContent = formatCurrency(totals.total);
    }

    function validateOfferForm() {
        const offersView = document.getElementById('offers-view');
        if (offersView) window.AppShared.clearAllFieldErrors(offersView);

        const errors = [];

        if (!window.OfferPdfGenerator || typeof window.OfferPdfGenerator.createOfferPdf !== 'function') {
            errors.push({
                fatal: true,
                message: i18n('offerErrorGeneratorUnavailable') || 'Offer generator is unavailable.'
            });
            return { ok: false, errors };
        }

        if (!getSelectedIssuer()) {
            errors.push({
                fieldEl: null,
                focusEl: elements.issuerSelect,
                message: i18n('offerIssuerNoneSelected') || 'Select or create an issuer.'
            });
        }

        const customerName = normalizeString(elements.customerNameInput.value);
        if (!customerName) {
            const fieldEl = elements.customerNameInput.closest('.offer-field');
            errors.push({
                fieldEl,
                focusEl: elements.customerNameInput,
                message: i18n('offerErrorCustomerNameRequired') || 'Customer name is required.'
            });
        }

        const items = collectOfferItems();
        if (!items.length) {
            errors.push({
                fieldEl: null,
                focusEl: elements.addItemBtn,
                message: i18n('offerErrorNoItems') || 'Add at least one offer line item.'
            });
        }

        return { ok: errors.length === 0, errors, items };
    }

    async function buildOfferData(items) {
        const issuer = getSelectedIssuer();
        const customer = {
            name: normalizeString(elements.customerNameInput.value),
            oib: normalizeString(elements.customerOibInput.value),
            address: normalizeString(elements.customerAddressInput.value)
        };
        const issueDate = normalizeString(elements.issueDateInput.value) || formatDateInputValue(new Date());
        const validUntil = normalizeString(elements.validUntilInput.value) || issueDate;
        const vatRate = clampInt(elements.vatInput.value, 0, 25, state.config.defaultVatRate);

        let offerNumber = normalizeString(elements.offerNumberInput.value).toUpperCase();
        if (!offerNumber) {
            offerNumber = await reserveNextOfferNumber(issueDate);
            elements.offerNumberInput.value = offerNumber;
        } else {
            await syncCounterFromManualOfferNumber(offerNumber);
        }

        return {
            offerNumber,
            issueDate,
            validUntil,
            issuer: {
                name: issuer.name,
                address: issuer.address,
                city: issuer.city,
                oib: issuer.oib,
                iban: issuer.iban,
                contact: issuer.contact,
                email: issuer.email,
                web: issuer.web
            },
            customer,
            intro: normalizeString(elements.introInput.value),
            specification: normalizeString(elements.specificationInput.value),
            note: normalizeString(elements.noteInput.value),
            items,
            vatRate,
            currency: 'EUR'
        };
    }

    async function renderAndPersistOffer(offerData) {
        const pdfLanguage = state.pdfLanguage || 'hr';
        const pdfMessages = await getPdfMessages(pdfLanguage);
        const pdfOptions = {
            language: pdfLanguage,
            accentColor: state.pdfAccentColor,
            logoDataUrl: state.pdfLogoDataUrl
        };
        const result = window.OfferPdfGenerator.createOfferPdf(offerData, {
            messages: pdfMessages,
            accentColor: pdfOptions.accentColor,
            logoDataUrl: pdfOptions.logoDataUrl,
            locale: toLocale(pdfLanguage)
        });
        const blob = result.doc.output('blob');

        const offerId = buildId('offer');
        const safeCustomer = sanitizeFilePart(offerData.customer.name || 'buyer');
        const safeOfferNumber = sanitizeFilePart(offerData.offerNumber || 'offer');
        const pdfName = `${safeCustomer}-${safeOfferNumber}.pdf`;

        const record = {
            id: offerId,
            pdfName,
            offerNumber: offerData.offerNumber,
            customerName: offerData.customer.name,
            total: result.totals.total,
            currency: 'EUR',
            issueDate: offerData.issueDate,
            validUntil: offerData.validUntil,
            createdAt: Date.now(),
            offerData,
            pdfOptions
        };

        state.generatedOffers.unshift(record);
        state.offerBlobs[offerId] = blob;

        upsertBuyer(offerData.customer);
        await persistBuyers();
        await persistGeneratedOffers();

        renderGeneratedOffers();
        focusGeneratedOffer(offerId);
        updateOfferNumberSuggestion(true);
        return offerId;
    }

    async function generateOffer() {
        const { ok, errors, items } = validateOfferForm();
        if (!ok) {
            errors.forEach((err) => {
                if (err.fieldEl) window.AppShared.setFieldError(err.fieldEl, err.message);
            });
            const first = errors[0];
            showToast(first.message, { variant: 'error' });
            if (first.focusEl && typeof first.focusEl.focus === 'function') {
                try { first.focusEl.focus(); } catch (e) { /* ignore */ }
            }
            return;
        }

        const busyLabel = i18n('offerGenerating') || 'Generating…';
        try {
            await window.AppShared.withBusy(elements.generateBtn, busyLabel, async () => {
                const offerData = await buildOfferData(items);
                await renderAndPersistOffer(offerData);
            });
            showToast(i18n('offerGeneratedSuccess') || 'Ponuda je generirana.', { variant: 'success' });
        } catch (error) {
            console.error('Offer PDF generation failed:', error);
            showToast(i18n('offerErrorGenerationFailed') || 'Failed to generate offer PDF.', { variant: 'error' });
        }
    }

    function resetOfferForm() {
        elements.offerNumberInput.value = '';
        elements.issueDateInput.value = formatDateInputValue(new Date());
        state.validUntilManuallySet = false;
        syncValidUntilFromDefaults();

        elements.customerNameInput.value = '';
        elements.customerOibInput.value = '';
        elements.customerAddressInput.value = '';
        closeBuyerSuggestions(elements.buyerNameSuggestions);
        closeBuyerSuggestions(elements.buyerOibSuggestions);

        elements.introInput.value = '';
        elements.specificationInput.value = '';
        elements.noteInput.value = state.config.defaultNote || '';
        elements.vatInput.value = String(state.config.defaultVatRate);

        elements.itemsBody.innerHTML = '';
        addItemRow();
        updateOfferNumberSuggestion(false);
        updateSummary();
    }

    function renderGeneratedOffers() {
        elements.resultsList.innerHTML = '';
        if (!state.generatedOffers.length) {
            elements.resultsSection.classList.add('is-hidden');
            return;
        }

        state.generatedOffers.forEach((offer) => {
            const row = document.createElement('div');
            row.className = 'file-item';
            row.id = `generated-offer-${offer.id}`;

            const info = document.createElement('div');
            info.className = 'file-info';

            const titleRow = document.createElement('div');
            titleRow.className = 'file-line';
            const icon = document.createElement('i');
            icon.className = 'fas fa-file-signature file-icon';
            icon.setAttribute('aria-hidden', 'true');
            const name = document.createElement('div');
            name.className = 'file-name';
            name.textContent = offer.pdfName;
            titleRow.appendChild(icon);
            titleRow.appendChild(name);

            const sub1 = document.createElement('div');
            sub1.className = 'file-sub';
            sub1.textContent = `${offer.offerNumber} | ${(i18n('offerLabelValidUntil') || 'Valid until')}: ${formatUiDate(offer.validUntil)}`;

            const sub2 = document.createElement('div');
            sub2.className = 'file-sub';
            sub2.textContent = `${i18n('offerSummaryTotal') || 'Total'}: ${formatCurrency(offer.total)}`;

            info.appendChild(titleRow);
            info.appendChild(sub1);
            info.appendChild(sub2);

            const actions = document.createElement('div');
            actions.className = 'action-buttons';
            actions.addEventListener('click', (event) => event.stopPropagation());

            const pdfBtn = document.createElement('button');
            pdfBtn.type = 'button';
            pdfBtn.className = 'download-btn';
            const pdfLabel = document.createElement('span');
            pdfLabel.textContent = i18n('downloadPdf') || 'PDF';
            const previewTrigger = document.createElement('span');
            previewTrigger.className = 'pdf-preview-trigger';
            previewTrigger.setAttribute('title', i18n('offerPreviewPdf') || 'Preview');
            previewTrigger.setAttribute('aria-hidden', 'true');
            const previewIcon = document.createElement('i');
            previewIcon.className = 'fas fa-search-plus';
            previewIcon.setAttribute('aria-hidden', 'true');
            previewTrigger.appendChild(previewIcon);
            pdfBtn.appendChild(pdfLabel);
            pdfBtn.appendChild(previewTrigger);
            pdfBtn.addEventListener('click', async (event) => {
                event.stopPropagation();
                if (event.target && event.target.closest('.pdf-preview-trigger')) {
                    await openOfferPreview(offer);
                    return;
                }
                await downloadOfferPdf(offer);
            });

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn-icon btn-icon-danger item-trash';
            removeBtn.title = i18n('offerItemRemove') || 'Remove';
            removeBtn.setAttribute('aria-label', removeBtn.title);
            removeBtn.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i>';
            window.AppShared.ConfirmInline.attach(removeBtn, {
                confirmLabel: i18n('confirmActionRepeat'),
                onConfirm: async () => {
                    await removeGeneratedOffer(offer.id);
                }
            });

            actions.appendChild(pdfBtn);
            actions.appendChild(removeBtn);

            row.appendChild(info);
            row.appendChild(actions);
            elements.resultsList.appendChild(row);
        });

        elements.resultsSection.classList.remove('is-hidden');
    }

    function focusGeneratedOffer(offerId) {
        const id = normalizeString(offerId);
        if (!id) return;
        elements.resultsSection.classList.remove('is-hidden');
        elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.requestAnimationFrame(() => {
            const row = document.getElementById(`generated-offer-${id}`);
            if (!row) return;
            row.classList.remove('flash-new');
            void row.offsetWidth;
            row.classList.add('flash-new');
            window.setTimeout(() => {
                row.classList.remove('flash-new');
            }, 1700);
        });
    }

    async function ensureOfferBlob(offer) {
        if (!offer || !offer.id || !offer.offerData) return null;
        if (state.offerBlobs[offer.id]) {
            return state.offerBlobs[offer.id];
        }
        try {
            const lang = normalizeLanguage(offer.pdfOptions && offer.pdfOptions.language ? offer.pdfOptions.language : state.pdfLanguage);
            const pdfMessages = await getPdfMessages(lang);
            const result = window.OfferPdfGenerator.createOfferPdf(offer.offerData, {
                messages: pdfMessages,
                accentColor: (offer.pdfOptions && offer.pdfOptions.accentColor) || state.pdfAccentColor,
                logoDataUrl: (offer.pdfOptions && offer.pdfOptions.logoDataUrl) || '',
                locale: toLocale(lang)
            });
            const blob = result.doc.output('blob');
            state.offerBlobs[offer.id] = blob;
            return blob;
        } catch (error) {
            console.error('Offer blob regeneration failed:', error);
            return null;
        }
    }

    async function openOfferPreview(offer, triggerEl) {
        const blob = await ensureOfferBlob(offer);
        if (!blob) {
            showToast(i18n('offerErrorBlobMissing') || 'Offer PDF is unavailable.');
            return;
        }

        closeOfferPreview();
        state.activePreviewUrl = URL.createObjectURL(blob);
        elements.previewFrame.src = `${state.activePreviewUrl}#view=FitH`;
        elements.previewTitle.textContent = offer.pdfName || 'Offer.pdf';
        if (modals.preview) {
            modals.preview.open(triggerEl || (document.activeElement instanceof HTMLElement ? document.activeElement : null));
        } else {
            elements.previewOverlay.classList.add('open');
            elements.previewOverlay.setAttribute('aria-hidden', 'false');
        }
    }

    function closeOfferPreview() {
        if (modals.preview && modals.preview.isOpen()) {
            modals.preview.close();
            return;
        }
        elements.previewOverlay.classList.remove('open');
        elements.previewOverlay.setAttribute('aria-hidden', 'true');
        elements.previewFrame.src = '';
        if (state.activePreviewUrl) {
            URL.revokeObjectURL(state.activePreviewUrl);
            state.activePreviewUrl = '';
        }
    }

    async function downloadOfferPdf(offer) {
        const blob = await ensureOfferBlob(offer);
        if (!blob) {
            showToast(i18n('offerErrorBlobMissing') || 'Offer PDF is unavailable.');
            return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = offer.pdfName || 'Offer.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    async function removeGeneratedOffer(offerId) {
        const id = normalizeString(offerId);
        if (!id) return;
        if (state.offerBlobs[id]) {
            delete state.offerBlobs[id];
        }
        state.generatedOffers = state.generatedOffers.filter((offer) => offer.id !== id);
        await persistGeneratedOffers();
        renderGeneratedOffers();
    }

    function bindBuyerAutocomplete(input, panel, mode) {
        function pickBuyerById(buyerId) {
            const id = normalizeString(buyerId);
            const buyer = state.buyers.find((entry) => entry.id === id);
            if (!buyer) return;
            elements.customerNameInput.value = buyer.name || '';
            elements.customerOibInput.value = buyer.oib || '';
            elements.customerAddressInput.value = buyer.address || '';
            window.AppShared.clearFieldError(elements.customerNameInput);
            closeBuyerSuggestions(elements.buyerNameSuggestions);
            closeBuyerSuggestions(elements.buyerOibSuggestions);
        }

        const render = () => {
            const query = normalizeString(input.value).toLowerCase();
            const candidates = state.buyers
                .filter((buyer) => {
                    const haystack = mode === 'oib'
                        ? `${buyer.oib} ${buyer.name}`
                        : `${buyer.name} ${buyer.oib}`;
                    return !query || haystack.toLowerCase().includes(query);
                })
                .sort((a, b) => Number(b.lastUsedAt || 0) - Number(a.lastUsedAt || 0))
                .slice(0, 8);

            panel.innerHTML = '';
            if (!candidates.length) {
                closeBuyerSuggestions(panel);
                return;
            }

            candidates.forEach((buyer) => {
                const row = document.createElement('div');
                row.className = 'buyer-suggestion';

                const main = document.createElement('button');
                main.type = 'button';
                main.className = 'buyer-suggestion-main';
                main.setAttribute('data-buyer-pick', buyer.id);
                const nameSpan = document.createElement('span');
                nameSpan.textContent = buyer.name || '-';
                const subSpan = document.createElement('span');
                subSpan.className = 'sub';
                const subParts = [buyer.oib || '-'];
                if (buyer.address) subParts.push(buyer.address);
                subSpan.textContent = subParts.join(' | ');
                main.appendChild(nameSpan);
                main.appendChild(subSpan);

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'buyer-suggestion-remove';
                remove.setAttribute('data-buyer-remove', buyer.id);
                remove.setAttribute('aria-label', i18n('offerBuyerRemove') || 'Remove buyer');
                remove.setAttribute('title', remove.getAttribute('aria-label'));
                remove.innerHTML = '&times;';
                window.AppShared.ConfirmInline.attach(remove, {
                    confirmLabel: i18n('confirmActionRepeat'),
                    onConfirm: async () => {
                        await removeBuyer(buyer.id);
                        render();
                    }
                });

                row.appendChild(main);
                row.appendChild(remove);
                panel.appendChild(row);
            });

            panel.classList.add('open');
        };

        window.AppShared.KeyboardListNav.bind(input, panel, {
            itemSelector: '[data-buyer-pick]',
            onSelect: (rowEl) => pickBuyerById(rowEl.getAttribute('data-buyer-pick')),
            onOpen: () => render(),
            onClose: () => closeBuyerSuggestions(panel)
        });
    }

    function closeBuyerSuggestions(panel) {
        panel.classList.remove('open');
        panel.innerHTML = '';
    }

    function upsertBuyer(customer) {
        const normalized = normalizeBuyer(customer);
        if (!normalized.name) return;

        const normalizedOib = normalizeIdentityValue(normalized.oib);
        const normalizedName = normalizeIdentityValue(normalized.name);
        const normalizedAddress = normalizeIdentityValue(normalized.address);
        const now = Date.now();

        const index = state.buyers.findIndex((buyer) => {
            const buyerOib = normalizeIdentityValue(buyer.oib);
            if (normalizedOib && buyerOib && normalizedOib === buyerOib) return true;
            return normalizeIdentityValue(buyer.name) === normalizedName &&
                normalizeIdentityValue(buyer.address) === normalizedAddress;
        });

        if (index >= 0) {
            const current = state.buyers[index];
            state.buyers[index] = normalizeBuyer({
                ...current,
                name: normalized.name || current.name,
                oib: normalized.oib || current.oib,
                address: normalized.address || current.address,
                lastUsedAt: now,
                usageCount: Number(current.usageCount || 0) + 1
            });
            return;
        }

        state.buyers.unshift(normalizeBuyer({
            ...normalized,
            id: buildId('buyer'),
            createdAt: now,
            lastUsedAt: now,
            usageCount: 1
        }));

        if (state.buyers.length > 200) {
            state.buyers = state.buyers.slice(0, 200);
        }
    }

    async function removeBuyer(buyerId) {
        state.buyers = state.buyers.filter((buyer) => buyer.id !== buyerId);
        await persistBuyers();
    }

    function applyActiveTab(viewId, persist) {
        const next = viewId === 'offers-view' ? 'offers-view' : 'xml2pdf-view';
        state.activeTabViewId = next;

        elements.tabViews.forEach((view) => {
            view.classList.toggle('active', view.id === next);
        });
        elements.tabButtons.forEach((button) => {
            const active = button.getAttribute('data-tab-target') === next;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        if (persist) {
            chrome.storage.local.set({ [STORAGE_KEYS.activeTab]: next }).catch(() => {});
        }
    }

    function updateOfferNumberSuggestion(force) {
        const current = normalizeString(elements.offerNumberInput.value);
        if (current && !force) return;
        const suggestion = peekNextOfferNumber(elements.issueDateInput.value);
        elements.offerNumberInput.value = suggestion;
        updateSectionExcerpts();
    }

    function peekNextOfferNumber(issueDate) {
        const prefix = resolveOfferPrefix();
        const year = extractYear(issueDate);
        const key = `${prefix}-${year}`;
        const nextSequence = Number(state.offerNumberCounters[key] || 0) + 1;
        return `${prefix}-${year}-${String(nextSequence).padStart(4, '0')}`;
    }

    async function reserveNextOfferNumber(issueDate) {
        const prefix = resolveOfferPrefix();
        const year = extractYear(issueDate);
        const key = `${prefix}-${year}`;
        const nextSequence = Number(state.offerNumberCounters[key] || 0) + 1;
        state.offerNumberCounters[key] = nextSequence;
        await persistCounters();
        return `${prefix}-${year}-${String(nextSequence).padStart(4, '0')}`;
    }

    async function syncCounterFromManualOfferNumber(value) {
        const normalized = normalizeString(value).toUpperCase();
        const match = /^([A-Z0-9]{1,12})-(\d{4})-(\d{1,6})$/.exec(normalized);
        if (!match) return;
        const key = `${match[1]}-${match[2]}`;
        const sequence = Number.parseInt(match[3], 10);
        if (!Number.isFinite(sequence) || sequence <= 0) return;
        if (Number(state.offerNumberCounters[key] || 0) >= sequence) return;
        state.offerNumberCounters[key] = sequence;
        await persistCounters();
    }

    function resolveOfferPrefix() {
        const explicit = sanitizePrefix(state.config.numberPrefix);
        if (explicit) return explicit;

        const issuer = getSelectedIssuer();
        if (!issuer || !issuer.name) return 'PON';
        const parts = normalizeIdentityValue(issuer.name).split(' ').filter(Boolean);
        let initials = parts.slice(0, 4).map((part) => part[0]).join('');
        if (initials.length < 2) {
            initials = normalizeIdentityValue(issuer.name).replace(/\s+/g, '').slice(0, 4);
        }
        return sanitizePrefix(initials) || 'PON';
    }

    function extractYear(dateValue) {
        const parsed = parseDateInput(dateValue);
        return String((parsed || new Date()).getFullYear());
    }

    async function getPdfMessages(language) {
        const lang = normalizeLanguage(language);
        if (!state.pdfMessagesByLanguage[lang]) {
            state.pdfMessagesByLanguage[lang] = await loadLocaleMessages(lang);
        }
        return state.pdfMessagesByLanguage[lang];
    }

    function loadLocaleMessages(language) {
        return window.AppShared.loadLocaleMessages(language);
    }

    function i18n(key, substitutions) {
        return window.AppShared.i18n(state.uiMessages, key, substitutions);
    }

    function formatMessage(template, substitutions) {
        return window.AppShared.formatMessage(template, substitutions);
    }

    function showToast(message, opts) {
        if (!message) return;
        const options = opts || { variant: 'error' };
        window.AppShared.Toast.show(message, options);
    }

    function normalizeConfig(rawConfig, legacyRoot) {
        const config = isPlainObject(rawConfig) ? rawConfig : {};
        const fallbackRoot = legacyRoot || {};
        return {
            numberPrefix: sanitizePrefix(config.numberPrefix || fallbackRoot.offerNumberPrefix || ''),
            defaultVatRate: clampInt(
                config.defaultVatRate !== undefined ? config.defaultVatRate : fallbackRoot.offerDefaultVatRate,
                0,
                25,
                DEFAULT_CONFIG.defaultVatRate
            ),
            defaultValidityDays: clampInt(
                config.defaultValidityDays !== undefined ? config.defaultValidityDays : fallbackRoot.offerDefaultValidityDays,
                1,
                30,
                DEFAULT_CONFIG.defaultValidityDays
            ),
            defaultNote: normalizeString(config.defaultNote !== undefined ? config.defaultNote : fallbackRoot.offerDefaultNote)
        };
    }

    function normalizeCounters(raw) {
        if (!isPlainObject(raw)) return {};
        const normalized = {};
        Object.keys(raw).forEach((key) => {
            const numeric = Number(raw[key]);
            if (Number.isFinite(numeric) && numeric > 0) {
                normalized[key] = Math.floor(numeric);
            }
        });
        return normalized;
    }

    function normalizeIssuers(raw) {
        if (!Array.isArray(raw)) return [];
        return raw
            .map((issuer) => normalizeIssuer(issuer))
            .filter((issuer) => Boolean(issuer && issuer.name));
    }

    function normalizeIssuer(raw) {
        const issuer = isPlainObject(raw) ? raw : {};
        return {
            id: normalizeString(issuer.id) || buildId('issuer'),
            source: issuer.source === 'manual' ? 'manual' : 'xml',
            name: normalizeString(issuer.name),
            address: normalizeString(issuer.address),
            city: normalizeString(issuer.city),
            oib: normalizeString(issuer.oib),
            iban: normalizeString(issuer.iban),
            contact: normalizeString(issuer.contact),
            email: normalizeString(issuer.email),
            web: normalizeString(issuer.web),
            createdAt: Number.isFinite(Number(issuer.createdAt)) ? Number(issuer.createdAt) : Date.now(),
            updatedAt: Number.isFinite(Number(issuer.updatedAt)) ? Number(issuer.updatedAt) : Date.now()
        };
    }

    function normalizeBuyers(raw) {
        if (!Array.isArray(raw)) return [];
        return raw
            .map((buyer) => normalizeBuyer(buyer))
            .filter((buyer) => Boolean(buyer.name));
    }

    function normalizeBuyer(raw) {
        const buyer = isPlainObject(raw) ? raw : {};
        return {
            id: normalizeString(buyer.id) || buildId('buyer'),
            name: normalizeString(buyer.name),
            oib: normalizeString(buyer.oib),
            address: normalizeString(buyer.address),
            createdAt: Number.isFinite(Number(buyer.createdAt)) ? Number(buyer.createdAt) : Date.now(),
            lastUsedAt: Number.isFinite(Number(buyer.lastUsedAt)) ? Number(buyer.lastUsedAt) : Date.now(),
            usageCount: Number.isFinite(Number(buyer.usageCount)) ? Number(buyer.usageCount) : 1
        };
    }

    function normalizeGeneratedOffers(raw) {
        if (!Array.isArray(raw)) return [];
        return raw
            .filter((offer) => isPlainObject(offer) && isPlainObject(offer.offerData))
            .map((offer) => ({
                id: normalizeString(offer.id) || buildId('offer'),
                pdfName: normalizeString(offer.pdfName) || 'offer.pdf',
                offerNumber: normalizeString(offer.offerNumber),
                customerName: normalizeString(offer.customerName),
                total: Number.isFinite(Number(offer.total)) ? Number(offer.total) : 0,
                currency: normalizeString(offer.currency) || 'EUR',
                issueDate: normalizeString(offer.issueDate),
                validUntil: normalizeString(offer.validUntil),
                createdAt: Number.isFinite(Number(offer.createdAt)) ? Number(offer.createdAt) : Date.now(),
                offerData: offer.offerData,
                pdfOptions: isPlainObject(offer.pdfOptions) ? {
                    language: normalizeLanguage(offer.pdfOptions.language || 'hr'),
                    accentColor: normalizeString(offer.pdfOptions.accentColor) || '#2c3e50',
                    logoDataUrl: normalizeString(offer.pdfOptions.logoDataUrl || '')
                } : {
                    language: 'hr',
                    accentColor: '#2c3e50',
                    logoDataUrl: ''
                }
            }));
    }

    function filterGeneratedOffersByRetention(offers) {
        if (!Array.isArray(offers)) return [];
        const retentionDays = clampInt(state.pdfRetentionDays, 0, 32, 8);
        if (retentionDays <= 0) return [];
        const cutoff = Date.now() - retentionDays * DAY_MS;
        return offers.filter((offer) => Number(offer.createdAt || 0) >= cutoff);
    }

    async function persistConfig() {
        await chrome.storage.local.set({ [STORAGE_KEYS.config]: state.config });
    }

    async function persistIssuers() {
        await chrome.storage.local.set({ [STORAGE_KEYS.issuers]: state.issuers });
    }

    async function persistSelectedIssuer() {
        await chrome.storage.local.set({ [STORAGE_KEYS.selectedIssuerId]: state.selectedIssuerId || '' });
    }

    async function persistBuyers() {
        await chrome.storage.local.set({ [STORAGE_KEYS.buyers]: state.buyers });
    }

    async function persistGeneratedOffers() {
        await chrome.storage.local.set({ [STORAGE_KEYS.generatedOffers]: state.generatedOffers });
    }

    async function persistCounters() {
        await chrome.storage.local.set({ [STORAGE_KEYS.counters]: state.offerNumberCounters });
    }

    function formatCurrency(amount) {
        return window.AppShared.formatCurrency(amount, 'EUR', toLocale(state.uiLanguage));
    }

    function formatUiDate(value) {
        const date = parseDateInput(value);
        if (!date) return '-';
        return window.AppShared.formatDate(date, toLocale(state.uiLanguage));
    }

    function toLocale(language) {
        return normalizeLanguage(language) === 'en' ? 'en-GB' : 'hr-HR';
    }

    function parseDateInput(value) {
        if (!value) return null;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function formatDateInputValue(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function buildId(prefix) {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function sanitizeFilePart(value) {
        const normalized = normalizeIdentityValue(value);
        return normalized.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'offer';
    }

    function sanitizePrefix(value) {
        return String(value || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 12);
    }

    function normalizeIdentityValue(value) {
        return normalizeString(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    function normalizeLanguage(language) {
        return window.AppShared.normalizeLanguage(language);
    }

    function normalizeString(value) {
        return String(value || '').trim();
    }

    function toNumber(value) {
        return window.AppShared.toNumber(value, 0);
    }

    function clampInt(value, min, max, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.max(min, Math.min(max, Math.round(numeric)));
    }

    function clampFloat(value, min, max, fallback, decimals) {
        return window.AppShared.clampFloat(value, min, max, fallback, decimals === undefined ? 2 : decimals);
    }

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function escapeHtml(value) {
        return window.AppShared.escapeHtml(value);
    }

    function getById(id) {
        return document.getElementById(id);
    }
}
