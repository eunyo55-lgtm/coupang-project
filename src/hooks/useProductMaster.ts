import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export function useProductMaster() {
  const [masterRecords, setMasterRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCloudData = async () => {
      setIsLoading(true);
      try {
        // 1. 세 테이블 데이터 동시 로드
        const [prodRes, salesRes, supplyRes] = await Promise.all([
          supabase.from('product_master').select('*'),
          supabase.from('sales_data').select('*'),
          supabase.from('supply_status').select('*')
        ]);

        if (prodRes.data) {
          const combined = prodRes.data.map(product => {
            // 2. 판매량 합산 (sales_data의 'SKU ID'와 product의 'barcode' 매칭)
            const relevantSales = salesRes.data?.filter(s => 
              String(s['SKU ID']) === String(product.barcode)
            ) || [];
            
            // 수량 합계 계산 (데이터 타입이 다를 수 있어 Number로 강제 변환)
            const totalSales = relevantSales.reduce((acc, curr) => 
              acc + (Number(curr['수량']) || 0), 0
            );
            
            // 3. 공급 상태 매칭 (supply_status의 'SKU ID'와 매칭)
            const supply = supplyRes.data?.find(sup => 
              String(sup['SKU ID']) === String(product.barcode)
            );

            return {
              ...product,
              productName: product.product_name, // 기존 앱 호환용
              totalSales: totalSales,
              status: supply ? '공급중' : '정보없음',
              stock: supply ? (Number(supply['발주수량']) || 0) : 0
            };
          });

          setMasterRecords(combined);
        }
      } catch (error) {
        console.error('데이터 통합 에러:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCloudData();
  }, []);

  return {
    masterRecords,
    addMasterRecords: () => {}, 
    clearMaster: () => {},
    isLoading
  };
}