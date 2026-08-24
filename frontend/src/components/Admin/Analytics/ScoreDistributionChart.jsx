import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts'

const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#6366f1']

export default function ScoreDistributionChart({ distribution }) {
  if (!distribution) return null
  const data = distribution.labels.map((label, i) => ({
    label,
    count: distribution.values[i],
  }))

  return (
    <div>
      <h4 style={{ fontSize:14, fontWeight:700, color:'#374151', margin:'0 0 16px' }}>Score Distribution</h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top:4, right:8, left:-20, bottom:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="label" tick={{ fontSize:11, fill:'#9ca3af' }} />
          <YAxis tick={{ fontSize:11, fill:'#9ca3af' }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ border:'1px solid #e5e7eb', borderRadius:8, fontSize:13 }}
            formatter={(v) => [v, 'Students']}
          />
          <Bar dataKey="count" radius={[6,6,0,0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
