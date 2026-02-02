import { read, utils } from 'xlsx';
import { isValid, format } from 'date-fns';

export interface SalesRecord {
    productId: string;
    skuId: string;
    productName: string;
    barcode: string;
    date: string; // YYYY-MM-DD
    salesQty: number;
    inventoryQty: number; // This is Coupang Inventory
}

export interface ProductMaster {
    barcode: string;
    skuName: string;
    skuId: string;
    category?: string;
    costPrice?: number;
    imageUrl?: string;
    hqInventory?: number; // New field: HQ/Warehouse Inventory
}

export interface ParseResult {
    records: SalesRecord[];
    errors: string[];
}

export interface MasterParseResult {
    products: ProductMaster[];
    errors: string[];
}

export async function parseExcel(file: File): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawData = utils.sheet_to_json(worksheet, { header: 1 });

                if (rawData.length < 2) {
                    resolve({ records: [], errors: ["파일이 비어있거나 헤더가 없습니다."] });
                    return;
                }

                // Find Header Row (Search first 20 rows)
                let headerRowIndex = 0;
                let headers: string[] = [];

                for (let i = 0; i < Math.min(rawData.length, 20); i++) {
                    const row = rawData[i] as any[];
                    if (!row || row.length === 0) continue;

                    const rowStr = row.join(' ').toLowerCase();
                    // Check for key columns to identify header row
                    // Must contain at least Date AND (Product Name OR Barcode) keywords
                    const hasDate = /날짜|date|일자|주문일자|결제일자|주문일/i.test(rowStr);
                    const hasProduct = /상품명|옵션명|product|sku|item|제품명|품목|바코드|barcode/i.test(rowStr);

                    if (hasDate && hasProduct) {
                        headerRowIndex = i;
                        headers = row.map(h => h?.toString().trim());
                        console.log(`[ExcelParser] Found Header at Row ${i}:`, headers);
                        break;
                    }
                }

                // Fallback: If no header found, use first non-empty row or row 0
                if (headers.length === 0 && rawData.length > 0) {
                    headers = (rawData[0] as string[]).map(h => h?.toString().trim());
                }

                const records: SalesRecord[] = [];
                const errors: string[] = [];

                const dateIdx = headers.findIndex(h => /날짜|Date|일자|주문일자|결제일자|주문일|접수일|판매일/i.test(h));

                // Barcode Priority: 바코드 > 상품코드 > 업체상품코드 > 옵션ID
                let barcodeIdx = headers.findIndex(h => /바코드|Barcode/i.test(h));
                if (barcodeIdx === -1) barcodeIdx = headers.findIndex(h => /상품코드|ItemCode/i.test(h));
                if (barcodeIdx === -1) barcodeIdx = headers.findIndex(h => /업체상품코드|VendorItemCode|SKU/i.test(h));

                // Other Columns
                const nameIdx = headers.findIndex(h => /상품명|옵션명|Product|SKU|Item|제품명|품목/i.test(h));

                // Sales Column Detection Strategy: Priority Search

                // Helper to check if header is likely NOT a sales column (exclude returns, inbound, etc)
                const isInvalidSales = (h: string) => /반품|입고|재고|발주/i.test(h);

                // 1. High Priority: Explicit 'Outbound/Sales' terms (User confirmed '출고수량')
                let salesIdx = headers.findIndex(h => !isInvalidSales(h) && /출고수량|출고량|출고|결제수량|판매량|판매수량/i.test(h));

                // 2. Medium Priority: Order/Sales terms
                if (salesIdx === -1) {
                    salesIdx = headers.findIndex(h => !isInvalidSales(h) && /주문수량|결제\s*수량|Sales|Quantity/i.test(h));
                }

                // 3. Low Priority: Generic terms (Risk of matching 'Return Qty', 'Stock Qty' etc)
                if (salesIdx === -1) {
                    salesIdx = headers.findIndex(h => !isInvalidSales(h) && /수량|Qty|개수|판매/i.test(h));
                }

                const inventoryIdx = headers.findIndex(h => /재고|Inventory|Stock/i.test(h));
                const idIdx = headers.findIndex(h => /옵션ID|등록상품ID|ID/i.test(h));
                const skuIdx = headers.findIndex(h => /업체상품코드|SKU\s*ID|SKU/i.test(h)); // Keep strictly for SKU ID field

                console.log("[ExcelParser Sales] Detected Columns:", { dateIdx, barcodeIdx, nameIdx, salesIdx, inventoryIdx });

                if (nameIdx === -1 && barcodeIdx === -1) {
                    // Fallback: If neither Name nor Barcode found, it's risky. But try to proceed if we found Date + Sales
                    if (dateIdx === -1 || salesIdx === -1) {
                        resolve({ records: [], errors: ["필수 데이터 열(날짜, 상품명/바코드, 판매량)을 찾을 수 없습니다. 헤더를 확인해주세요."] });
                        return;
                    }
                }

                const todayStr = format(new Date(), 'yyyy-MM-dd');

                for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                    const row = rawData[i] as any[];
                    if (!row || row.length === 0) continue;

                    const name = nameIdx !== -1 ? row[nameIdx] : (barcodeIdx !== -1 ? row[barcodeIdx] : 'Unknown');
                    if (!name) continue;

                    // Skip "Total" / "Sum" rows
                    const firstCell = row[0] ? String(row[0]) : '';
                    if (/합계|소계|Total|Sum/i.test(firstCell) || /합계|소계|Total|Sum/i.test(String(name))) {
                        continue;
                    }

                    // Helper to parse numbers safely (Handles '1,000', '100개', '100ea')
                    const parseNum = (val: any) => {
                        if (typeof val === 'number') return val;
                        if (typeof val === 'string') {
                            // Remove all non-numeric chars except dot and minus
                            const cleanVal = val.replace(/[^0-9.-]/g, '').trim();
                            return parseFloat(cleanVal) || 0;
                        }
                        return 0;
                    };

                    // 1. Parse Date - Use detected column or default to Col A
                    let dateStr = todayStr;
                    const targetDateIdx = dateIdx !== -1 ? dateIdx : 0;
                    let rawDate = row[targetDateIdx];

                    if (rawDate) {
                        const strVal = String(rawDate).trim();

                        // Case A: YYYYMMDD (e.g. 20260130)
                        const yyyymmddParams = strVal.replace(/[^0-9]/g, '');
                        if (yyyymmddParams.length === 8 && /^20/.test(yyyymmddParams)) {
                            const y = yyyymmddParams.substring(0, 4);
                            const m = yyyymmddParams.substring(4, 6);
                            const d = yyyymmddParams.substring(6, 8);
                            dateStr = `${y}-${m}-${d}`;
                        }
                        // Case B: Excel Serial Date (e.g. 45000)
                        else if (typeof rawDate === 'number' && rawDate > 35000 && rawDate < 60000) {
                            // Tighter Bounds: 35000 (~1995) to 60000 (~2064)
                            const dt = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
                            if (isValid(dt)) dateStr = format(dt, 'yyyy-MM-dd');
                        }
                        // Case C: Standard String Date
                        else {
                            const dt = new Date(rawDate);
                            // Strict validation: must be > year 2000
                            if (isValid(dt) && dt.getFullYear() > 2000 && dt.getFullYear() < 2100) {
                                dateStr = format(dt, 'yyyy-MM-dd');
                            }
                        }
                    }

                    // 2. Parse Barcode (Priority: Header match -> Fallback to Col 8)
                    let barcode = '-';
                    if (barcodeIdx !== -1 && row[barcodeIdx]) {
                        barcode = String(row[barcodeIdx]).trim();
                    } else if (row[8]) {
                        // Fallback: Legacy assumption that Col I is barcode
                        barcode = String(row[8]).trim();
                    }

                    // 3. Parse Other Fields
                    const id = idIdx !== -1 ? String(row[idIdx]).trim() : String(name).trim();
                    const skuId = skuIdx !== -1 ? String(row[skuIdx]).trim() : id;
                    const sales = salesIdx !== -1 ? parseNum(row[salesIdx]) : 0;
                    const inventory = inventoryIdx !== -1 ? parseNum(row[inventoryIdx]) : 0;

                    records.push({
                        productId: id,
                        skuId,
                        productName: String(name).trim(),
                        barcode,
                        date: dateStr,
                        salesQty: sales,
                        inventoryQty: inventory
                    });
                }
                resolve({ records, errors });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

export async function parseProductMaster(file: File): Promise<MasterParseResult> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawData = utils.sheet_to_json(worksheet, { header: 1 });

                if (rawData.length < 2) {
                    resolve({ products: [], errors: ["파일이 비어있거나 헤더가 없습니다."] });
                    return;
                }

                const headers = (rawData[0] as string[]).map(h => h?.toString().trim());
                const products: ProductMaster[] = [];

                // Robust Header Matching
                const clean = (s: string) => s.replace(/\s+/g, '').toLowerCase();

                const barcodeIdx = headers.findIndex(h => {
                    const c = clean(h);
                    return c.includes('바코드') || c.includes('barcode') || c.includes('ean') || c.includes('upc');
                });

                const nameIdx = headers.findIndex(h => {
                    const c = clean(h);
                    return c.includes('상품명') || c.includes('skuname') || c.includes('name') || c.includes('제품명');
                });

                const skuIdIdx = headers.findIndex(h => {
                    const c = clean(h);
                    return c.includes('skuid') || c.includes('sku') || c.includes('code') || c.includes('코드');
                });

                const categoryIdx = headers.findIndex(h => h.includes('카테고리') || h.includes('Category'));
                const costIdx = headers.findIndex(h => h.includes('원가') || h.includes('Cost'));

                const imageIdx = headers.findIndex(h => {
                    const c = clean(h);
                    return c.includes('이미지') || c.includes('image') || c.includes('img') || c.includes('url');
                });

                // HQ Inventory Detection
                const hqIdx = headers.findIndex(h => {
                    const c = clean(h);
                    return c.includes('본사재고') || c.includes('hq') || c.includes('warehouse') || c.includes('창고');
                });

                if (barcodeIdx === -1) {
                    resolve({
                        products: [],
                        errors: [`'바코드' 열을 찾을 수 없습니다. (발견된 헤더: ${headers.join(', ')})`]
                    });
                    return;
                }

                for (let i = 1; i < rawData.length; i++) {
                    const row = rawData[i] as any[];
                    if (!row || row.length === 0) continue;

                    // Helper reused (conceptually, or duplicate for simplicity here inside the promise closure if strictness needed, but standard logic applies)
                    // Let's just inline clean parsing for master as well
                    const parseNumMaster = (val: any) => {
                        if (typeof val === 'number') return val;
                        if (typeof val === 'string') {
                            return Number(val.replace(/,/g, '').trim()) || 0;
                        }
                        return 0;
                    };

                    // BARCODE (Master) -> Column K (Index 10) priority
                    // A=0, ..., J=9, K=10
                    let barcode = row[barcodeIdx] ? String(row[barcodeIdx]).trim() : '';
                    if (row[10]) {
                        barcode = String(row[10]).trim();
                    }

                    if (!barcode || barcode === '-') continue;

                    const name = nameIdx !== -1 ? String(row[nameIdx]).trim() : '';
                    const skuId = skuIdIdx !== -1 ? String(row[skuIdIdx]).trim() : '';
                    const category = categoryIdx !== -1 ? String(row[categoryIdx]).trim() : undefined;
                    const cost = costIdx !== -1 ? parseNumMaster(row[costIdx]) : undefined;
                    const imageUrl = imageIdx !== -1 ? String(row[imageIdx]).trim() : undefined;
                    const hqInventory = hqIdx !== -1 ? parseNumMaster(row[hqIdx]) : undefined; // Optional

                    products.push({
                        barcode,
                        skuName: name || skuId || 'Unknown',
                        skuId,
                        category,
                        costPrice: cost,
                        imageUrl,
                        hqInventory
                    });
                }
                resolve({ products, errors: [] });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

export interface InboundRecord {
    barcode: string;
    productName: string;
    inboundQty: number; // Scheduled supply quantity
}

export interface InboundParseResult {
    records: InboundRecord[];
    errors: string[];
}

export async function parseInboundData(file: File): Promise<InboundParseResult> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawData = utils.sheet_to_json(worksheet, { header: 1 });

                if (rawData.length < 2) {
                    resolve({ records: [], errors: ["파일이 비어있거나 헤더가 없습니다."] });
                    return;
                }

                const headers = (rawData[0] as string[]).map(h => h?.toString().trim());
                const records: InboundRecord[] = [];

                // Header Matching
                const clean = (s: string) => s.replace(/\s+/g, '').toLowerCase();

                const barcodeIdx = headers.findIndex(h => {
                    const c = clean(h);
                    return c.includes('바코드') || c.includes('barcode');
                });

                const nameIdx = headers.findIndex(h => {
                    const c = clean(h);
                    return c.includes('상품명') || c.includes('name') || c.includes('product');
                });

                // Priority 1. Explicit 'Confirmed' or 'Inbound' related terms
                let qtyIdx = headers.findIndex(h => {
                    const c = clean(h);
                    return c.includes('확정') || c.includes('confirmed');
                });

                // Priority 2: Supply/Inbound terms
                if (qtyIdx === -1) {
                    qtyIdx = headers.findIndex(h => {
                        const c = clean(h);
                        return c.includes('공급') || c.includes('입고') || c.includes('supply') || c.includes('inbound');
                    });
                }

                // Priority 3: Generic Qty (Risky, but fallback)
                if (qtyIdx === -1) {
                    qtyIdx = headers.findIndex(h => {
                        const c = clean(h);
                        return c.includes('수량') || c.includes('qty');
                    });
                }

                if (barcodeIdx === -1) {
                    resolve({
                        records: [],
                        errors: [`'바코드' 열을 찾을 수 없습니다. (발견된 헤더: ${headers.join(', ')})`]
                    });
                    return;
                }

                for (let i = 1; i < rawData.length; i++) {
                    const row = rawData[i] as any[];
                    if (!row || row.length === 0) continue;

                    let barcode = row[barcodeIdx] ? String(row[barcodeIdx]).trim() : '';
                    if (!barcode || barcode === '-') continue;

                    const name = nameIdx !== -1 ? String(row[nameIdx]).trim() : 'Unknown';

                    let qty = 0;
                    if (qtyIdx !== -1) {
                        const val = row[qtyIdx];
                        if (typeof val === 'number') qty = val;
                        else if (typeof val === 'string') qty = Number(val.replace(/,/g, '').replace(/[^0-9.-]/g, '')) || 0;
                    }

                    if (qty > 0) {
                        records.push({
                            barcode,
                            productName: name,
                            inboundQty: qty
                        });
                    }
                }
                resolve({ records, errors: [] });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}
