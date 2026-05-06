'use strict';

(function attachOfferPdfGenerator(globalScope) {
    const { jsPDF } = globalScope.jspdf || {};

    function asNumber(value, fallback = 0) {
        if (value === null || value === undefined || value === '') return fallback;
        const normalized = Number(String(value).replace(',', '.'));
        return Number.isFinite(normalized) ? normalized : fallback;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function roundMoney(value) {
        return Math.round((asNumber(value) + Number.EPSILON) * 100) / 100;
    }

    function normalizeItems(items, fallbackDiscountRate = 0) {
        if (!Array.isArray(items)) return [];
        return items
            .map((item) => {
                const quantity = asNumber(item && (item.quantity ?? item.qty), 0);
                const unitPrice = asNumber(item && item.unitPrice, 0);
                const description = String(item && item.description ? item.description : '').trim();
                const unit = String(item && item.unit ? item.unit : '').trim();
                const lineGross = roundMoney(quantity * unitPrice);
                const rawDiscountRate = item && item.discountRate !== undefined
                    ? item.discountRate
                    : fallbackDiscountRate;
                const discountRate = clamp(asNumber(rawDiscountRate, 0), 0, 100);
                const discountAmount = roundMoney(lineGross * (discountRate / 100));
                const lineTotal = roundMoney(lineGross - discountAmount);
                return {
                    description,
                    quantity: roundMoney(quantity),
                    unit,
                    unitPrice: roundMoney(unitPrice),
                    discountRate: roundMoney(discountRate),
                    lineGross,
                    discountAmount,
                    lineTotal
                };
            })
            .filter((item) => item.description || item.quantity || item.unitPrice);
    }

    function computeOfferTotals(items, discountRateOrVatRate, vatRateMaybe) {
        const usingLegacyGlobalDiscount = vatRateMaybe !== undefined && vatRateMaybe !== null;
        const fallbackDiscountRate = usingLegacyGlobalDiscount
            ? clamp(asNumber(discountRateOrVatRate, 0), 0, 100)
            : 0;
        const normalizedItems = normalizeItems(items, fallbackDiscountRate);
        const standardPrice = roundMoney(
            normalizedItems.reduce((sum, item) => sum + roundMoney(item.lineGross), 0)
        );
        const normalizedVatRate = clamp(
            asNumber(usingLegacyGlobalDiscount ? vatRateMaybe : discountRateOrVatRate, 25),
            0,
            99.99
        );
        const discountAmount = roundMoney(
            normalizedItems.reduce((sum, item) => sum + roundMoney(item.discountAmount), 0)
        );
        const netBase = roundMoney(standardPrice - discountAmount);
        const vatAmount = roundMoney(netBase * (normalizedVatRate / 100));
        const total = roundMoney(netBase + vatAmount);

        return {
            items: normalizedItems,
            discountRate: fallbackDiscountRate,
            vatRate: normalizedVatRate,
            standardPrice,
            discountAmount,
            netBase,
            vatAmount,
            total
        };
    }

    function formatCurrency(value, currency, locale) {
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

    function formatDate(value, locale) {
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

    function hexToRgb(hexColor) {
        if (!hexColor || typeof hexColor !== 'string') return [44, 62, 80];
        const value = hexColor.trim().replace('#', '');
        if (value.length === 3) {
            const r = Number.parseInt(value[0] + value[0], 16);
            const g = Number.parseInt(value[1] + value[1], 16);
            const b = Number.parseInt(value[2] + value[2], 16);
            if ([r, g, b].every(Number.isFinite)) return [r, g, b];
            return [44, 62, 80];
        }
        if (value.length === 6) {
            const r = Number.parseInt(value.slice(0, 2), 16);
            const g = Number.parseInt(value.slice(2, 4), 16);
            const b = Number.parseInt(value.slice(4, 6), 16);
            if ([r, g, b].every(Number.isFinite)) return [r, g, b];
        }
        return [44, 62, 80];
    }

    function detectImageFormat(dataUrl) {
        const normalized = String(dataUrl || '').toLowerCase();
        if (normalized.startsWith('data:image/png')) return 'PNG';
        if (normalized.startsWith('data:image/webp')) return 'WEBP';
        if (normalized.startsWith('data:image/jpeg') || normalized.startsWith('data:image/jpg')) return 'JPEG';
        return 'PNG';
    }

    function resolveMarginLeft(margin) {
        if (typeof margin === 'number') return margin;
        if (margin && typeof margin === 'object' && Number.isFinite(margin.left)) return margin.left;
        return 0;
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

    function resolveLogoPlacement(doc, dataUrl) {
        if (!doc || !dataUrl) return null;

        const fallback = {
            width: 28,
            height: 10,
            type: detectImageFormat(dataUrl)
        };

        try {
            const properties = doc.getImageProperties(dataUrl);
            const sourceWidth = Number(properties && properties.width);
            const sourceHeight = Number(properties && properties.height);
            if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
                return fallback;
            }

            const maxWidth = 28;
            const maxHeight = 12;
            const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
            return {
                width: roundMoney(sourceWidth * scale),
                height: roundMoney(sourceHeight * scale),
                type: fallback.type
            };
        } catch (error) {
            return fallback;
        }
    }

    function createI18n(messages, locale) {
        const dictionary = messages || {};
        const isEnglish = String(locale || '').toLowerCase().startsWith('en');
        const fallbacks = {
            offerPdfTitle: isEnglish ? 'OFFER' : 'PONUDA',
            offerPdfIssuerLabel: isEnglish ? 'ISSUER' : 'IZDAVATELJ',
            offerPdfCustomerLabel: isEnglish ? 'CUSTOMER' : 'KLIJENT',
            offerPdfMetaNumber: isEnglish ? 'Offer number' : 'Broj ponude',
            offerPdfMetaIssueDate: isEnglish ? 'Issue date' : 'Datum izdavanja',
            offerPdfMetaValidUntil: isEnglish ? 'Valid until' : 'Rok valjanosti',
            offerPdfIntroLabel: isEnglish ? 'Intro' : 'Uvod',
            offerPdfSpecificationLabel: isEnglish ? 'Specification' : 'Specifikacija',
            offerPdfTableNo: '#',
            offerPdfTableDescription: isEnglish ? 'Description' : 'Opis',
            offerPdfTableQuantity: isEnglish ? 'Qty' : 'Kol',
            offerPdfTableUnitPrice: isEnglish ? 'Unit price' : 'Jed. cijena',
            offerPdfTableDiscount: isEnglish ? 'Discount' : 'Popust',
            offerPdfTableTotal: isEnglish ? 'Total' : 'Ukupno',
            offerSummaryStandard: isEnglish ? 'Standard price' : 'Standardna cijena',
            offerSummaryDiscount: isEnglish ? 'Discount' : 'Popust',
            offerSummaryNet: isEnglish ? 'Net base' : 'Neto osnovica',
            offerSummaryVat: isEnglish ? 'VAT' : 'PDV',
            offerSummaryTotal: isEnglish ? 'Total to pay' : 'Ukupno za platiti',
            offerPdfNoteLabel: isEnglish ? 'Note' : 'Napomena'
        };
        return function i18n(key, substitutions) {
            const template = dictionary[key] && dictionary[key].message ? dictionary[key].message : fallbacks[key] || key;
            if (!Array.isArray(substitutions) || substitutions.length === 0) return template;
            return template.replace(/\$(\d+)/g, (match, index) => {
                const replacement = substitutions[Number(index) - 1];
                return replacement === undefined ? '' : replacement;
            });
        };
    }

    function toLineList(parts) {
        if (!Array.isArray(parts)) return [];
        return parts
            .map((part) => (part === null || part === undefined ? '' : String(part).trim()))
            .filter(Boolean);
    }

    function drawTextSection(doc, title, text, left, y, width) {
        if (!text) return y;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(40, 50, 62);
        doc.text(title, left, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(56, 71, 85);
        const wrapped = doc.splitTextToSize(String(text), width);
        doc.text(wrapped, left, y + 4.8);
        return y + 4.8 + (wrapped.length * 4.2) + 2.5;
    }

    function createOfferPdf(offerData, options) {
        if (!jsPDF) {
            throw new Error('jsPDF is not loaded.');
        }
        const data = offerData || {};
        const opts = options || {};
        const locale = opts.locale || 'hr-HR';
        const accentColor = opts.accentColor || '#c10034';
        const logoDataUrl = opts.logoDataUrl || '';
        const accentRgb = hexToRgb(accentColor);
        const currency = data.currency || 'EUR';
        const i18n = createI18n(opts.messages || {}, locale);

        const hasPerItemDiscount = Array.isArray(data.items) && data.items.some((item) =>
            item && item.discountRate !== undefined && item.discountRate !== null && item.discountRate !== ''
        );
        const totals = hasPerItemDiscount
            ? computeOfferTotals(data.items || [], data.vatRate)
            : computeOfferTotals(data.items || [], data.discountRate, data.vatRate);
        const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 14;
        const contentWidth = pageWidth - margin * 2;
        const rightColWidth = 70;
        const leftColWidth = contentWidth - rightColWidth - 6;

        doc.setDrawColor(accentRgb[0], accentRgb[1], accentRgb[2]);
        doc.setLineWidth(1.2);
        doc.line(margin, 14, pageWidth - margin, 14);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
        doc.setFontSize(18);
        let titleX = margin;
        if (logoDataUrl) {
            try {
                const logoPlacement = resolveLogoPlacement(doc, logoDataUrl);
                if (logoPlacement) {
                    const logoY = 17 + ((12 - logoPlacement.height) / 2);
                    doc.addImage(logoDataUrl, logoPlacement.type, margin, logoY, logoPlacement.width, logoPlacement.height);
                    titleX = margin + logoPlacement.width + 6;
                }
            } catch (error) {
                // Ignore invalid logo payload and keep rendering without a logo.
            }
        }
        doc.text(i18n('offerPdfTitle'), titleX, 24);

        const issueDate = formatDate(data.issueDate, locale);
        const validUntil = formatDate(data.validUntil, locale);
        const offerNumber = data.offerNumber || '-';

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(56, 71, 85);
        doc.setFontSize(9.5);
        doc.text(`${i18n('offerPdfMetaNumber')}: ${offerNumber}`, pageWidth - margin, 20, { align: 'right' });
        doc.text(`${i18n('offerPdfMetaIssueDate')}: ${issueDate}`, pageWidth - margin, 25, { align: 'right' });
        doc.text(`${i18n('offerPdfMetaValidUntil')}: ${validUntil}`, pageWidth - margin, 30, { align: 'right' });

        const issuerLines = toLineList([
            data.issuer && data.issuer.name,
            data.issuer && data.issuer.address,
            data.issuer && data.issuer.city,
            data.issuer && data.issuer.oib ? `OIB: ${data.issuer.oib}` : '',
            data.issuer && data.issuer.iban ? `IBAN: ${data.issuer.iban}` : '',
            data.issuer && data.issuer.contact ? `${data.issuer.contact}` : '',
            data.issuer && data.issuer.email ? `${data.issuer.email}` : '',
            data.issuer && data.issuer.web ? `${data.issuer.web}` : ''
        ]);
        const customerLines = toLineList([
            data.customer && data.customer.name,
            data.customer && data.customer.address,
            data.customer && data.customer.oib ? `OIB: ${data.customer.oib}` : ''
        ]);

        let cursorY = 36;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(31, 42, 55);
        doc.text(i18n('offerPdfIssuerLabel'), margin, cursorY);
        doc.text(i18n('offerPdfCustomerLabel'), margin + leftColWidth + 6, cursorY);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(56, 71, 85);

        const issuerWrapped = doc.splitTextToSize(issuerLines.join('\n') || '-', leftColWidth);
        const customerWrapped = doc.splitTextToSize(customerLines.join('\n') || '-', rightColWidth);
        doc.text(issuerWrapped, margin, cursorY + 5);
        doc.text(customerWrapped, margin + leftColWidth + 6, cursorY + 5);
        cursorY += Math.max(issuerWrapped.length, customerWrapped.length) * 4.2 + 10;

        cursorY = drawTextSection(
            doc,
            i18n('offerPdfIntroLabel'),
            data.intro || '',
            margin,
            cursorY,
            contentWidth
        );
        cursorY = drawTextSection(
            doc,
            i18n('offerPdfSpecificationLabel'),
            data.specification || '',
            margin,
            cursorY,
            contentWidth
        );

        if (cursorY > pageHeight - 110) {
            doc.addPage();
            cursorY = margin + 6;
        }

        const tableBody = totals.items.map((item, index) => ([
            String(index + 1),
            item.description || '-',
            `${item.quantity.toFixed(2)} ${item.unit || ''}`.trim(),
            formatCurrency(item.unitPrice, currency, locale),
            `${Math.round(item.discountRate)}%`,
            formatCurrency(item.lineTotal, currency, locale)
        ]));

        doc.autoTable({
            startY: cursorY + 2,
            margin: { left: margin, right: margin },
            head: [[
                i18n('offerPdfTableNo'),
                i18n('offerPdfTableDescription'),
                i18n('offerPdfTableQuantity'),
                i18n('offerPdfTableUnitPrice'),
                i18n('offerPdfTableDiscount'),
                i18n('offerPdfTableTotal')
            ]],
            body: tableBody,
            headStyles: {
                fillColor: accentRgb,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 9
            },
            styles: {
                font: 'helvetica',
                fontSize: 9,
                cellPadding: 1.8,
                textColor: [31, 42, 55],
                lineColor: [216, 222, 230],
                lineWidth: 0.1
            },
            alternateRowStyles: {
                fillColor: [247, 249, 252]
            },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 68 },
                2: { cellWidth: 24, halign: 'right' },
                3: { cellWidth: 28, halign: 'right' },
                4: { cellWidth: 20, halign: 'right' },
                5: { cellWidth: 26, halign: 'right' }
            }
        });

        const tableBottom = doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : (cursorY + 10);
        let summaryY = tableBottom + 7;
        if (summaryY > pageHeight - 55) {
            doc.addPage();
            summaryY = margin + 6;
        }

        const summaryWidth = 72;
        const table = doc.lastAutoTable;
        let summaryRight = pageWidth - margin;
        let summaryValueX = summaryRight - 3;
        if (table && Array.isArray(table.columns) && table.columns.length > 0) {
            const tableLeft = resolveMarginLeft(table.settings ? table.settings.margin : null);
            const tableWidth = table.columns.reduce((sum, column) => sum + column.width, 0);
            summaryRight = tableLeft + tableWidth;
            const paddingRight = resolvePaddingRight(table.styles ? table.styles.cellPadding : null);
            summaryValueX = summaryRight - Math.max(2, paddingRight);
        }
        summaryRight = Math.min(pageWidth - margin, Math.max(summaryRight, margin + summaryWidth));
        const summaryX = summaryRight - summaryWidth;
        summaryValueX = Math.min(summaryRight - 2.5, Math.max(summaryX + 28, summaryValueX));

        const summaryRows = [
            { label: i18n('offerSummaryStandard'), value: formatCurrency(totals.standardPrice, currency, locale), bold: false },
            { label: i18n('offerSummaryDiscount'), value: formatCurrency(totals.discountAmount, currency, locale), bold: false },
            { label: i18n('offerSummaryNet'), value: formatCurrency(totals.netBase, currency, locale), bold: false },
            { label: i18n('offerSummaryVat'), value: formatCurrency(totals.vatAmount, currency, locale), bold: false },
            { label: i18n('offerSummaryTotal'), value: formatCurrency(totals.total, currency, locale), bold: true }
        ];

        doc.setDrawColor(216, 222, 230);
        doc.setLineWidth(0.2);
        doc.roundedRect(summaryX, summaryY - 4, summaryWidth, 30, 2, 2);

        let rowY = summaryY;
        summaryRows.forEach((row, index) => {
            doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
            doc.setFontSize(row.bold ? 10.5 : 9.5);
            doc.setTextColor(row.bold ? accentRgb[0] : 56, row.bold ? accentRgb[1] : 71, row.bold ? accentRgb[2] : 85);
            doc.text(row.label, summaryX + 3, rowY);
            doc.text(row.value, summaryValueX, rowY, { align: 'right' });
            rowY += index === summaryRows.length - 1 ? 0 : 5.3;
        });

        const noteText = data.note || '';
        if (noteText) {
            let noteY = summaryY + 34;
            if (noteY > pageHeight - 20) {
                doc.addPage();
                noteY = margin + 6;
            }
            drawTextSection(doc, i18n('offerPdfNoteLabel'), noteText, margin, noteY, contentWidth);
        }

        return {
            doc,
            totals
        };
    }

    globalScope.OfferPdfGenerator = {
        computeOfferTotals,
        createOfferPdf
    };
}(window));
