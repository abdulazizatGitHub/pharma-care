'use client'

import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'

export interface TrendPoint {
  label:    string
  revenue:  number
  expenses: number
  profit:   number
}

interface Props {
  data: TrendPoint[]
}

const fmtShort = (n: number) =>
  n >= 1_000_000
    ? `Rs ${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `Rs ${(n / 1_000).toFixed(0)}K`
    : `Rs ${n.toFixed(0)}`

export function ProfitTrendChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtShort}
          width={60}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any, name: any) => [
            'Rs ' + Number(v).toLocaleString('en-PK', { minimumFractionDigits: 0 }),
            name,
          ]}
          contentStyle={{ fontSize: 11 }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Bar dataKey="revenue"  name="Revenue"  fill="#0F6E56" radius={[3, 3, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill="#F97316" radius={[3, 3, 0, 0]} />
        <Bar dataKey="profit"   name="Net Profit" fill="#3B82F6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
