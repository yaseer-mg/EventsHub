import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, Calendar, CheckCircle2, XCircle } from 'lucide-react'
import { getEvents } from '../../api/eventsApi'
import { scanQR } from '../../api/attendeesApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Select from '../../components/ui/Select'

function payload(response) {
  return response?.data ?? response ?? {}
}

function rows(response) {
  const data = payload(response)
  return data.events ?? data.data ?? data.items ?? []
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(date) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

function playTone(type) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.frequency.value = type === 'success' ? 880 : 220
    gain.gain.value = 0.04
    oscillator.start()
    oscillator.stop(context.currentTime + 0.12)
  } catch {
    // Audio feedback is optional.
  }
}

function ResultCard({ result, onReset }) {
  if (!result) return null

  const base = 'rounded-2xl border p-6 text-center shadow-xl'
  const styles = {
    success: 'border-emerald-400/40 bg-emerald-500/20 text-emerald-50',
    duplicate: 'border-amber-400/40 bg-amber-500/20 text-amber-50',
    invalid: 'border-red-400/40 bg-red-500/20 text-red-50',
    wrong_date: 'border-red-400/40 bg-red-500/20 text-red-50',
  }
  const Icon =
    result.type === 'success'
      ? CheckCircle2
      : result.type === 'duplicate'
        ? AlertTriangle
        : result.type === 'wrong_date'
          ? Calendar
          : XCircle
  const heading = {
    success: 'ENTRY GRANTED',
    duplicate: 'ALREADY SCANNED',
    invalid: 'ACCESS DENIED',
    wrong_date: 'WRONG DATE',
  }[result.type]

  return (
    <div className={[base, styles[result.type]].join(' ')}>
      <Icon className="mx-auto h-16 w-16 animate-pulse" />
      <h2 className="mt-5 text-3xl font-black tracking-widest">{heading}</h2>
      {result.type === 'success' ? (
        <>
          <p className="mt-5 text-2xl font-semibold">{result.attendeeName}</p>
          <p className="mt-2 text-lg">Seat: {result.seatNumber}</p>
          {result.tag ? <p className="mt-2 text-lg">Tag: {result.tag}</p> : null}
          <p className="mt-2 text-sm opacity-80">{result.eventName}</p>
        </>
      ) : null}
      {result.type === 'duplicate' ? (
        <>
          <p className="mt-5 text-2xl font-semibold">{result.attendeeName}</p>
          <p className="mt-2 text-sm opacity-80">Checked in at: {result.checkedInAt ?? '-'}</p>
        </>
      ) : null}
      {result.type === 'invalid' ? <p className="mt-5 text-lg">{result.message}</p> : null}
      {result.type === 'wrong_date' ? (
        <p className="mt-5 text-lg">This pass is valid for: {formatDate(result.validDate)}</p>
      ) : null}
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/20">
        <div className="h-full animate-[shrink_4s_linear] rounded-full bg-white/80" />
      </div>
      <Button className="mt-6 w-full" variant="secondary" onClick={onReset}>
        {result.type === 'success' ? 'Scan Next' : 'Try Again'}
      </Button>
    </div>
  )
}

export default function ScanConfirm() {
  const inputRef = useRef(null)
  const [eventId, setEventId] = useState('')
  const [token, setToken] = useState('')
  const [result, setResult] = useState(null)
  const [counter, setCounter] = useState({ checkIn: 0, total: 0 })

  const { data } = useQuery({
    queryKey: ['scan-events', today()],
    queryFn: () => getEvents({ date: today(), status: 'ongoing' }),
  })

  const events = rows(data)
  const selectedEvent = useMemo(
    () => events.find((event) => String(event.id) === String(eventId)),
    [eventId, events],
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!eventId && events[0]?.id) {
      setEventId(String(events[0].id))
    }
  }, [eventId, events])

  useEffect(() => {
    if (selectedEvent) {
      setCounter({
        checkIn: Number(selectedEvent.check_in_count ?? 0),
        total: Number(selectedEvent.total_attendees ?? selectedEvent.attendee_count ?? 0),
      })
    }
  }, [selectedEvent])

  useEffect(() => {
    if (!result) return undefined

    const timer = window.setTimeout(() => {
      resetScan()
    }, 4000)

    return () => window.clearTimeout(timer)
  }, [result])

  function resetScan() {
    setResult(null)
    setToken('')
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }

  const mutation = useMutation({
    mutationFn: (value) => scanQR(value),
    onSuccess: (response) => {
      const data = payload(response)
      const status = data.status ?? data.result

      if (status === 'already_checked_in' || status === 'duplicate') {
        playTone('error')
        setResult({
          type: 'duplicate',
          attendeeName: data.attendee?.full_name ?? data.attendee_name,
          checkedInAt: data.checked_in_at ?? data.attendee?.checked_in_at,
        })
        return
      }

      if (status === 'wrong_date') {
        playTone('error')
        setResult({ type: 'wrong_date', validDate: data.valid_date ?? data.event_date })
        return
      }

      playTone('success')
      setCounter({
        checkIn: Number(data.check_in_count ?? counter.checkIn + 1),
        total: Number(data.total_attendees ?? counter.total),
      })
      setResult({
        type: 'success',
        attendeeName: data.attendee?.full_name ?? data.attendee_name,
        seatNumber: data.attendee?.seat_number ?? data.seat_number,
        tag: data.attendee?.tag ?? data.tag,
        eventName: data.event?.event_name ?? data.event_name ?? selectedEvent?.event_name,
      })
    },
    onError: (error) => {
      const data = payload(error?.response)
      const action = data.action ?? data.code

      playTone('error')
      if (action === 'WRONG_DATE' || action === 'wrong_date') {
        setResult({ type: 'wrong_date', validDate: data.valid_date ?? data.event_date })
        return
      }

      setResult({
        type: 'invalid',
        message: data.message ?? error.message ?? 'This pass could not be verified.',
      })
    },
  })

  function submitScan(event) {
    event.preventDefault()
    if (!token.trim()) return
    mutation.mutate(token.trim())
  }

  const progress = counter.total ? Math.min(100, Math.round((counter.checkIn / counter.total) * 100)) : 0

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-6 text-slate-100 sm:px-6">
      <style>
        {`
          @keyframes shrink {
            from { width: 100%; }
            to { width: 0%; }
          }
        `}
      </style>

      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl flex-col">
        <Card className="mb-5">
          <Select
            label="Select today's event"
            name="event_id"
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
            options={events.map((event) => ({
              value: String(event.id),
              label: `${event.event_name ?? event.name} — ${event.start_time ?? '-'} — ${
                event.hall_name ?? event.hall?.name ?? '-'
              }`,
            }))}
            placeholder="Select today's event"
          />
        </Card>

        <form onSubmit={submitScan} className="space-y-4">
          <input
            ref={inputRef}
            type="text"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Scan or enter QR token..."
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-5 py-5 text-xl font-semibold text-slate-100 placeholder:text-slate-600 focus:border-(--primary) focus:outline-none focus:ring-1 focus:ring-(--primary)"
            autoFocus
          />
          <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>
            Scan
          </Button>
        </form>

        <div className="mt-6 flex-1">
          <ResultCard result={result} onReset={resetScan} />
        </div>

        <Card className="mt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-300">
              Checked in: {counter.checkIn} / {counter.total}
            </span>
            <span className="text-slate-500">{progress}%</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      </div>
    </main>
  )
}
