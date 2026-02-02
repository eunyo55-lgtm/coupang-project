import { useMemo } from 'react';
import {

    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart
} from 'recharts';
import { format } from 'date-fns';
import type { DailyTrend } from '../utils/analytics';

interface SalesTrendChartProps {
    data: DailyTrend[];
}

export function SalesTrendChart({ data }: SalesTrendChartProps) {
    // Format dates for display
    const chartData = useMemo(() => {
        return data.map(d => ({
            ...d,
            displayDate: format(new Date(d.date), 'MM/dd')
        }));
    }, [data]);

    if (!data || data.length === 0) {
        return (
            <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                데이터가 없습니다.
            </div>
        );
    }

    return (
        <div style={{ height: '400px', width: '100%', padding: '1rem 0' }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                        dataKey="displayDate"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                    />
                    <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        formatter={(value: any) => [Number(value || 0).toLocaleString() + '개', '판매량']}
                        labelStyle={{ color: '#64748b', marginBottom: '0.25rem' }}
                    />

                    <Area
                        type="monotone"
                        dataKey="sales"
                        name="일자별 판매량"
                        stroke="#4f46e5"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorSales)"
                        animationDuration={1000}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
