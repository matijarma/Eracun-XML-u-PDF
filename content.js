// content.js
function scanForXmls() {
    const findings = new Set();

    // 1. Scan visible links
    const links = document.querySelectorAll('a[href$=".xml"]');
    links.forEach(a => findings.add(a.href));

    // 2. Scan resource timing (network tab) for loaded XMLs
    const resources = performance.getEntriesByType("resource");
    resources.forEach(r => {
        if (r.name.toLowerCase().endsWith(".xml") || r.name.includes("xml")) {
            findings.add(r.name);
        }
    });

    // 3. Scan iframes (cross-origin restrictions apply)
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        try {
            if (iframe.src && iframe.src.endsWith(".xml")) {
                findings.add(iframe.src);
            }
        } catch (e) { /* ignore cross-origin */ }
    });

    return Array.from(findings);
}

// Listen for request from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scan_xmls") {
        sendResponse({ xmls: scanForXmls() });
    }
});