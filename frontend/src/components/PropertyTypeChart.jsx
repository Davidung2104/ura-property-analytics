import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

function PropertyTypeChart({ data }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  
  const chartData = data.map(d => ({
    ...d,
    percentage: ((d.count / total) * 100).toFixed(1)
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
          <p className="font-semibold text-gray-900">{d.type}</p>
          <p className="text-sm text-gray-600">
            Count: <span className="font-medium">{d.count.toLocaleString()}</span> ({d.percentage}%)
          </p>
          <p className="text-sm text-gray-600">
            Avg Price: <span className="font-medium text-green-600">S${d.avgPrice.toLocaleString()}</span>
          </p>
          <p className="text-sm text-gray-600">
            Avg PSF: <span className="font-medium">S${d.avgPsf.toLocaleString()}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Property Type Breakdown</h3>
        <p className="text-sm text-gray-500">Distribution of transactions by property type</p>
      </div>
      
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius={100}
              dataKey="count"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              layout="vertical" 
              verticalAlign="middle" 
              align="right"
              formatter={(value, entry) => (
                <span className="text-sm text-gray-700">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Property Type Stats */}
      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
        {chartData.slice(0, 4).map((type, index) => (
          <div key={type.type} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: COLORS[index] }}
            />
            <div className="text-xs">
              <span className="text-gray-600">{type.type}:</span>
              <span className="font-medium text-gray-900 ml-1">S${type.avgPsf.toLocaleString()}/sqft</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PropertyTypeChart;
