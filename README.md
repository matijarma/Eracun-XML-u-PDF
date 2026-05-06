# XMLuPDF + Offers (Chrome Extension)

Source code for the Chrome extension that:
- converts Croatian UBL e-invoice XML files to PDF (`XML2PDF` mode)
- creates professional offer PDFs (`Offers` mode)
- runs fully local in the browser

This README reflects `v2 built - added offers and renamed` (commit `1d5c450`).

## What Changed in v2

- Product renamed to `XMLuPDF + Offers`.
- New `Offers` tab and workflow added.
- New offer PDF engine added (`offer-pdf-generator.js`).
- Offer state and shared helpers introduced (`offers.js`, `shared.js`).
- Localized UI text extended for offer generation (`_locales/en`, `_locales/hr`).

## Core Features

### XML2PDF mode

- Convert one or many Croatian UBL e-invoice XML files into readable PDF.
- Load ZIP archives and scan recursively for valid XML invoices.
- Detect XML links on the active page and ingest them.
- Preview generated PDFs and download single or bulk outputs.
- Optional local retention in browser storage.

### Offers mode

- Create and manage issuer profiles (manual entry or import issuer data from XML).
- Create offer header/content, line items, VAT, discount, and totals.
- Auto-suggest offer numbers with configurable prefix and validity defaults.
- Generate offer PDF, preview instantly, and download on demand.
- Persist generated offers locally (subject to retention settings).

### Shared PDF branding

- Set PDF language, accent color, and logo.
- Shared branding applies to both invoice PDFs and offer PDFs.

## Privacy Model

All processing is local:
- XML parsing and PDF generation run in-browser.
- No server upload is required for conversion or offer generation.
- Stored data remains in local browser storage on the same device.

## Permissions (Manifest v3)

- `activeTab`: user-triggered access to the currently active tab for XML link detection.
- `storage`: saves settings and optional local retained data.
- `sidePanel`: allows rendering the UI in Chrome side panel.
- Host access/content script on all URLs: enables XML link discovery on pages the user opens.

## Project Structure

- `popup.html` / `popup.js`: main UI shell and XML2PDF logic.
- `offers.js`: Offers mode state, form logic, persistence, preview/download flow.
- `offer-pdf-generator.js`: offer PDF layout and rendering.
- `pdf-generator.js`: invoice PDF renderer for XML2PDF mode.
- `invoice-parser.js`: Croatian UBL invoice XML extraction.
- `shared.js`: shared UI utilities and helpers.
- `_locales/`: English and Croatian text resources.

## Local Development

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this `chrome/` directory (the one containing `manifest.json`).

## Author

**Aning usluge d.o.o. / Matija Radeljak**

