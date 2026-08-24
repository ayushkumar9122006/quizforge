import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'

export default function SessionTrendChart({ sessionTrend }) {
  if (!sessionTrend?.length || sessionTrend.length < 2) return null

  const data = sessionTrend.map((s, i) => ({
    name:     `Session ${i + 1}`,
    avg_pct:  s.avg_pct,
    count:    s.count,
    date:     s.date ? new Date(s.date).toLocaleDateString() : '',
  }))

  const overall = data.reduce((acc, d) => acc + d.avg_pct, 0) / data.length

  return (
    <div>
      <h4 style={{ fontSize:14, fontWeight:700, color:'#374151', margin:'0 0 16px' }}>
        Average Score Trend Across Sessions
      </h4>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top:4, right:8, left:-20, bottom:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="name" tick={{ fontSize:11, fill:'#9ca3af' }} />
          <YAxis domain={[0,100]} tick={{ fontSize:11, fill:'#9ca3af' }} tickFormatter={v => `${v}%`} />
          <Tooltip
            contentStyle={{ border:'1px solid #e5e7eb', borderRadius:8, fontSize:12 }}
            formatter={(v, _, props) => [`${v}% avg (${props.payload.count} students)`, 'Avg Score']}
          />
          <ReferenceLine y={overall} stroke="#6366f1" strokeDasharray="4 4"
            label={{ value:`Avg ${Math.round(overall)}%`, fill:'#6366f1', fontSize:11 }} />
          <Line type="monotone" dataKey="avg_pct" stroke="#6366f1" strokeWidth={2.5}
            dot={{ fill:'#6366f1', r:4 }} activeDot={{ r:6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
