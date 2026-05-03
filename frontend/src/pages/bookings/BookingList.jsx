import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CheckCircle, Edit, Eye, Plus, XCircle } from 'lucide-react'
import {
  getBookings,
  toggleBookingActive,
  updateBookingStatus,
} from '../../api/bookingsApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Table from '../../components/ui/Table'
import Toggle from '../../components/ui/Toggle'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import StatusBadge from '../../components/shared/StatusBadge'
import PageWrapper from '../../components/layout/PageWrapper'

const statusOptions = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

const paymentOptions = [
  { value: '', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
]

function getPayload(response) {
  return response?.data ?? response ?? {}
}

function getBookingsData(response) {
  const payload = getPayload(response)
  const rows = payload.bookings ?? payload.data ?? payload.items ?? []
  const total = payload.total ?? payload.meta?.total ?? rows.length
  const page = payload.current_page ?? payload.meta?.current_page ?? payload.page ?? 1
  const perPage = payload.per_page ?? payload.meta?.per_page ?? payload.perPage ?? rows.length ?? 10

  return {
    rows,
    stats: payload.stats ?? {},
    total,
    page,
    perPage,
  }
}

function formatCurrency(value = 0) {
  return `₦${new Intl.NumberFormat('en-NG').format(Number(value) || 0)}`
}

function formatDate(date) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

function StatCard({ label, value }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
    </Card>
  )
}

export default function BookingList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [confirmAction, setConfirmAction] = useState(null)

  const filters = useMemo(
    () => ({
      search: searchParams.get('search') ?? '',
      status: searchParams.get('status') ?? '',
      payment: searchParams.get('payment') ?? '',
      date_from: searchParams.get('date_from') ?? '',
      date_to: searchParams.get('date_to') ?? '',
      page: searchParams.get('page') ?? '1',
    }),
    [searchParams],
  )

  const queryParams = useMemo(() => {
    return Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
  }, [filters])

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', queryParams],
    queryFn: () => getBookings(queryParams),
  })

  const { rows, stats, total, page, perPage } = getBookingsData(data)
  const from = total === 0 ? 0 : (Number(page) - 1) * Number(perPage) + 1
  const to = Math.min(total, Number(page) * Number(perPage))
  const hasPrev = Number(page) > 1
  const hasNext = to < total

  function updateFilter(key, value) {
    const next = new URLSearchParams(searchParams)

    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }

    if (key !== 'page') {
      next.delete('page')
    }

    setSearchParams(next)
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateBookingStatus(id, status),
    onSuccess: () => {
      toast.success('Booking status updated')
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setConfirmAction(null)
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message ?? error.message ?? 'Could not update booking')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: toggleBookingActive,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['bookings'] })
      const previous = queryClient.getQueryData(['bookings', queryParams])

      queryClient.setQueryData(['bookings', queryParams], (current) => {
        const payload = getPayload(current)
        const currentRows = payload.bookings ?? payload.data ?? payload.items
        if (!currentRows) return current

        const updatedRows = currentRows.map((booking) =>
          booking.id === id ? { ...booking, is_active: !booking.is_active } : booking,
        )

        if (payload.bookings) return { ...payload, bookings: updatedRows }
        if (payload.items) return { ...payload, items: updatedRows }
        return { ...payload, data: updatedRows }
      })

      return { previous }
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['bookings', queryParams], context.previous)
      }
      toast.error(error?.response?.data?.message ?? error.message ?? 'Could not toggle booking')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })

  const columns = [
    { key: 'client_name', label: 'Client Name', render: (row) => row.client_name ?? row.client?.full_name ?? row.client?.name ?? '-' },
    { key: 'event_name', label: 'Event Name', render: (row) => row.event_name ?? '-' },
    { key: 'event_type', label: 'Event Type', render: (row) => <Badge variant="info">{row.event_type ?? row.type ?? '-'}</Badge> },
    { key: 'date', label: 'Date', render: (row) => formatDate(row.date ?? row.preferred_date ?? row.event_date) },
    { key: 'hall', label: 'Hall', render: (row) => row.hall_name ?? row.hall?.name ?? '-' },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} type="booking" /> },
    { key: 'payment', label: 'Payment', render: (row) => <StatusBadge status={row.payment_status} type="payment" /> },
    {
      key: 'active',
      label: 'Active',
      render: (row) => (
        <Toggle
          checked={Boolean(row.is_active ?? row.active)}
          size="sm"
          disabled={toggleMutation.isPending}
          onChange={() => toggleMutation.mutate(row.id)}
        />
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => {
        const isPending = row.status === 'pending'

        return (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate(`/bookings/${row.id}`)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
              aria-label="View booking"
            >
              <Eye className="h-4 w-4" />
            </button>
            {isPending ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate(`/bookings/${row.id}/edit`)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
                  aria-label="Edit booking"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction({ id: row.id, status: 'approved' })}
                  className="rounded-lg p-2 text-emerald-400 hover:bg-emerald-500/10"
                  aria-label="Approve booking"
                >
                  <CheckCircle className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction({ id: row.id, status: 'rejected' })}
                  className="rounded-lg p-2 text-red-400 hover:bg-red-500/10"
                  aria-label="Reject booking"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>
        )
      },
    },
  ]

  return (
    <PageWrapper
      title="Bookings"
      actions={
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/bookings/new')}>
          New Booking
        </Button>
      }
    >
      <Card>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
          <Input
            name="search"
            placeholder="Search event or client"
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
          />
          <Select
            name="status"
            value={filters.status}
            onChange={(event) => updateFilter('status', event.target.value)}
            options={statusOptions}
          />
          <Select
            name="payment"
            value={filters.payment}
            onChange={(event) => updateFilter('payment', event.target.value)}
            options={paymentOptions}
          />
          <Input
            name="date_from"
            type="date"
            value={filters.date_from}
            onChange={(event) => updateFilter('date_from', event.target.value)}
          />
          <Input
            name="date_to"
            type="date"
            value={filters.date_to}
            onChange={(event) => updateFilter('date_to', event.target.value)}
          />
          <Button variant="ghost" onClick={() => setSearchParams({})}>
            Clear Filters
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total" value={stats.total ?? total} />
        <StatCard label="Pending" value={stats.pending ?? 0} />
        <StatCard label="Approved" value={stats.approved ?? 0} />
        <StatCard label="Revenue collected this period" value={formatCurrency(stats.revenue_collected ?? 0)} />
      </div>

      <Card>
        <Table columns={columns} data={rows} loading={isLoading} emptyMessage="No bookings found" />

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-700 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-400">
            {from}-{to} of {total} results
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!hasPrev}
              onClick={() => updateFilter('page', String(Number(page) - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              disabled={!hasNext}
              onClick={() => updateFilter('page', String(Number(page) + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => statusMutation.mutate(confirmAction)}
        title={confirmAction?.status === 'approved' ? 'Approve booking?' : 'Reject booking?'}
        message={
          confirmAction?.status === 'approved'
            ? 'This booking will be approved and ready for payment or scheduling.'
            : 'This booking will be rejected.'
        }
        confirmLabel={confirmAction?.status === 'approved' ? 'Approve' : 'Reject'}
        danger={confirmAction?.status === 'rejected'}
        loading={statusMutation.isPending}
      />
    </PageWrapper>
  )
}
