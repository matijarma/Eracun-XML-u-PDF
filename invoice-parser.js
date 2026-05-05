const CODES = {
    // Invoice Types (UN/ECE 1001)
    hr: {
        invoiceTypes: {
            "380": "Komercijalni ra\u010dun",
            "381": "Odobrenje",
            "383": "Tere\u0107enje",
            "384": "Korektivni ra\u010dun",
            "386": "Ra\u010dun za predujam",
            "325": "Predra\u010dun",
            "394": "Ra\u010dun za leasing"
        },
        // Payment Means (UN/ECE 4461)
        paymentMeans: {
            "10": "Gotovina",
            "30": "Transakcijski ra\u010dun",
            "31": "Kartica",
            "42": "Na ra\u010dun u banci",
            "48": "Bankovna kartica"
        },
        // Tax Categories (UN/ECE 5305)
        taxCategories: {
            "S": "PDV",
            "E": "Oslobo\u0111eno",
            "AE": "Prijenos porezne obveze",
            "Z": "Nulta stopa",
            "O": "Neoporezivo",
            "K": "Isporuka unutar EU",
            "G": "Izvoz"
        },
        // Units (UN/ECE Rec 20 - Common subset)
        units: {
            "H87": "kom",
            "C62": "kom",
            "EA": "kom",
            "KGM": "kg",
            "MTR": "m",
            "MTK": "m2",
            "MTQ": "m3",
            "LTR": "l",
            "DAY": "dan",
            "HUR": "h",
            "MIN": "min",
            "KWH": "kWh",
            "TNE": "t"
        }
    },
    en: {
        invoiceTypes: {
            "380": "Commercial invoice",
            "381": "Credit note",
            "383": "Debit note",
            "384": "Corrective invoice",
            "386": "Advance invoice",
            "325": "Proforma invoice",
            "394": "Leasing invoice"
        },
        paymentMeans: {
            "10": "Cash",
            "30": "Account transfer",
            "31": "Card",
            "42": "Bank transfer",
            "48": "Bank card"
        },
        taxCategories: {
            "S": "VAT",
            "E": "Exempt",
            "AE": "Reverse charge",
            "Z": "Zero rate",
            "O": "Out of scope",
            "K": "Intra-EU supply",
            "G": "Export"
        },
        units: {
            "H87": "pcs",
            "C62": "pcs",
            "EA": "pcs",
            "KGM": "kg",
            "MTR": "m",
            "MTK": "m2",
            "MTQ": "m3",
            "LTR": "l",
            "DAY": "day",
            "HUR": "h",
            "MIN": "min",
            "KWH": "kWh",
            "TNE": "t"
        }
    }
};

const DEFAULT_LANGUAGE = 'hr';

function normalizeLanguage(language) {
    if (!language) return DEFAULT_LANGUAGE;
    const lower = String(language).toLowerCase();
    if (lower.startsWith('hr')) return 'hr';
    if (lower.startsWith('en')) return 'en';
    return DEFAULT_LANGUAGE;
}

function getCodes(language) {
    const lang = normalizeLanguage(language);
    return CODES[lang] || CODES[DEFAULT_LANGUAGE];
}

function fallbackInvoiceLabel(language, code) {
    const lang = normalizeLanguage(language);
    if (!code) {
        return lang === 'en' ? 'Invoice' : 'Ra\u010dun';
    }
    return lang === 'en' ? `Invoice (${code})` : `Ra\u010dun (${code})`;
}

class InvoiceParser {
    constructor(xmlString, language) {
        this.parser = new DOMParser();
        this.xmlDoc = this.parser.parseFromString(xmlString, 'text/xml');
        this.language = normalizeLanguage(language);
    }

    static isUBL(xmlString) {
        if (!xmlString || typeof xmlString !== 'string') return false;
        // Simple check for UBL Invoice root element and namespace
        return (xmlString.includes('Invoice') || xmlString.includes('CreditNote')) &&
               (xmlString.includes('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2') ||
                xmlString.includes('urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'));
    }

    findChild(parent, localName) {
        if (!parent) return null;
        const all = parent.getElementsByTagName('*');
        for (let i = 0; i < all.length; i++) {
            if (all[i].localName === localName) {
                return all[i];
            }
        }
        return null;
    }

    getText(parent, tagName) {
        if (!parent) return '';
        const node = this.findChild(parent, tagName);
        return node ? node.textContent.trim() : '';
    }

    parse() {
        const root = this.xmlDoc.documentElement;
        const codes = getCodes(this.language);

        // --- Header Info ---
        const invoiceTypeCode = this.getText(root, 'InvoiceTypeCode');
        const invoiceType = codes.invoiceTypes[invoiceTypeCode] || fallbackInvoiceLabel(this.language, invoiceTypeCode);

        const invoiceId = this.getText(root, 'ID');
        const issueDate = this.getText(root, 'IssueDate');
        const issueTime = this.getText(root, 'IssueTime').substring(0, 5);
        const dueDate = this.getText(root, 'DueDate');
        const currency = this.getText(root, 'DocumentCurrencyCode') || 'EUR';
        const note = this.getText(root, 'Note');

        // --- Supplier ---
        const supplierParty = this.findChild(root, 'AccountingSupplierParty');
        const supplierObj = this.findChild(supplierParty, 'Party');
        const supplierLegal = this.findChild(supplierObj, 'PartyLegalEntity');
        const supplierTax = this.findChild(supplierObj, 'PartyTaxScheme');
        const supplierAddress = this.findChild(supplierObj, 'PostalAddress');
        const supplierContact = this.findChild(supplierParty, 'SellerContact');

        const supplier = {
            name: this.getText(supplierLegal, 'RegistrationName') || this.getText(supplierObj, 'Name'),
            vatId: this.getText(supplierTax, 'CompanyID'),
            address: this.getText(supplierAddress, 'StreetName'),
            city: `${this.getText(supplierAddress, 'PostalZone')} ${this.getText(supplierAddress, 'CityName')}`,
            country: this.getText(this.findChild(supplierAddress, 'Country'), 'IdentificationCode'),
            legalNote: this.getText(supplierLegal, 'CompanyLegalForm'),
            contact: this.getText(supplierContact, 'Name')
        };

        // --- Customer ---
        const customerParty = this.findChild(root, 'AccountingCustomerParty');
        const customerObj = this.findChild(customerParty, 'Party');
        const customerLegal = this.findChild(customerObj, 'PartyLegalEntity');
        const customerTax = this.findChild(customerObj, 'PartyTaxScheme');
        const customerAddress = this.findChild(customerObj, 'PostalAddress');

        const customer = {
            name: this.getText(customerLegal, 'RegistrationName') || this.getText(customerObj, 'Name'),
            vatId: this.getText(customerTax, 'CompanyID'),
            address: this.getText(customerAddress, 'StreetName'),
            city: `${this.getText(customerAddress, 'PostalZone')} ${this.getText(customerAddress, 'CityName')}`,
            country: this.getText(this.findChild(customerAddress, 'Country'), 'IdentificationCode')
        };

        // --- Payment & Delivery ---
        const delivery = this.findChild(root, 'Delivery');
        const actualDeliveryDate = this.getText(delivery, 'ActualDeliveryDate');

        const paymentMeans = this.findChild(root, 'PaymentMeans');
        const payCode = this.getText(paymentMeans, 'PaymentMeansCode');
        const payment = {
            code: payCode,
            method: codes.paymentMeans[payCode] || payCode,
            note: this.getText(paymentMeans, 'InstructionNote'),
            id: this.getText(paymentMeans, 'PaymentID'),
            account: this.getText(this.findChild(paymentMeans, 'PayeeFinancialAccount'), 'ID')
        };

        // --- Totals ---
        const monetaryTotal = this.findChild(root, 'LegalMonetaryTotal');
        const taxTotalNode = this.findChild(root, 'TaxTotal');

        const totals = {
            net: parseFloat(this.getText(monetaryTotal, 'TaxExclusiveAmount') || 0),
            tax: parseFloat(this.getText(taxTotalNode, 'TaxAmount') || 0),
            total: parseFloat(this.getText(monetaryTotal, 'PayableAmount') || 0),
            currency: currency
        };

        // --- Lines ---
        const lines = [];
        const allNodes = root.getElementsByTagName('*');
        for (let i = 0; i < allNodes.length; i++) {
            if (allNodes[i].localName === 'InvoiceLine') {
                const line = allNodes[i];
                const item = this.findChild(line, 'Item');
                const price = this.findChild(line, 'Price');

                let description = this.getText(item, 'Description');
                const name = this.getText(item, 'Name');
                if (name && description && name !== description) description = name + '\n' + description;
                else if (name) description = name;

                const unitCode = this.findChild(line, 'InvoicedQuantity')?.getAttribute('unitCode');
                const taxCatCode = this.getText(this.findChild(this.findChild(item, 'ClassifiedTaxCategory'), 'ID'));

                lines.push({
                    id: this.getText(line, 'ID'),
                    desc: description,
                    qty: parseFloat(this.getText(line, 'InvoicedQuantity') || 0),
                    unitCode: unitCode,
                    unit: codes.units[unitCode] || unitCode,
                    unitPrice: parseFloat(this.getText(price, 'PriceAmount') || 0),
                    total: parseFloat(this.getText(line, 'LineExtensionAmount') || 0),
                    taxPercent: this.getText(this.findChild(this.findChild(item, 'ClassifiedTaxCategory'), 'Percent') || '25'),
                    taxCategory: codes.taxCategories[taxCatCode] || taxCatCode
                });
            }
        }

        return {
            invoiceType, invoiceId, issueDate, issueTime, dueDate,
            supplier, customer, payment, actualDeliveryDate, totals, lines,
            note
        };
    }
}
