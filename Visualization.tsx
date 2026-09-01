
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ComposedChart
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useUserScope } from '../contexts/UserScopeContext';
import { getVouchers } from '../lib/voucherService';
import { getForecastsByUser, ForecastRecord } from '../lib/forecastService';
import { generateFutureForecasts, YearlyTotal } from '../lib/forecastUtils';
import { useTheme } from '../contexts/ThemeContext';

export default function Visualization() {
  const { user } = useAuth();
  const { scopeUserId, readOnly, scopedProfile } = useUserScope();
  const { theme } = useTheme();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yearlyDetails, setYearlyDetails] = useState<Record<number, { vouchers: any[]; investment: any[]; capex: any[] }>>({});
  const [selectedDetailYear, setSelectedDetailYear] = useState<number | null>(null);
  const [forecastRecords, setForecastRecords] = useState<ForecastRecord[]>([]);
  const activeUserId = scopeUserId ?? user?.id ?? null;
  const viewingLabel = scopedProfile
    ? (scopedProfile.full_name && scopedProfile.full_name.trim()) || scopedProfile.email
    : user?.email ?? 'your account';
  const axisColor = theme === 'dark' ? '#cbd5f5' : '#475569';
  const gridColor = theme === 'dark' ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.25)';
  const tooltipStyle = useMemo(() => ({
    backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
    border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`,
    borderRadius: 12,
    color: theme === 'dark' ? '#f8fafc' : '#0f172a',
    boxShadow: '0 15px 35px rgba(15,23,42,0.18)'
  }), [theme]);
  const tooltipLabelStyle = { color: theme === 'dark' ? '#94a3b8' : '#475569' };
  const tooltipItemStyle = { color: theme === 'dark' ? '#f8fafc' : '#0f172a' };
  const secondaryTextClass = theme === 'dark' ? 'text-slate-300' : 'text-slate-600';
  const mutedTextClass = theme === 'dark' ? 'text-slate-400' : 'text-slate-500';

  useEffect(() => {
    let canceled = false;
    const fetchData = async () => {
      if (!activeUserId) {
        if (!canceled) {
          setData([]);
          setYearlyDetails({});
          setSelectedDetailYear(null);
          setForecastRecords([]);
          setError(user ? 'Select a user to see analytics.' : 'You are not authenticated to see analytics.');
        }
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const vouchers = await getVouchers({ userId: activeUserId ?? undefined });
        let forecasts: ForecastRecord[] = [];
        try {
          const fetchedForecasts = await getForecastsByUser(activeUserId);
          forecasts = fetchedForecasts ?? [];
        } catch (forecastError) {
          console.warn('Unable to load stored forecasts; continuing without them.', forecastError);
        }
        if (canceled) return;
        const userVouchers = (vouchers || []).filter((v: any) => v.user_id === activeUserId && v.data?.year);
        // Group by year
        const yearMap: Record<number, any> = {};
        userVouchers.forEach((v: any) => {
          const y = v.data.year;
          if (!yearMap[y]) yearMap[y] = { capex: [], opex: [], opexop: [], vouchers: [], investment: [] };
          if (v.data.capex) yearMap[y].capex = v.data.capex;
          if (v.data.opex) yearMap[y].opex = v.data.opex;
          if (v.data.opexop) yearMap[y].opexop = v.data.opexop;
          if (v.data.vouchers) yearMap[y].vouchers = v.data.vouchers;
          if (v.data.investment) yearMap[y].investment = v.data.investment;
        });
        const years = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
        const analytics = years.map((year) => {
          const capexRows = yearMap[year].capex || [];
          const capexTotal = capexRows.reduce((sum: number, row: any) => sum + (row.totalCost || 0), 0);
          const opexRows = yearMap[year].opex || [];
          const opexRecurring = opexRows.reduce((sum: number, row: any) => sum + (row.totalCost || 0), 0);
          const opexOpRows = yearMap[year].opexop || [];
          const opexOperation = opexOpRows.reduce((sum: number, row: any) => sum + (row.cost || 0), 0);
          const voucherRows = yearMap[year].vouchers || [];
          const voucherTotal = voucherRows.reduce((sum: number, v: any) => {
            const unit = Number(v.unitPrice || v.unit_price || 0);
            const totalCount = v.months ? Object.values(v.months).reduce((s: number, n: any) => s + (Number(n)||0), 0) : 0;
            return sum + unit * totalCount;
          }, 0);
          const investmentRows = yearMap[year].investment || [];
          const investmentTotal = investmentRows.reduce((sum: number, row: any) => sum + (row.totalCost || 0), 0);
          return {
            year,
            capexTotal,
            opexRecurring,
            opexOperation,
            opexGrand: opexRecurring + opexOperation,
            voucherTotal,
            investmentTotal,
            grandTotal: capexTotal + opexRecurring + opexOperation + voucherTotal + investmentTotal,
          };
        });
        setData(analytics);
        setYearlyDetails(yearMap);
        setForecastRecords(forecasts || []);
        const mostRecentYear = years.length ? years[years.length - 1] : null;
        setSelectedDetailYear((prev) => {
          if (prev && yearMap[prev]) return prev;
          return mostRecentYear ?? null;
        });
      } catch (e) {
        if (!canceled) {
          setError('Failed to load analytics from Supabase.');
          setData([]);
          setYearlyDetails({});
          setSelectedDetailYear(null);
          setForecastRecords([]);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    fetchData();
    return () => { canceled = true; };
  }, [activeUserId, user]);

  const barData = useMemo(() => data.map(d => ({
    year: d.year,
    Capex: d.capexTotal,
    'Opex (Recurring)': d.opexRecurring,
    'Opex (Operation)': d.opexOperation,
    Voucher: d.voucherTotal,
    Investment: d.investmentTotal,
    'Grand Total': d.grandTotal,
  })), [data]);

  const voucherTrendData = useMemo(() => data.map(d => ({
    year: d.year,
    voucherTotal: d.voucherTotal,
  })), [data]);

  const voucherYearlyTotals = useMemo<YearlyTotal[]>(() =>
    data
      .filter((item) => Number.isFinite(item.voucherTotal))
      .map((item) => ({ year: item.year, total: item.voucherTotal }))
      .sort((a, b) => a.year - b.year),
  [data]);

  const currentCalendarYear = new Date().getFullYear();

  const voucherForecastRecords = useMemo(() =>
    forecastRecords.filter((record) => (record.source ?? 'voucher') === 'voucher'),
  [forecastRecords]);

  const storedForecastMap = useMemo(() => {
    const map = new Map<number, ForecastRecord>();
    voucherForecastRecords.forEach((record) => {
      map.set(record.year, record);
    });
    return map;
  }, [voucherForecastRecords]);

  const futureForecasts = useMemo(
    () => generateFutureForecasts(voucherYearlyTotals, currentCalendarYear, 5),
    [voucherYearlyTotals, currentCalendarYear]
  );

  const futureForecastMap = useMemo(() => {
    const map = new Map<number, { value: number; method: string; note: string }>();
    futureForecasts.forEach((forecast) => {
      map.set(forecast.year, {
        value: forecast.value,
        method: forecast.method,
        note: forecast.note,
      });
    });
    return map;
  }, [futureForecasts]);

  const forecastComparisonData = useMemo(() => {
    const actualMap = new Map<number, number>();
    voucherYearlyTotals.forEach((entry) => actualMap.set(entry.year, entry.total));

    const years = new Set<number>();
    voucherYearlyTotals.forEach((entry) => years.add(entry.year));
    storedForecastMap.forEach((_, year) => years.add(year));
    futureForecastMap.forEach((_, year) => years.add(year));

    return Array.from(years)
      .sort((a, b) => a - b)
      .map((year) => {
        const actual = actualMap.has(year) ? actualMap.get(year)! : null;
        const stored = storedForecastMap.get(year);
        const future = futureForecastMap.get(year);
        const predictedRecord = stored
          ? { value: stored.value, method: stored.method, note: stored.note ?? '' }
          : future ?? null;

        if (actual === null && !predictedRecord) return null;

        const predicted = predictedRecord ? predictedRecord.value : null;
        const deviation = actual !== null && predicted !== null ? actual - predicted : null;
        return {
          year,
          actual,
          predicted,
          deviation,
          method: predictedRecord?.method ?? '',
          note: predictedRecord?.note ?? '',
          isFuture: year > currentCalendarYear,
        };
      })
      .filter((entry): entry is {
        year: number;
        actual: number | null;
        predicted: number | null;
        deviation: number | null;
        method: string;
        note: string;
        isFuture: boolean;
      } => Boolean(entry));
  }, [voucherYearlyTotals, storedForecastMap, futureForecastMap, currentCalendarYear]);

  const planMixData = useMemo(() => {
    if (!selectedDetailYear || !yearlyDetails[selectedDetailYear] || !(yearlyDetails[selectedDetailYear].vouchers || []).length) return [];

    const voucherRows = yearlyDetails[selectedDetailYear].vouchers || [];
    const aggregate = new Map<string, { plan: string; totalUnits: number; totalValue: number }>();

    voucherRows.forEach((row: any) => {
      const planName = String(row.dataPlan || row.data_plan || 'Unnamed plan').trim() || 'Unnamed plan';
      const unitPrice = Number(row.unitPrice ?? row.unit_price ?? 0);
      const months = row.months && typeof row.months === 'object' ? row.months : {};
      const units = Object.values(months).reduce((sum, value) => sum + (Number(value) || 0), 0);

      if (!units) return;

      const value = units * unitPrice;
      const existing = aggregate.get(planName) ?? { plan: planName, totalUnits: 0, totalValue: 0 };
      existing.totalUnits += units;
      existing.totalValue += value;
      aggregate.set(planName, existing);
    });

    const sorted = Array.from(aggregate.values()).sort((a, b) => b.totalValue - a.totalValue);
    if (!sorted.length) return [];

    const totalValue = sorted.reduce((sum, item) => sum + item.totalValue, 0);
    let running = 0;

    return sorted.map((item) => {
      running += item.totalValue;
      const cumulativeShare = totalValue ? (running / totalValue) * 100 : 0;
      return {
        ...item,
        cumulativeShare,
      };
    });
  }, [selectedDetailYear, yearlyDetails]);

  const vendorFocusData = useMemo(() => {
    if (!selectedDetailYear || !yearlyDetails[selectedDetailYear]) return [];

    const investmentRows = yearlyDetails[selectedDetailYear].investment || [];
    if (!investmentRows.length) return [];

    const aggregate = new Map<string, { vendor: string; investmentTotal: number }>();

    const upsert = (name: string) => {
      const trimmed = name.trim() || 'Unknown vendor';
      if (!aggregate.has(trimmed)) {
        aggregate.set(trimmed, { vendor: trimmed, investmentTotal: 0 });
      }
      return aggregate.get(trimmed)!;
    };

    investmentRows.forEach((row: any) => {
      const vendorNameRaw = row.vendor ?? row.vendor_brand ?? row.vendorName ?? row.brand ?? row.supplier;
      if (vendorNameRaw === undefined || vendorNameRaw === null) return;
      const vendorName = String(vendorNameRaw).trim();
      if (!vendorName) return;
      const totalCost = Number(row.totalCost ?? row.total_cost ?? 0);
      const fallbackTotal = Number(row.quantity ?? 0) * Number(row.costPerItem ?? row.cost_per_item ?? 0);
      const amount = Number.isFinite(totalCost) && totalCost > 0 ? totalCost : fallbackTotal;
      if (!amount) return;
      upsert(vendorName).investmentTotal += amount;
    });

    return Array.from(aggregate.values())
      .filter(item => item.investmentTotal)
      .sort((a, b) => b.investmentTotal - a.investmentTotal)
      .slice(0, 10);
  }, [selectedDetailYear, yearlyDetails]);

  const yearOptions = useMemo(() => data.map((d) => d.year), [data]);

  const breakdownSeries = useMemo(() => {
    if (!selectedDetailYear) return null;
    const found = data.find((item) => item.year === selectedDetailYear);
    if (!found) return null;
    return [{
      year: found.year,
      Capex: found.capexTotal,
      'Opex (Recurring)': found.opexRecurring,
      'Opex (Operation)': found.opexOperation,
      Voucher: found.voucherTotal,
      Investment: found.investmentTotal,
    }];
  }, [data, selectedDetailYear]);

  const formatCurrency = (value: number) => value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const renderForecastTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as {
      actual: number | null;
      predicted: number | null;
      deviation: number | null;
      method?: string;
      note?: string;
    };

    const formatValue = (value: number | null) => (value === null ? 'N/A' : formatCurrency(Number(value)));
    const formatDeviation = (value: number | null) => {
      if (value === null) return 'N/A';
      if (value === 0) return formatCurrency(0);
      const sign = value > 0 ? '+' : '−';
      return `${sign}${formatCurrency(Math.abs(value))}`;
    };

    return (
      <div
        className="text-xs px-3 py-2 rounded shadow max-w-xs space-y-1"
        style={tooltipStyle}
      >
        <p className="text-sm font-semibold">Year {label}</p>
        <p>Actual: {formatValue(row.actual)}</p>
        <p>Predicted: {formatValue(row.predicted)}</p>
        <p>Deviation: {formatDeviation(row.deviation)}</p>
        {row.method && <p className={`pt-1 text-[10px] ${mutedTextClass}`}>Method: {row.method}</p>}
        {row.note && <p className={`text-[10px] ${mutedTextClass}`}>{row.note}</p>}
      </div>
    );
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 sm:p-8 text-slate-900 dark:text-slate-100">
        <h2 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white">Analytics & Visualization</h2>
        <p className={secondaryTextClass}>You are not authenticated to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 sm:p-8 text-slate-900 dark:text-slate-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics & Visualization</h2>
          {readOnly && (
            <p className="text-xs text-amber-500 mt-1">Viewing data for {viewingLabel}. Editing is disabled for supervisors.</p>
          )}
        </div>
        {yearOptions.length > 0 && selectedDetailYear !== null && (
          <div className="flex items-center gap-3">
            <span className={`text-sm ${secondaryTextClass}`}>Focus year</span>
            <select
              id="viz-year-filter"
              value={selectedDetailYear}
              onChange={(event) => setSelectedDetailYear(Number(event.target.value))}
              className="bg-white text-slate-900 dark:bg-slate-800 dark:text-white border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {loading && <p className={secondaryTextClass}>Loading analytics...</p>}
      {error && <p className="text-red-500 dark:text-red-300">{error}</p>}
      {!loading && !error && (
        <>
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">Yearly Comparison (Bar Chart)</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={barData} margin={{ top: 20, right: 32, left: 72, bottom: 24 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis dataKey="year" stroke={axisColor} tick={{ fill: axisColor }} axisLine={{ stroke: axisColor }} tickMargin={12} />
                <YAxis
                  stroke={axisColor}
                  tick={{ fill: axisColor }}
                  axisLine={{ stroke: axisColor }}
                  width={104}
                  tickMargin={12}
                  tickFormatter={formatCurrency}
                />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Legend wrapperStyle={{ color: axisColor }} />
                <Bar dataKey="Capex" stackId="a" fill="#377eb8" />
                <Bar dataKey="Opex (Recurring)" stackId="a" fill="#4daf4a" />
                <Bar dataKey="Opex (Operation)" stackId="a" fill="#ff7f00" />
                <Bar dataKey="Voucher" stackId="a" fill="#e41a1c" />
                <Bar dataKey="Investment" stackId="a" fill="#bcbd22" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">Voucher Sales Trend (Line Chart)</h3>
            {voucherTrendData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={voucherTrendData} margin={{ top: 10, right: 24, left: 64, bottom: 12 }}>
                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis dataKey="year" stroke={axisColor} tick={{ fill: axisColor }} axisLine={{ stroke: axisColor }} tickMargin={10} />
                  <YAxis
                    tickFormatter={formatCurrency}
                    stroke={axisColor}
                    tick={{ fill: axisColor }}
                    axisLine={{ stroke: axisColor }}
                    width={96}
                    tickMargin={12}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    formatter={(value: number) => [formatCurrency(Number(value)), 'Voucher Sales']}
                  />
                  <Legend wrapperStyle={{ color: axisColor }} />
                  <Line type="monotone" dataKey="voucherTotal" stroke="#e41a1c" strokeWidth={3} name="Voucher Sales" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className={mutedTextClass}>Add voucher data to see trends over time.</p>
            )}
          </div>
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">Forecast vs Actual Voucher Sales</h3>
            {forecastComparisonData.length ? (
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={forecastComparisonData} margin={{ top: 20, right: 24, left: 72, bottom: 16 }}>
                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis dataKey="year" stroke={axisColor} tick={{ fill: axisColor }} axisLine={{ stroke: axisColor }} tickMargin={12} />
                  <YAxis
                    tickFormatter={formatCurrency}
                    stroke={axisColor}
                    tick={{ fill: axisColor }}
                    axisLine={{ stroke: axisColor }}
                    width={104}
                    tickMargin={12}
                  />
                  <Tooltip content={renderForecastTooltip} />
                  <Legend wrapperStyle={{ color: axisColor }} />
                  <Bar
                    dataKey="deviation"
                    fill="#38bdf8"
                    name="Deviation (Actual - Predicted)"
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#22c55e"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    name="Actual Sales"
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="#f97316"
                    strokeWidth={3}
                    strokeDasharray="5 5"
                    dot={{ r: 3 }}
                    name="Predicted Sales"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className={mutedTextClass}>Need historical voucher data to derive predictions.</p>
            )}
          </div>
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">Grand Total by Year (Line Chart)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={barData} margin={{ top: 10, right: 24, left: 64, bottom: 12 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis dataKey="year" stroke={axisColor} tick={{ fill: axisColor }} axisLine={{ stroke: axisColor }} tickMargin={10} />
                <YAxis
                  stroke={axisColor}
                  tick={{ fill: axisColor }}
                  axisLine={{ stroke: axisColor }}
                  width={96}
                  tickMargin={12}
                  tickFormatter={formatCurrency}
                />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Legend wrapperStyle={{ color: axisColor }} />
                <Line type="monotone" dataKey="Grand Total" stroke="#377eb8" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">Breakdown for Year {selectedDetailYear ?? '-'}</h3>
            {breakdownSeries && breakdownSeries.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={breakdownSeries} layout="vertical" margin={{ top: 10, right: 24, left: 24, bottom: 10 }}>
                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickFormatter={formatCurrency}
                    stroke={axisColor}
                    tick={{ fill: axisColor }}
                    axisLine={{ stroke: axisColor }}
                  />
                  <YAxis type="category" dataKey="year" hide />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                  <Legend wrapperStyle={{ color: axisColor }} />
                  <Bar dataKey="Capex" fill="#377eb8" />
                  <Bar dataKey="Opex (Recurring)" fill="#4daf4a" />
                  <Bar dataKey="Opex (Operation)" fill="#ff7f00" />
                  <Bar dataKey="Voucher" fill="#e41a1c" />
                  <Bar dataKey="Investment" fill="#bcbd22" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className={mutedTextClass}>No data available for the selected year.</p>}
          </div>
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">
              Plan Mix Leaderboard {selectedDetailYear !== null ? `(Year ${selectedDetailYear})` : ''}
            </h3>
            {planMixData.length ? (
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={planMixData} margin={{ top: 20, right: 32, left: 32, bottom: 0 }}>
                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="plan"
                    angle={-15}
                    textAnchor="end"
                    interval={0}
                    height={70}
                    tick={{ fill: axisColor }}
                    stroke={axisColor}
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={formatCurrency}
                    tick={{ fill: axisColor }}
                    stroke={axisColor}
                    label={{ value: 'Total Value (TZS)', angle: -90, position: 'insideLeft', fill: axisColor }}
                    width={96}
                    tickMargin={12}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    tick={{ fill: axisColor }}
                    stroke={axisColor}
                    label={{ value: 'Cumulative %', angle: 90, position: 'insideRight', fill: axisColor }}
                    width={64}
                    tickMargin={10}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    formatter={(value: number, name: string) =>
                      name === 'cumulativeShare'
                        ? [`${value.toFixed(1)}%`, 'Cumulative Share']
                        : [formatCurrency(Number(value)), name === 'totalValue' ? 'Total Value (TZS)' : 'Total Units']
                    }
                    labelFormatter={(label) => `Plan: ${label}`}
                  />
                  <Legend wrapperStyle={{ color: axisColor }} />
                  <Bar yAxisId="left" dataKey="totalValue" fill="#6366F1" radius={[6, 6, 0, 0]} name="Total Value" />
                  <Line yAxisId="right" type="monotone" dataKey="cumulativeShare" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4 }} name="Cumulative %" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className={mutedTextClass}>Add voucher usage data for the selected year to view plan rankings.</p>
            )}
          </div>
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">
              Investment Vendor Focus {selectedDetailYear !== null ? `(Year ${selectedDetailYear})` : ''}
            </h3>
            {vendorFocusData.length ? (
              <ResponsiveContainer width="100%" height={Math.max(280, vendorFocusData.length * 44)}>
                <BarChart
                  data={vendorFocusData}
                  layout="vertical"
                  margin={{ top: 20, right: 32, left: 32, bottom: 0 }}
                >
                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickFormatter={formatCurrency}
                    tick={{ fill: axisColor }}
                    stroke={axisColor}
                    label={{ value: 'Total Spend (TZS)', position: 'insideBottom', offset: -8, fill: axisColor }}
                    tickMargin={10}
                  />
                  <YAxis
                    type="category"
                    dataKey="vendor"
                    width={180}
                    tick={{ fill: axisColor }}
                    stroke={axisColor}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    formatter={(value: number) => [formatCurrency(Number(value)), 'Investment Spend']}
                    labelFormatter={(label) => `Vendor: ${label}`}
                  />
                  <Legend wrapperStyle={{ color: axisColor }} />
                  <Bar dataKey="investmentTotal" fill="#A855F7" name="Investment Spend" radius={[0, 0, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className={mutedTextClass}>Add investment entries for the selected year to see vendor concentration.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
