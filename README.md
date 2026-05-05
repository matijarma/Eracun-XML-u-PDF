# XML to PDF e-Invoice Converter 🇭🇷

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)

A privacy-first Chrome Extension and Progressive Web App (PWA) designed to convert Croatian UBL 2.1 e-invoices (`.xml`) into human-readable PDF files. Developed by **Aning usluge d.o.o.** to assist Croatian businesses with the 2026 Fiscalization mandate.

## 🚀 Features

- **100% Client-Side:** No server uploads. Parsing and PDF generation happen entirely within the user's browser.
- **UBL 2.1 Support:** Specifically tuned for the Croatian implementation of the EN 16931 standard.
- **Auto-Detection:** The extension scans pages for linked XML files and offers instant conversion.
- **Custom Branding:** Users can embed their own logo into the generated PDF.
- **Bulk Processing:** Convert multiple invoices simultaneously.
- **Offline Capable:** The PWA functions fully without an internet connection after initial load.

## 🛠 Tech Stack

- **Vanilla JavaScript:** Core logic (ES6+).
- **jsPDF:** For PDF document generation.
- **jsPDF-AutoTable:** For rendering invoice line items.
- **JSZip:** For bundling multiple PDFs into a single download.

## 📦 Installation

### As a PWA
Visit `https://aning.hr/XMLuPDF-pwa/` and click "Install App" in your browser address bar.

### As a Chrome Extension (Developer Mode)
1. Clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select the folder containing `manifest.json`.

## 🛡️ Privacy & Security

This project was built with a "Zero-Knowledge" philosophy:
1.  **Input:** The user selects a file from their local disk.
2.  **Process:** The `invoice-parser.js` reads the DOM of the XML in the browser memory.
3.  **Output:** The `pdf-generator.js` draws the PDF blob and triggers a browser download.
4.  **Network:** No API calls are made to external servers for data processing.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👤 Author

**Aning usluge d.o.o.**
* Website: [aning.hr](https://aning.hr)
* GitHub: [@AningUsluge](https://github.com/AningUsluge)

---
*Developed to support the Croatian business community during the transition to Fiscalization 2.0 (Jan 2026).*