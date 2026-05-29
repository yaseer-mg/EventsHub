import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Calendar, ChevronDown, User, Clock, Landmark, Trash2, Users } from 'lucide-react'
import { deleteEvent, getEvents, updateEventStatus } from '../../api/eventsApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import EmptyState from '../../components/shared/EmptyState'
import StatusBadge from '../../components/shared/StatusBadge'
import PageWrapper from '../../components/layout/PageWrapper'

const tabs = ['all', 'upcoming', 'ongoing', 'completed', 'cancelled']

function payload(response) {
  return response?.data ?? response ?? {}
}

function rows(response) {
  const data = payload(response)
  return data.events ?? data.data ?? data.items ?? []
}

function meta(response, count) {
  const data = payload(response)
  return {
    total: data.total ?? data.meta?.total ?? count,
    page: data.current_page ?? data.meta?.current_page ?? data.page ?? 1,
    perPage: data.per_page ?? data.meta?.per_page ?? data.perPage ?? count ?? 10,
  }
}

function formatDate(date) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

function EventCard({ event, onDelete, onStatus, statusLoading }) {
  const navigate = useNavigate()
  const attendees = Number(event.total_attendees ?? event.attendee_count ?? 0)
  const registered = Number(event.registered ?? event.registered_attendees ?? attendees)
  const paid = event.payment_status === 'paid'
  const status = event.status

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <Badge variant="info">{event.event_type ?? event.type ?? 'Event'}</Badge>
        <StatusBadge status={status} type="event" />
      </div>

      <h3 className="text-lg font-bold text-slate-100">{event.event_name ?? event.name}</h3>
      <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
        <User className="h-4 w-4" />
        {event.client_name ?? event.client?.full_name ?? event.client?.name ?? '-'}
      </div>

      <div className="my-5 h-px bg-slate-700" />

      <div className="grid gap-3 text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-500" />
          {formatDate(event.event_date ?? event.date)}
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-500" />
          {event.start_time ?? '-'} → {event.end_time ?? '-'}
        </div>
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-slate-500" />
          {event.hall_name ?? event.hall?.name ?? '-'}
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          {registered} / {attendees} attendees
        </div>
      </div>

      <div className="my-5 h-px bg-slate-700" />
      <StatusBadge status={event.payment_status} type="payment" />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => navigate(`/events/${event.id}`)}>
          View Details
        </Button>
        {attendees > 0 ? (
          <Button onClick={() => navigate(`/events/${event.id}`)}>View Passes</Button>
        ) : (
          <Button disabled={!paid} onClick={() => navigate(`/events/${event.id}/attendees`)}>
            Generate Gate Passes
          </Button>
        )}
        {status === 'upcoming' ? (
          <Button
            variant="outline"
            loading={statusLoading}
            onClick={() => onStatus(event.id, 'ongoing')}
          >
            Start Event
          </Button>
        ) : null}
        {status !== 'ongoing' ? (
          <Button
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => onDelete(event)}
          >
            Delete
          </Button>
        ) : null}
        {status === 'ongoing' ? (
          <Button
            variant="success"
            loading={statusLoading}
            onClick={() => onStatus(event.id, 'completed')}
          >
            Complete Event
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

export default function UpcomingEvents() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const filters = useMemo(
    () => ({
      status: searchParams.get('status') ?? 'all',
      search: searchParams.get('search') ?? '',
      date_from: searchParams.get('date_from') ?? '',
      date_to: searchParams.get('date_to') ?? '',
      page: searchParams.get('page') ?? '1',
    }),
    [searchParams],
  )

  const params = useMemo(() => {
    const next = {
      status: filters.status,
      search: filters.search,
      from: filters.date_from,
      to: filters.date_to,
      page: filters.page,
    }
    if (next.status === 'all') delete next.status
    return Object.fromEntries(Object.entries(next).filter(([, value]) => value))
  }, [filters])

  const { data, isLoading } = useQuery({
    queryKey: ['events', params],
    queryFn: () => getEvents(params),
  })

  const events = rows(data)
  const pagination = meta(data, events.length)
  const from = pagination.total === 0 ? 0 : (Number(pagination.page) - 1) * Number(pagination.perPage) + 1
  const to = Math.min(pagination.total, Number(pagination.page) * Number(pagination.perPage))

  function updateFilter(key, value) {
    const next = new URLSearchParams(searchParams)
    if (value && !(key === 'status' && value === 'all')) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setSearchParams(next)
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateEventStatus(id, status),
    onSuccess: () => {
      toast.success('Event status updated')
      queryClient.invalidateQueries({ queryKey: ['events'] })
      setConfirm(null)
    },
    onError: (error) => toast.error(error?.response?.data?.message ?? error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteEvent(id),
    onSuccess: () => {
      toast.success('Event deleted')
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
      setConfirmDelete(null)
    },
    onError: (error) => toast.error(error?.response?.data?.message ?? error.message),
  })

  return (
    <PageWrapper title="Upcoming Events">
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => updateFilter('status', tab)}
            className={[
              'rounded-full px-4 py-2 text-sm font-medium capitalize transition',
              filters.status === tab
                ? 'bg-(--primary) text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-100',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      <Card>
        <button
          type="button"
          onClick={() => setFiltersOpen((value) => !value)}
          className="mb-4 flex w-full items-center justify-between text-sm font-medium text-slate-300 md:hidden"
        >
          Filters
          <ChevronDown className="h-4 w-4" />
        </button>
        <div className={`${filtersOpen ? 'grid' : 'hidden'} gap-4 md:grid md:grid-cols-3`}>
          <Input
            name="search"
            placeholder="Search events"
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
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
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <Card key={item}>
              <div className="h-48 animate-pulse rounded-lg bg-slate-700" />
            </Card>
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-7 w-7" />}
          title="No events found"
          message="Events matching your filters will show up here."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              statusLoading={statusMutation.isPending}
              onDelete={(event) => setConfirmDelete(event)}
              onStatus={(id, status) => setConfirm({ id, status })}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">
          {from}-{to} of {pagination.total} results
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={Number(pagination.page) <= 1}
            onClick={() => updateFilter('page', String(Number(pagination.page) - 1))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            disabled={to >= pagination.total}
            onClick={() => updateFilter('page', String(Number(pagination.page) + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => statusMutation.mutate(confirm)}
        title={confirm?.status === 'ongoing' ? 'Start event?' : 'Complete event?'}
        message="This will update the event status immediately."
        confirmLabel={confirm?.status === 'ongoing' ? 'Start Event' : 'Complete Event'}
        loading={statusMutation.isPending}
      />

      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
        title="Delete event?"
        message="This permanently deletes the upcoming event, its booking, attendees, and generated gate passes."
        confirmLabel="Delete Event"
        danger
        loading={deleteMutation.isPending}
      />
    </PageWrapper>
  )
}
