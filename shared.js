'use strict';

(function attachAppShared(globalScope) {
    const win = globalScope;
    const doc = globalScope.document;

    /* ---------- Utilities ---------- */

    function toNumber(value, fallback = 0) {
        if (value === null || value === undefined || value === '') return fallback;
        const normalized = Number(String(value).replace(',', '.'));
        return Number.isFinite(normalized) ? normalized : fallback;
    }

    function parseDecimal(input, locale = 'hr-HR') {
        if (input === null || input === undefined) return null;
        let str = String(input).trim();
        if (!str) return null;
        const usesCommaDecimal = String(locale).toLowerCase().startsWith('hr')
            || String(locale).toLowerCase().startsWith('de')
            || str.includes(',');
        if (usesCommaDecimal) {
            str = str.replace(/\s+/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
        } else {
            str = str.replace(/[\s,](?=\d{3}(\D|$))/g, '');
        }
        const value = Number(str);
        return Number.isFinite(value) ? value : null;
    }

    function roundMoney(value) {
        return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
    }

    function clampInt(value, min, max, fallback) {
        const num = Number.parseInt(String(value).replace(',', '.'), 10);
        if (!Number.isFinite(num)) return fallback;
        if (num < min) return min;
        if (num > max) return max;
        return num;
    }

    function clampFloat(value, min, max, fallback, decimals = 2) {
        const num = toNumber(value, NaN);
        if (!Number.isFinite(num)) return fallback;
        const clamped = Math.min(max, Math.max(min, num));
        const factor = Math.pow(10, decimals);
        return Math.round((clamped + Number.EPSILON) * factor) / factor;
    }

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatCurrency(value, currency = 'EUR', locale = 'hr-HR') {
        const amount = roundMoney(value);
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: currency || 'EUR',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        } catch (error) {
            const fallback = amount.toFixed(2).replace('.', ',');
            return `${fallback} ${currency || 'EUR'}`;
        }
    }

    function formatDate(value, locale = 'hr-HR') {
        if (!value) return '-';
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        try {
            return new Intl.DateTimeFormat(locale, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }).format(date);
        } catch (error) {
            return date.toISOString().slice(0, 10);
        }
    }

    function normalizeLanguage(language) {
        if (!language) return 'hr';
        const lower = String(language).toLowerCase();
        if (lower.startsWith('hr')) return 'hr';
        if (lower.startsWith('en')) return 'en';
        return 'hr';
    }

    function formatMessage(template, substitutions) {
        if (!template) return '';
        if (!Array.isArray(substitutions) || substitutions.length === 0) return template;
        return template.replace(/\$(\d+)/g, (match, index) => {
            const value = substitutions[Number(index) - 1];
            return value === undefined ? '' : value;
        });
    }

    const localeFetchCache = new Map();

    function loadLocaleMessages(language) {
        const lang = normalizeLanguage(language);
        if (localeFetchCache.has(lang)) return localeFetchCache.get(lang);
        const promise = (async () => {
            try {
                const url = win.chrome && win.chrome.runtime && win.chrome.runtime.getURL
                    ? win.chrome.runtime.getURL(`_locales/${lang}/messages.json`)
                    : `_locales/${lang}/messages.json`;
                const response = await fetch(url);
                if (!response.ok) return {};
                return await response.json();
            } catch (error) {
                return {};
            }
        })();
        localeFetchCache.set(lang, promise);
        return promise;
    }

    function i18n(messages, key, substitutions) {
        const entry = messages && messages[key];
        const template = entry && entry.message ? entry.message : '';
        if (template) return formatMessage(template, substitutions);
        if (win.chrome && win.chrome.i18n && typeof win.chrome.i18n.getMessage === 'function') {
            return win.chrome.i18n.getMessage(key, substitutions) || '';
        }
        return '';
    }

    /* ---------- Field-level errors ---------- */

    function findFieldEl(target) {
        if (!target) return null;
        if (target.classList && target.classList.contains('offer-field')) return target;
        return target.closest ? target.closest('.offer-field') : null;
    }

    function ensureErrorSlot(fieldEl) {
        let slot = fieldEl.querySelector(':scope > [data-error-slot]');
        if (!slot) {
            slot = doc.createElement('small');
            slot.className = 'field-error';
            slot.setAttribute('data-error-slot', '');
            fieldEl.appendChild(slot);
        }
        return slot;
    }

    function setFieldError(target, message) {
        const fieldEl = findFieldEl(target);
        if (!fieldEl) return;
        const slot = ensureErrorSlot(fieldEl);
        slot.textContent = String(message || '');
        fieldEl.classList.add('has-error');
    }

    function clearFieldError(target) {
        const fieldEl = findFieldEl(target);
        if (!fieldEl) return;
        fieldEl.classList.remove('has-error');
        const slot = fieldEl.querySelector(':scope > [data-error-slot]');
        if (slot) slot.textContent = '';
    }

    function clearAllFieldErrors(rootEl) {
        const root = rootEl || doc;
        root.querySelectorAll('.offer-field.has-error').forEach((field) => {
            field.classList.remove('has-error');
            const slot = field.querySelector(':scope > [data-error-slot]');
            if (slot) slot.textContent = '';
        });
    }

    /* ---------- Toast ---------- */

    const Toast = (function createToast() {
        const queue = [];
        let activeTimer = 0;
        let element = null;

        function getElement() {
            if (element && doc.body.contains(element)) return element;
            element = doc.getElementById('errorToast');
            if (!element) {
                element = doc.createElement('div');
                element.id = 'errorToast';
                element.className = 'error-toast';
                doc.body.appendChild(element);
            }
            return element;
        }

        function applyVariant(el, variant) {
            el.classList.remove('is-error', 'is-info', 'is-success', 'is-warn');
            const cls = variant && ['error', 'info', 'success', 'warn'].includes(variant)
                ? `is-${variant}`
                : 'is-error';
            el.classList.add(cls);
            el.setAttribute('aria-live', cls === 'is-error' ? 'assertive' : 'polite');
        }

        function defaultDuration(variant) {
            return variant === 'error' ? 5000 : 4200;
        }

        function pump() {
            if (activeTimer || queue.length === 0) return;
            const next = queue.shift();
            const el = getElement();
            applyVariant(el, next.variant);
            el.textContent = next.message;
            el.style.display = 'block';
            activeTimer = win.setTimeout(() => {
                el.style.display = 'none';
                el.textContent = '';
                activeTimer = 0;
                pump();
            }, next.duration);
        }

        function show(message, opts) {
            if (!message) return;
            const variant = opts && opts.variant ? opts.variant : 'error';
            const duration = opts && Number.isFinite(opts.duration) ? opts.duration : defaultDuration(variant);
            queue.push({ message: String(message), variant, duration });
            pump();
        }

        function dismiss() {
            if (!activeTimer) return;
            win.clearTimeout(activeTimer);
            activeTimer = 0;
            const el = getElement();
            el.style.display = 'none';
            el.textContent = '';
            pump();
        }

        return { show, dismiss };
    }());

    /* ---------- ConfirmInline ---------- */

    const ConfirmInline = (function createConfirmInline() {
        const timers = new WeakMap();
        const originalLabels = new WeakMap();
        const originalAria = new WeakMap();

        function getLabelEl(button) {
            return button.querySelector(':scope > span');
        }

        function arm(button, opts) {
            const confirmText = opts.confirmLabel || 'Kliknite ponovno za potvrdu';
            const labelEl = getLabelEl(button);
            if (labelEl && !opts.keepLabel) {
                if (!originalLabels.has(button)) {
                    originalLabels.set(button, labelEl.textContent);
                }
                labelEl.textContent = confirmText;
            }
            if (!originalAria.has(button)) {
                originalAria.set(button, button.getAttribute('aria-label'));
            }
            button.setAttribute('aria-label', confirmText);
            button.classList.add('is-confirming');
            const timerId = win.setTimeout(() => disarm(button, opts), opts.timeout);
            timers.set(button, timerId);
        }

        function disarm(button, opts) {
            const labelEl = getLabelEl(button);
            if (labelEl && !opts.keepLabel) {
                const original = originalLabels.get(button);
                if (typeof original === 'string') labelEl.textContent = original;
            }
            if (originalAria.has(button)) {
                const prev = originalAria.get(button);
                if (prev === null) button.removeAttribute('aria-label');
                else button.setAttribute('aria-label', prev);
                originalAria.delete(button);
            }
            button.classList.remove('is-confirming');
            const t = timers.get(button);
            if (t) {
                win.clearTimeout(t);
                timers.delete(button);
            }
            if (opts && typeof opts.onRestore === 'function') opts.onRestore();
        }

        async function confirm(button, opts) {
            const t = timers.get(button);
            if (t) {
                win.clearTimeout(t);
                timers.delete(button);
            }
            disarm(button, opts);
            const result = opts.onConfirm && opts.onConfirm();
            if (result && typeof result.then === 'function') {
                if (typeof setBusy === 'function') setBusy(button, true);
                try {
                    await result;
                } finally {
                    if (typeof setBusy === 'function') setBusy(button, false);
                }
            }
        }

        function attach(button, opts) {
            if (!button || button.dataset.confirmBound === '1') return;
            button.dataset.confirmBound = '1';
            const config = {
                onConfirm: opts && opts.onConfirm,
                confirmLabel: opts && opts.confirmLabel,
                timeout: opts && Number.isFinite(opts.timeout) ? opts.timeout : 3000,
                keepLabel: !!(opts && opts.keepLabel),
                onRestore: opts && opts.onRestore
            };
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (button.classList.contains('is-confirming')) {
                    confirm(button, config);
                } else {
                    arm(button, config);
                }
            });
        }

        return { attach };
    }());

    /* ---------- setBusy / withBusy ---------- */

    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const busyOriginals = new WeakMap();

    function setBusy(buttonEl, isBusy, busyLabel) {
        if (!buttonEl) return;
        if (isBusy) {
            if (busyOriginals.has(buttonEl)) return;
            const labelEl = buttonEl.querySelector(':scope > span');
            const iconEl = buttonEl.querySelector(':scope > i');
            const stash = {
                disabled: buttonEl.disabled,
                labelText: labelEl ? labelEl.textContent : null,
                iconClass: iconEl ? iconEl.className : null,
                hadIcon: !!iconEl,
                hadLabel: !!labelEl
            };
            busyOriginals.set(buttonEl, stash);
            buttonEl.disabled = true;
            buttonEl.classList.add('is-busy');
            if (iconEl) iconEl.className = 'fas fa-spinner fa-spin';
            if (labelEl && busyLabel) labelEl.textContent = busyLabel;
        } else {
            const stash = busyOriginals.get(buttonEl);
            if (!stash) return;
            const labelEl = buttonEl.querySelector(':scope > span');
            const iconEl = buttonEl.querySelector(':scope > i');
            buttonEl.disabled = stash.disabled;
            buttonEl.classList.remove('is-busy');
            if (iconEl && stash.iconClass !== null) iconEl.className = stash.iconClass;
            if (labelEl && stash.labelText !== null) labelEl.textContent = stash.labelText;
            busyOriginals.delete(buttonEl);
        }
    }

    async function withBusy(buttonEl, busyLabel, asyncFn) {
        setBusy(buttonEl, true, busyLabel);
        try {
            return await asyncFn();
        } finally {
            setBusy(buttonEl, false);
        }
    }

    /* ---------- Modal ---------- */

    const Modal = (function createModal() {
        const stack = [];

        function focusableElements(root) {
            return Array.from(root.querySelectorAll(focusableSelector)).filter((el) => {
                if (el.getAttribute('aria-hidden') === 'true') return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 || rect.height > 0;
            });
        }

        function trapFocus(handle, event) {
            if (event.key !== 'Tab') return;
            const focusables = focusableElements(handle.dialogEl);
            if (focusables.length === 0) {
                event.preventDefault();
                return;
            }
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = doc.activeElement;
            if (event.shiftKey) {
                if (active === first || !handle.dialogEl.contains(active)) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (active === last) {
                event.preventDefault();
                first.focus();
            }
        }

        function onKeydown(event) {
            const top = stack[stack.length - 1];
            if (!top) return;
            if (event.key === 'Escape') {
                event.stopPropagation();
                top.close();
                return;
            }
            trapFocus(top, event);
        }

        function onBackdropClick(handle, event) {
            if (event.target === handle.overlayEl) handle.close();
        }

        let globalKeydownBound = false;
        function ensureGlobalKeydown() {
            if (globalKeydownBound) return;
            doc.addEventListener('keydown', onKeydown, true);
            globalKeydownBound = true;
        }

        function create(overlayEl, opts = {}) {
            if (!overlayEl) return { open: () => {}, close: () => {}, isOpen: () => false };
            const dialogSelector = opts.dialogSelector || '[role="dialog"]';
            const dialogEl = overlayEl.querySelector(dialogSelector) || overlayEl;
            let triggerEl = null;
            let isOpen = false;
            const handle = {
                overlayEl,
                dialogEl,
                open(trigger) {
                    if (isOpen) return;
                    triggerEl = trigger || (doc.activeElement instanceof HTMLElement ? doc.activeElement : null);
                    overlayEl.classList.add('open');
                    overlayEl.setAttribute('aria-hidden', 'false');
                    doc.body.classList.add('has-modal');
                    isOpen = true;
                    stack.push(handle);
                    ensureGlobalKeydown();
                    win.requestAnimationFrame(() => {
                        const target = (typeof opts.initialFocus === 'function' && opts.initialFocus())
                            || focusableElements(dialogEl)[0];
                        if (target && typeof target.focus === 'function') target.focus();
                    });
                },
                close() {
                    if (!isOpen) return;
                    overlayEl.classList.remove('open');
                    overlayEl.setAttribute('aria-hidden', 'true');
                    isOpen = false;
                    const idx = stack.indexOf(handle);
                    if (idx >= 0) stack.splice(idx, 1);
                    if (stack.length === 0) doc.body.classList.remove('has-modal');
                    if (typeof opts.onClose === 'function') opts.onClose();
                    if (triggerEl && typeof triggerEl.focus === 'function') {
                        try { triggerEl.focus(); } catch (e) { /* ignore */ }
                    }
                    triggerEl = null;
                },
                isOpen() { return isOpen; }
            };
            overlayEl.addEventListener('click', (event) => onBackdropClick(handle, event));
            return handle;
        }

        return { create };
    }());

    /* ---------- KeyboardListNav ---------- */

    const KeyboardListNav = (function createKeyboardListNav() {
        let counter = 0;

        function bind(input, panel, opts) {
            if (!input || !panel || !opts || !opts.itemSelector) return;
            const idPrefix = opts.idPrefix || `kln-${++counter}`;
            if (!panel.id) panel.id = `${idPrefix}-panel`;

            input.setAttribute('role', 'combobox');
            input.setAttribute('aria-autocomplete', 'list');
            input.setAttribute('aria-haspopup', 'listbox');
            input.setAttribute('aria-controls', panel.id);
            input.setAttribute('aria-expanded', 'false');
            panel.setAttribute('role', 'listbox');

            const state = { activeIndex: -1, ignoreBlur: false };

            function items() {
                return Array.from(panel.querySelectorAll(opts.itemSelector));
            }

            function syncIds() {
                items().forEach((el, index) => {
                    if (!el.id) el.id = `${idPrefix}-opt-${index}`;
                    el.setAttribute('role', 'option');
                    el.setAttribute('aria-selected', index === state.activeIndex ? 'true' : 'false');
                    el.classList.toggle('is-active', index === state.activeIndex);
                });
                if (state.activeIndex >= 0) {
                    const active = items()[state.activeIndex];
                    if (active) input.setAttribute('aria-activedescendant', active.id);
                } else {
                    input.removeAttribute('aria-activedescendant');
                }
            }

            function setActive(index) {
                const list = items();
                if (list.length === 0) {
                    state.activeIndex = -1;
                } else {
                    const len = list.length;
                    state.activeIndex = ((index % len) + len) % len;
                }
                syncIds();
                if (state.activeIndex >= 0) {
                    const active = items()[state.activeIndex];
                    if (active && typeof active.scrollIntoView === 'function') {
                        active.scrollIntoView({ block: 'nearest' });
                    }
                }
            }

            function isOpen() {
                return panel.classList.contains('open');
            }

            function open(query) {
                if (typeof opts.onOpen === 'function') opts.onOpen(query);
                input.setAttribute('aria-expanded', 'true');
                if (state.activeIndex < 0 && items().length > 0) setActive(0);
                else syncIds();
            }

            function close() {
                if (typeof opts.onClose === 'function') opts.onClose();
                input.setAttribute('aria-expanded', 'false');
                input.removeAttribute('aria-activedescendant');
                state.activeIndex = -1;
            }

            function commitActive() {
                const list = items();
                if (state.activeIndex < 0 || state.activeIndex >= list.length) return false;
                const target = list[state.activeIndex];
                if (typeof opts.onSelect === 'function') opts.onSelect(target);
                return true;
            }

            input.addEventListener('focus', () => open(input.value));
            input.addEventListener('input', () => {
                state.activeIndex = -1;
                open(input.value);
            });
            input.addEventListener('blur', (event) => {
                if (state.ignoreBlur) {
                    state.ignoreBlur = false;
                    return;
                }
                const next = event.relatedTarget;
                if (next && (panel.contains(next) || panel === next)) return;
                win.setTimeout(() => {
                    if (!panel.contains(doc.activeElement)) close();
                }, 200);
            });
            input.addEventListener('keydown', (event) => {
                switch (event.key) {
                    case 'ArrowDown':
                        event.preventDefault();
                        if (!isOpen()) open(input.value);
                        else setActive(state.activeIndex + 1);
                        break;
                    case 'ArrowUp':
                        event.preventDefault();
                        if (!isOpen()) open(input.value);
                        else setActive(state.activeIndex - 1);
                        break;
                    case 'Home':
                        if (isOpen()) { event.preventDefault(); setActive(0); }
                        break;
                    case 'End':
                        if (isOpen()) { event.preventDefault(); setActive(items().length - 1); }
                        break;
                    case 'Enter':
                        if (isOpen() && commitActive()) {
                            event.preventDefault();
                            close();
                        }
                        break;
                    case 'Escape':
                        if (isOpen()) {
                            event.preventDefault();
                            close();
                        }
                        break;
                    case 'Tab':
                        if (isOpen() && state.activeIndex >= 0) {
                            commitActive();
                            close();
                        }
                        break;
                    default:
                        break;
                }
            });

            panel.addEventListener('mousedown', (event) => {
                state.ignoreBlur = true;
                const item = event.target.closest && event.target.closest(opts.itemSelector);
                if (item) {
                    const list = items();
                    state.activeIndex = list.indexOf(item);
                    syncIds();
                }
            });
            panel.addEventListener('mouseover', (event) => {
                const item = event.target.closest && event.target.closest(opts.itemSelector);
                if (!item) return;
                const list = items();
                const idx = list.indexOf(item);
                if (idx >= 0 && idx !== state.activeIndex) {
                    state.activeIndex = idx;
                    syncIds();
                }
            });
            panel.addEventListener('click', (event) => {
                const item = event.target.closest && event.target.closest(opts.itemSelector);
                if (!item) return;
                if (typeof opts.onSelect === 'function') opts.onSelect(item);
                close();
            });
        }

        return { bind };
    }());

    /* ---------- Export ---------- */

    globalScope.AppShared = {
        toNumber,
        parseDecimal,
        roundMoney,
        clampInt,
        clampFloat,
        escapeHtml,
        formatCurrency,
        formatDate,
        normalizeLanguage,
        formatMessage,
        loadLocaleMessages,
        i18n,
        setFieldError,
        clearFieldError,
        clearAllFieldErrors,
        Toast,
        ConfirmInline,
        Modal,
        KeyboardListNav,
        setBusy,
        withBusy
    };
}(window));
