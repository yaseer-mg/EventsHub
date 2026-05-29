import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Calendar, Landmark, Loader2, Plus, Trash2 } from 'lucide-react'
import { getEventById } from '../../api/eventsApi'
import { bulkCreateAttendees } from '../../api/attendeesApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import PageWrapper from '../../components/layout/PageWrapper'
import LoadingSpinner from '../../components/shared/LoadingSpinner'

const DETAIL_FIELDS = {
  wedding: [
    ['groom_name', 'Groom name'],
    ['bride_name', 'Bride name'],
  ],
  graduation: [['graduate_name', 'Graduate name']],
  birthday: [['celebrant_name', 'Celebrant name']],
  conference: [
    ['host_name', 'Host name'],
    ['organization', 'Organization'],
  ],
  corporate: [
    ['ceo_name', 'CEO name'],
    ['company_name', 'Company name'],
  ],
  meeting: [
    ['host_name', 'Host name'],
    ['organization', 'Organization'],
  ],
  anniversary: [
    ['couple_names', 'Couple or honoree names'],
    ['anniversary_year', 'Anniversary year'],
  ],
  funeral: [['honoree_name', 'Honoree name']],
  concert: [['artist_name', 'Artist name']],
  naming: [['child_name', 'Child name']],
  default: [['host_name', 'Host or celebrant name']],
}

const TAG_SUGGESTIONS = {
  wedding: ['VIP', 'Groomsman', 'Bridesmaid', 'Family', 'Vendor'],
  graduation: ['VIP', 'Graduate', 'Family', 'Faculty', 'Guest'],
  birthday: ['VIP', 'Family', 'Friends', 'Crew'],
  conference: ['VIP', 'Speaker', 'CEO', 'Staff', 'Guest'],
  corporate: ['VIP', 'CEO', 'Executive', 'Staff', 'Guest'],
  meeting: ['VIP', 'CEO', 'Staff', 'Guest'],
  anniversary: ['VIP', 'Family', 'Friends', 'Guest'],
  funeral: ['Family', 'Clergy', 'VIP', 'Guest'],
  concert: ['VIP', 'Artist', 'Backstage', 'Crew', 'Guest'],
  naming: ['VIP', 'Family', 'Friends', 'Guest'],
  default: ['VIP', 'Regular', 'Staff', 'Guest'],
}

const TEMPLATE_OPTIONS = [
  { value: 'classic-luxe', label: 'Classic Luxe' },
  { value: 'modern-minimal', label: 'Modern Minimal' },
  { value: 'royal-gold', label: 'Royal Gold' },
  { value: 'floral-wedding', label: 'Floral Wedding' },
  { value: 'graduation-bold', label: 'Graduation Bold' },
  { value: 'corporate-clean', label: 'Corporate Clean' },
  { value: 'birthday-pop', label: 'Birthday Pop' },
  { value: 'black-tie', label: 'Black Tie' },
  { value: 'festival-bright', label: 'Festival Bright' },
  { value: 'soft-elegance', label: 'Soft Elegance' },
]

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

function normalizeType(value) {
  const type = String(value || '').toLowerCase()
  if (type.includes('wed')) return 'wedding'
  if (type.includes('grad')) return 'graduation'
  if (type.includes('birth')) return 'birthday'
  if (type.includes('conference')) return 'conference'
  if (type.includes('corporate')) return 'corporate'
  if (type.includes('meeting')) return 'meeting'
  if (type.includes('anniversary')) return 'anniversary'
  if (type.includes('funeral')) return 'funeral'
  if (type.includes('concert')) return 'concert'
  if (type.includes('naming')) return 'naming'
  return 'default'
}

function initials(value, fallback) {
  const letters = String(value || fallback)
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
  return letters.slice(0, 3) || 'GP'
}

function makeDetails(fields) {
  return Object.fromEntries(fields.map(([name]) => [name, '']))
}

function makeAttendees(tagGroups, passTemplate, passDetails) {
  return tagGroups.flatMap((group, groupIndex) => {
    const copies = Math.max(0, Number(group.copies || 0))
    const tag = group.tag.trim() || `Tag ${groupIndex + 1}`
    const prefix = group.seatPrefix.trim() || initials(tag, groupIndex + 1)

    return Array.from({ length: copies }, (_, copyIndex) => ({
      seat_number: `${prefix}-${copyIndex + 1}`,
      full_name: `${tag} ${copyIndex + 1}`,
      tag,
      pass_template: passTemplate,
      pass_details: passDetails,
    }))
  })
}

export default function AttendeesForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(1)
  const [warning, setWarning] = useState('')
  const [passTemplate, setPassTemplate] = useState(TEMPLATE_OPTIONS[0].value)
  const [tagGroups, setTagGroups] = useState([{ tag: 'VIP', copies: 1, seatPrefix: 'VIP' }])
  const [passDetails, setPassDetails] = useState({})
  const [attendees, setAttendees] = useState([])

  const { data, isLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: () => getEventById(id),
  })

  const event = payload(data).event ?? payload(data)
  const eventType = normalizeType(event.event_type ?? event.type ?? event.event_name ?? event.name)
  const detailFields = useMemo(() => DETAIL_FIELDS[eventType] ?? DETAIL_FIELDS.default, [eventType])
  const suggestedTags = TAG_SUGGESTIONS[eventType] ?? TAG_SUGGESTIONS.default
  const maxGuests = Number(event.guest_count ?? event.expected_guests ?? event.total_guests ?? 1)
  const generatedCount = tagGroups.reduce((total, group) => total + Number(group.copies || 0), 0)

  useEffect(() => {
    setPassDetails(makeDetails(detailFields))
  }, [detailFields])

  useEffect(() => {
    if (generatedCount > maxGuests) {
      setWarning(`Gate pass count cannot exceed ${maxGuests}.`)
    } else if (generatedCount < 1) {
      setWarning('Add at least one gate pass.')
    } else {
      setWarning('')
    }
  }, [generatedCount, maxGuests])

  const mutation = useMutation({
    mutationFn: () => bulkCreateAttendees(id, attendees),
    onSuccess: () => {
      toast.success(`${attendees.length} passes generated!`)
      queryClient.invalidateQueries({ queryKey: ['event', id] })
      queryClient.invalidateQueries({ queryKey: ['event-attendees', id] })
      navigate(`/events/${id}`)
    },
    onError: (error) => toast.error(error?.response?.data?.message ?? error.message),
  })

  function updateTagGroup(index, field, value) {
    setTagGroups((current) =>
      current.map((group, groupIndex) =>
        groupIndex === index ? { ...group, [field]: value } : group,
      ),
    )
  }

  function addTagGroup(tag = '') {
    setTagGroups((current) => [
      ...current,
      { tag, copies: 1, seatPrefix: initials(tag || `T${current.length + 1}`, current.length + 1) },
    ])
  }

  function removeTagGroup(index) {
    setTagGroups((current) => current.filter((_, groupIndex) => groupIndex !== index))
  }

  function continueToPasses() {
    if (generatedCount < 1 || generatedCount > maxGuests) return
    if (tagGroups.some((group) => !group.tag.trim() || Number(group.copies) < 1)) {
      setWarning('Each tag needs a name and at least one copy.')
      return
    }

    setAttendees(makeAttendees(tagGroups, passTemplate, passDetails))
    setWarning('')
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
    const seats = attendees.map((attendee) => attendee.seat_number.trim().toLowerCase())
    const hasDuplicateSeat = new Set(seats).size !== seats.length
    const incomplete = attendees.some(
      (attendee) => !attendee.full_name.trim() || !attendee.seat_number.trim() || !attendee.tag.trim(),
    )

    if (incomplete) {
      setWarning('Fill all names, tags, and seat numbers before continuing.')
      return
    }

    if (hasDuplicateSeat) {
      setWarning('Seat numbers must be unique for this event.')
      return
    }

    setWarning('')
    setStep(3)
  }

  function autofill() {
    setAttendees((current) =>
      current.map((attendee, index) => ({
        ...attendee,
        full_name: attendee.full_name || `${attendee.tag} ${index + 1}`,
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
            className="h-full rounded-full bg-(--primary) transition-all"
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
        <div className="space-y-6">
          <Card title="Event pass details" subtitle="These details print on every gate pass.">
            <div className="grid gap-4 md:grid-cols-2">
              {detailFields.map(([name, label]) => (
                <Input
                  key={name}
                  label={label}
                  name={name}
                  value={passDetails[name] ?? ''}
                  onChange={(event) =>
                    setPassDetails((current) => ({ ...current, [name]: event.target.value }))
                  }
                />
              ))}
              <Select
                label="Card style"
                name="pass_template"
                value={passTemplate}
                onChange={(event) => setPassTemplate(event.target.value)}
                options={TEMPLATE_OPTIONS}
              />
            </div>
          </Card>

          <Card title="Tags and copies" subtitle="Create tags like VIP, bridesmaid, CEO, or regular.">
            <div className="mb-4 flex flex-wrap gap-2">
              {suggestedTags.map((tag) => (
                <Button key={tag} type="button" size="sm" variant="outline" onClick={() => addTagGroup(tag)}>
                  {tag}
                </Button>
              ))}
            </div>

            <div className="space-y-3">
              {tagGroups.map((group, index) => (
                <div key={index} className="grid gap-3 rounded-lg border border-slate-700 p-3 md:grid-cols-[1fr_120px_140px_auto]">
                  <Input
                    label={index === 0 ? 'Tag' : undefined}
                    name={`tag_${index}`}
                    value={group.tag}
                    onChange={(event) => updateTagGroup(index, 'tag', event.target.value)}
                    placeholder="VIP"
                  />
                  <Input
                    label={index === 0 ? 'Copies' : undefined}
                    name={`copies_${index}`}
                    type="number"
                    min="1"
                    value={group.copies}
                    onChange={(event) => updateTagGroup(index, 'copies', event.target.value)}
                  />
                  <Input
                    label={index === 0 ? 'Seat Prefix' : undefined}
                    name={`seat_prefix_${index}`}
                    value={group.seatPrefix}
                    onChange={(event) => updateTagGroup(index, 'seatPrefix', event.target.value)}
                    placeholder="VIP"
                  />
                  <div className={index === 0 ? 'md:pt-6' : ''}>
                    <Button
                      type="button"
                      variant="ghost"
                      icon={<Trash2 className="h-4 w-4" />}
                      disabled={tagGroups.length === 1}
                      onClick={() => removeTagGroup(index)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => addTagGroup()}>
                Add Tag
              </Button>
              <div className="flex items-center gap-4">
                <p className="text-sm text-slate-400">{generatedCount} passes</p>
                <Button onClick={continueToPasses}>Continue</Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {step === 2 ? (
        <Card
          title="Edit generated passes"
          subtitle="Each pass must keep a unique seat number."
          actions={
            <Button variant="outline" size="sm" onClick={autofill}>
              Auto-fill
            </Button>
          }
        >
          <div className="max-h-96 space-y-3 overflow-y-auto pr-2">
            {attendees.map((attendee, index) => (
              <div key={index} className="grid gap-3 md:grid-cols-[140px_1fr_180px]">
                <Input
                  label={index === 0 ? 'Seat Number' : undefined}
                  name={`seat_${index}`}
                  value={attendee.seat_number}
                  onChange={(event) => updateAttendee(index, 'seat_number', event.target.value)}
                />
                <Input
                  label={index === 0 ? 'Name on Pass' : undefined}
                  name={`name_${index}`}
                  value={attendee.full_name}
                  onChange={(event) => updateAttendee(index, 'full_name', event.target.value)}
                />
                <Input
                  label={index === 0 ? 'Tag' : undefined}
                  name={`tag_value_${index}`}
                  value={attendee.tag}
                  onChange={(event) => updateAttendee(index, 'tag', event.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={review}>Review</Button>
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
            <p className="mt-2 text-sm text-slate-400">
              Style: {TEMPLATE_OPTIONS.find((option) => option.value === passTemplate)?.label}
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {Object.entries(
              attendees.reduce((groups, attendee) => {
                groups[attendee.tag] = (groups[attendee.tag] || 0) + 1
                return groups
              }, {}),
            ).map(([tag, count]) => (
              <div key={tag} className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                <p className="text-xs uppercase text-slate-500">{tag}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-100">{count}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/15 p-4 text-sm text-amber-200">
            Each pass gets a unique QR token tied to this event and its tag.
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button variant="success" className="w-full sm:w-auto" onClick={() => mutation.mutate()}>
              Confirm & Generate
            </Button>
          </div>
        </Card>
      ) : null}

      {mutation.isPending ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 text-slate-100 backdrop-blur-sm">
          <Loader2 className="h-12 w-12 animate-spin text-(--primary)" />
          <p className="mt-4 text-lg font-semibold">Generating gate passes...</p>
        </div>
      ) : null}
    </PageWrapper>
  )
}
