import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9'
];

function DistrictChart({ data }) {
  // Sort by average PSF for better visualization
  const sortedData = [...data]
    .sort((a, b) => b.avgPsf - a.avgPsf)
    .slice(0, 15);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
          <p className="font-semibold text-gray-900">{d.district}</p>
          <p className="text-sm text-gray-600">
            Avg PSF: <span className="font-medium text-blue-600">S${d.avgPsf.toLocaleString()}</span>
          </p>
          <p className="text-sm text-gray-600">
            Avg Price: <span className="font-medium">S${d.avgPrice.toLocaleString()}</span>
          </p>
          <p className="text-sm text-gray-600">
            Transactions: <span className="font-medium">{d.transactions.toLocaleString()}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">District Comparison</h3>
        <p className="text-sm text-gray-500">Average price per square foot by district</p>
      </div>
      
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sortedData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis 
              type="number" 
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              fontSize={12}
            />
            <YAxis 
              type="category" 
              dataKey="district" 
              width={50}
              fontSize={12}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="avgPsf" radius={[0, 4, 4, 0]}>
              {sortedData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          💡 Tip: Higher PSF typically indicates prime locations (D09, D10, D11 = Core Central Region)
        </p>
      </div>
    </div>
  );
}

export default DistrictChart;
