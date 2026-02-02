import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { LayoutDashboard, Package, Settings, LogOut, Database, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, List, Truck } from 'lucide-react'
import './index.css'
import { DataUploader } from './components/DataUploader'
import { useSalesData } from './hooks/useSalesData'
import { useProductMaster } from './hooks/useProductMaster'
import { getDashboardStats, getProductSummary, groupProductsByName, getDailyTrend, getInventoryRiskAnalysis } from './utils/analytics'
import type { SalesRecord, ProductMaster, InboundRecord } from './utils/excelParser'
import { SalesTrendChart } from './components/SalesTrendChart'

function formatDateShort(dateStr: string) {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('-')) return '-';
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { records, addRecords, clearData } = useSalesData();
  const { masterRecords, addMasterRecords, clearMaster } = useProductMaster();
  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([]);

  const handleDataUpload = (newRecords: any[]) => {
    addRecords(newRecords);
    alert(`데이터 ${newRecords.length}건이 성공적으로 추가되었습니다.`);
  };

  const handleMasterUpload = (newProducts: ProductMaster[]) => {
    // Merge or Overwrite? Let's overwrite for simplicity as Master is typically a full snapshot
    // But to be safe, let's allow overwrite. Assuming the user uploads the full master file.
    addMasterRecords(newProducts);
    alert(`상품 마스터 ${newProducts.length}건이 등록되었습니다.`);
  };

  const handleInboundUpload = (newInbound: InboundRecord[]) => {
    setInboundRecords(newInbound);
    alert(`입고 예정 내역 ${newInbound.length}건이 등록되었습니다.`);
  };

  // Pagination & Grouping State
  const [visibleCount, setVisibleCount] = useState(50);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };

  // Sidebar Resize Logic
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const isResizing = useRef(false);

  // Resize Handlers
  const startResizing = () => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; // Prevent selection
  };

  const stopResizing = () => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  const resize = (e: MouseEvent) => {
    if (isResizing.current) {
      const newWidth = Math.max(200, Math.min(e.clientX, 600)); // Clamp width
      setSidebarWidth(newWidth);
    }
  };

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, []);

  const stats = useMemo(() => getDashboardStats(records), [records]);
  const productList = useMemo(() => getProductSummary(records, masterRecords), [records, masterRecords]);
  const productGroups = useMemo(() => groupProductsByName(productList), [productList]);


  // Date Logic: Show ALL dates that have at least one sale
  const uniqueDates = useMemo(() => {
    if (!records) return [];

    // Filter out dates with 0 total sales across ALL products
    const dateSalesMap = new Map<string, number>();
    records.forEach(r => {
      if (r.date) {
        dateSalesMap.set(r.date, (dateSalesMap.get(r.date) || 0) + r.salesQty);
      }
    });

    const validDates = Array.from(dateSalesMap.entries())
      .filter(([_, total]) => total > 0)
      .map(([date]) => date);

    return validDates.sort();
  }, [records]);

  const latestDate = records && records.length > 0 ? records[records.length - 1]?.date : '-';

  // Sorting Logic
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'cumulativeSales', direction: 'desc' });

  const sortedProductGroups = useMemo(() => {
    let sortable = [...productGroups];
    if (sortConfig !== null) {
      sortable.sort((a, b) => {
        // Map sort keys to Group properties
        let valA: any = '';
        let valB: any = '';

        if (sortConfig.key === 'productName') {
          valA = a.groupName;
          valB = b.groupName;
        } else if (sortConfig.key === 'cumulativeSales') {
          valA = a.totalCumulativeSales;
          valB = b.totalCumulativeSales;
        } else if (sortConfig.key === 'hqInventory') {
          valA = a.totalHqInventory;
          valB = b.totalHqInventory;
        } else if (sortConfig.key === 'coupangInventory') {
          valA = a.totalCoupangInventory;
          valB = b.totalCoupangInventory;
        } else {
          // Dynamic Date Sort
          valA = a.dailySalesMap[sortConfig.key] || 0;
          valB = b.dailySalesMap[sortConfig.key] || 0;
        }

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [productGroups, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc'; // Default to desc for numbers usually, but let's stick to toggle
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    } else if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return <ArrowUpDown size={14} style={{ opacity: 0.3, minWidth: '14px' }} />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={14} style={{ minWidth: '14px' }} /> : <ArrowDown size={14} style={{ minWidth: '14px' }} />;
  };

  const tableAggregations = useMemo(() => {
    const aggs = {
      totalHqInventory: 0,
      totalCoupangInventory: 0,
      totalCumulativeSales: 0,
      dailySalesSums: {} as Record<string, number>
    };

    sortedProductGroups.forEach(group => {
      aggs.totalHqInventory += group.totalHqInventory;
      aggs.totalCoupangInventory += group.totalCoupangInventory;
      aggs.totalCumulativeSales += group.totalCumulativeSales;

      Object.entries(group.dailySalesMap).forEach(([date, sales]) => {
        aggs.dailySalesSums[date] = (aggs.dailySalesSums[date] || 0) + sales;
      });
    });

    return aggs;
  }, [sortedProductGroups]);

  const handleLoadMore = () => {
    setVisibleCount(prev => prev + 50);
  };


  const trendData = useMemo(() => getDailyTrend(records), [records]);
  const inventoryRisks = useMemo(() => getInventoryRiskAnalysis(records, masterRecords, inboundRecords), [records, masterRecords, inboundRecords]);
  const dangerousRisks = useMemo(() => inventoryRisks.filter(r => r.status === 'Danger'), [inventoryRisks]);

  // Inventory Sorting
  const [invSortConfig, setInvSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  const sortedDangerousRisks = useMemo(() => {
    let sortable = [...dangerousRisks];
    if (invSortConfig !== null) {
      sortable.sort((a, b) => {
        const key = invSortConfig.key as keyof typeof a;
        let valA: any = a[key];
        let valB: any = b[key];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return invSortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return invSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [dangerousRisks, invSortConfig]);

  // Inventory Expansion
  const [expandedRisks, setExpandedRisks] = useState<Set<string>>(new Set());

  const toggleRisk = (productName: string) => {
    setExpandedRisks(prev => {
      const next = new Set(prev);
      if (next.has(productName)) next.delete(productName);
      else next.add(productName);
      return next;
    });
  };

  const requestInvSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (invSortConfig && invSortConfig.key === key && invSortConfig.direction === 'desc') {
      direction = 'asc';
    } else if (invSortConfig && invSortConfig.key === key && invSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setInvSortConfig({ key, direction });
  };

  const getInvSortIcon = (key: string) => {
    if (!invSortConfig || invSortConfig.key !== key) return <ArrowUpDown size={14} style={{ opacity: 0.3, minWidth: '14px' }} />;
    return invSortConfig.direction === 'asc' ? <ArrowUp size={14} style={{ minWidth: '14px' }} /> : <ArrowDown size={14} style={{ minWidth: '14px' }} />;
  };

  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        className="glass"
        style={{ width: `${sidebarWidth}px`, position: 'fixed', height: '100vh', padding: '2rem', display: 'flex', flexDirection: 'column', zIndex: 10, borderRight: '1px solid rgba(255,255,255,0.2)' }}
      >
        <div className="brand" style={{ marginBottom: '3rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', background: 'var(--secondary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>C</div>
          <h1 style={{ fontSize: '1.25rem', color: 'var(--primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Sales Manager</h1>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <NavItem icon={<LayoutDashboard size={20} />} label="대시보드" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<List size={20} />} label="상품별 현황" active={activeTab === 'products'} onClick={() => setActiveTab('products')} />
          <NavItem icon={<Package size={20} />} label="재고 관리" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
        </nav>
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
          <NavItem icon={<Settings size={20} />} label="설정/데이터" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={startResizing}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '5px',
            cursor: 'col-resize',
            zIndex: 100,
            background: 'transparent'
          }}
          className="resize-handle"
        />
      </aside>

      <main style={{ flex: 1, marginLeft: `${sidebarWidth}px`, padding: '2rem', minWidth: 0 }}>
        <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.875rem' }}>
              {activeTab === 'dashboard' && '대시보드'}
              {activeTab === 'products' && '상품별 현황'}
              {activeTab === 'inventory' && '재고 효율성 분석'}
              {activeTab === 'settings' && '데이터 설정'}
            </h2>
            <p style={{ color: 'var(--text-secondary)' }}>오늘의 판매 현황을 한눈에 확인하세요.</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {activeTab !== 'dashboard' && (
              <>
                <DataUploader onUploadSuccess={handleDataUpload} mode="sales" compact={true} />
                <DataUploader onUploadSuccess={handleMasterUpload} mode="master" compact={true} />
                <DataUploader onUploadSuccess={handleInboundUpload} mode="inbound" compact={true} />
              </>
            )}
          </div>
        </header>

        <div className="content-area animate-fade-in" style={{ paddingBottom: '3rem' }}>
          {activeTab === 'dashboard' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
              <div className="card">
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>전일 판매량 ({formatDateShort(latestDate)})</h4>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '0.5rem', color: 'var(--primary)' }}>{stats.prevDaySales.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>개</span></div>
              </div>
              <div className="card">
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>이번 주 판매량 <span style={{ fontSize: '0.8rem' }}>({stats.thisWeekLabel})</span></h4>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '0.5rem', color: 'var(--primary)' }}>{stats.thisWeekSales.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>개</span></div>
              </div>
              <div className="card">
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>지난 주 판매량 <span style={{ fontSize: '0.8rem' }}>({stats.lastWeekLabel})</span></h4>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '0.5rem', color: '#64748b' }}>{stats.lastWeekSales.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>개</span></div>
              </div>
              <div className="card">
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>전일 재고 (쿠팡)</h4>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '0.5rem', color: '#64748b' }}>{stats.prevDayInventory.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>개</span></div>
              </div>

              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>일별 판매 추이</h3>
                  <div style={{ fontSize: '0.9rem', color: '#64748b' }}>최근 30일 데이터</div>
                </div>
                <div style={{ height: '400px' }}>
                  <SalesTrendChart data={trendData} />
                </div>
              </div>

              {/* Top 10 Lists */}
              {/* Top 10 Lists */}
              <div className="card">
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🔥 판매량 Best 10
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {[...productGroups]
                    .sort((a, b) => b.totalCumulativeSales - a.totalCumulativeSales)
                    .slice(0, 10)
                    .map((item, idx) => (
                      <div key={item.groupName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: idx < 3 ? '#fff7ed' : '#f8fafc', borderRadius: '0.5rem', border: idx < 3 ? '1px solid #fdba74' : '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                          <div style={{ width: '24px', height: '24px', background: idx < 3 ? '#f97316' : '#cbd5e1', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0 }}>
                            {idx + 1}
                          </div>
                          {item.imageUrl && (
                            <img src={item.imageUrl} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #eee', flexShrink: 0 }} />
                          )}
                          <div style={{ fontWeight: 600, color: '#334155', wordBreak: 'keep-all', lineHeight: 1.3 }}>
                            {item.groupName}
                          </div>
                        </div>
                        <div style={{ fontWeight: 'bold', color: 'var(--primary)', whiteSpace: 'nowrap', marginLeft: '1rem' }}>
                          {item.totalCumulativeSales.toLocaleString()}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="card">
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📦 쿠팡 재고 Best 10
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {[...productGroups]
                    .sort((a, b) => b.totalCoupangInventory - a.totalCoupangInventory)
                    .slice(0, 10)
                    .map((item, idx) => (
                      <div key={item.groupName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                          <div style={{ width: '24px', height: '24px', background: '#94a3b8', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0 }}>
                            {idx + 1}
                          </div>
                          {item.imageUrl && (
                            <img src={item.imageUrl} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #eee', flexShrink: 0 }} />
                          )}
                          <div style={{ fontWeight: 600, color: '#334155', wordBreak: 'keep-all', lineHeight: 1.3 }}>
                            {item.groupName}
                          </div>
                        </div>
                        <div style={{ fontWeight: 'bold', color: '#475569', whiteSpace: 'nowrap', marginLeft: '1rem' }}>
                          {item.totalCoupangInventory.toLocaleString()}
                        </div>
                      </div>
                    ))}
                </div>
              </div>



              {/* Weekly Stats Summary */}


            </div>
          )}

          {activeTab === 'products' && (
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h3 style={{ margin: 0 }}>상품별 현황</h3>
              </div>

              <div style={{ overflowX: 'auto', marginTop: '1.5rem', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', position: 'relative' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.9rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '0.75rem', width: '40px', position: 'sticky', left: 0, top: 0, zIndex: 30, background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}></th>
                      <th style={{ padding: '0.75rem', whiteSpace: 'nowrap', position: 'sticky', left: '40px', top: 0, zIndex: 30, background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>이미지</th>

                      <th
                        style={{ padding: '0.75rem', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', position: 'sticky', left: '100px', top: 0, zIndex: 30, background: '#f8fafc', borderBottom: '2px solid #e2e8f0', minWidth: '200px', borderRight: '1px solid #e2e8f0' }}
                        onClick={() => requestSort('productName')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          상품명 {getSortIcon('productName')}
                        </div>
                      </th>

                      <th
                        style={{ padding: '0.75rem', textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}
                        onClick={() => requestSort('hqInventory')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                          본사 재고 {getSortIcon('hqInventory')}
                        </div>
                      </th>

                      <th
                        style={{ padding: '0.75rem', textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}
                        onClick={() => requestSort('coupangInventory')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                          쿠팡 재고 {getSortIcon('coupangInventory')}
                        </div>
                      </th>

                      <th
                        style={{ padding: '0.75rem', textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}
                        onClick={() => requestSort('cumulativeSales')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                          누적 판매량 {getSortIcon('cumulativeSales')}
                        </div>
                      </th>

                      {uniqueDates.map(date => (
                        <th
                          key={date}
                          style={{ padding: '0.75rem', textAlign: 'center', minWidth: '60px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}
                          onClick={() => requestSort(date)}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                            <span>{formatDateShort(date)}</span>
                            {getSortIcon(date)}
                          </div>
                        </th>
                      ))}
                    </tr>
                    {/* Total Sum Row */}
                    <tr style={{ background: '#f0f9ff', fontWeight: 'bold' }}>
                      <td style={{ padding: '0.75rem', position: 'sticky', left: 0, top: '53px', zIndex: 30, background: '#f0f9ff', borderBottom: '2px solid #e2e8f0' }}></td>
                      <td style={{ padding: '0.75rem', position: 'sticky', left: '40px', top: '53px', zIndex: 30, background: '#f0f9ff', borderBottom: '2px solid #e2e8f0' }}></td>
                      <td style={{ padding: '0.75rem', position: 'sticky', left: '100px', top: '53px', zIndex: 30, background: '#f0f9ff', borderBottom: '2px solid #e2e8f0', borderRight: '1px solid #e0f2fe', color: 'var(--primary)' }}>
                        합계
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', position: 'sticky', top: '53px', zIndex: 20, background: '#f0f9ff', borderBottom: '2px solid #e2e8f0', color: 'var(--text-secondary)' }}>
                        {tableAggregations.totalHqInventory.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', position: 'sticky', top: '53px', zIndex: 20, background: '#f0f9ff', borderBottom: '2px solid #e2e8f0', color: 'var(--text-secondary)' }}>
                        {tableAggregations.totalCoupangInventory.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', position: 'sticky', top: '53px', zIndex: 20, background: '#f0f9ff', borderBottom: '2px solid #e2e8f0', color: 'var(--primary)' }}>
                        {tableAggregations.totalCumulativeSales.toLocaleString()}
                      </td>
                      {uniqueDates.map(date => (
                        <td key={date} style={{ padding: '0.75rem', textAlign: 'center', position: 'sticky', top: '53px', zIndex: 20, background: '#f0f9ff', borderBottom: '2px solid #e2e8f0', color: 'var(--text-secondary)' }}>
                          {(tableAggregations.dailySalesSums[date] || 0).toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProductGroups.length === 0 ? (
                      <tr><td colSpan={6 + uniqueDates.length} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>데이터가 없습니다.</td></tr>
                    ) : (
                      sortedProductGroups.slice(0, visibleCount).map((group) => {
                        const isExpanded = expandedGroups.has(group.groupName);
                        return (
                          <>
                            <tr key={group.groupName} style={{ background: '#fff' }}>
                              <td style={{ padding: '0.5rem', textAlign: 'center', position: 'sticky', left: 0, background: '#fff', zIndex: 10, borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>
                                <button
                                  onClick={() => toggleGroup(group.groupName)}
                                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}
                                >
                                  {isExpanded ? <ChevronDown size={16} /> : <div style={{ transform: 'rotate(-90deg)' }}><ChevronDown size={16} /></div>}
                                </button>
                              </td>
                              <td style={{ padding: '0.5rem', position: 'sticky', left: '40px', background: '#fff', zIndex: 10, borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>
                                {group.imageUrl ? (
                                  <img src={group.imageUrl} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #eee' }} />
                                ) : (
                                  <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}><Package size={16} /></div>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', position: 'sticky', left: '100px', background: '#fff', zIndex: 10, minWidth: '200px', borderRight: '1px solid #f1f5f9', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>
                                {group.groupName} <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 400 }}>({group.items.length}개 옵션)</span>
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4b5563', whiteSpace: 'nowrap', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>
                                {group.totalHqInventory > 0 ? group.totalHqInventory.toLocaleString() : '-'}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>
                                {group.totalCoupangInventory.toLocaleString()}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>
                                <span style={{ background: 'var(--primary)', color: 'white', padding: '0.15rem 0.6rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                  {group.totalCumulativeSales.toLocaleString()}
                                </span>
                              </td>
                              {uniqueDates.map(date => (
                                <td key={date} style={{ padding: '0.75rem', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>
                                  {group.dailySalesMap[date] ? group.dailySalesMap[date].toLocaleString() : '-'}
                                </td>
                              ))}
                            </tr>

                            {isExpanded && group.items.map(item => (
                              <tr key={item.barcode} style={{ background: '#f8fafc' }}>
                                <td style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 10, borderBottom: '1px solid #f1f5f9' }} />
                                <td style={{ position: 'sticky', left: '40px', background: '#f8fafc', zIndex: 10, borderBottom: '1px solid #f1f5f9' }} />
                                <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap', position: 'sticky', left: '100px', background: '#f8fafc', zIndex: 10, borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
                                  └ {item.barcode}
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>
                                  {item.hqInventory > 0 ? item.hqInventory.toLocaleString() : '-'}
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.85rem', color: item.coupangInventory < 5 ? 'var(--danger)' : '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>
                                  {item.coupangInventory.toLocaleString()}
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>
                                  {item.cumulativeSales.toLocaleString()}
                                </td>
                                {uniqueDates.map(date => (
                                  <td key={date} style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontSize: '0.85rem', color: '#94a3b8', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>
                                    {item.dailySalesMap[date] ? item.dailySalesMap[date].toLocaleString() : '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </>
                        );
                      })
                    )}
                  </tbody>
                </table>

                {sortedProductGroups.length > visibleCount && (
                  <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <button
                      onClick={handleLoadMore}
                      className="btn"
                      style={{
                        background: 'white',
                        border: '1px solid var(--primary)',
                        color: 'var(--primary)',
                        padding: '0.75rem 2rem',
                        borderRadius: '2rem',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s'
                      }}
                    >
                      더 보기 ({visibleCount} / {sortedProductGroups.length}) <ChevronDown size={18} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <h3 style={{ margin: 0 }}>재고 부족 예상 알림</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    최근 판매 추세를 기반으로 7일 후 재고 부족 여부를 예측합니다.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fee2e2' }}></span> 부족 예상
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fef3c7' }}></span> 여유 적음 (14일분 미만)
                  </div>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '0.75rem', width: '40px', borderBottom: '2px solid #e2e8f0' }}></th>
                    <th
                      style={{ padding: '0.75rem', width: '60px', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}
                    >
                      이미지
                    </th>

                    <th
                      style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      onClick={() => requestInvSort('productName')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>상품명 {getInvSortIcon('productName')}</div>
                    </th>

                    <th
                      style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      onClick={() => requestInvSort('currentInventory')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>현재 재고 {getInvSortIcon('currentInventory')}</div>
                    </th>

                    <th
                      style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#059669', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      onClick={() => requestInvSort('inboundQty')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>공급 예정 {getInvSortIcon('inboundQty')}</div>
                    </th>

                    <th
                      style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      onClick={() => requestInvSort('avg7Days')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>최근 7일 평균 {getInvSortIcon('avg7Days')}</div>
                    </th>

                    <th
                      style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      onClick={() => requestInvSort('prevDaySales')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>전일 판매 {getInvSortIcon('prevDaySales')}</div>
                    </th>

                    <th
                      style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: 'var(--primary)', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      onClick={() => requestInvSort('weightedDailyAvg')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>일평균(가중) {getInvSortIcon('weightedDailyAvg')}</div>
                    </th>

                    <th
                      style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      onClick={() => requestInvSort('expectedDemand7Days')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>필요수량(7일) {getInvSortIcon('expectedDemand7Days')}</div>
                    </th>

                    <th
                      style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e2e8f0', background: '#eff6ff', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      onClick={() => requestInvSort('expectedBalance7Days')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>7일 후 부족 {getInvSortIcon('expectedBalance7Days')}</div>
                    </th>

                    <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDangerousRisks.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>현재 재고 부족 위기 상품이 없습니다. 🎉</td></tr>
                  ) : (
                    sortedDangerousRisks.map((item, idx) => {
                      const isExpanded = expandedRisks.has(item.productName);
                      return (
                        <Fragment key={idx}>
                          <tr style={{ background: '#fff' }}>
                            <td style={{ padding: '0.5rem', textAlign: 'center', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>
                              <button
                                onClick={() => toggleRisk(item.productName)}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}
                              >
                                {isExpanded ? <ChevronDown size={16} /> : <div style={{ transform: 'rotate(-90deg)' }}><ChevronDown size={16} /></div>}
                              </button>
                            </td>
                            <td style={{ padding: '0.5rem', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                              ) : (
                                <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={16} color="#cbd5e1" /></div>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem', fontWeight: 600, borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>{item.productName}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>{item.currentInventory.toLocaleString()}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: '#059669', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9', fontWeight: item.inboundQty > 0 ? 'bold' : 'normal' }}>{item.inboundQty > 0 ? `+${item.inboundQty.toLocaleString()}` : '-'}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: '#64748b', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>{item.avg7Days.toFixed(1)}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: '#64748b', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>{item.prevDaySales}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>{item.weightedDailyAvg.toFixed(1)}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: '#64748b', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>{Math.ceil(item.expectedDemand7Days).toLocaleString()}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9', background: '#eff6ff', color: item.expectedBalance7Days < 0 ? 'var(--danger)' : 'var(--primary)' }}>
                              {item.expectedBalance7Days < 0 ? Math.abs(Math.round(item.expectedBalance7Days)).toLocaleString() : '-'}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'center', borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}></td>
                          </tr>
                          {isExpanded && item.items && item.items.map((subItem: any, subIdx: number) => (
                            <tr key={subItem.barcode} style={{ background: '#f8fafc', fontSize: '0.85rem' }}>
                              <td style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}></td>
                              <td style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
                                <div style={{ width: '6px', height: '6px', background: '#cbd5e1', borderRadius: '50%', margin: '0 auto' }}></div>
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingLeft: '2rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span>{subItem.productName}</span>
                                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{subItem.barcode}</span>
                                </div>
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                                {subItem.currentInventory.toLocaleString()}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                                {subItem.inboundQty > 0 ? `+${subItem.inboundQty.toLocaleString()}` : '-'}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>
                                {subItem.avg7Days.toFixed(1)}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>
                                {subItem.prevDaySales}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                                {subItem.weightedDailyAvg.toFixed(1)}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>
                                {Math.ceil(subItem.expectedDemand7Days).toLocaleString()}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: subItem.expectedBalance7Days < 0 ? '#ef4444' : '#64748b' }}>
                                {subItem.expectedBalance7Days < 0 ? Math.abs(Math.round(subItem.expectedBalance7Days)).toLocaleString() : '-'}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>
                                {subItem.status === 'Danger' && <span style={{ color: '#b91c1c', fontSize: '0.75rem', fontWeight: 'bold' }}>부족</span>}
                                {subItem.status === 'Warning' && <span style={{ color: '#d97706', fontSize: '0.75rem', fontWeight: 'bold' }}>주의</span>}
                                {subItem.status === 'Safe' && <span style={{ color: '#15803d', fontSize: '0.75rem' }}>안전</span>}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'settings' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div className="card">
                <h3 style={{ marginBottom: '1rem' }}>데이터 초기화</h3>
                <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                  <button onClick={clearData} className="btn" style={{ background: '#fee2e2', color: '#b91c1c' }}><LogOut size={16} /> 판매 데이터 삭제</button>
                  <button onClick={clearMaster} className="btn" style={{ background: '#fef3c7', color: '#d97706' }}><Database size={16} /> 상품 목록 삭제</button>
                  <button onClick={() => setInboundRecords([])} className="btn" style={{ background: '#dbeafe', color: '#1e40af' }}><Truck size={16} /> 입고 예정 삭제</button>
                </div>
              </div>
              <div className="card">
                <h3 style={{ marginBottom: '1rem' }}>파일 가이드</h3>
                <ul style={{ paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
                  <li><strong>판매 데이터:</strong> 바코드, 판매량, 재고(쿠팡)</li>
                  <li><strong>상품 목록:</strong> 바코드, 상품명, 이미지URL, 본사재고</li>
                  <li><strong>입고 예정:</strong> 바코드, 상품명, 공급수량</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </main >
    </div >
  )
}

function NavItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', width: '100%', border: 'none', background: active ? 'linear-gradient(90deg, rgba(79, 70, 229, 0.1) 0%, transparent 100%)' : 'transparent', borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent', color: active ? 'var(--primary)' : 'var(--text-secondary)', fontSize: '1rem', fontWeight: active ? 600 : 500, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {icon} <span style={{ opacity: 1, transition: 'opacity 0.2s' }}>{label}</span>
    </button>
  )
}
export default App
