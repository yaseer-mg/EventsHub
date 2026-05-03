import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { enUS } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { getCalendarEvents } from '../../api/eventsApi'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Modal from '../../components/ui/Modal'
import StatusBadge from '../../components/shared/StatusBadge'
import PageWrapper from '../../components/layout/PageWrapper'

const locales = {
  'en-US': enUS,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

const viewLabels = [
  { value: Views.MONTH, label: 'Month' },
  { value: Views.WEEK, label: 'Week' },
  { value: Views.DAY, label: 'Day' },
  { value: Views.AGENDA, label: 'Agenda' },
]

function getPayload(response) {
  return response?.data ?? response ?? {}
}

function toDateString(date) {
  return format(date, 'yyyy-MM-dd')
}

function combineDateTime(date, time = '00:00') {
  if (!date) return new Date()
  const cleanTime = String(time || '00:00').slice(0, 5)
  return new Date(`${date}T${cleanTime}:00`)
}

function getRange(date, view) {
  if (view === Views.WEEK) {
    return {
      from: toDateString(startOfWeek(date)),
      to: toDateString(endOfWeek(date)),
    }
  }

  if (view === Views.DAY) {
    return {
      from: toDateString(startOfDay(date)),
      to: toDateString(endOfDay(date)),
    }
  }

  if (view === Views.AGENDA) {
    return {
      from: toDateString(startOfDay(date)),
      to: toDateString(addDays(date, 30)),
    }
  }

  return {
    from: toDateString(startOfMonth(date)),
    to: toDateString(endOfMonth(date)),
  }
}

function eventStyle(status) {
  const styles = {
    pending: {
      backgroundColor: 'rgba(245, 158, 11, 0.3)',
      borderColor: '#f59e0b',
      color: '#fde68a',
    },
    upcoming: {
      backgroundColor: 'rgba(var(--primary-rgb), 0.3)',
      borderColor: 'var(--primary)',
      color: '#ddd6fe',
    },
    ongoing: {
      backgroundColor: 'rgba(16, 185, 129, 0.3)',
      borderColor: '#10b981',
      color: '#a7f3d0',
    },
    completed: {
      backgroundColor: '#475569',
      borderColor: '#64748b',
      color: '#cbd5e1',
    },
    cancelled: {
      backgroundColor: 'rgba(239, 68, 68, 0.2)',
      borderColor: '#ef4444',
      color: '#fca5a5',
    },
  }

  return styles[status] ?? styles.upcoming
}

function Toolbar({ label, onNavigate, onView, view }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onNavigate('PREV')}>
          Previous
        </Button>
        <h2 className="min-w-48 text-center text-lg font-semibold text-slate-100">{label}</h2>
        <Button variant="outline" size="sm" onClick={() => onNavigate('NEXT')}>
          Next
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onNavigate('TODAY')}>
          Today
        </Button>
        <div className="flex rounded-lg bg-slate-900 p-1">
          {viewLabels.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onView(item.value)}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition',
                view === item.value
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-slate-400 hover:text-slate-100',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [currentView, setCurrentView] = useState(Views.MONTH)
  const [selectedEvent, setSelectedEvent] = useState(null)

  const range = useMemo(() => getRange(currentDate, currentView), [currentDate, currentView])

  const { data } = useQuery({
    queryKey: ['calendar-events', range.from, range.to],
    queryFn: () => getCalendarEvents(range.from, range.to),
  })

  const payload = getPayload(data)
  const calendarEvents = useMemo(() => {
    const events = payload.events ?? []
    const pendingBookings = payload.pendingBookings ?? payload.pending_bookings ?? []

    const mappedEvents = events.map((event) => ({
      id: `event-${event.id}`,
      title: event.event_name ?? event.name,
      start: combineDateTime(event.event_date ?? event.date, event.start_time),
      end: combineDateTime(event.event_date ?? event.date, event.end_time),
      resource: {
        type: 'event',
        status: event.status,
        event_type: event.event_type ?? event.type,
        client_name: event.client_name ?? event.client?.full_name,
        hall_name: event.hall_name ?? event.hall?.name,
        event,
      },
    }))

    const mappedBookings = pendingBookings.map((booking) => {
      const start = combineDateTime(booking.preferred_date, booking.preferred_time)
      const end = addDays(start, 0)
      end.setHours(start.getHours() + Number(booking.duration_hours ?? 1))

      return {
        id: `booking-${booking.id}`,
        title: `${booking.event_name} (Pending)`,
        start,
        end,
        resource: {
          type: 'booking',
          status: 'pending',
          event_type: booking.event_type,
          client_name: booking.client_name ?? booking.client?.full_name,
          hall_name: booking.hall_name ?? booking.hall?.name,
          event: booking,
        },
      }
    })

    return [...mappedEvents, ...mappedBookings]
  }, [payload])

  const summary = {
    totalEvents: payload.total_events ?? (payload.events ?? []).length,
    pendingBookings: payload.pending_bookings_count ?? (payload.pendingBookings ?? payload.pending_bookings ?? []).length,
    totalAttendees:
      payload.total_attendees ??
      (payload.events ?? []).reduce((sum, event) => sum + Number(event.total_attendees ?? 0), 0),
  }

  const upcomingThisWeek = calendarEvents
    .filter((item) => item.start >= startOfDay(new Date()))
    .sort((a, b) => a.start - b.start)
    .slice(0, 5)

  return (
    <PageWrapper title="Calendar">
      <style>
        {`
          .events-calendar .rbc-calendar { color: #f1f5f9; }
          .events-calendar .rbc-month-view,
          .events-calendar .rbc-time-view,
          .events-calendar .rbc-agenda-view { background: #1e293b; border-color: #334155; border-radius: 0.75rem; overflow: hidden; }
          .events-calendar .rbc-header,
          .events-calendar .rbc-month-row,
          .events-calendar .rbc-day-bg,
          .events-calendar .rbc-time-content,
          .events-calendar .rbc-timeslot-group,
          .events-calendar .rbc-time-header,
          .events-calendar .rbc-time-header-content,
          .events-calendar .rbc-agenda-table,
          .events-calendar .rbc-agenda-table tbody > tr > td,
          .events-calendar .rbc-agenda-table thead > tr > th { border-color: #334155; }
          .events-calendar .rbc-off-range-bg { background: #0f172a; }
          .events-calendar .rbc-off-range { color: #64748b; }
          .events-calendar .rbc-today { background: rgba(var(--primary-rgb), 0.1); }
          .events-calendar .rbc-event { border-width: 1px; border-style: solid; border-radius: 0.5rem; padding: 0.25rem 0.5rem; }
          .events-calendar .rbc-agenda-content,
          .events-calendar .rbc-time-gutter,
          .events-calendar .rbc-time-content > * + * > * { background: #1e293b; }
          .events-calendar .rbc-current-time-indicator { background: var(--primary); }
        `}
      </style>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="events-calendar min-h-[720px]">
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            date={currentDate}
            view={currentView}
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            onNavigate={setCurrentDate}
            onView={setCurrentView}
            onSelectEvent={setSelectedEvent}
            style={{ height: 720 }}
            components={{ toolbar: Toolbar }}
            eventPropGetter={(event) => ({
              style: eventStyle(event.resource.status),
            })}
            dayPropGetter={(date) => {
              const isToday = toDateString(date) === toDateString(new Date())
              const isPast = date < startOfDay(new Date())
              const isWeekend = [0, 6].includes(date.getDay())

              return {
                style: {
                  backgroundColor: isToday
                    ? 'rgba(var(--primary-rgb), 0.1)'
                    : isWeekend
                      ? 'rgba(51, 65, 85, 0.25)'
                      : undefined,
                  borderColor: isToday ? 'var(--primary)' : undefined,
                  opacity: isPast && !isToday ? 0.6 : 1,
                },
              }
            }}
          />
        </div>

        <aside className="space-y-6">
          <Card title="This Month Summary">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Total events</span>
                <span className="text-xl font-semibold text-slate-100">{summary.totalEvents}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Pending bookings</span>
                <span className="text-xl font-semibold text-amber-400">
                  {summary.pendingBookings}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Total attendees</span>
                <span className="text-xl font-semibold text-slate-100">
                  {summary.totalAttendees}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Upcoming This Week">
            {upcomingThisWeek.length === 0 ? (
              <p className="text-sm text-slate-400">No upcoming events this week.</p>
            ) : (
              <div className="space-y-3">
                {upcomingThisWeek.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedEvent(item)}
                    className="w-full rounded-lg bg-slate-900 p-3 text-left transition hover:bg-slate-700"
                  >
                    <p className="text-xs text-slate-500">{format(item.start, 'EEE, d MMM')}</p>
                    <p className="mt-1 truncate text-sm font-medium text-slate-100">{item.title}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>

      <Modal
        isOpen={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent?.title}
      >
        {selectedEvent ? (
          <div className="space-y-5">
            <div className="flex gap-2">
              <Badge variant="info">{selectedEvent.resource.event_type ?? selectedEvent.resource.type}</Badge>
              <StatusBadge
                status={selectedEvent.resource.status}
                type={selectedEvent.resource.type === 'booking' ? 'booking' : 'event'}
              />
            </div>
            <div className="grid gap-3 text-sm text-slate-300">
              <p>Date: {format(selectedEvent.start, 'EEEE, d MMMM yyyy')}</p>
              <p>
                Time: {format(selectedEvent.start, 'p')} → {format(selectedEvent.end, 'p')}
              </p>
              <p>Hall: {selectedEvent.resource.hall_name ?? '-'}</p>
              <p>Client: {selectedEvent.resource.client_name ?? '-'}</p>
            </div>
            <Button
              onClick={() => {
                const rawId = String(selectedEvent.id).replace(/^(event|booking)-/, '')
                navigate(
                  selectedEvent.resource.type === 'booking'
                    ? `/bookings/${rawId}`
                    : `/events/${rawId}`,
                )
              }}
            >
              View Details
            </Button>
          </div>
        ) : null}
      </Modal>
    </PageWrapper>
  )
}
