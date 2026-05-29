import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { getEventById } from '../../api/eventsApi'
import { getEventAttendees } from '../../api/attendeesApi'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import GatePassCard from './GatePassCard'

function payload(response) {
  return response?.data ?? response ?? {}
}

function rows(response) {
  const data = payload(response)
  return data.attendees ?? data.data ?? data.items ?? []
}

function eventTitle(event) {
  return event.event_name ?? event.name ?? 'Gate Passes'
}

export default function GatePassBatch() {
  const { id } = useParams()

  const { data: eventData, isLoading: eventLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: () => getEventById(id),
  })

  const { data: attendeesData, isLoading: attendeesLoading } = useQuery({
    queryKey: ['event-attendees', id],
    queryFn: () => getEventAttendees(id),
  })

  const event = payload(eventData).event ?? payload(eventData)
  const attendees = useMemo(() => rows(attendeesData), [attendeesData])
  const loading = eventLoading || attendeesLoading

  function printPasses() {
    window.print()
  }

  if (loading) {
    return <LoadingSpinner size="lg" className="min-h-screen bg-slate-900" />
  }

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-6 text-slate-100 sm:px-6">
      <style>
        {`
          @page { size: auto; margin: 12mm; }
          @media print {
            body { background: white !important; }
            .print-hidden { display: none !important; }
            .pass-print-card { break-after: page; page-break-after: always; }
            .pass-print-card:last-child { break-after: auto; page-break-after: auto; }
            .gate-pass-shell { box-shadow: none !important; }
          }
        `}
      </style>

      <div className="print-hidden mx-auto mb-6 flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to={`/events/${id}`}
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to event
          </Link>
          <h1 className="text-2xl font-semibold">{eventTitle(event)}</h1>
          <p className="mt-1 text-sm text-slate-400">{attendees.length} gate passes</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button icon={<Printer className="h-4 w-4" />} onClick={printPasses}>
            Print All
          </Button>
          <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={printPasses}>
            Download PDF
          </Button>
        </div>
      </div>

      {attendees.length ? (
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2 print:block">
          {attendees.map((attendee) => (
            <div key={attendee.id ?? attendee.qr_token} className="pass-print-card">
              <GatePassCard attendee={attendee} event={event} compact showActions={false} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-xl rounded-xl border border-slate-700 bg-slate-800 p-6 text-center">
          <p className="font-semibold">No gate passes generated yet.</p>
          <Link to={`/events/${id}/attendees`} className="mt-4 inline-flex text-(--primary) hover:brightness-125">
            Generate gate passes
          </Link>
        </div>
      )}
    </main>
  )
}
