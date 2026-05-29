import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Calendar, Clock, Download, Eye, Landmark, Printer, Trash2, Users } from 'lucide-react'
import { deleteEvent, getEventById, updateEventStatus } from '../../api/eventsApi'
import { deleteEventAttendees, getEventAttendees } from '../../api/attendeesApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import StatusBadge from '../../components/shared/StatusBadge'
import PageWrapper from '../../components/layout/PageWrapper'
import GatePassCard from '../gatepass/GatePassCard'

function payload(response) {
  return response?.data ?? response ?? {}
}

function rows(response) {
  const data = payload(response)
  return data.attendees ?? data.data ?? data.items ?? []
}

function formatDate(date) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

function Stat({ icon: Icon, label, value }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-slate-500" />
        <div>
          <p className="text-xs uppercase text-slate-500">{label}</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">{value || '-'}</p>
        </div>
      </div>
    </Card>
  )
}

export default function EventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedPass, setSelectedPass] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: () => getEventById(id),
  })

  const { data: attendeesData, isLoading: attendeesLoading } = useQuery({
    queryKey: ['event-attendees', id],
    queryFn: () => getEventAttendees(id),
  })

  const event = payload(data).event ?? payload(data)
  const attendees = rows(attendeesData)
  const attendeeStats = payload(attendeesData).stats ?? {}
  const checkInCount = Number(attendeeStats.checked_in_count ?? event.check_in_count ?? attendees.filter((a) => a.checked_in).length)
  const totalAttendees = Number(attendeeStats.total ?? attendees.length ?? event.total_attendees ?? 0)
  const notArrived = Math.max(0, totalAttendees - checkInCount)
  const progress = totalAttendees ? Math.round((checkInCount / totalAttendees) * 100) : 0

  const filteredAttendees = useMemo(() => {
    return attendees
      .filter((attendee) => {
        const name = attendee.full_name ?? attendee.name ?? ''
        const tag = attendee.tag ?? ''
        const seat = attendee.seat_number ?? attendee.seat ?? ''
        const searchTerm = search.toLowerCase()
        return (
          name.toLowerCase().includes(searchTerm) ||
          tag.toLowerCase().includes(searchTerm) ||
          seat.toLowerCase().includes(searchTerm)
        )
      })
      .filter((attendee) => {
        if (filter === 'checked') return Boolean(attendee.checked_in ?? attendee.checked_in_at)
        if (filter === 'not_arrived') return !attendee.checked_in && !attendee.checked_in_at
        return true
      })
  }, [attendees, filter, search])

  const paginated = filteredAttendees.slice((page - 1) * 20, page * 20)
  const statusAction =
    event.status === 'upcoming'
      ? { label: 'Start Event', status: 'ongoing' }
      : event.status === 'ongoing'
        ? { label: 'Complete Event', status: 'completed' }
        : null

  const statusMutation = useMutation({
    mutationFn: (status) => updateEventStatus(id, status),
    onSuccess: () => {
      toast.success('Event status updated')
      queryClient.invalidateQueries({ queryKey: ['event', id] })
    },
    onError: (error) => toast.error(error?.response?.data?.message ?? error.message),
  })

  const clearMutation = useMutation({
    mutationFn: () => deleteEventAttendees(id),
    onSuccess: () => {
      toast.success('Attendees cleared')
      queryClient.invalidateQueries({ queryKey: ['event', id] })
      queryClient.invalidateQueries({ queryKey: ['event-attendees', id] })
      setConfirmClear(false)
    },
    onError: (error) => toast.error(error?.response?.data?.message ?? error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteEvent(id),
    onSuccess: () => {
      toast.success('Event deleted')
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
      navigate('/events')
    },
    onError: (error) => toast.error(error?.response?.data?.message ?? error.message),
  })

  if (isLoading) {
    return <LoadingSpinner size="lg" className="min-h-[50vh]" />
  }

  const columns = [
    { key: 'seat_number', label: 'Seat#', render: (row) => row.seat_number ?? row.seat ?? '-' },
    { key: 'name', label: 'Name', render: (row) => row.full_name ?? row.name ?? '-' },
    { key: 'tag', label: 'Tag', render: (row) => row.tag ?? '-' },
    {
      key: 'check_in',
      label: 'Check-in Status',
      render: (row) =>
        row.checked_in || row.checked_in_at ? (
          <Badge variant="success">Checked In</Badge>
        ) : (
          <Badge variant="neutral">Not Arrived</Badge>
        ),
    },
    { key: 'time', label: 'Time', render: (row) => row.checked_in_at ?? '-' },
    {
      key: 'pass',
      label: 'Pass',
      render: (row) => (
        <Button size="sm" variant="outline" onClick={() => setSelectedPass(row)}>
          View Pass
        </Button>
      ),
    },
  ]

  return (
    <PageWrapper
      title={event.event_name ?? event.name}
      backTo="/events"
      actions={
        statusAction ? (
          <>
            <Button
              loading={statusMutation.isPending}
              onClick={() => statusMutation.mutate(statusAction.status)}
            >
              {statusAction.label}
            </Button>
            {event.status !== 'ongoing' ? (
              <Button
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={Calendar} label="Event Date" value={formatDate(event.event_date ?? event.date)} />
        <Stat icon={Clock} label="Time" value={`${event.start_time ?? '-'} → ${event.end_time ?? '-'}`} />
        <Stat icon={Landmark} label="Hall" value={event.hall_name ?? event.hall?.name} />
        <Stat icon={Users} label="Guests" value={event.guest_count ?? event.expected_guests} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <Card title="Attendee Statistics">
            <div className="mb-6">
              <p className="text-4xl font-semibold text-white">{checkInCount} checked in</p>
              <p className="mt-2 text-sm text-slate-400">
                out of {totalAttendees} registered
              </p>
              <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-700">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-slate-900 p-4 text-center">
                <p className="text-sm text-slate-400">Registered</p>
                <p className="mt-2 text-2xl font-semibold text-white">{totalAttendees}</p>
              </div>
              <div className="rounded-lg bg-slate-900 p-4 text-center">
                <p className="text-sm text-slate-400">Checked In</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-400">{checkInCount}</p>
              </div>
              <div className="rounded-lg bg-slate-900 p-4 text-center">
                <p className="text-sm text-slate-400">Not Arrived</p>
                <p className="mt-2 text-2xl font-semibold text-amber-400">{notArrived}</p>
              </div>
            </div>
          </Card>

          <Card title="Attendee List">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <Input
                name="search"
                placeholder="Search by name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="md:w-72"
              />
              <div className="flex rounded-lg bg-slate-900 p-1">
                {[
                  ['all', 'All'],
                  ['checked', 'Checked In'],
                  ['not_arrived', 'Not Arrived'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setFilter(value)
                      setPage(1)
                    }}
                    className={[
                      'rounded-md px-3 py-1.5 text-sm font-medium',
                      filter === value
                        ? 'bg-(--primary) text-white'
                        : 'text-slate-400 hover:text-slate-100',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Table columns={columns} data={paginated} loading={attendeesLoading} />
            {filteredAttendees.length > 20 ? (
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Prev
                </Button>
                <Button
                  variant="outline"
                  disabled={page * 20 >= filteredAttendees.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Actions">
            {totalAttendees === 0 && event.payment_status === 'paid' ? (
              <Button className="w-full" size="lg" onClick={() => navigate(`/events/${id}/attendees`)}>
                Generate Gate Passes
              </Button>
            ) : null}

            {totalAttendees > 0 ? (
              <div className="space-y-4">
                <Badge variant="success">Passes Generated</Badge>
                <p className="text-sm text-slate-300">
                  {checkInCount} / {totalAttendees} checked in
                </p>
                <Button
                  className="w-full"
                  icon={<Eye className="h-4 w-4" />}
                  onClick={() => navigate(`/events/${id}/gatepasses`)}
                >
                  View Gate Passes
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  icon={<Printer className="h-4 w-4" />}
                  onClick={() => navigate(`/events/${id}/gatepasses`)}
                >
                  Print All
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  icon={<Download className="h-4 w-4" />}
                  onClick={() => navigate(`/events/${id}/gatepasses`)}
                >
                  Download PDF
                </Button>
                <Button variant="danger" className="w-full" onClick={() => setConfirmClear(true)}>
                  Clear & Regenerate
                </Button>
              </div>
            ) : null}

            {event.status !== 'ongoing' ? (
              <Button
                variant="danger"
                className="w-full"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete Event
              </Button>
            ) : null}

            {event.payment_status !== 'paid' ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/15 p-4 text-sm text-amber-200">
                <p>Complete payment to generate gate passes</p>
                <Link
                  to={`/bookings/${event.booking_id ?? event.booking?.id}`}
                  className="mt-3 inline-flex font-medium text-amber-100 hover:underline"
                >
                  Update Payment
                </Link>
              </div>
            ) : null}
          </Card>

          <Card title="Event Info">
            <div className="space-y-3 text-sm">
              <p className="text-slate-300">
                Client: {event.client_name ?? event.client?.full_name ?? '-'}
              </p>
              <p className="text-slate-300">Phone: {event.client?.phone ?? '-'}</p>
              <Link
                to={`/bookings/${event.booking_id ?? event.booking?.id}`}
                className="inline-flex text-(--primary) hover:brightness-125"
              >
                Booking reference
              </Link>
              <div>
                <StatusBadge status={event.payment_status} type="payment" />
              </div>
            </div>
          </Card>

          <Card title="Event Status">
            <div className="space-y-4">
              <StatusBadge status={event.status} type="event" />
              {statusAction ? (
                <Button
                  className="w-full"
                  loading={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(statusAction.status)}
                >
                  {statusAction.label}
                </Button>
              ) : null}
              <p className="text-sm text-slate-400">
                Approved by {event.approved_by ?? '-'} on {formatDate(event.approved_at)}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={Boolean(selectedPass)}
        onClose={() => setSelectedPass(null)}
        title="Gate Pass"
        size="md"
      >
        <div className="space-y-4">
          <GatePassCard attendee={selectedPass} event={event} />
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => clearMutation.mutate()}
        title="Clear generated passes?"
        message="This removes all current attendees and gate passes so they can be regenerated."
        confirmLabel="Clear Passes"
        danger
        loading={clearMutation.isPending}
      />

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete event?"
        message="This permanently deletes the upcoming event, its booking, attendees, and generated gate passes."
        confirmLabel="Delete Event"
        danger
        loading={deleteMutation.isPending}
      />
    </PageWrapper>
  )
}
