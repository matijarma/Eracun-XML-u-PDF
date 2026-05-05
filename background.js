'use strict';

const DISPLAY_MODE_KEY = 'displayMode';
const DEFAULT_DISPLAY_MODE = 'sidepanel';

let currentMode = null;
let lastActiveTabId = null;

async function getStoredDisplayMode() {
    if (currentMode) return currentMode;
    const result = await chrome.storage.local.get([DISPLAY_MODE_KEY]);
    currentMode = result.displayMode || DEFAULT_DISPLAY_MODE;
    return currentMode;
}

async function applyDisplayMode(mode) {
    const useSidePanel = mode === 'sidepanel';

    try {
        await chrome.action.setPopup({ popup: useSidePanel ? '' : 'popup.html' });
    } catch (e) {
        // ignore
    }

    if (!chrome.sidePanel) return;

    try {
        if (chrome.sidePanel.setPanelBehavior) {
            await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: useSidePanel });
        }
        if (chrome.sidePanel.setOptions) {
            await chrome.sidePanel.setOptions({ path: 'popup.html', enabled: useSidePanel });
        }
    } catch (e) {
        // ignore
    }
}

async function resolveTabId(explicitTabId) {
    if (explicitTabId) return explicitTabId;
    if (lastActiveTabId) return lastActiveTabId;

    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs && tabs[0] ? tabs[0].id : null);
        });
    });
}

async function setDisplayMode(mode, tabId, openPopup, skipOpen) {
    currentMode = mode;
    await chrome.storage.local.set({ displayMode: mode });
    await applyDisplayMode(mode);

    if (!chrome.sidePanel) return;

    const targetTabId = await resolveTabId(tabId);

    try {
        if (mode === 'sidepanel' && chrome.sidePanel.open && targetTabId && !skipOpen) {
            if (chrome.sidePanel.setOptions) {
                await chrome.sidePanel.setOptions({ enabled: true, tabId: targetTabId });
            }
            await chrome.sidePanel.open({ tabId: targetTabId });
        }

        if (mode === 'popup' && chrome.sidePanel.setOptions && targetTabId) {
            await chrome.sidePanel.setOptions({ enabled: false, tabId: targetTabId });
        }
    } catch (e) {
        // ignore
    }

    if (openPopup && chrome.action && chrome.action.openPopup) {
        try {
            await chrome.action.openPopup();
        } catch (e) {
            // ignore
        }
    }
}

async function syncDisplayMode() {
    const mode = await getStoredDisplayMode();
    await applyDisplayMode(mode);
}

chrome.runtime.onInstalled.addListener(() => {
    syncDisplayMode();
});

chrome.runtime.onStartup.addListener(() => {
    syncDisplayMode();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    lastActiveTabId = activeInfo.tabId;
});

chrome.windows.onFocusChanged.addListener(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
            lastActiveTabId = tabs[0].id;
        }
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.action !== 'setDisplayMode') {
        return;
    }

    setDisplayMode(message.mode, message.tabId, message.openPopup, message.skipOpen)
        .then(() => {
            sendResponse({ ok: true });
        })
        .catch((error) => {
            sendResponse({ ok: false, error: String(error) });
        });

    return true;
});

chrome.action.onClicked.addListener((tab) => {
    getStoredDisplayMode().then((mode) => {
        if (mode !== 'sidepanel') return;
        if (chrome.sidePanel && chrome.sidePanel.open && tab && tab.id) {
            chrome.sidePanel.open({ tabId: tab.id });
        }
    });
});
