import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Search, UserPlus } from 'lucide-react'
import { createBooking, getBookingById, updateBooking } from '../../api/bookingsApi'
import { createClient, getClients } from '../../api/clientsApi'
import { getHalls } from '../../api/hallsApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import PageWrapper from '../../components/layout/PageWrapper'
import LoadingSpinner from '../../components/shared/LoadingSpinner'

const eventTypeOptions = [
  'Wedding',
  'Conference',
  'Birthday',
  'Concert',
  'Seminar',
  'Graduation',
  'Religious',
  'Other',
].map((value) => ({ value, label: value }))

const paymentStatusOptions = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
]

const today = new Date().toISOString().slice(0, 10)

const numberField = (message) =>
  z.coerce
    .number({ invalid_type_error: message })
    .refine((value) => Number.isFinite(value), message)

const bookingSchema = z
  .object({
    event_name: z.string().min(1, 'Event name is required'),
    event_type: z.string().min(1, 'Event type is required'),
    preferred_date: z.string().min(1, 'Preferred date is required'),
    preferred_time: z.string().min(1, 'Preferred time is required'),
    duration_hours: numberField('Duration is required').min(1).max(24),
    expected_guests: numberField('Expected guests is required').min(1),
    hall_id: z.string().min(1, 'Hall is required'),
    notes: z.string().optional(),
    amount_due: numberField('Amount due is required').min(0),
    payment_status: z.string().min(1, 'Payment status is required'),
    amount_paid: z.coerce.number().min(0).optional().default(0),
  })
  .refine((data) => data.preferred_date >= today, {
    path: ['preferred_date'],
    message: 'Date must be today or later',
  })
  .refine((data) => Number(data.amount_paid || 0) <= Number(data.amount_due || 0), {
    path: ['amount_paid'],
    message: 'Amount paid cannot exceed amount due',
  })

function getPayload(response) {
  return response?.data ?? response ?? {}
}

function getRows(response, key) {
  const payload = getPayload(response)
  return payload[key] ?? payload.data ?? payload.items ?? []
}

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])

  return debounced
}

function mapBookingToForm(booking) {
  return {
    event_name: booking.event_name ?? '',
    event_type: booking.event_type ?? booking.type ?? '',
    preferred_date: (booking.preferred_date ?? booking.date ?? '').slice(0, 10),
    preferred_time: booking.preferred_time ?? booking.time ?? '',
    duration_hours: booking.duration_hours ?? booking.duration ?? 1,
    expected_guests: booking.expected_guests ?? booking.guests ?? 1,
    hall_id: String(booking.hall_id ?? booking.hall?.id ?? ''),
    notes: booking.notes ?? '',
    amount_due: booking.amount_due ?? 0,
    payment_status: booking.payment_status ?? 'unpaid',
    amount_paid: booking.amount_paid ?? 0,
  }
}

export default function BookingForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const isEditMode = Boolean(id && location.pathname.endsWith('/edit'))
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClient, setNewClient] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
  })
  const debouncedSearch = useDebouncedValue(clientSearch)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      event_name: '',
      event_type: '',
      preferred_date: today,
      preferred_time: '',
      duration_hours: 1,
      expected_guests: 1,
      hall_id: '',
      notes: '',
      amount_due: 0,
      payment_status: 'unpaid',
      amount_paid: 0,
    },
  })

  const paymentStatus = watch('payment_status')

  const { data: bookingData, isLoading: bookingLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBookingById(id),
    enabled: isEditMode,
  })

  const { data: hallsData, isLoading: hallsLoading } = useQuery({
    queryKey: ['halls'],
    queryFn: getHalls,
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients', debouncedSearch],
    queryFn: () => getClients({ search: debouncedSearch }),
    enabled: debouncedSearch.length >= 2,
  })

  const booking = getPayload(bookingData).booking ?? getPayload(bookingData)
  const halls = getRows(hallsData, 'halls')
  const clients = getRows(clientsData, 'clients')

  useEffect(() => {
    if (!isEditMode || !booking?.id) return

    reset(mapBookingToForm(booking))
    const client = booking.client ?? null
    if (client) {
      setSelectedClient(client)
      setClientSearch(client.full_name ?? client.name ?? '')
    }
  }, [booking, isEditMode, reset])

  const hallOptions = useMemo(
    () =>
      halls.map((hall) => ({
        value: String(hall.id),
        label: `${hall.name} — Capacity: ${hall.capacity ?? 0} — ₦${hall.price_per_hour ?? 0}/hr`,
      })),
    [halls],
  )

  const submitMutation = useMutation({
    mutationFn: async (values) => {
      let clientId = selectedClient?.id ?? booking?.client_id

      if (showNewClient) {
        if (!newClient.full_name.trim()) {
          throw new Error('New client name is required')
        }
        const clientResponse = await createClient(newClient)
        const clientPayload = getPayload(clientResponse)
        clientId = clientPayload.client?.id ?? clientPayload.id
      }

      if (!clientId) {
        throw new Error('Select an existing client or create a new one')
      }

      const payload = {
        ...values,
        client_id: clientId,
        hall_id: Number(values.hall_id),
        duration_hours: Number(values.duration_hours),
        expected_guests: Number(values.expected_guests),
        amount_due: Number(values.amount_due),
        amount_paid: Number(values.amount_paid || 0),
      }

      return isEditMode ? updateBooking(id, payload) : createBooking(payload)
    },
    onSuccess: (response) => {
      const payload = getPayload(response)
      const bookingId = payload.booking?.id ?? payload.id ?? id
      toast.success(isEditMode ? 'Booking updated' : 'Booking created')
      navigate(`/bookings/${bookingId}`)
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message ?? error.message ?? 'Could not save booking')
    },
  })

  if (bookingLoading || hallsLoading) {
    return <LoadingSpinner size="lg" className="min-h-[50vh]" />
  }

  return (
    <PageWrapper title={isEditMode ? 'Edit Booking' : 'New Booking'} backTo="/bookings">
      <form onSubmit={handleSubmit((values) => submitMutation.mutate(values))}>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Client">
            <div className="relative">
              <Input
                label="Search client"
                name="client_search"
                placeholder="Search by client name"
                icon={<Search className="h-4 w-4" />}
                value={clientSearch}
                onChange={(event) => {
                  setClientSearch(event.target.value)
                  setSelectedClient(null)
                }}
              />
              {clientSearch.length >= 2 && !selectedClient ? (
                <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                  {clients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => {
                        setSelectedClient(client)
                        setShowNewClient(false)
                        setClientSearch(client.full_name ?? client.name ?? '')
                      }}
                      className="block w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-slate-800"
                    >
                      <span className="font-medium">{client.full_name ?? client.name}</span>
                      <span className="block text-slate-500">{client.email ?? client.phone}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewClient(true)
                      setSelectedClient(null)
                      setNewClient((current) => ({ ...current, full_name: clientSearch }))
                    }}
                    className="flex w-full items-center gap-2 border-t border-slate-700 px-4 py-3 text-left text-sm font-medium text-[var(--primary)] hover:bg-slate-800"
                  >
                    <UserPlus className="h-4 w-4" />
                    Create new client
                  </button>
                </div>
              ) : null}
            </div>

            {selectedClient ? (
              <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">
                <p className="font-semibold text-slate-100">
                  {selectedClient.full_name ?? selectedClient.name}
                </p>
                <p className="mt-1 text-slate-400">{selectedClient.email ?? 'No email'}</p>
                <p className="mt-1 text-slate-400">{selectedClient.phone ?? 'No phone'}</p>
              </div>
            ) : null}

            {showNewClient ? (
              <div className="mt-5 grid gap-4">
                <Input
                  label="Full name"
                  name="new_client_full_name"
                  value={newClient.full_name}
                  onChange={(event) =>
                    setNewClient((current) => ({ ...current, full_name: event.target.value }))
                  }
                  required
                />
                <Input
                  label="Email"
                  name="new_client_email"
                  type="email"
                  value={newClient.email}
                  onChange={(event) =>
                    setNewClient((current) => ({ ...current, email: event.target.value }))
                  }
                />
                <Input
                  label="Phone"
                  name="new_client_phone"
                  value={newClient.phone}
                  onChange={(event) =>
                    setNewClient((current) => ({ ...current, phone: event.target.value }))
                  }
                />
                <Input
                  label="Address"
                  name="new_client_address"
                  value={newClient.address}
                  onChange={(event) =>
                    setNewClient((current) => ({ ...current, address: event.target.value }))
                  }
                />
              </div>
            ) : null}
          </Card>

          <Card title="Payment">
            <div className="grid gap-4">
              <Input
                label="Amount Due"
                name="amount_due"
                type="number"
                error={errors.amount_due?.message}
                required
                {...register('amount_due')}
              />
              <Select
                label="Payment Status"
                name="payment_status"
                options={paymentStatusOptions}
                error={errors.payment_status?.message}
                required
                {...register('payment_status')}
              />
              {paymentStatus === 'partial' || paymentStatus === 'paid' ? (
                <Input
                  label="Amount Paid"
                  name="amount_paid"
                  type="number"
                  error={errors.amount_paid?.message}
                  required
                  {...register('amount_paid')}
                />
              ) : null}
            </div>
          </Card>

          <Card title="Event Details" className="xl:col-span-2">
            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label="Event Name"
                name="event_name"
                error={errors.event_name?.message}
                required
                {...register('event_name')}
              />
              <Select
                label="Event Type"
                name="event_type"
                options={eventTypeOptions}
                placeholder="Select event type"
                error={errors.event_type?.message}
                required
                {...register('event_type')}
              />
              <Input
                label="Preferred Date"
                name="preferred_date"
                type="date"
                min={today}
                error={errors.preferred_date?.message}
                required
                {...register('preferred_date')}
              />
              <Input
                label="Preferred Time"
                name="preferred_time"
                type="time"
                error={errors.preferred_time?.message}
                required
                {...register('preferred_time')}
              />
              <Input
                label="Duration in Hours"
                name="duration_hours"
                type="number"
                min="1"
                max="24"
                error={errors.duration_hours?.message}
                required
                {...register('duration_hours')}
              />
              <Input
                label="Expected Guests"
                name="expected_guests"
                type="number"
                min="1"
                error={errors.expected_guests?.message}
                required
                {...register('expected_guests')}
              />
              <Select
                label="Hall"
                name="hall_id"
                options={hallOptions}
                placeholder="Select hall"
                error={errors.hall_id?.message}
                required
                className="md:col-span-2"
                {...register('hall_id')}
              />
              <Textarea
                label="Notes"
                name="notes"
                rows={4}
                className="md:col-span-2"
                {...register('notes')}
              />
            </div>
          </Card>
        </div>

        <div className="sticky bottom-0 mt-8 flex justify-end gap-3 border-t border-slate-800 bg-slate-900/95 py-4 backdrop-blur">
          <Button variant="ghost" onClick={() => navigate('/bookings')}>
            Cancel
          </Button>
          <Button type="submit" loading={submitMutation.isPending}>
            Save
          </Button>
        </div>
      </form>
    </PageWrapper>
  )
}
