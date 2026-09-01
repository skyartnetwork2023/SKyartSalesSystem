import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { useTheme } from '../../contexts/ThemeContext';

export interface MonthlyForecastRow {
  month: string;
  actual: number;
  predicted: number;
  deviation: number;
}

interface MonthlyForecastSectionProps {
  loading: boolean;
  data: MonthlyForecastRow[];
  selectedYear: number;
}

export default function MonthlyForecastSection({ loading, data, selectedYear }: MonthlyForecastSectionProps) {
  const { theme } = useTheme();
  const axisColor = theme === 'dark' ? '#cbd5f5' : '#475569';
  const gridColor = theme === 'dark' ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.35)';
  const tooltipStyle = useMemo(() => ({
    backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
    border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`,
    borderRadius: 12,
    color: theme === 'dark' ? '#f8fafc' : '#0f172a',
    boxShadow: '0 15px 35px rgba(15,23,42,0.18)'
  }), [theme]);
  const labelStyle = { color: theme === 'dark' ? '#94a3b8' : '#475569' };
  const itemStyle = { color: theme === 'dark' ? '#f8fafc' : '#0f172a' };

  const formatCurrency = (value: number) => value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as MonthlyForecastRow;
    return (
      <div className="text-xs px-3 py-2 rounded shadow space-y-1" style={tooltipStyle}>
        <p className="text-sm font-semibold">{label} {selectedYear}</p>
        <p>Actual: {formatCurrency(row.actual)} TZS</p>
        <p>Predicted: {formatCurrency(row.predicted)} TZS</p>
        <p>
          Difference: {row.deviation >= 0 ? '+' : '−'}
          {formatCurrency(Math.abs(row.deviation))} TZS
        </p>
      </div>
    );
  };

  return (
    <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40 text-slate-900 dark:text-slate-100">
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
        Predicted vs Actual Voucher Sales
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Monthly totals for {selectedYear}</p>

      {loading ? (
        <p className="text-slate-600 dark:text-slate-400">Loading...</p>
      ) : (
        data.length ? (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={data} margin={{ top: 20, right: 24, left: 48, bottom: 16 }}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke={axisColor} tick={{ fill: axisColor }} axisLine={{ stroke: axisColor }} />
              <YAxis
                stroke={axisColor}
                tick={{ fill: axisColor }}
                axisLine={{ stroke: axisColor }}
                width={92}
                tickMargin={12}
                tickFormatter={formatCurrency}
              />
              <Tooltip content={renderTooltip} itemStyle={itemStyle} labelStyle={labelStyle} />
              <Legend wrapperStyle={{ color: axisColor }} />
              <Bar dataKey="deviation" name="Actual - Predicted" barSize={18} radius={[4, 4, 0, 0]}>
                {data.map((row, index) => (
                  <Cell key={`gap-${index}`} fill={row.deviation >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ r: 3 }}
                name="Actual"
              />
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#f97316"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
                name="Predicted"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-600 dark:text-slate-400">Add voucher entries to see projected trends.</p>
        )
      )}
    </div>
  );
}
