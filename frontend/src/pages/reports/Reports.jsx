import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Lock } from 'lucide-react'
import {
  getAttendeeReport,
  getBookingReport,
  getEventReport,
  getRevenueReport,
} from '../../api/reportsApi'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Table from '../../components/ui/Table'
import StatusBadge from '../../components/shared/StatusBadge'
import PageWrapper from '../../components/layout/PageWrapper'
import { useAuthStore } from '../../store/authStore'

const tabs = [
  { key: 'bookings', label: '📊 Bookings' },
  { key: 'revenue', label: '💰 Revenue' },
  { key: 'events', label: '🎪 Events' },
  { key: 'attendees', label: '👥 Attendees' },
]

const statusOptions = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

const eventStatusOptions = [
  { value: '', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const eventTypeOptions = [
  { value: '', label: 'All' },
  ...['Wedding', 'Conference', 'Birthday', 'Concert', 'Seminar', 'Graduation', 'Religious', 'Other']
    .map((type) => ({ value: type, label: type })),
]

const pieColors = ['#f59e0b', '#10b981', '#ef4444', '#64748b', '#3b82f6']

function payload(response) {
  return response?.data ?? response ?? {}
}

function rows(data, key) {
  return data[key] ?? data.rows ?? data.data ?? data.items ?? []
}

function money(value = 0) {
  return `₦${new Intl.NumberFormat('en-NG').format(Number(value) || 0)}`
}

function dateText(date) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

function compact(value = 0) {
  const number = Number(value) || 0
  if (number >= 1000000) return `${Math.round(number / 1000000)}m`
  if (number >= 1000) return `${Math.round(number / 1000)}k`
  return String(number)
}

function StatCard({ label, value, tone = 'default' }) {
  const toneClass = {
    default: 'text-slate-100',
    green: 'text-emerald-400',
    amber: 'text-amber-400',
  }[tone]

  return (
    <Card className="p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </Card>
  )
}

function RateBadge({ value }) {
  const rate = Number(value) || 0
  const variant = rate > 80 ? 'success' : rate >= 50 ? 'warning' : 'danger'
  return <Badge variant={variant}>{rate}%</Badge>
}

function csvEscape(value) {
  const stringValue = String(value ?? '')
  return `"${stringValue.replaceAll('"', '""')}"`
}

function downloadCsv(tab, columns, data) {
  const header = columns.map((column) => csvEscape(column.label)).join(',')
  const body = data
    .map((row) =>
      columns
        .map((column) => {
          const value = column.csv ? column.csv(row) : row[column.key]
          return csvEscape(value)
        })
        .join(','),
    )
    .join('\n')
  const blob = new Blob([[header, body].filter(Boolean).join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `eventshub-${tab}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const tenant = useAuthStore((state) => state.tenant)
  const [activeTab, setActiveTab] = useState('bookings')
  const [draftFilters, setDraftFilters] = useState({
    date_from: '',
    date_to: '',
    status: '',
    event_type: '',
    event_id: '',
  })
  const [filters, setFilters] = useState({})
  const canExport = String(tenant?.plan ?? 'free').toLowerCase() !== 'free'

  const queryFn = {
    bookings: getBookingReport,
    revenue: getRevenueReport,
    events: getEventReport,
    attendees: getAttendeeReport,
  }[activeTab]

  const queryParams = useMemo(() => {
    const tabFilters = { date_from: filters.date_from, date_to: filters.date_to }
    if (activeTab === 'bookings') {
      tabFilters.status = filters.status
      tabFilters.event_type = filters.event_type
    }
    if (activeTab === 'events') tabFilters.status = filters.status
    if (activeTab === 'attendees') tabFilters.event_id = filters.event_id
    return Object.fromEntries(Object.entries(tabFilters).filter(([, value]) => value))
  }, [activeTab, filters])

  const { data, isLoading } = useQuery({
    queryKey: ['reports', activeTab, queryParams],
    queryFn: () => queryFn(queryParams),
  })

  const report = payload(data)
  const stats = report.stats ?? {}
  const tableData = {
    bookings: rows(report, 'bookings'),
    revenue: rows(report, 'revenue'),
    events: rows(report, 'events'),
    attendees: rows(report, 'attendees'),
  }[activeTab]

  const eventOptions = [
    { value: '', label: 'All Events' },
    ...(report.events ?? report.event_options ?? []).map((event) => ({
      value: String(event.id),
      label: event.event_name ?? event.name,
    })),
  ]

  const columnsByTab = {
    bookings: [
      { key: 'client', label: 'Client', render: (row) => row.client_name ?? row.client?.full_name ?? '-', csv: (row) => row.client_name ?? row.client?.full_name ?? '-' },
      { key: 'event', label: 'Event', render: (row) => row.event_name ?? '-', csv: (row) => row.event_name ?? '-' },
      { key: 'type', label: 'Type', render: (row) => row.event_type ?? row.type ?? '-', csv: (row) => row.event_type ?? row.type ?? '-' },
      { key: 'date', label: 'Date', render: (row) => dateText(row.date ?? row.event_date), csv: (row) => dateText(row.date ?? row.event_date) },
      { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} />, csv: (row) => row.status },
      { key: 'due', label: 'Due', render: (row) => money(row.amount_due), csv: (row) => row.amount_due },
      { key: 'paid', label: 'Paid', render: (row) => money(row.amount_paid), csv: (row) => row.amount_paid },
      { key: 'balance', label: 'Balance', render: (row) => money((row.amount_due ?? 0) - (row.amount_paid ?? 0)), csv: (row) => (row.amount_due ?? 0) - (row.amount_paid ?? 0) },
    ],
    revenue: [
      { key: 'event', label: 'Event', render: (row) => row.event_name ?? '-', csv: (row) => row.event_name ?? '-' },
      { key: 'date', label: 'Date', render: (row) => dateText(row.date ?? row.event_date), csv: (row) => dateText(row.date ?? row.event_date) },
      { key: 'type', label: 'Type', render: (row) => row.event_type ?? '-', csv: (row) => row.event_type ?? '-' },
      { key: 'due', label: 'Due', render: (row) => money(row.amount_due), csv: (row) => row.amount_due },
      { key: 'paid', label: 'Paid', render: (row) => money(row.amount_paid), csv: (row) => row.amount_paid },
      { key: 'balance', label: 'Balance', render: (row) => money((row.amount_due ?? 0) - (row.amount_paid ?? 0)), csv: (row) => (row.amount_due ?? 0) - (row.amount_paid ?? 0) },
      { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.payment_status} type="payment" />, csv: (row) => row.payment_status },
    ],
    events: [
      { key: 'event_name', label: 'Event Name' },
      { key: 'date', label: 'Date', render: (row) => dateText(row.event_date ?? row.date), csv: (row) => dateText(row.event_date ?? row.date) },
      { key: 'hall', label: 'Hall', render: (row) => row.hall_name ?? row.hall?.name ?? '-', csv: (row) => row.hall_name ?? row.hall?.name ?? '-' },
      { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} type="event" />, csv: (row) => row.status },
      { key: 'registered', label: 'Registered', render: (row) => row.total_attendees ?? row.registered ?? 0 },
      { key: 'checked_in', label: 'Checked In', render: (row) => row.check_in_count ?? row.checked_in ?? 0 },
      { key: 'rate', label: 'Rate', render: (row) => <RateBadge value={row.check_in_rate ?? row.rate ?? 0} />, csv: (row) => row.check_in_rate ?? row.rate ?? 0 },
    ],
    attendees: [
      { key: 'name', label: 'Name', render: (row) => row.full_name ?? row.name ?? '-', csv: (row) => row.full_name ?? row.name ?? '-' },
      { key: 'seat', label: 'Seat', render: (row) => row.seat_number ?? row.seat ?? '-', csv: (row) => row.seat_number ?? row.seat ?? '-' },
      { key: 'event', label: 'Event', render: (row) => row.event_name ?? '-', csv: (row) => row.event_name ?? '-' },
      { key: 'event_date', label: 'Event Date', render: (row) => dateText(row.event_date), csv: (row) => dateText(row.event_date) },
      { key: 'check_in_time', label: 'Check-in Time', render: (row) => row.checked_in_at ?? '-' },
      { key: 'status', label: 'Status', render: (row) => row.checked_in || row.checked_in_at ? <Badge variant="success">Checked In</Badge> : <Badge variant="neutral">Not Arrived</Badge>, csv: (row) => row.checked_in || row.checked_in_at ? 'Checked In' : 'Not Arrived' },
    ],
  }

  const columns = columnsByTab[activeTab]

  function applyFilters() {
    setFilters(draftFilters)
  }

  function clearFilters() {
    const empty = { date_from: '', date_to: '', status: '', event_type: '', event_id: '' }
    setDraftFilters(empty)
    setFilters({})
  }

  return (
    <PageWrapper
      title="Reports & Analytics"
      actions={
        canExport ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => downloadCsv(activeTab, columns, tableData)}>
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              Export PDF
            </Button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400">
            <Lock className="h-4 w-4" />
            Upgrade to export
          </div>
        )
      }
    >
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .print-report, .print-report * { visibility: visible; }
            .print-report { position: absolute; inset: 0; background: white; color: black; padding: 24px; }
            .print-hidden { display: none !important; }
          }
        `}
      </style>

      <div className="print-hidden flex gap-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              'rounded-full px-4 py-2 text-sm font-medium transition',
              activeTab === tab.key
                ? 'bg-[var(--primary)] text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-100',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="print-hidden">
        <div className="grid gap-4 lg:grid-cols-6">
          <Input
            label="Date From"
            name="date_from"
            type="date"
            value={draftFilters.date_from}
            onChange={(event) => setDraftFilters((current) => ({ ...current, date_from: event.target.value }))}
          />
          <Input
            label="Date To"
            name="date_to"
            type="date"
            value={draftFilters.date_to}
            onChange={(event) => setDraftFilters((current) => ({ ...current, date_to: event.target.value }))}
          />
          {activeTab === 'bookings' ? (
            <>
              <Select
                label="Status"
                name="status"
                value={draftFilters.status}
                onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}
                options={statusOptions}
              />
              <Select
                label="Event Type"
                name="event_type"
                value={draftFilters.event_type}
                onChange={(event) => setDraftFilters((current) => ({ ...current, event_type: event.target.value }))}
                options={eventTypeOptions}
              />
            </>
          ) : null}
          {activeTab === 'events' ? (
            <Select
              label="Status"
              name="status"
              value={draftFilters.status}
              onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}
              options={eventStatusOptions}
              className="lg:col-span-2"
            />
          ) : null}
          {activeTab === 'attendees' ? (
            <Select
              label="Event"
              name="event_id"
              value={draftFilters.event_id}
              onChange={(event) => setDraftFilters((current) => ({ ...current, event_id: event.target.value }))}
              options={eventOptions}
              className="lg:col-span-2"
            />
          ) : null}
          <div className="flex items-end gap-2 lg:col-span-2">
            <Button onClick={applyFilters}>Apply</Button>
            <Button variant="ghost" onClick={clearFilters}>Clear</Button>
          </div>
        </div>
      </Card>

      <div className="print-report space-y-6">
        {activeTab === 'bookings' ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard label="Total Bookings" value={stats.total_bookings ?? 0} />
              <StatCard label="Approved" value={stats.approved ?? 0} />
              <StatCard label="Revenue Collected" value={money(stats.revenue_collected)} tone="green" />
              <StatCard label="Outstanding" value={money(stats.outstanding)} tone="amber" />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="Bookings by Status">
                <div className="h-72">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={report.by_status ?? []} dataKey="value" nameKey="name" outerRadius={95} label>
                        {(report.by_status ?? []).map((entry, index) => (
                          <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card title="Bookings by Event Type">
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={(report.by_event_type ?? []).slice(0, 5)}>
                      <CartesianGrid stroke="#334155" vertical={false} />
                      <XAxis dataKey="name" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip />
                      <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </>
        ) : null}

        {activeTab === 'revenue' ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard label="Total Collected" value={money(stats.total_collected)} tone="green" />
              <StatCard label="Total Outstanding" value={money(stats.total_outstanding)} tone="amber" />
              <StatCard label="Total Value" value={money(stats.total_value)} />
            </div>
            <Card title="Monthly Revenue">
              <div className="h-80">
                <ResponsiveContainer>
                  <AreaChart data={report.monthly_revenue ?? []}>
                    <CartesianGrid stroke="#334155" vertical={false} />
                    <XAxis dataKey="month" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" tickFormatter={(value) => `₦${compact(value)}`} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Legend />
                    <Area type="monotone" dataKey="collected" stroke="#10b981" fill="#10b981" fillOpacity={0.25} />
                    <Area type="monotone" dataKey="outstanding" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </>
        ) : null}

        {activeTab === 'events' ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard label="Total" value={stats.total ?? 0} />
              <StatCard label="Upcoming" value={stats.upcoming ?? 0} />
              <StatCard label="Completed" value={stats.completed ?? 0} />
              <StatCard label="Cancelled" value={stats.cancelled ?? 0} />
            </div>
            <Card title="Events by Month">
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={report.by_month ?? []}>
                    <CartesianGrid stroke="#334155" vertical={false} />
                    <XAxis dataKey="month" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip />
                    <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </>
        ) : null}

        {activeTab === 'attendees' ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard label="Registered" value={stats.registered ?? 0} />
              <StatCard label="Checked In" value={stats.checked_in ?? 0} tone="green" />
              <StatCard label="Rate%" value={`${stats.rate ?? 0}%`} />
            </div>
            <Card title="Check-in Rate">
              <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-full border-[18px] border-slate-700" style={{ borderTopColor: '#10b981', borderRightColor: '#10b981' }}>
                <div className="text-center">
                  <p className="text-4xl font-semibold text-white">{stats.rate ?? 0}%</p>
                  <p className="text-sm text-slate-400">checked in</p>
                </div>
              </div>
            </Card>
          </>
        ) : null}

        <Card title={`${tabs.find((tab) => tab.key === activeTab)?.label} Table`}>
          <Table columns={columns} data={tableData} loading={isLoading} />
          {activeTab === 'bookings' ? (
            <div className="mt-4 grid gap-3 border-t border-slate-700 pt-4 text-sm text-slate-300 md:grid-cols-3">
              <p>Total Due: {money(tableData.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0))}</p>
              <p>Total Paid: {money(tableData.reduce((sum, row) => sum + Number(row.amount_paid ?? 0), 0))}</p>
              <p>Balance: {money(tableData.reduce((sum, row) => sum + Number((row.amount_due ?? 0) - (row.amount_paid ?? 0)), 0))}</p>
            </div>
          ) : null}
        </Card>
      </div>
    </PageWrapper>
  )
}
