import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Calendar, Landmark, Loader2 } from 'lucide-react'
import { getEventById } from '../../api/eventsApi'
import { bulkCreateAttendees } from '../../api/attendeesApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import PageWrapper from '../../components/layout/PageWrapper'
import LoadingSpinner from '../../components/shared/LoadingSpinner'

function payload(response) {
  return response?.data ?? response ?? {}
}

function formatDate(date) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

function makeAttendees(count) {
  return Array.from({ length: count }, (_, index) => ({
    seat_number: `A${index + 1}`,
    full_name: '',
  }))
}

export default function AttendeesForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [count, setCount] = useState(1)
  const [attendees, setAttendees] = useState(makeAttendees(1))
  const [warning, setWarning] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: () => getEventById(id),
  })

  const event = payload(data).event ?? payload(data)
  const maxGuests = Number(event.guest_count ?? event.expected_guests ?? event.total_guests ?? 1)

  useEffect(() => {
    if (count > maxGuests) {
      setWarning(`Attendee count cannot exceed ${maxGuests}.`)
    } else {
      setWarning('')
    }
  }, [count, maxGuests])

  const mutation = useMutation({
    mutationFn: () => bulkCreateAttendees(id, attendees),
    onSuccess: () => {
      toast.success(`${attendees.length} passes generated!`)
      navigate(`/events/${id}`)
    },
    onError: (error) => toast.error(error?.response?.data?.message ?? error.message),
  })

  function continueFromCount() {
    if (count < 1 || count > maxGuests) return
    setAttendees(makeAttendees(Number(count)))
    setStep(2)
  }

  function updateAttendee(index, field, value) {
    setAttendees((current) =>
      current.map((attendee, attendeeIndex) =>
        attendeeIndex === index ? { ...attendee, [field]: value } : attendee,
      ),
    )
  }

  function review() {
    const incomplete = attendees.some(
      (attendee) => !attendee.full_name.trim() || !attendee.seat_number.trim(),
    )
    if (incomplete) {
      setWarning('Fill all attendee names and seat numbers before continuing.')
      return
    }
    setWarning('')
    setStep(3)
  }

  function autofill() {
    setAttendees((current) =>
      current.map((attendee, index) => ({
        ...attendee,
        full_name: attendee.full_name || `Guest ${index + 1}`,
      })),
    )
  }

  if (isLoading) {
    return <LoadingSpinner size="lg" className="min-h-[50vh]" />
  }

  return (
    <PageWrapper title="Generate Gate Passes" backTo={`/events/${id}`}>
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-300">Step {step} of 3</span>
          <span className="text-slate-500">{Math.round((step / 3) * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-all"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="text-xs uppercase text-slate-500">Event</p>
            <p className="mt-1 font-semibold text-slate-100">{event.event_name ?? event.name}</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Calendar className="h-4 w-4 text-slate-500" />
            {formatDate(event.event_date ?? event.date)}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Landmark className="h-4 w-4 text-slate-500" />
            {event.hall_name ?? event.hall?.name}
          </div>
          <p className="text-sm text-slate-400 md:col-span-4">
            Max guests from booking: {maxGuests}
          </p>
        </div>
      </Card>

      {warning ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/15 p-4 text-sm text-red-200">
          {warning}
        </div>
      ) : null}

      {step === 1 ? (
        <Card title="How many attendees?">
          <Input
            label="Number of attendees"
            name="attendee_count"
            type="number"
            min="1"
            max={maxGuests}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            hint={`Max ${maxGuests} based on your booking`}
          />
          <div className="mt-6 flex justify-end">
            <Button onClick={continueFromCount}>Continue →</Button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card
          title="Enter attendee names"
          subtitle="Enter the name of each attendee"
          actions={
            <Button variant="outline" size="sm" onClick={autofill}>
              Auto-fill
            </Button>
          }
        >
          <div className="max-h-96 space-y-3 overflow-y-auto pr-2">
            {attendees.map((attendee, index) => (
              <div key={index} className="grid gap-3 md:grid-cols-[140px_1fr]">
                <Input
                  label={index === 0 ? 'Seat Number' : undefined}
                  name={`seat_${index}`}
                  value={attendee.seat_number}
                  onChange={(event) => updateAttendee(index, 'seat_number', event.target.value)}
                />
                <Input
                  label={index === 0 ? 'Full Name' : undefined}
                  name={`name_${index}`}
                  value={attendee.full_name}
                  onChange={(event) => updateAttendee(index, 'full_name', event.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <Button onClick={review}>Review →</Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card title="Review & Confirm">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">
              You are about to generate {attendees.length} gate passes for:
            </p>
            <p className="mt-2 font-semibold text-slate-100">{event.event_name ?? event.name}</p>
            <p className="mt-1 text-sm text-slate-400">
              {formatDate(event.event_date ?? event.date)} | {event.hall_name ?? event.hall?.name}
            </p>
          </div>

          <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-xs uppercase text-slate-500">Sample pass</p>
            <div className="mt-3 rounded-lg border border-slate-700 p-4">
              <p className="font-semibold text-slate-100">{attendees[0]?.full_name}</p>
              <p className="text-sm text-slate-400">Seat {attendees[0]?.seat_number}</p>
              <div className="mt-3 h-20 rounded bg-slate-800" />
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/15 p-4 text-sm text-amber-200">
            ⚠ Each pass has a unique QR code. If you need to make changes, you will need to clear
            and regenerate.
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" onClick={() => setStep(2)}>
              ← Back
            </Button>
            <Button variant="success" className="w-full sm:w-auto" onClick={() => mutation.mutate()}>
              Confirm & Generate
            </Button>
          </div>
        </Card>
      ) : null}

      {mutation.isPending ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 text-slate-100 backdrop-blur-sm">
          <Loader2 className="h-12 w-12 animate-spin text-[var(--primary)]" />
          <p className="mt-4 text-lg font-semibold">Generating gate passes...</p>
        </div>
      ) : null}
    </PageWrapper>
  )
}
