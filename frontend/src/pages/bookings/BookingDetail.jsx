import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Calendar,
  Clock,
  Edit,
  FileText,
  Landmark,
  Timer,
  Users,
} from 'lucide-react'
import {
  getBookingById,
  toggleBookingActive,
  updateBookingStatus,
  updatePayment,
} from '../../api/bookingsApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Toggle from '../../components/ui/Toggle'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import StatusBadge from '../../components/shared/StatusBadge'
import PageWrapper from '../../components/layout/PageWrapper'

const paymentOptions = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
]

function getPayload(response) {
  return response?.data ?? response ?? {}
}

function formatCurrency(value = 0) {
  return `₦${new Intl.NumberFormat('en-NG').format(Number(value) || 0)}`
}

function formatDate(date) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-slate-900 p-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
      <div>
        <p className="text-xs uppercase text-slate-500">{label}</p>
        <p className="mt-1 text-sm font-medium text-slate-100">{value || '-'}</p>
      </div>
    </div>
  )
}

export default function BookingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmAction, setConfirmAction] = useState(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [paymentForm, setPaymentForm] = useState({ payment_status: 'unpaid', amount_paid: 0 })

  const { data, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBookingById(id),
  })

  const booking = getPayload(data).booking ?? getPayload(data)
  const amountDue = Number(booking.amount_due) || 0
  const amountPaid = Number(booking.amount_paid) || 0
  const balance = Math.max(0, amountDue - amountPaid)
  const isPending = booking.status === 'pending'
  const isApproved = booking.status === 'approved'
  const isPaid = booking.payment_status === 'paid'

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['booking', id] })
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
  }

  const statusMutation = useMutation({
    mutationFn: ({ status, reason }) => updateBookingStatus(id, status, reason ? { reason } : {}),
    onSuccess: () => {
      toast.success('Booking status updated')
      invalidate()
      setConfirmAction(null)
      setRejectOpen(false)
      setRejectReason('')
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message ?? error.message ?? 'Could not update status')
    },
  })

  const paymentMutation = useMutation({
    mutationFn: (payload) => updatePayment(id, payload),
    onSuccess: () => {
      toast.success('Payment updated')
      invalidate()
      setPaymentOpen(false)
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message ?? error.message ?? 'Could not update payment')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: () => toggleBookingActive(id),
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(error?.response?.data?.message ?? error.message ?? 'Could not toggle booking')
    },
  })

  function openPaymentModal() {
    setPaymentForm({
      payment_status: booking.payment_status ?? 'unpaid',
      amount_paid: booking.amount_paid ?? 0,
    })
    setPaymentOpen(true)
  }

  if (isLoading) {
    return <LoadingSpinner size="lg" className="min-h-[50vh]" />
  }

  return (
    <PageWrapper
      title={booking.event_name ?? 'Booking Detail'}
      backTo="/bookings"
      actions={
        <div className="flex gap-2">
          {isPending ? (
            <Button
              variant="outline"
              icon={<Edit className="h-4 w-4" />}
              onClick={() => navigate(`/bookings/${id}/edit`)}
            >
              Edit
            </Button>
          ) : null}
          {isPending ? (
            <>
              <Button
                variant="success"
                onClick={() => setConfirmAction({ status: 'approved' })}
              >
                Approve
              </Button>
              <Button variant="danger" onClick={() => setRejectOpen(true)}>
                Reject
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <Card title="Event Information">
            <div className="grid gap-3 md:grid-cols-2">
              <DetailRow icon={Calendar} label="Date" value={formatDate(booking.preferred_date ?? booking.date)} />
              <DetailRow icon={Clock} label="Time" value={booking.preferred_time ?? booking.time} />
              <DetailRow icon={Timer} label="Duration" value={`${booking.duration_hours ?? booking.duration ?? '-'} hours`} />
              <DetailRow icon={Users} label="Guests" value={booking.expected_guests ?? booking.guests} />
              <DetailRow icon={Landmark} label="Hall" value={booking.hall_name ?? booking.hall?.name} />
              <DetailRow icon={FileText} label="Event Type" value={booking.event_type ?? booking.type} />
            </div>
            {booking.notes ? (
              <div className="mt-5 rounded-lg bg-slate-900 p-4">
                <p className="text-xs uppercase text-slate-500">Notes</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{booking.notes}</p>
              </div>
            ) : null}
          </Card>

          <Card
            title="Payment Information"
            actions={
              <Button variant="outline" size="sm" onClick={openPaymentModal}>
                Update Payment
              </Button>
            }
          >
            <div className="mb-5">
              <StatusBadge status={booking.payment_status} type="payment" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-slate-900 p-4">
                <p className="text-xs uppercase text-slate-500">Amount Due</p>
                <p className="mt-2 text-xl font-semibold text-slate-100">
                  {formatCurrency(amountDue)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-900 p-4">
                <p className="text-xs uppercase text-slate-500">Amount Paid</p>
                <p className="mt-2 text-xl font-semibold text-emerald-400">
                  {formatCurrency(amountPaid)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-900 p-4">
                <p className="text-xs uppercase text-slate-500">Balance</p>
                <p className="mt-2 text-xl font-semibold text-amber-400">
                  {formatCurrency(balance)}
                </p>
              </div>
            </div>
          </Card>

          <Card title="Client Information">
            <div className="grid gap-4 md:grid-cols-2">
              <DetailRow icon={Users} label="Name" value={booking.client?.full_name ?? booking.client_name} />
              <DetailRow icon={FileText} label="Email" value={booking.client?.email} />
              <DetailRow icon={FileText} label="Phone" value={booking.client?.phone} />
              <DetailRow icon={FileText} label="Address" value={booking.client?.address} />
            </div>
            <div className="mt-5 flex items-center justify-between rounded-lg bg-slate-900 p-4 text-sm">
              <span className="text-slate-400">
                Total bookings with this client: {booking.client?.bookings_count ?? 0}
              </span>
              <Link
                to={`/clients/${booking.client_id ?? booking.client?.id}`}
                className="font-medium text-[var(--primary)] hover:brightness-125"
              >
                View Client History
              </Link>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Status & Actions">
            <div className="mb-5">
              <StatusBadge status={booking.status} type="booking" />
            </div>

            {isPending ? (
              <div className="space-y-3">
                <Button
                  variant="success"
                  className="w-full"
                  onClick={() => setConfirmAction({ status: 'approved' })}
                >
                  Approve Booking
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setRejectOpen(true)}>
                  Reject Booking
                </Button>
              </div>
            ) : null}

            {isApproved && !isPaid ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/15 p-4 text-sm text-amber-200">
                <p>Awaiting payment to schedule event</p>
                <Button
                  className="mt-4 w-full"
                  variant="secondary"
                  onClick={() =>
                    paymentMutation.mutate({ payment_status: 'paid', amount_paid: amountDue })
                  }
                  loading={paymentMutation.isPending}
                >
                  Mark as Paid
                </Button>
              </div>
            ) : null}

            {isApproved && isPaid ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 p-4 text-sm text-emerald-200">
                <p>✓ Event is scheduled</p>
                {booking.event_id ? (
                  <Button
                    className="mt-4 w-full"
                    variant="success"
                    onClick={() => navigate(`/events/${booking.event_id}`)}
                  >
                    View Event →
                  </Button>
                ) : null}
              </div>
            ) : null}

            {booking.status === 'rejected' || booking.status === 'cancelled' ? (
              <Button
                className="w-full"
                onClick={() => statusMutation.mutate({ status: 'pending' })}
                loading={statusMutation.isPending}
              >
                Reactivate
              </Button>
            ) : null}

            <div className="mt-6 flex items-center justify-between border-t border-slate-700 pt-5">
              <span className="text-sm font-medium text-slate-300">Active</span>
              <Toggle
                checked={Boolean(booking.is_active ?? booking.active)}
                disabled={toggleMutation.isPending}
                onChange={() => toggleMutation.mutate()}
              />
            </div>
          </Card>

          <Card title="Timeline">
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-slate-100">Created</p>
                <p className="text-slate-400">
                  {formatDate(booking.created_at)} {booking.created_by ? `by ${booking.created_by}` : ''}
                </p>
              </div>
              <div>
                <p className="font-medium text-slate-100">Last Updated</p>
                <p className="text-slate-400">{formatDate(booking.updated_at)}</p>
              </div>
              {booking.approved_at ? (
                <div>
                  <p className="font-medium text-slate-100">Approved</p>
                  <p className="text-slate-400">
                    {formatDate(booking.approved_at)}{' '}
                    {booking.approved_by ? `by ${booking.approved_by}` : ''}
                  </p>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => statusMutation.mutate(confirmAction)}
        title="Approve booking?"
        message="This booking will be approved and can move into payment or event scheduling."
        confirmLabel="Approve"
        loading={statusMutation.isPending}
      />

      <Modal
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject booking"
        size="sm"
      >
        <div className="space-y-5">
          <Textarea
            label="Reason"
            name="reject_reason"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Add a reason for rejecting this booking"
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={statusMutation.isPending}
              onClick={() => statusMutation.mutate({ status: 'rejected', reason: rejectReason })}
            >
              Reject Booking
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Update Payment"
        size="sm"
      >
        <div className="space-y-5">
          <Select
            label="Payment Status"
            name="payment_status"
            value={paymentForm.payment_status}
            onChange={(event) =>
              setPaymentForm((current) => ({ ...current, payment_status: event.target.value }))
            }
            options={paymentOptions}
          />
          <Input
            label="Amount Paid"
            name="amount_paid"
            type="number"
            value={paymentForm.amount_paid}
            onChange={(event) =>
              setPaymentForm((current) => ({ ...current, amount_paid: event.target.value }))
            }
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setPaymentOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={paymentMutation.isPending}
              onClick={() => paymentMutation.mutate(paymentForm)}
            >
              Save Payment
            </Button>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  )
}
