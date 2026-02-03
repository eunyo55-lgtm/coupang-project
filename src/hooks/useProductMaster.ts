import { useState, useEffect, useCallback } from 'react';
import type { ProductMaster } from '../utils/excelParser';
import { parseProductMaster } from '../utils/excelParser';
import { DB } from '../utils/db';

const MASTER_STORAGE_KEY = 'coupang_product_master';

export function useProductMaster() {
    const [masterRecords, setMasterRecords] = useState<ProductMaster[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Initial load from IndexedDB
    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            try {
                const stored = await DB.get<ProductMaster[]>(MASTER_STORAGE_KEY);
                if (isMounted && stored) {
                    setMasterRecords(stored);
                    console.log(`[DB] Loaded ${stored.length} master records.`);
                } else {
                    // Try to load product master from public folder when DB is empty
                    try {
                        const publicPaths = [
                            '/product_master.csv',
                            '/product_master.xlsx',
                            '/master.csv',
                            '/master.xlsx'
                        ];
                        for (const p of publicPaths) {
                            try {
                                const res = await fetch(p);
                                if (!res.ok) continue;
                                const buf = await res.arrayBuffer();
                                const file = new File([buf], p.split('/').pop() || 'product_master.csv', { type: 'application/octet-stream' });
                                const result = await parseProductMaster(file);
                                if (result.products && result.products.length > 0) {
                                    setMasterRecords(result.products);
                                    await DB.set(MASTER_STORAGE_KEY, result.products);
                                    console.log(`[Public] Loaded ${result.products.length} master records from ${p}`);
                                    break;
                                }
                            } catch (e) {
                                console.warn('Failed to fetch/parse public master file', p, e);
                            }
                        }
                    } catch (e) {
                        console.warn('No public master fallback found', e);
                    }
                }
            } catch (e) {
                console.error("Failed to load master data", e);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        loadData();
        return () => { isMounted = false; };
    }, []);

    const saveMaster = useCallback(async (data: ProductMaster[]) => {
        try {
            await DB.set(MASTER_STORAGE_KEY, data);
            console.log(`[DB] Saved ${data.length} master records.`);
        } catch (e) {
            console.error("Failed to save master data", e);
            alert("상품 목록 저장 실패");
        }
    }, []);

    const addMasterRecords = useCallback((newRecords: ProductMaster[]) => {
        setMasterRecords(prev => {
            // Merge logic: Barcode is unique key
            const existingMap = new Map();
            prev.forEach(r => existingMap.set(r.barcode, r));

            let addedCount = 0;
            let updatedCount = 0;

            newRecords.forEach(newItem => {
                const key = newItem.barcode;
                if (!key) return; // Skip invalid barcode

                if (existingMap.has(key)) {
                    // Update existing (overwrite)
                    existingMap.set(key, { ...existingMap.get(key), ...newItem });
                    updatedCount++;
                } else {
                    existingMap.set(key, newItem);
                    addedCount++;
                }
            });

            console.log(`Merged Master: ${addedCount} added, ${updatedCount} updated.`);
            const merged = Array.from(existingMap.values());

            saveMaster(merged);
            return merged;
        });
    }, [saveMaster]);

    const clearMaster = useCallback(async () => {
        if (confirm("상품 목록을 초기화하시겠습니까?")) {
            setMasterRecords([]);
            await DB.delete(MASTER_STORAGE_KEY);
        }
    }, []);

    return {
        masterRecords,
        addMasterRecords,
        clearMaster,
        isLoading
    };
}
