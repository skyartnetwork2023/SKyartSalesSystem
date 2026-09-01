import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  Tooltip
} from 'recharts';
import { useTheme } from '../../contexts/ThemeContext';

const BAR_COLORS = {
  light: { low: '#ef4444', mid: '#2563eb', high: '#22c55e' },
  dark: { low: '#fca5a5', mid: '#93c5fd', high: '#86efac' }
} satisfies Record<string, { low: string; mid: string; high: string }>;

export default function BarSection({ loading, data, selectedYear }: any) {
  const { theme } = useTheme();
  const palette = BAR_COLORS[theme];
  const tooltipStyle = useMemo(() => ({
    backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
    border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`,
    borderRadius: 12,
    color: theme === 'dark' ? '#f8fafc' : '#0f172a',
    boxShadow: '0 15px 35px rgba(15,23,42,0.18)'
  }), [theme]);
  const thresholdLegend = [
    { label: '< 700k TZS', color: palette.low },
    { label: '700k–899k TZS', color: palette.mid },
    { label: '≥ 900k TZS', color: palette.high },
  ];

  const axisColor = theme === 'dark' ? '#cbd5f5' : '#475569';
  const gridColor = theme === 'dark' ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.35)';

  return (
    <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40 text-slate-900 dark:text-slate-100">
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
        Monthly Total Amounts
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Year {selectedYear}</p>

      {loading ? (
        <p className="text-slate-600 dark:text-slate-400">Loading...</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm font-medium">
            {thresholdLegend.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            margin={{ top: 10, right: 24, left: 36, bottom: 16 }}
            style={{ overflow: 'visible' }}
          >
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" stroke={axisColor} tick={{ fill: axisColor }} axisLine={{ stroke: axisColor }} />
            <YAxis
              stroke={axisColor}
              tick={{ fill: axisColor }}
              axisLine={{ stroke: axisColor }}
              width={80}
              tickMargin={12}
              tickFormatter={(val: number) => val.toLocaleString()}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}
              labelStyle={{ color: theme === 'dark' ? '#94a3b8' : '#475569' }}
            />

            <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
              {data.map((row: { amount: number }, index: number) => {
                const value = row.amount ?? 0;
                const fill = value < 700000
                  ? palette.low
                  : value < 900000
                    ? palette.mid
                    : palette.high;
                return <Cell key={`bar-${index}`} fill={fill} />;
              })}
            </Bar>
          </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
