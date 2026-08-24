import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts'

export default function QuestionAccuracyChart({ questionStats }) {
  if (!questionStats?.length) return null

  const data = questionStats.map((q, i) => ({
    name: `Q${i + 1}`,
    label: q.question_text,
    accuracy: q.accuracy_pct,
    correct: q.correct,
    wrong: q.wrong,
    skipped: q.skipped,
  }))

  const getColor = (pct) =>
    pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div>
      <h4 style={{ fontSize:14, fontWeight:700, color:'#374151', margin:'0 0 16px' }}>
        Question Accuracy (sorted: hardest → easiest)
      </h4>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 42)}>
        <BarChart data={data} layout="vertical" margin={{ top:4, right:60, left:30, bottom:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
          <XAxis type="number" domain={[0,100]} tick={{ fontSize:11, fill:'#9ca3af' }}
            tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize:12, fill:'#374151' }} width={28} />
          <Tooltip
            contentStyle={{ border:'1px solid #e5e7eb', borderRadius:8, fontSize:12 }}
            formatter={(v, name, props) => [
              `${v}% accuracy`,
              `${props.payload.label?.slice(0,50)}${props.payload.label?.length > 50 ? '…' : ''}`,
            ]}
          />
          <Bar dataKey="accuracy" radius={[0,6,6,0]} maxBarSize={28}>
            <LabelList dataKey="accuracy" position="right" formatter={v => `${v}%`}
              style={{ fontSize:11, fill:'#6b7280', fontWeight:700 }} />
            {data.map((entry, i) => (
              <Cell key={i} fill={getColor(entry.accuracy)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
