// Assumes jspdf and jspdf-autotable are loaded globally via script tags
const { jsPDF } = window.jspdf;

const DEFAULT_ACCENT = [44, 62, 80];

function formatMessage(template, substitutions) {
    if (!template) return '';
    if (!substitutions || substitutions.length === 0) return template;
    return template.replace(/\$(\d+)/g, (match, index) => {
        const value = substitutions[Number(index) - 1];
        return value === undefined ? '' : value;
    });
}

function getMessage(messages, key, substitutions) {
    if (!messages || !messages[key] || !messages[key].message) return '';
    return formatMessage(messages[key].message, substitutions);
}

function buildI18n(messages) {
    return (key, substitutions) => {
        const message = getMessage(messages, key, substitutions);
        if (message) return message;
        if (chrome.i18n && chrome.i18n.getMessage) {
            return chrome.i18n.getMessage(key, substitutions);
        }
        return '';
    };
}

function resolveLocale(language) {
    if (!language) return 'en-US';
    if (language === 'hr') return 'hr-HR';
    if (language === 'en') return 'en-US';
    if (language.includes('-')) return language;
    return 'en-US';
}

const fmtMoney = (amount, currency, language) => {
    try {
        const safeAmount = amount === undefined || amount === null ? 0 : amount;
        return new Intl.NumberFormat(resolveLocale(language), {
            style: 'currency',
            currency: currency || 'EUR',
            minimumFractionDigits: 2
        }).format(safeAmount);
    } catch (e) {
        return parseFloat(amount || 0).toFixed(2);
    }
};

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

async function loadFont(doc, url, filename, fontName, style) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        const base64Font = arrayBufferToBase64(buffer);

        doc.addFileToVFS(filename, base64Font);
        doc.addFont(filename, fontName, style);
    } catch (e) {
        console.error(`Failed to load font ${url}:`, e);
    }
}

function parseHexColor(value) {
    if (!value || typeof value !== 'string') return null;
    const hex = value.trim().replace('#', '');
    if (hex.length !== 6) return null;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
    return [r, g, b];
}

function resolveMarginLeft(margin) {
    if (typeof margin === 'number') return margin;
    if (margin && typeof margin === 'object' && Number.isFinite(margin.left)) return margin.left;
    return 14;
}

function resolvePaddingRight(padding) {
    if (typeof padding === 'number') return padding;
    if (padding && typeof padding === 'object') {
        if (Number.isFinite(padding.right)) return padding.right;
        if (Number.isFinite(padding.horizontal)) return padding.horizontal;
        if (Number.isFinite(padding.left)) return padding.left;
    }
    return 0;
}

function getImageType(dataUrl) {
    const match = /^data:image\/(png|jpeg|jpg)/i.exec(dataUrl || '');
    if (!match) return 'PNG';
    return match[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG';
}

function loadImageDimensions(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve(null);
        img.src = dataUrl;
    });
}

async function resolveLogoPlacement(dataUrl) {
    const dimensions = await loadImageDimensions(dataUrl);
    if (!dimensions) return null;

    const ratio = dimensions.width / dimensions.height;
    let height = 12;
    let width = height * ratio;
    const maxWidth = 40;

    if (width > maxWidth) {
        width = maxWidth;
        height = maxWidth / ratio;
    }

    return {
        width,
        height,
        type: getImageType(dataUrl)
    };
}

// Returns the doc object, ready to be saved or blobbed
async function createPdf(data, options = {}) {
    const doc = new jsPDF();
    const i18n = buildI18n(options.messages || {});
    const label = (key, fallback, substitutions) => i18n(key, substitutions) || fallback;
    const language = options.language || (chrome.i18n && chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : 'en');
    const accentColor = parseHexColor(options.accentColor) || DEFAULT_ACCENT;

    // --- 1. Load Custom Fonts ---
    await loadFont(doc, './lib/Roboto-Regular.ttf', 'Roboto-Regular.ttf', 'Roboto', 'normal');
    await loadFont(doc, './lib/Roboto-Bold.ttf', 'Roboto-Bold.ttf', 'Roboto', 'bold');

    doc.setFont('Roboto', 'normal');

    // --- 2. Header Section ---
    doc.setTextColor(...accentColor);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(20);

    let titleX = 14;
    if (options.logoDataUrl) {
        const logoPlacement = await resolveLogoPlacement(options.logoDataUrl);
        if (logoPlacement) {
            doc.addImage(options.logoDataUrl, logoPlacement.type, 14, 10, logoPlacement.width, logoPlacement.height);
            titleX = 14 + logoPlacement.width + 6;
        }
    }

    const defaultTitle = label('pdfInvoiceTitle', 'INVOICE');
    const title = (data.invoiceType || defaultTitle).toUpperCase();
    doc.text(title, titleX, 20);

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(data.invoiceId || '---', 196, 20, { align: 'right' });

    doc.setDrawColor(200);
    doc.line(14, 25, 196, 25);

    // --- 3. Invoice Meta Row ---
    const metaRowTop = 30;
    const metaRowHeight = 16;
    const metaStartX = 14;
    const metaWidth = 182;
    const metaLabelY = metaRowTop + 6;
    const metaValueY = metaRowTop + 11;

    const issueValue = data.issueDate ? `${data.issueDate} ${data.issueTime || ''}`.trim() : '-';
    const metaItems = [
        { label: label('pdfIssueDateLabel', 'Issue date:'), value: issueValue || '-' },
        { label: label('pdfDueDateLabel', 'Due date:'), value: data.dueDate || '-' },
        { label: label('pdfDeliveryDateLabel', 'Delivery date:'), value: data.actualDeliveryDate || '-' },
        { label: label('pdfReferenceLabel', 'Model / Reference:'), value: data.payment ? data.payment.id || '-' : '-' }
    ];

    doc.setFillColor(245, 247, 250);
    doc.rect(metaStartX, metaRowTop, metaWidth, metaRowHeight, 'F');

    const colWidth = metaWidth / metaItems.length;
    doc.setFontSize(7);
    doc.setFont('Roboto', 'normal');
    doc.setTextColor(110);

    metaItems.forEach((item, index) => {
        const x = metaStartX + colWidth * index + 2;
        doc.text(item.label, x, metaLabelY, { maxWidth: colWidth - 4 });
        doc.setFont('Roboto', 'bold');
        doc.setTextColor(0);
        doc.text(item.value, x, metaValueY, { maxWidth: colWidth - 4 });
        doc.setFont('Roboto', 'normal');
        doc.setTextColor(110);
    });

    // --- 4. Parties ---
    const leftCol = 14;
    const rightCol = 110;
    const startY = metaRowTop + metaRowHeight + 6;
    let addressY = startY;

    const taxIdLabel = label('pdfTaxIdLabel', 'VAT ID:');
    const contactLabel = label('pdfContactLabel', 'Contact:');

    // Supplier
    doc.setTextColor(...accentColor);
    doc.setFontSize(9);
    doc.setFont('Roboto', 'bold');
    doc.text(label('pdfSupplierLabel', 'SUPPLIER:'), leftCol, addressY);
    addressY += 5;

    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(data.supplier.name || '', leftCol, addressY);
    addressY += 5;

    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    doc.text(data.supplier.address || '', leftCol, addressY);
    addressY += 4;
    doc.text(data.supplier.city || '', leftCol, addressY);
    addressY += 4;
    doc.text(`${taxIdLabel} ${data.supplier.vatId || ''}`, leftCol, addressY);
    addressY += 4;
    if (data.supplier.contact) {
        doc.text(`${contactLabel} ${data.supplier.contact}`, leftCol, addressY);
        addressY += 4;
    }

    // Customer
    let custY = startY;
    doc.setTextColor(...accentColor);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(9);
    doc.text(label('pdfCustomerLabel', 'CUSTOMER:'), rightCol, custY);
    custY += 5;

    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(data.customer.name || '', rightCol, custY);
    custY += 5;

    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    doc.text(data.customer.address || '', rightCol, custY);
    custY += 4;
    doc.text(data.customer.city || '', rightCol, custY);
    custY += 4;
    doc.text(`${taxIdLabel} ${data.customer.vatId || ''}`, rightCol, custY);

    // --- 5. Table ---
    const currency = data.totals && data.totals.currency ? data.totals.currency : 'EUR';

    const tableBody = data.lines.map((line, index) => [
        index + 1,
        line.desc,
        `${line.qty} ${line.unit || ''}`,
        fmtMoney(line.unitPrice, currency, language),
        `${line.taxPercent}%`,
        fmtMoney(line.total, currency, language)
    ]);

    doc.autoTable({
        startY: Math.max(addressY, custY) + 8,
        head: [[
            label('pdfTableIndex', '#'),
            label('pdfTableDescription', 'Item description'),
            label('pdfTableQuantity', 'Quantity'),
            label('pdfTableUnitPrice', 'Price'),
            label('pdfTableVat', 'VAT'),
            label('pdfTableAmount', 'Amount')
        ]],
        body: tableBody,
        theme: 'striped',
        styles: {
            font: 'Roboto',
            fontStyle: 'normal',
            fontSize: 9,
            cellPadding: 3,
            valign: 'middle'
        },
        headStyles: {
            fillColor: accentColor,
            textColor: 255,
            font: 'Roboto',
            fontStyle: 'bold'
        },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 25, halign: 'right' },
            3: { cellWidth: 25, halign: 'right' },
            4: { cellWidth: 15, halign: 'center' },
            5: { cellWidth: 30, halign: 'right' }
        },
        margin: { bottom: 30 }
    });

    // --- 6. Totals ---
    let finalY = doc.lastAutoTable.finalY + 5;
    const vatRate = 25;
    const lineHeight = 6;
    const subtotalLabel = label('pdfSubtotalLabel', 'Subtotal:');
    const vatLabel = i18n('pdfVatLabel', [String(vatRate)]) || `VAT (${vatRate}%):`;
    const totalLabel = label('pdfTotalLabel', 'TOTAL:');

    const netText = fmtMoney(data.totals.net, currency, language);
    const taxText = fmtMoney(data.totals.tax, currency, language);
    const totalText = fmtMoney(data.totals.total, currency, language);

    let totalsValX = 196;
    const labelGap = 8;
    const table = doc.lastAutoTable;
    if (table && table.columns && table.columns.length > 0) {
        const marginLeft = resolveMarginLeft(table.settings ? table.settings.margin : null);
        let tableRight = marginLeft;
        table.columns.forEach((column) => {
            tableRight += column.width;
        });
        const paddingRight = resolvePaddingRight(table.styles ? table.styles.cellPadding : null);
        totalsValX = tableRight - paddingRight;
    }

    doc.setFontSize(9);
    doc.setTextColor(0);

    doc.setFont('Roboto', 'normal');
    const netWidth = doc.getTextWidth(netText);
    const taxWidth = doc.getTextWidth(taxText);
    const subtotalLabelWidth = doc.getTextWidth(subtotalLabel);
    const vatLabelWidth = doc.getTextWidth(vatLabel);

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(11);
    const totalWidth = doc.getTextWidth(totalText);
    const totalLabelWidth = doc.getTextWidth(totalLabel);

    const maxValueWidth = Math.max(netWidth, taxWidth, totalWidth);
    const maxLabelWidth = Math.max(subtotalLabelWidth, vatLabelWidth, totalLabelWidth);
    const leftMargin = resolveMarginLeft(table && table.settings ? table.settings.margin : null);
    let totalsLabelX = totalsValX - maxValueWidth - labelGap;
    if (totalsLabelX < leftMargin + maxLabelWidth) {
        totalsLabelX = leftMargin + maxLabelWidth;
    }

    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    doc.text(subtotalLabel, totalsLabelX, finalY, { align: 'right' });
    doc.text(netText, totalsValX, finalY, { align: 'right' });
    finalY += lineHeight;

    doc.text(vatLabel, totalsLabelX, finalY, { align: 'right' });
    doc.text(taxText, totalsValX, finalY, { align: 'right' });
    finalY += lineHeight;

    doc.setFontSize(11);
    doc.setFont('Roboto', 'bold');
    doc.setTextColor(...accentColor);
    doc.text(totalLabel, totalsLabelX, finalY, { align: 'right' });
    doc.setTextColor(0);
    doc.text(totalText, totalsValX, finalY, { align: 'right' });

    // --- 7. Payment ---
    const totalsEndY = finalY + lineHeight;
    let paymentY = Math.max(doc.lastAutoTable.finalY + 10, totalsEndY + 6);

    if (data.payment) {
        doc.setFillColor(245, 247, 250);
        doc.rect(14, paymentY, 100, 30, 'F');

        doc.setTextColor(...accentColor);
        doc.setFontSize(10);
        doc.text(label('pdfPaymentHeading', 'Payment details:'), 18, paymentY + 6);

        doc.setFont('Roboto', 'normal');
        doc.setTextColor(0);
        doc.setFontSize(9);

        let payTextY = paymentY + 12;
        const methodLabel = label('pdfPaymentMethodLabel', 'Method:');
        const accountLabel = label('pdfPaymentAccountLabel', 'IBAN:');
        const referenceLabel = label('pdfPaymentReferenceLabel', 'Reference:');
        const methodValue = data.payment.method || data.payment.code || '-';

        doc.text(`${methodLabel} ${methodValue}`, 18, payTextY);
        payTextY += 5;
        doc.text(`${accountLabel} ${data.payment.account || '-'}`, 18, payTextY);
        payTextY += 5;
        doc.text(`${referenceLabel} ${data.payment.id || '-'}`, 18, payTextY);
    }

    // --- 8. Footer ---
    const pageHeight = doc.internal.pageSize.getHeight();
    let noteY = Math.max(finalY, paymentY + 35) + 10;

    if (data.note) {
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(label('pdfNoteLabel', 'Note:'), 14, noteY);
        doc.setFont('Roboto', 'normal');
        doc.setTextColor(100);
        const splitNote = doc.splitTextToSize(data.note, 180);
        doc.text(splitNote, 14, noteY + 5);
    }

    if (data.supplier.legalNote) {
        doc.setFontSize(7);
        doc.setTextColor(150);
        const splitLegal = doc.splitTextToSize(data.supplier.legalNote, 180);
        doc.text(splitLegal, 14, pageHeight - 15);
    }

    const legalNotice = label(
        'pdfLegalNotice',
        'This document is not a legal document. The PDF is generated automatically from the e-invoice XML.'
    );

    if (legalNotice) {
        const pageCount = doc.getNumberOfPages();
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(80);

        for (let pageIndex = 1; pageIndex <= pageCount; pageIndex++) {
            doc.setPage(pageIndex);
            doc.text(legalNotice, 105, pageHeight - 6, { align: 'center' });
        }
    }

    return doc;
}

// Single file convenience wrapper
async function generatePdf(data, options = {}) {
    const doc = await createPdf(data, options);
    const i18n = buildI18n(options.messages || {});
    const invoiceId = data.invoiceId || i18n('unknownInvoiceId') || 'unknown';
    const fileName = i18n('pdfFileName', [invoiceId]) || `Invoice-${invoiceId}.pdf`;
    doc.save(fileName);
}
