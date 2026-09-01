import React, { useEffect, useMemo, useState } from 'react';
import PieSection from './charts/PieSection';
import BarSection from './charts/BarSection';
import MonthlyForecastSection from './charts/MonthlyForecastSection';
import { useAuth } from '../contexts/AuthContext';
import { useUserScope } from '../contexts/UserScopeContext';
import { getVouchers } from '../lib/voucherService';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'];
const DATA_KEYS = ['vouchers', 'capex', 'opex', 'opexop', 'investment', 'loans', 'pendingPayments', 'cashInflows', 'cashOutflows'] as const;

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateVoucherSalesTotal = (rows: any[]): number => {
  return rows.reduce((sum: number, row: any) => {
    const unitPrice = safeNumber(row?.unitPrice ?? row?.unit_price);
    const months = row?.months && typeof row.months === 'object' ? Object.values(row.months) : [];
    const totalUnits = months.reduce((units: number, value: any) => units + safeNumber(value), 0);
    return sum + unitPrice * totalUnits;
  }, 0);
};

const calculateOpexTotal = (opexRows: any[], opexOperationRows: any[]): number => {
  const recurring = opexRows.reduce((sum: number, row: any) => sum + safeNumber(row?.totalCost ?? row?.total_cost), 0);
  const operations = opexOperationRows.reduce((sum: number, row: any) => sum + safeNumber(row?.cost ?? row?.totalCost ?? row?.total_cost), 0);
  return recurring + operations;
};

const calculateCapexTotal = (rows: any[]): number => {
  return rows.reduce((sum: number, row: any) => {
    const totalCost = safeNumber(row?.totalCost ?? row?.total_cost);
    if (totalCost > 0) return sum + totalCost;
    const fallback = safeNumber(row?.quantity) * safeNumber(row?.costPerItem ?? row?.cost_per_item ?? row?.unitCost ?? row?.unit_cost);
    return sum + fallback;
  }, 0);
};

type VoucherRecord = {
  id: string;
  user_id: string;
  data?: Record<string, any>;
};

type YearData = Partial<Record<(typeof DATA_KEYS)[number], any[]>>;

const mergeYearData = (entries: VoucherRecord[]): YearData => {
  const merged = entries.reduce<YearData>((acc, entry) => {
    const payload = entry?.data ?? {};
    DATA_KEYS.forEach((key) => {
      const value = payload[key];
      if (Array.isArray(value)) {
        const existing = acc[key] ?? [];
        acc[key] = [...existing, ...value];
      }
    });
    return acc;
  }, {});

  const dedupeById = (rows: any[]) => {
    const seen = new Set<string>();
    return rows.filter((row) => {
      const identifier = typeof row?.id === 'string' ? row.id : null;
      if (!identifier) return true;
      if (seen.has(identifier)) return false;
      seen.add(identifier);
      return true;
    });
  };

  if (Array.isArray(merged.cashInflows)) merged.cashInflows = dedupeById(merged.cashInflows);
  if (Array.isArray(merged.cashOutflows)) merged.cashOutflows = dedupeById(merged.cashOutflows);

  return merged;
};

export default function DashboardContent() {
  const { user } = useAuth();
  const { scopeUserId, readOnly, scopedProfile } = useUserScope();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
  const [sheet, setSheet] = useState<any[] | null>(null);
  const [capexTotal, setCapexTotal] = useState(0);
  const [opexRecurringTotal, setOpexRecurringTotal] = useState(0);
  const [opexOperationTotal, setOpexOperationTotal] = useState(0);
  const [opexGrandTotal, setOpexGrandTotal] = useState(0);
  const [netCashTotal, setNetCashTotal] = useState(0);
  const [openingCashBalance, setOpeningCashBalance] = useState(0);
  const [closingCashBalance, setClosingCashBalance] = useState(0);
  const [voucherYearTotal, setVoucherYearTotal] = useState(0);
  const [topVoucherPlan, setTopVoucherPlan] = useState<string | null>(null);
  const [topVoucherPlanValue, setTopVoucherPlanValue] = useState(0);
  const [investmentTotal, setInvestmentTotal] = useState(0);
  const [loanCreditTotal, setLoanCreditTotal] = useState(0);
  const [topCreditor, setTopCreditor] = useState<string | null>(null);
  const [topCreditorAmount, setTopCreditorAmount] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [amountInHand, setAmountInHand] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeUserId = scopeUserId ?? user?.id ?? null;
  const viewingLabel = scopedProfile
    ? (scopedProfile.full_name && scopedProfile.full_name.trim()) || scopedProfile.email
    : user?.email ?? 'your account';

  useEffect(() => {
    let canceled = false;
    const resetMetrics = (message: string) => {
      setSheet(null);
      setCapexTotal(0);
      setOpexRecurringTotal(0);
      setOpexOperationTotal(0);
      setOpexGrandTotal(0);
      setNetCashTotal(0);
      setOpeningCashBalance(0);
      setClosingCashBalance(0);
      setVoucherYearTotal(0);
      setTopVoucherPlan(null);
      setTopVoucherPlanValue(0);
      setInvestmentTotal(0);
      setLoanCreditTotal(0);
      setTopCreditor(null);
      setTopCreditorAmount(0);
      setPendingTotal(0);
      setAmountInHand(0);
      setAvailableYears([currentYear]);
      setError(message);
    };

    const load = async () => {
      setLoading(true);
      setError(null);
      if (!activeUserId) {
        resetMetrics(user ? 'Select a user to see dashboard analytics.' : 'You are not authenticated to see dashboard analytics.');
        setLoading(false);
        return;
      }

      try {
        const list = await getVouchers({ userId: activeUserId ?? undefined });
        if (canceled) return;
        const userVouchers = (list || []).filter((v: VoucherRecord) => v.user_id === activeUserId && v.data?.year);
        const years = Array.from(new Set(userVouchers.map((v: VoucherRecord) => Number(v.data?.year)).filter((value) => Number.isFinite(value))));
        const sortedYears = years.length ? [...years].sort((a, b) => a - b) : [currentYear];
        const resolvedYear = sortedYears.includes(selectedYear) ? selectedYear : sortedYears[sortedYears.length - 1];
        const allYears = Array.from(new Set([...sortedYears, resolvedYear])).sort((a, b) => a - b);
        setAvailableYears(allYears);
        if (resolvedYear !== selectedYear) {
          setSelectedYear(resolvedYear);
        }
        const yearEntryMap = new Map<number, VoucherRecord[]>();
        allYears.forEach((year) => {
          yearEntryMap.set(year, userVouchers.filter((v: VoucherRecord) => Number(v.data?.year) === year));
        });

        const mergedByYear = new Map<number, YearData>();
        allYears.forEach((year) => {
          mergedByYear.set(year, mergeYearData(yearEntryMap.get(year) ?? []));
        });

        let previousClosing = 0;
        const cashSummaries = new Map<number, { net: number; opening: number; closing: number }>();
        allYears.forEach((year) => {
          const data = mergedByYear.get(year) ?? {};
          const inflowRows = Array.isArray((data as any)?.cashInflows) ? (data as any).cashInflows : [];
          const outflowRows = Array.isArray((data as any)?.cashOutflows) ? (data as any).cashOutflows : [];
          const voucherRows = Array.isArray((data as any)?.vouchers) ? (data as any).vouchers : [];
          const opexRows = Array.isArray((data as any)?.opex) ? (data as any).opex : [];
          const opexOperationRows = Array.isArray((data as any)?.opexop) ? (data as any).opexop : [];
          const capexRows = Array.isArray((data as any)?.capex) ? (data as any).capex : [];

          const baseInflows = inflowRows
            .filter((row: any) => !row?.derived)
            .reduce((sum: number, row: any) => sum + safeNumber(row?.amount ?? 0), 0);
          const baseOutflows = outflowRows
            .filter((row: any) => !row?.derived)
            .reduce((sum: number, row: any) => sum + safeNumber(row?.amount ?? 0), 0);
          const derivedInflows = calculateVoucherSalesTotal(voucherRows);
          const derivedOutflows = calculateOpexTotal(opexRows, opexOperationRows) + calculateCapexTotal(capexRows);
          const net = baseInflows + derivedInflows - (baseOutflows + derivedOutflows);
          const opening = previousClosing;
          const closing = opening + net;
          cashSummaries.set(year, { net, opening, closing });
          previousClosing = closing;
        });

        const merged = (mergedByYear.get(resolvedYear) ?? {}) as YearData;
        const foundSheet = Array.isArray(merged?.vouchers) ? merged.vouchers : null;
        setSheet(foundSheet);
        const capexRows = Array.isArray(merged?.capex) ? merged.capex : [];
        const capexTotalVal = calculateCapexTotal(capexRows);
        setCapexTotal(capexTotalVal);
        const opexRows = Array.isArray(merged?.opex) ? merged.opex : [];
        const opexRecurringVal = opexRows.reduce((sum: number, row: any) => sum + safeNumber(row?.totalCost ?? row?.total_cost), 0);
        setOpexRecurringTotal(opexRecurringVal);
        const opRows = Array.isArray(merged?.opexop) ? merged.opexop : [];
        const opexOperationVal = opRows.reduce((sum: number, row: any) => sum + safeNumber(row?.cost ?? row?.totalCost ?? row?.total_cost), 0);
        setOpexOperationTotal(opexOperationVal);
        setOpexGrandTotal(opexRecurringVal + opexOperationVal);

        const voucherRows = Array.isArray(merged?.vouchers) ? merged.vouchers : [];
        let totalVoucherAmount = 0;
        let bestPlanName: string | null = null;
        let bestPlanAmount = 0;
        voucherRows.forEach((row: any) => {
          const unitPrice = safeNumber(row?.unitPrice ?? row?.unit_price);
          const months = row?.months && typeof row.months === 'object' ? Object.values(row.months) : [];
          const totalUnits = months.reduce((sum: number, value: any) => sum + safeNumber(value), 0);
          if (!totalUnits) return;
          const amount = unitPrice * totalUnits;
          totalVoucherAmount += amount;
          if (amount > bestPlanAmount) {
            const planName = String(row?.dataPlan ?? row?.data_plan ?? 'Unnamed plan').trim() || 'Unnamed plan';
            bestPlanAmount = amount;
            bestPlanName = planName;
          }
        });
        setVoucherYearTotal(totalVoucherAmount);
        setTopVoucherPlan(bestPlanName);
        setTopVoucherPlanValue(bestPlanAmount);

        const pendingRows = Array.isArray(merged?.pendingPayments) ? merged.pendingPayments : [];
        const pendingTotalVal = pendingRows.reduce((sum: number, row: any) => {
          const amount = safeNumber(row.amount);
          return sum + amount;
        }, 0);
        setPendingTotal(pendingTotalVal);

        const cashSummary = cashSummaries.get(resolvedYear) ?? { net: 0, opening: 0, closing: 0 };
        setNetCashTotal(cashSummary.net);
        setOpeningCashBalance(cashSummary.opening);
        setClosingCashBalance(cashSummary.closing);

        const investmentRows = Array.isArray(merged?.investment) ? merged.investment : [];
        const investmentTotalVal = investmentRows.reduce((sum: number, row: any) => {
          const totalCost = safeNumber(row?.totalCost ?? row?.total_cost);
          if (totalCost > 0) return sum + totalCost;
          const fallback = safeNumber(row?.quantity) * safeNumber(row?.costPerItem ?? row?.cost_per_item ?? row?.unitCost ?? row?.unit_cost);
          return sum + fallback;
        }, 0);
        setInvestmentTotal(investmentTotalVal);

        const loanRows = Array.isArray(merged?.loans) ? merged.loans : [];
        let loanTotal = 0;
        const creditorTotals = new Map<string, number>();
        loanRows.forEach((row: any) => {
          const amount = safeNumber(row?.amount);
          if (amount <= 0) return;
          loanTotal += amount;
          const name = String(row.creditor ?? '').trim();
          if (!name) return;
          creditorTotals.set(name, (creditorTotals.get(name) || 0) + amount);
        });
        setLoanCreditTotal(loanTotal);
        let bestCreditor: string | null = null;
        let bestCreditorAmount = 0;
        creditorTotals.forEach((value, name) => {
          if (value > bestCreditorAmount) {
            bestCreditorAmount = value;
            bestCreditor = name;
          }
        });
        setTopCreditor(bestCreditor);
        setTopCreditorAmount(bestCreditorAmount);

        const amountInHandVal = cashSummary.closing - pendingTotalVal;
        setAmountInHand(amountInHandVal);
      } catch (err) {
        if (!canceled) {
          resetMetrics('Failed to load dashboard data from Supabase.');
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    load();
    return () => {
      canceled = true;
    };
  }, [activeUserId, selectedYear, currentYear, user]);

  const pieData = useMemo(() => {
    if (!sheet) return [];
    const map = new Map<string, number>();
    sheet.forEach((v: any) => {
      const unit = Number(v.unitPrice || v.unit_price || 0);
      const totalCount = Object.values(v.months || {}).reduce((s: number, n: any) => s + (Number(n) || 0), 0);
      const total = unit * totalCount;
      const key = v.dataPlan || v.data_plan || 'Unknown';
      map.set(key, (map.get(key) || 0) + total);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [sheet]);

  const barData = useMemo(() => {
    if (!sheet) return [];
    return MONTHS.map((month) => {
      const value = sheet.reduce((sum: number, v: any) => {
        const unit = Number(v.unitPrice || v.unit_price || 0);
        const count = Number((v.months && v.months[month]) || 0);
        return sum + unit * count;
      }, 0);
      return { month, amount: value };
    });
  }, [sheet]);

  const monthlyForecastData = useMemo(() => {
    if (!barData.length) return [];
    const points = barData.map((entry, index) => ({
      month: entry.month,
      actual: Number(entry.amount ?? 0),
      position: index + 1,
    }));
    const n = points.length;
    if (!n) return [];
    const sumX = points.reduce((sum, point) => sum + point.position, 0);
    const sumY = points.reduce((sum, point) => sum + point.actual, 0);
    const sumXX = points.reduce((sum, point) => sum + point.position * point.position, 0);
    const sumXY = points.reduce((sum, point) => sum + point.position * point.actual, 0);
    const denominator = n * sumXX - sumX * sumX;
    const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    return points.map(({ month, actual, position }) => {
      const predicted = Math.max(intercept + slope * position, 0);
      return {
        month,
        actual,
        predicted,
        deviation: actual - predicted,
      };
    });
  }, [barData]);

  if (!user) {
    return (
      <div className="flex-1 overflow-auto p-8 text-slate-900 dark:text-white">
        <h2 className="text-2xl font-bold mb-3">Dashboard</h2>
        <p className="text-slate-600 dark:text-slate-400">You are not authenticated to see dashboard analytics.</p>
      </div>
    );
  }

  const formatCurrency = (value: number) => value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <div className="flex-1 overflow-auto p-8 text-slate-900 dark:text-slate-100">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Insights for {selectedYear} with key totals below.</p>
          {readOnly && (
            <p className="text-xs text-amber-500 mt-1">Viewing data for {viewingLabel}. Editing is disabled for supervisors.</p>
          )}
        </div>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>

      {!loading && !error && (
        <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Voucher Sales</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatCurrency(voucherYearTotal)} TZS</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Total revenue from voucher plans</p>
          </div>
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Net Cash</p>
            <p className={`mt-2 text-2xl font-semibold ${netCashTotal < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
              {netCashTotal < 0 ? '-' : ''}{formatCurrency(Math.abs(netCashTotal))} TZS
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Cash inflows minus outflows</p>
          </div>
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Opening Cash Balance</p>
            <p className={`mt-2 text-2xl font-semibold ${openingCashBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
              {openingCashBalance < 0 ? '-' : ''}{formatCurrency(Math.abs(openingCashBalance))} TZS
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Carried forward from prior year</p>
          </div>
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Closing Cash Balance</p>
            <p className={`mt-2 text-2xl font-semibold ${closingCashBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
              {closingCashBalance < 0 ? '-' : ''}{formatCurrency(Math.abs(closingCashBalance))} TZS
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Opening balance plus net cash</p>
          </div>
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount In Hand</p>
            <p className={`mt-2 text-2xl font-semibold ${amountInHand < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
              {amountInHand < 0 ? '-' : ''}{formatCurrency(Math.abs(amountInHand))} TZS
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Closing cash minus pending payments</p>
          </div>
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Top Selling Plan</p>
            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{topVoucherPlan ?? 'No plan data'}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{topVoucherPlan ? `${formatCurrency(topVoucherPlanValue)} TZS` : 'Awaiting sales entries'}</p>
          </div>
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Opex Grand Total</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatCurrency(opexGrandTotal)} TZS</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Recurring + operations</p>
          </div>
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Capex Total</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatCurrency(capexTotal)} TZS</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Capital expenditure spend</p>
          </div>
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Investment Total</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatCurrency(investmentTotal)} TZS</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Annual investments</p>
          </div>
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Loan Credits</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatCurrency(loanCreditTotal)} TZS</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Total loaned out</p>
          </div>
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Pending Payments</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatCurrency(pendingTotal)} TZS</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Open customer balances</p>
          </div>
          <div className="bg-white/95 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/40">
            <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Top Creditor</p>
            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{topCreditor ?? 'No loan data'}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{topCreditor ? `${formatCurrency(topCreditorAmount)} TZS credit` : 'Awaiting loan entries'}</p>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PieSection loading={loading} data={pieData} selectedYear={selectedYear} />
        <BarSection loading={loading} data={barData} selectedYear={selectedYear} />
      </div>
      <div className="mt-6">
        <MonthlyForecastSection
          loading={loading}
          data={monthlyForecastData}
          selectedYear={selectedYear}
        />
      </div>
    </div>
  );
}

