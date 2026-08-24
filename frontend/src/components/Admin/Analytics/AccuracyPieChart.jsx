import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

export default function AccuracyPieChart({ correct, wrong, skipped }) {
  const data = [
    { name: 'Correct', value: correct,  color: '#22c55e' },
    { name: 'Wrong',   value: wrong,    color: '#ef4444' },
    { name: 'Skipped', value: skipped,  color: '#d1d5db' },
  ].filter(d => d.value > 0)

  if (!data.length) return null

  return (
    <div>
      <h4 style={{ fontSize:14, fontWeight:700, color:'#374151', margin:'0 0 16px' }}>
        Overall Answer Breakdown
      </h4>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%" cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ border:'1px solid #e5e7eb', borderRadius:8, fontSize:13 }}
            formatter={(v, name) => [v, name]}
          />
          <Legend
            iconType="circle"
            iconSize={10}
            formatter={(value) => <span style={{ fontSize:12, color:'#374151' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
