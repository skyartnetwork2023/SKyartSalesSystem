import { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend
} from 'recharts';
import { useTheme } from '../../contexts/ThemeContext';

const COLOR_SETS = {
  light: ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0ea5e9', '#eab308', '#dc2626', '#14b8a6', '#64748b', '#7c3aed'],
  dark: ['#93c5fd', '#86efac', '#d8b4fe', '#fdba74', '#67e8f9', '#fde68a', '#fca5a5', '#5eead4', '#cbd5f5', '#c4b5fd']
};

const RADIAN = Math.PI / 180;

const buildLabelRenderer = (labelColor: string) => ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill={labelColor}
      fontSize="12"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
    >
      {`${name} ${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function PieSection({ loading, data, selectedYear }: any) {
  const { theme } = useTheme();
  const palette = COLOR_SETS[theme];
  const tooltipStyle = useMemo(() => ({
    backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
    border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`,
    borderRadius: 12,
    color: theme === 'dark' ? '#f8fafc' : '#0f172a',
    boxShadow: '0 15px 35px rgba(15,23,42,0.18)'
  }), [theme]);

  const labelRenderer = useMemo(
    () => buildLabelRenderer(theme === 'dark' ? '#f8fafc' : '#0f172a'),
    [theme]
  );

  return (
    <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40 text-slate-900 dark:text-slate-100">
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
        Total Amount by Data Plan
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Year {selectedYear}</p>

      {loading ? (
        <p className="text-slate-600 dark:text-slate-400">Loading...</p>
      ) : data.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-400">No data for {selectedYear}.</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              dataKey="value"
              nameKey="name"
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={110}
              innerRadius={40}
              labelLine={false}
              label={labelRenderer}
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>

            <Tooltip
              separator=": "
              contentStyle={tooltipStyle}
              itemStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}
              labelStyle={{ color: theme === 'dark' ? '#94a3b8' : '#475569' }}
            />
            <Legend wrapperStyle={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
