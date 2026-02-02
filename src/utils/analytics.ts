import type { SalesRecord, ProductMaster, InboundRecord } from "./excelParser";

export interface DashboardStats {
    totalSales: number;
    totalRevenue: number;
    risingItemsCount: number;
    fallingItemsCount: number;
    stockWarningCount: number;
    // New fields
    prevDaySales: number;
    prevDayInventory: number;
    thisWeekSales: number;
    lastWeekSales: number;
    thisWeekLabel: string;
    lastWeekLabel: string;
}

export interface ProductSummary {
    productId: string; // The Aggregation Key (Product Name)
    skuId: string;
    productName: string;
    barcode: string;
    imageUrl?: string;
    cumulativeSales: number;
    coupangInventory: number; // Renamed from 'inventory'
    hqInventory: number;      // New field from Master
    dailySalesMap: Record<string, number>;
}

export function getDashboardStats(records: SalesRecord[]): DashboardStats {
    if (!records || records.length === 0) {
        return {
            totalSales: 0, totalRevenue: 0, risingItemsCount: 0, fallingItemsCount: 0, stockWarningCount: 0,
            prevDaySales: 0, prevDayInventory: 0, thisWeekSales: 0, lastWeekSales: 0, thisWeekLabel: '-', lastWeekLabel: '-'
        };
    }

    // 1. Daily Stats (Based on Latest Date)
    const dates = records.map(r => r.date).sort();
    const latestDateStr = dates[dates.length - 1]; // "Prev Day" in user's context is the latest data point
    const todayRecords = records.filter(r => r.date === latestDateStr);

    // Sum for "Prev Day"
    const prevDaySales = todayRecords.reduce((sum, r) => sum + r.salesQty, 0);
    const prevDayInventory = todayRecords.reduce((sum, r) => sum + r.inventoryQty, 0);

    // 2. Weekly Stats (Reuse getWeeklyComparison logic)
    // We can just call getWeeklyComparison internally if we move it or duplicate logic slightly for efficiency
    // Let's call the helper function directly since it's exported
    const weeklyStats = getWeeklyComparison(records);

    // Legacy fields (keep for compatibility if needed, or set to 0 if unused)
    // User wants to remove rising/falling from top cards, but let's keep calculating just in case
    const productMap = new Map<string, SalesRecord[]>();
    records.forEach(r => {
        if (!productMap.has(r.productId)) productMap.set(r.productId, []);
        productMap.get(r.productId)?.push(r);
    });

    let rising = 0;
    let falling = 0;
    let warnings = 0;

    productMap.forEach((history) => {
        const lastRec = history[history.length - 1];
        if (lastRec.inventoryQty < 5) warnings++;
        if (history.length >= 2) {
            const recent = history.slice(-5);
            if (recent.length >= 2) {
                let diffSum = 0;
                for (let i = 1; i < recent.length; i++) {
                    diffSum += (recent[i].salesQty - recent[i - 1].salesQty);
                }
                if (diffSum > 0) rising++;
                if (diffSum < 0) falling++;
            }
        }
    });

    return {
        totalSales: prevDaySales, // Map totalSales to prevDaySales for backward compat just in case
        totalRevenue: prevDaySales * 10000,
        risingItemsCount: rising,
        fallingItemsCount: falling,
        stockWarningCount: warnings,

        prevDaySales,
        prevDayInventory,
        thisWeekSales: weeklyStats.thisWeekSales,
        lastWeekSales: weeklyStats.lastWeekSales,
        thisWeekLabel: weeklyStats.thisWeekLabel,
        lastWeekLabel: weeklyStats.lastWeekLabel
    };
}

export interface ProductSummary {
    productId: string; // The Aggregation Key (Product Name)
    skuId: string;
    productName: string;
    barcode: string;
    imageUrl?: string;
    cumulativeSales: number;
    coupangInventory: number; // Renamed from 'inventory'
    hqInventory: number;      // New field from Master
    dailySalesMap: Record<string, number>;
}

export function getProductSummary(records: SalesRecord[], masterData: ProductMaster[] = []): ProductSummary[] {
    // Map: Barcode -> Summary
    const summaryMap = new Map<string, ProductSummary>();

    // 1. Initialize Summaries from Master Data (The User's Source of Truth)
    masterData.forEach(m => {
        if (!m.barcode) return;
        // Normalize barcode: Trim spaces
        const key = String(m.barcode).trim();
        summaryMap.set(key, {
            productId: key, // Use Barcode as logical ID
            skuId: m.skuId,
            productName: m.skuName,
            barcode: key,
            imageUrl: m.imageUrl,
            cumulativeSales: 0,
            coupangInventory: 0,
            hqInventory: m.hqInventory || 0,
            dailySalesMap: {}
        });
    });

    if (!records || records.length === 0) return Array.from(summaryMap.values());

    // Filter out invalid records
    const validRecords = records.filter(r => r && r.date);
    if (validRecords.length === 0) return Array.from(summaryMap.values());

    // Find absolute latest date for Inventory Aggregation
    const dates = validRecords.map(r => r.date).sort();
    const latestDateStr = dates[dates.length - 1];

    // 2. Aggregate Sales Data into existing Summaries (matched by Barcode)
    validRecords.forEach(r => {
        // Normalize sales barcode
        const barcode = r.barcode ? String(r.barcode).trim() : '-';
        let summary = summaryMap.get(barcode);

        if (!summary) {
            // Orphan Record (Not in Master) -> Create ad-hoc entry
            summary = {
                productId: r.barcode || r.productId,
                skuId: r.skuId || r.productId,
                productName: r.productName,
                barcode: barcode,
                imageUrl: undefined,
                cumulativeSales: 0,
                coupangInventory: 0,
                hqInventory: 0,
                dailySalesMap: {}
            };
            summaryMap.set(barcode, summary);
        }

        // Summation Logic
        summary.cumulativeSales += r.salesQty;

        // Coupang Inventory: Only for latest date
        if (r.date === latestDateStr) {
            summary.coupangInventory += r.inventoryQty;
        }

        const dateKey = r.date;
        summary.dailySalesMap[dateKey] = (summary.dailySalesMap[dateKey] || 0) + r.salesQty;
    });

    return Array.from(summaryMap.values());
}

export interface ProductGroup {
    groupName: string;
    imageUrl?: string;
    totalCumulativeSales: number;
    totalCoupangInventory: number;
    totalHqInventory: number;
    dailySalesMap: Record<string, number>;
    items: ProductSummary[];
}

export function groupProductsByName(items: ProductSummary[]): ProductGroup[] {
    const groups = new Map<string, ProductGroup>();

    items.forEach(item => {
        const key = item.productName;
        if (!groups.has(key)) {
            groups.set(key, {
                groupName: key,
                imageUrl: item.imageUrl, // Use first image found
                totalCumulativeSales: 0,
                totalCoupangInventory: 0,
                totalHqInventory: 0,
                dailySalesMap: {},
                items: []
            });
        }
        const group = groups.get(key)!;
        group.items.push(item);

        // Use image from children if not set
        if (!group.imageUrl && item.imageUrl) {
            group.imageUrl = item.imageUrl;
        }

        group.totalCumulativeSales += item.cumulativeSales;
        group.totalCoupangInventory += item.coupangInventory;
        group.totalHqInventory += item.hqInventory;

        // Sum daily sales
        Object.entries(item.dailySalesMap).forEach(([date, qty]) => {
            group.dailySalesMap[date] = (group.dailySalesMap[date] || 0) + qty;
        });
    });

    return Array.from(groups.values());
}

export interface WeeklyStats {
    thisWeekLabel: string; // e.g., "1/26 ~ 2/1"
    lastWeekLabel: string; // e.g., "1/19 ~ 1/25"
    thisWeekSales: number;
    lastWeekSales: number;
    growthRate: number; // percentage
}

export function getWeeklyComparison(records: SalesRecord[]): WeeklyStats {
    if (!records || records.length === 0) {
        return { thisWeekLabel: '-', lastWeekLabel: '-', thisWeekSales: 0, lastWeekSales: 0, growthRate: 0 };
    }

    // Helper: format Date to YYYY-MM-DD string
    const toDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // Helper: Parse YYYY-MM-DD to Date object
    const parseDateLocal = (dateStr: string) => {
        const parts = dateStr.split(/[-/.]/);
        if (parts.length >= 3) {
            return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        }
        return new Date(dateStr);
    };

    // 1. Determine "Current" reference date (latest available date in records)
    const dates = records.map(r => r.date).sort();
    const latestDateStr = dates[dates.length - 1];
    const currDate = parseDateLocal(latestDateStr);

    // 2. Find start of "This Week" (Most recent Friday)
    // Friday is day 5.
    const dayOfWeek = currDate.getDay();
    // Calculate offset to get back to Friday
    // Sun(0)->2, Mon(1)->3, Tue(2)->4, Wed(3)->5, Thu(4)->6, Fri(5)->0, Sat(6)->1
    const offset = (dayOfWeek + 2) % 7;

    const thisWeekStart = new Date(currDate);
    thisWeekStart.setDate(currDate.getDate() - offset);

    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekStart.getDate() + 6);

    // 3. Find "Last Week" (Previous Fri-Thu)
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);

    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekStart.getDate() + 6);

    // Convert ranges to YYYY-MM-DD strings for reliable comparison
    const thisStartStr = toDateStr(thisWeekStart);
    const thisEndStr = toDateStr(thisWeekEnd);
    const lastStartStr = toDateStr(lastWeekStart);
    const lastEndStr = toDateStr(lastWeekEnd);

    // Calculate Sales
    let thisWeekSales = 0;
    let lastWeekSales = 0;

    records.forEach(r => {
        // String comparison works for YYYY-MM-DD
        if (r.date >= thisStartStr && r.date <= thisEndStr) {
            thisWeekSales += r.salesQty;
        } else if (r.date >= lastStartStr && r.date <= lastEndStr) {
            lastWeekSales += r.salesQty;
        }
    });

    // Format Labels (MM/DD)
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    const thisWeekLabel = `${fmt(thisWeekStart)}~${fmt(thisWeekEnd)}`;
    const lastWeekLabel = `${fmt(lastWeekStart)}~${fmt(lastWeekEnd)}`;

    // Growth Rate
    let growthRate = 0;
    if (lastWeekSales > 0) {
        growthRate = ((thisWeekSales - lastWeekSales) / lastWeekSales) * 100;
    } else if (thisWeekSales > 0) {
        growthRate = 100;
    }

    return {
        thisWeekLabel,
        lastWeekLabel,
        thisWeekSales,
        lastWeekSales,
        growthRate
    };
}

export interface DailyTrend {
    date: string;
    sales: number;
    revenue: number;
}

export function getDailyTrend(records: SalesRecord[]): DailyTrend[] {
    if (!records || records.length === 0) return [];

    const map = new Map<string, { sales: number, revenue: number }>();

    records.forEach(r => {
        if (!r.date) return;
        const key = r.date;
        const current = map.get(key) || { sales: 0, revenue: 0 };

        current.sales += r.salesQty;
        // Assuming revenue logic if needed, simplify to just simple calculation?
        // App currently estimates revenue as sales * 10000 in DashboardStats, let's keep consistency or just 0
        // But for trends, Sales Qty is most important.
        current.revenue += (r.salesQty * 10000);

        map.set(key, current);
    });

    const result = Array.from(map.entries()).map(([date, val]) => ({
        date,
        sales: val.sales,
        revenue: val.revenue
    }));

    // Sort by date
    result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return result;
}

export interface InventoryRisk {
    productName: string;
    imageUrl?: string;
    currentInventory: number;
    inboundQty: number; // New field
    avg7Days: number;
    prevDaySales: number;
    weightedDailyAvg: number;
    expectedDemand7Days: number;
    expectedBalance7Days: number; // (Inventory + Inbound) - Demand
    status: 'Safe' | 'Warning' | 'Danger';
    items: any[]; // Variants
}

export function getInventoryRiskAnalysis(records: SalesRecord[], masterData: ProductMaster[] = [], inboundData: InboundRecord[] = []): InventoryRisk[] {
    if (!records || records.length === 0) return [];

    // 1. Prepare Date Range
    const dates = Array.from(new Set(records.map(r => r.date))).sort();
    if (dates.length === 0) return [];

    const latestDate = dates[dates.length - 1];
    // Get last 7 days inclusive of latest
    const recent7Days = dates.slice(Math.max(0, dates.length - 7));

    // 2. Group by Product (Aggregate across barcodes for same product name)
    // We reuse groupProductsByName logic but specialized for this calc
    const products = groupProductsByName(getProductSummary(records, masterData));

    // 2.5 Prepare Inbound Data Map
    const inboundMap = new Map<string, number>(); // Name -> Total Inbound Qty
    inboundData.forEach(r => {
        const current = inboundMap.get(r.productName) || 0;
        inboundMap.set(r.productName, current + r.inboundQty);
    });

    const risks: InventoryRisk[] = products.map(p => {
        // A. Prev Day Sales
        const prevDaySales = p.dailySalesMap[latestDate] || 0;

        // B. Avg Last 7 Days (Sum of sales in recent7Days / 7)
        let sum7Days = 0;
        recent7Days.forEach(date => {
            sum7Days += (p.dailySalesMap[date] || 0);
        });
        const avg7Days = sum7Days / 7;

        // C. Weighted Daily Avg
        const weightedDailyAvg = (avg7Days + prevDaySales) / 2;

        // D. Expected Demand next 7 Days
        const expectedDemand7Days = weightedDailyAvg * 7;

        // E. Inbound Qty
        const inboundQty = inboundMap.get(p.groupName) || 0;

        // F. Expected Balance
        const expectedBalance7Days = (p.totalCoupangInventory + inboundQty) - expectedDemand7Days;

        // G. Status
        let status: 'Safe' | 'Warning' | 'Danger' = 'Safe';
        if (expectedBalance7Days < 0) {
            status = 'Danger'; // Will run out
        } else if (expectedBalance7Days < weightedDailyAvg * 14) {
            // Warning if less than 2 weeks supply
            status = 'Warning';
        }

        return {
            productName: p.groupName,
            imageUrl: p.imageUrl,
            currentInventory: p.totalCoupangInventory,
            inboundQty,
            avg7Days,
            prevDaySales,
            weightedDailyAvg,
            expectedDemand7Days,
            expectedBalance7Days,
            status,
            items: p.items.map(item => {
                // Calculate same metrics for child item
                const itemPrevDaySales = item.dailySalesMap[latestDate] || 0;
                let itemSum7Days = 0;
                recent7Days.forEach(date => {
                    itemSum7Days += (item.dailySalesMap[date] || 0);
                });
                const itemAvg7Days = itemSum7Days / 7;
                const itemWeightedDailyAvg = (itemAvg7Days + itemPrevDaySales) / 2;
                const itemExpectedDemand7Days = itemWeightedDailyAvg * 7;

                // For now, we assume inbound is at product level only (or we distribute? for now simpler: 0 for child unless we map it)
                // TODO: If inbound data has barcode, we could map it. Assuming 0 for now to be safe.
                const itemInboundQty = 0;

                const itemExpectedBalance7Days = (item.coupangInventory + itemInboundQty) - itemExpectedDemand7Days;

                let itemStatus: 'Safe' | 'Warning' | 'Danger' = 'Safe';
                if (itemExpectedBalance7Days < 0) itemStatus = 'Danger';
                else if (itemExpectedBalance7Days < itemWeightedDailyAvg * 14) itemStatus = 'Warning';

                return {
                    productName: item.optionName || item.barcode, // Use option name for display
                    imageUrl: item.imageUrl,
                    currentInventory: item.coupangInventory,
                    inboundQty: itemInboundQty,
                    avg7Days: itemAvg7Days,
                    prevDaySales: itemPrevDaySales,
                    weightedDailyAvg: itemWeightedDailyAvg,
                    expectedDemand7Days: itemExpectedDemand7Days,
                    expectedBalance7Days: itemExpectedBalance7Days,
                    status: itemStatus,
                    barcode: item.barcode // Keep barcode for reference
                };
            })
        };
    });

    // Sort: Danger first, then ascending balance
    risks.sort((a, b) => a.expectedBalance7Days - b.expectedBalance7Days);

    return risks;
}
