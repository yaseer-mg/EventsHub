import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { QRCodeCanvas } from 'qrcode.react'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { getAttendeePass } from '../../api/attendeesApi'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import { useAuthStore } from '../../store/authStore'

function payload(response) {
  return response?.data ?? response ?? {}
}

function formatDate(date) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(date))
}

function shortId(value) {
  return String(value ?? '').slice(0, 8).toUpperCase()
}

const CARD_TEMPLATES = {
  'classic-luxe': {
    header: '#111827',
    accent: '#d4af37',
    border: 'border-amber-300',
    body: 'bg-white',
  },
  'modern-minimal': {
    header: '#0f172a',
    accent: '#38bdf8',
    border: 'border-sky-300',
    body: 'bg-slate-50',
  },
  'royal-gold': {
    header: '#3b0764',
    accent: '#facc15',
    border: 'border-yellow-300',
    body: 'bg-purple-50',
  },
  'floral-wedding': {
    header: '#9f1239',
    accent: '#f9a8d4',
    border: 'border-rose-200',
    body: 'bg-rose-50',
  },
  'graduation-bold': {
    header: '#111827',
    accent: '#f59e0b',
    border: 'border-slate-300',
    body: 'bg-stone-50',
  },
  'corporate-clean': {
    header: '#0f766e',
    accent: '#99f6e4',
    border: 'border-teal-200',
    body: 'bg-white',
  },
  'birthday-pop': {
    header: '#be123c',
    accent: '#22c55e',
    border: 'border-green-200',
    body: 'bg-pink-50',
  },
  'black-tie': {
    header: '#020617',
    accent: '#e5e7eb',
    border: 'border-slate-400',
    body: 'bg-zinc-50',
  },
  'festival-bright': {
    header: '#c2410c',
    accent: '#fde047',
    border: 'border-orange-200',
    body: 'bg-orange-50',
  },
  'soft-elegance': {
    header: '#475569',
    accent: '#c4b5fd',
    border: 'border-violet-200',
    body: 'bg-violet-50',
  },
}

function formatDetailLabel(value) {
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizePass(pass, attendee, event, tenant) {
  const source = pass ?? {}
  const sourceAttendee = source.attendee ?? attendee ?? {}
  const sourceEvent = source.event ?? event ?? {}

  return {
    tenantLogo: source.tenant?.logo_url ?? tenant?.logo_url,
    tenantName: source.tenant?.business_name ?? tenant?.business_name ?? 'EVENTSHUB',
    primaryColor: source.tenant?.primary_color ?? tenant?.primary_color ?? '#6366f1',
    eventName: source.event_name ?? sourceEvent.event_name ?? sourceEvent.name ?? '-',
    eventDate: source.event_date ?? sourceEvent.event_date ?? sourceEvent.date,
    startTime: source.start_time ?? sourceEvent.start_time,
    endTime: source.end_time ?? sourceEvent.end_time,
    hallName: source.hall_name ?? sourceEvent.hall_name ?? sourceEvent.hall?.name,
    eventType: source.event_type ?? sourceEvent.event_type ?? sourceEvent.type,
    attendeeName:
      source.full_name ?? source.attendee_name ?? sourceAttendee.full_name ?? sourceAttendee.name ?? '-',
    seatNumber: source.seat_number ?? sourceAttendee.seat_number ?? sourceAttendee.seat ?? '-',
    tag: source.tag ?? sourceAttendee.tag ?? 'Guest',
    passTemplate: source.pass_template ?? sourceAttendee.pass_template ?? 'classic-luxe',
    passDetails: source.pass_details ?? sourceAttendee.pass_details ?? {},
    qrToken: source.qr_token ?? sourceAttendee.qr_token ?? source.token ?? sourceAttendee.token ?? '',
    passId: source.pass_id ?? source.id ?? sourceAttendee.id ?? source.qr_token ?? sourceAttendee.qr_token,
  }
}

export default function GatePassCard({ pass, attendee, event, compact = false, showActions = true }) {
  const { attendeeId } = useParams()
  const navigate = useNavigate()
  const tenant = useAuthStore((state) => state.tenant)
  const isStandalone = Boolean(attendeeId)

  const { data, isLoading } = useQuery({
    queryKey: ['attendee-pass', attendeeId],
    queryFn: () => getAttendeePass(attendeeId),
    enabled: isStandalone,
  })

  const passData = useMemo(
    () => normalizePass(payload(data).pass ?? payload(data), attendee, event, tenant),
    [attendee, data, event, tenant],
  )
  const template = CARD_TEMPLATES[passData.passTemplate] ?? CARD_TEMPLATES['classic-luxe']
  const details = Object.entries(passData.passDetails || {}).filter(([, value]) => value)

  function downloadPdf() {
    window.print()
  }

  if (isStandalone && isLoading) {
    return <LoadingSpinner size="lg" className="min-h-screen bg-slate-900" />
  }

  return (
    <main
      className={
        isStandalone
          ? 'min-h-screen bg-slate-900 px-6 py-10 text-slate-100'
          : 'text-slate-100'
      }
    >
      <style>
        {`
          @media print {
            body { background: white !important; }
            .print-hidden { display: none !important; }
            .gate-pass-shell { box-shadow: none !important; margin: 0 auto !important; }
          }
        `}
      </style>

      <div className={isStandalone ? 'mx-auto max-w-xl' : ''}>
        <article className={`gate-pass-shell mx-auto overflow-hidden rounded-2xl border-4 ${template.border} ${template.body} text-slate-950 shadow-2xl print:shadow-none`}>
          <header
            className="px-8 py-6 text-center text-white"
            style={{ backgroundColor: template.header || passData.primaryColor }}
          >
            <div className="mb-5 flex items-center justify-center gap-3">
              {passData.tenantLogo ? (
                <img
                  src={passData.tenantLogo}
                  alt={passData.tenantName}
                  className="max-h-10 rounded bg-white/10 object-contain"
                />
              ) : null}
              <span className="text-sm font-black tracking-[0.35em]">EVENTSHUB</span>
            </div>
            <p className="text-sm font-bold tracking-[0.35em]">GATE PASS</p>
            <h1 className="mt-3 text-2xl font-black">{passData.eventName}</h1>
          </header>

          <section className="relative px-8 py-8 text-center">
            <div
              className="mx-auto mb-4 inline-flex rounded-full px-5 py-2 text-sm font-black uppercase tracking-widest text-slate-950"
              style={{ backgroundColor: template.accent }}
            >
              {passData.tag}
            </div>
            <h2 className="text-3xl font-black">{passData.attendeeName}</h2>
            <p className="mt-2 text-lg font-semibold text-slate-600">Seat: {passData.seatNumber}</p>

            <div className="mx-auto mt-8 grid max-w-sm grid-cols-[110px_1fr] overflow-hidden rounded-xl border border-slate-300 text-left text-sm">
              <div className="border-b border-r border-slate-300 bg-slate-100 p-3 font-semibold">📅 Date</div>
              <div className="border-b border-slate-300 p-3">{formatDate(passData.eventDate)}</div>
              <div className="border-b border-r border-slate-300 bg-slate-100 p-3 font-semibold">🕐 Time</div>
              <div className="border-b border-slate-300 p-3">
                {passData.startTime ?? '-'} {passData.endTime ? `→ ${passData.endTime}` : ''}
              </div>
              <div className="border-b border-r border-slate-300 bg-slate-100 p-3 font-semibold">🏛 Hall</div>
              <div className="border-b border-slate-300 p-3">{passData.hallName ?? '-'}</div>
              <div className="border-r border-slate-300 bg-slate-100 p-3 font-semibold">🎪 Type</div>
              <div className="p-3">{passData.eventType ?? '-'}</div>
            </div>

            {details.length ? (
              <div className="mx-auto mt-5 grid max-w-sm gap-2 text-left text-sm">
                {details.map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2">
                    <span className="font-semibold text-slate-500">{formatDetailLabel(key)}: </span>
                    <span className="font-semibold text-slate-900">{value}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="absolute right-8 top-1/2 rotate-[-12deg] rounded-lg border-4 border-red-500 px-4 py-2 text-xl font-black tracking-widest text-red-500 opacity-80">
              ADMIT ONE
            </div>
          </section>

          <footer className="border-t border-slate-200 px-8 py-7 text-center">
            <div className="mx-auto flex h-[150px] w-[150px] items-center justify-center bg-white">
              <QRCodeCanvas value={passData.qrToken || String(passData.passId ?? '')} size={150} />
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-700">Scan at entry gate</p>
            <p className="mt-1 text-xs uppercase tracking-widest text-slate-500">
              Pass ID: {shortId(passData.passId)}
            </p>
          </footer>
        </article>

        {showActions ? (
          <div className="print-hidden mt-6 flex flex-wrap justify-center gap-3">
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              {compact ? 'Print' : 'Print This Pass'}
            </Button>
            {isStandalone ? (
              <>
                <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={downloadPdf}>
                  Download PDF
                </Button>
                <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(-1)}>
                  ← Back to Event
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  )
}
