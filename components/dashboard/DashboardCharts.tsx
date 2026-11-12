'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardData } from '@/lib/domain/dashboard';
import { formatDate, formatINR } from '@/lib/domain/money';

// Loaded with next/dynamic (ssr: false) from the dashboard so recharts stays out of the first paint.
const compact = (paise: number) => {
  const r = paise / 100;
  if (r >= 1e7) return `₹${+(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `₹${+(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `₹${+(r / 1e3).toFixed(0)}K`;
  return `₹${r}`;
};
const axis = { fill: 'currentColor', fontSize: 11 };
const tip = { contentStyle: { background: 'rgb(17 26 51)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#E8ECF5', fontSize: 12 }, labelStyle: { color: '#94A0B8' }, cursor: { fill: 'rgba(148,160,184,.12)' } };

export function SalesTrend({ data }: { data: DashboardData['trend'] }) {
  const total = data.reduce((a, p) => a + p.sales, 0);
  return (
    <div className="h-64 text-mute" role="img" aria-label={`Sales over the last 90 days, total ${formatINR(total)}`} data-testid="chart-trend">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs><linearGradient id="trend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F5B544" stopOpacity={0.55} /><stop offset="100%" stopColor="#FF8A3D" stopOpacity={0.03} /></linearGradient></defs>
          <CartesianGrid stroke="rgba(148,160,184,.15)" vertical={false} />
          <XAxis dataKey="date" tick={axis} tickFormatter={(d: string) => formatDate(d).slice(0, 6)} interval={14} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickFormatter={compact} width={52} tickLine={false} axisLine={false} />
          <Tooltip {...tip} labelFormatter={(d) => formatDate(String(d))} formatter={(v) => [formatINR(Number(v)), 'Sales']} />
          <Area type="monotone" dataKey="sales" stroke="#F5B544" strokeWidth={2} fill="url(#trend)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GstByRate({ data }: { data: DashboardData['gstByRate'] }) {
  const rows = data.map((d) => ({ name: `${d.rate}%`, tax: d.tax }));
  return (
    <div className="h-64 text-mute" role="img" aria-label={`GST collected by rate: ${rows.map((r) => `${r.name} ${formatINR(r.tax)}`).join(', ')}`} data-testid="chart-gst">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="rgba(148,160,184,.15)" vertical={false} />
          <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickFormatter={compact} width={52} tickLine={false} axisLine={false} />
          <Tooltip {...tip} formatter={(v) => [formatINR(Number(v)), 'Output GST']} />
          <Bar dataKey="tax" fill="#6366F1" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const AGE_COLORS = ['#38BDF8', '#F59E0B', '#FF8A3D', '#F43F5E'];
export function Ageing({ data }: { data: DashboardData['ageing'] }) {
  return (
    <div className="h-56 text-mute" role="img" aria-label={`Receivables ageing: ${data.map((b) => `${b.label} ${formatINR(b.amount)}`).join(', ')}`} data-testid="chart-ageing">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
          <CartesianGrid stroke="rgba(148,160,184,.15)" horizontal={false} />
          <XAxis type="number" tick={axis} tickFormatter={compact} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" tick={axis} width={78} tickLine={false} axisLine={false} />
          <Tooltip {...tip} formatter={(v, _n, p) => [`${formatINR(Number(v))} · ${(p.payload as { count: number }).count} invoices`, 'Receivable']} />
          <Bar dataKey="amount" radius={[0, 6, 6, 0]} isAnimationActive={false}>{data.map((_, i) => <Cell key={i} fill={AGE_COLORS[i]} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
