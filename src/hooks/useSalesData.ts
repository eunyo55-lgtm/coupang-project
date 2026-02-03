import { useState, useEffect, useCallback, useRef } from 'react';
import type { SalesRecord } from '../utils/excelParser';
import { parseExcel } from '../utils/excelParser';
import { DB } from '../utils/db';

const STORAGE_KEY = 'coupang_sales_records';

export function useSalesData() {
    const [records, setRecords] = useState<SalesRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Initial load from IndexedDB
    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            try {
                const stored = await DB.get<SalesRecord[]>(STORAGE_KEY);
                if (isMounted && stored) {
                    setRecords(stored);
                    console.log(`[DB] Loaded ${stored.length} records.`);
                } else {
                    // Try to load default CSV from public folder when DB is empty
                    try {
                        const publicPaths = [
                            '/basic_operation_rocket_2026010120260131.csv',
                            '/sales.csv',
                            '/data.csv'
                        ];
                        for (const p of publicPaths) {
                            try {
                                const res = await fetch(p);
                                if (!res.ok) continue;
                                const buf = await res.arrayBuffer();
                                const file = new File([buf], p.split('/').pop() || 'data.csv', { type: 'text/csv' });
                                const result = await parseExcel(file);
                                if (result.records && result.records.length > 0) {
                                    setRecords(result.records);
                                    await DB.set(STORAGE_KEY, result.records);
                                    console.log(`[Public] Loaded ${result.records.length} records from ${p}`);
                                    break;
                                }
                            } catch (e) {
                                // ignore and try next
                                console.warn('Failed to fetch/parse public file', p, e);
                            }
                        }
                    } catch (e) {
                        console.warn('No public fallback data found', e);
                    }
                }
            } catch (e) {
                console.error("Failed to load initial data from DB", e);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        loadData();
        return () => { isMounted = false; };
    }, []);

    // Helper to save to DB
    const saveData = useCallback(async (dataToSave: SalesRecord[]) => {
        try {
            await DB.set(STORAGE_KEY, dataToSave);
            console.log(`[DB] Saved ${dataToSave.length} records.`);
        } catch (e) {
            console.error("Failed to save data to DB", e);
            // alert("데이터 저장 실패: 용량이 부족하거나 오류가 발생했습니다.");
        }
    }, []);

    const addRecords = useCallback((newRecords: SalesRecord[]) => {
        setRecords(prev => {
            // 1. Aggregate INSIDE the new batch first (Handle split rows within the file)
            // This ensures "1+1+1 = 3" logic is preserved for the single file.
            const batchMap = new Map<string, SalesRecord>();

            newRecords.forEach(r => {
                const key = `${r.productId}_${r.date}`;
                if (batchMap.has(key)) {
                    const existing = batchMap.get(key)!;
                    batchMap.set(key, {
                        ...existing,
                        ...r, // Update metadata
                        salesQty: (existing.salesQty || 0) + (r.salesQty || 0),
                        inventoryQty: (existing.inventoryQty || 0) + (r.inventoryQty || 0)
                    });
                } else {
                    batchMap.set(key, { ...r });
                }
            });

            // 2. Merge Batch into DB (Overwrite existing keys)
            // This prevents "Double Counting" if the user re-uploads the same file.
            const existingMap = new Map();
            prev.forEach(r => existingMap.set(`${r.productId}_${r.date}`, r));

            let addedCount = 0;
            let updatedCount = 0;

            batchMap.forEach((newItem, key) => {
                if (existingMap.has(key)) {
                    // Overwrite logic: The new file is considered the "Latest Source of Truth" for this day
                    existingMap.set(key, newItem);
                    updatedCount++;
                } else {
                    existingMap.set(key, newItem);
                    addedCount++;
                }
            });

            console.log(`Merged data: ${addedCount} added, ${updatedCount} updated (Overwrite Strategy).`);

            const merged = Array.from(existingMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Save immediately (async)
            saveData(merged);

            return merged;
        });
    }, [saveData]);

    const clearData = useCallback(async () => {
        if (confirm("모든 데이터를 삭제하시겠습니까? 복구할 수 없습니다.")) {
            setRecords([]);
            await DB.delete(STORAGE_KEY);
            // Also clean up old localStorage key if it exists to verify cleanup
            localStorage.removeItem('coupang_sales_data_v1');
        }
    }, []);

    return {
        records,
        addRecords,
        clearData,
        isLoading
    };
}
