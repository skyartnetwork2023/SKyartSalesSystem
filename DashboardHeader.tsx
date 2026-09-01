export default function DashboardHeader({
  selectedYear,
  setSelectedYear,
  availableYears,
  capexTotal,
  opexGrandTotal,
  opexRecurringTotal,
  opexOperationTotal
}: any) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">

      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Dashboard</h2>

        <div className="flex gap-4 flex-wrap mt-2">
          <div className="bg-blue-100 text-blue-900 px-4 py-2 rounded-lg shadow">
            Capex Total: <b>{capexTotal.toLocaleString()}</b> Tzs
          </div>

          <div className="bg-green-200 text-green-900 px-4 py-2 rounded-lg shadow">
            Total Opex: <b>{opexGrandTotal.toLocaleString()}</b> Tzs
          </div>

          <div className="bg-yellow-100 text-yellow-900 px-4 py-2 rounded-lg shadow">
            Recurring Opex: <b>{opexRecurringTotal.toLocaleString()}</b> Tzs
          </div>

          <div className="bg-orange-100 text-orange-900 px-4 py-2 rounded-lg shadow">
            Operation Opex: <b>{opexOperationTotal.toLocaleString()}</b> Tzs
          </div>
        </div>

        <p className="text-slate-400 mt-1">
          Charts show contributions from saved voucher sheets.
        </p>
      </div>

      <select
        value={selectedYear}
        onChange={(e) => setSelectedYear(Number(e.target.value))}
        className="bg-slate-800 text-white px-3 py-2 rounded"
      >
        {availableYears.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

    </div>
  );
}
