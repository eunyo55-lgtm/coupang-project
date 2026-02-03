import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// 1. Supabase 연결 설정 (Vercel에 넣은 환경 변수를 자동으로 읽어옵니다)
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
        // 2. 3개 테이블 데이터를 동시에 가져오기
        const [prodRes, salesRes, supplyRes] = await Promise.all([
          supabase.from('product_master').select('*'),
          supabase.from('sales_data').select('*'),
          supabase.from('supply_status').select('*')
        ]);

        if (prodRes.data) {
          // 3. 바코드(SKU ID)를 기준으로 데이터 합치기
          const combined = prodRes.data.map(product => {
            // 판매량 합산 (sales_data 테이블의 SKU ID와 일치하는 것 찾기)
            const relevantSales = salesRes.data?.filter(s => s['SKU ID'] === product.barcode) || [];
            const totalSales = relevantSales.reduce((acc, curr) => acc + (Number(curr['수량']) || 0), 0);
            
            // 공급 상태 연결
            const supply = supplyRes.data?.find(sup => sup.barcode === product.barcode);

            return {
              ...product,
              totalSales,
              status: supply?.status || '정보없음',
              stock: supply?.stock_count || 0
            };
          });

          setMasterRecords(combined);
        }
      } catch (error) {
        console.error('클라우드 데이터 로딩 에러:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCloudData();
  }, []);

  // 대시보드에서 필요로 하는 함수들 (기존 구조 유지)
  const addMasterRecords = () => {}; 
  const clearMaster = () => {};

  return {
    masterRecords,
    addMasterRecords,
    clearMaster,
    isLoading
  };
}