import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { Check, CheckCircle2, Plus } from 'lucide-react'
import { completeOnboarding } from '../../api/authApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import { useAuthStore } from '../../store/authStore'

const nigerianStates = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT Abuja',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
]

const stateOptions = nigerianStates.map((state) => ({ value: state, label: state }))
const timezoneOptions = [{ value: 'Africa/Lagos', label: 'Africa/Lagos' }]

function getDaysLeft(date) {
  if (!date) return 0

  const diff = new Date(date).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function getPayload(response) {
  return response?.data ?? response ?? {}
}

function emptyHall() {
  return {
    name: '',
    capacity: '',
    price_per_hour: '',
  }
}

function ChecklistItem({ children }) {
  return (
    <li className="flex items-center gap-3 text-sm text-slate-300">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
        <Check className="h-4 w-4" />
      </span>
      {children}
    </li>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { tenant, updateTenant, updateUser } = useAuthStore()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    business_name: tenant?.business_name ?? '',
    phone: '',
    address: '',
    city: '',
    state: '',
    timezone: 'Africa/Lagos',
    halls: [emptyHall()],
  })

  const isFreePlan = String(tenant?.plan ?? 'free').toLowerCase() === 'free'
  const businessName = formData.business_name || tenant?.business_name || 'your business'
  const daysLeft = getDaysLeft(tenant?.trial_ends_at)

  useEffect(() => {
    if (tenant?.business_name) {
      setFormData((current) => ({
        ...current,
        business_name: current.business_name || tenant.business_name,
      }))
    }
  }, [tenant?.business_name])

  useEffect(() => {
    if (step !== 3) return

    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
    })
  }, [step])

  function updateField(field, value) {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updateHall(index, field, value) {
    setFormData((current) => ({
      ...current,
      halls: current.halls.map((hall, hallIndex) =>
        hallIndex === index ? { ...hall, [field]: value } : hall,
      ),
    }))
  }

  function addHall() {
    if (isFreePlan && formData.halls.length >= 1) return

    setFormData((current) => ({
      ...current,
      halls: [...current.halls, emptyHall()],
    }))
  }

  async function handleFinish() {
    setSubmitting(true)
    setError('')

    try {
      const response = await completeOnboarding(formData)
      const payload = getPayload(response)

      if (payload.tenant) {
        updateTenant(payload.tenant)
      }

      updateUser({ onboarding_complete: true })
      navigate('/dashboard')
    } catch (err) {
      const payload = err?.response?.data?.data ?? err?.response?.data ?? {}
      setError(payload.message ?? err.message ?? 'Could not complete onboarding.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12 text-slate-100">
      <section className="w-full max-w-3xl">
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
          {step === 1 ? (
            <div>
              <div className="mb-6">
                <p className="text-sm font-medium text-[var(--primary)]">
                  Tell us about your business
                </p>
                <h1 className="mt-2 text-3xl font-semibold text-white">
                  Set up your business profile
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  You can change this anytime in settings
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <Input
                  label="Business Name"
                  name="business_name"
                  value={formData.business_name}
                  onChange={(event) => updateField('business_name', event.target.value)}
                  required
                />
                <Input
                  label="Phone Number"
                  name="phone"
                  type="tel"
                  placeholder="+234 801 234 5678"
                  value={formData.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                  hint="Use +234 prefix"
                />
                <Input
                  label="Address"
                  name="address"
                  value={formData.address}
                  onChange={(event) => updateField('address', event.target.value)}
                  className="md:col-span-2"
                />
                <Input
                  label="City"
                  name="city"
                  value={formData.city}
                  onChange={(event) => updateField('city', event.target.value)}
                />
                <Select
                  label="State"
                  name="state"
                  value={formData.state}
                  onChange={(event) => updateField('state', event.target.value)}
                  options={stateOptions}
                  placeholder="Select state"
                />
                <Select
                  label="Timezone"
                  name="timezone"
                  value={formData.timezone}
                  onChange={(event) => updateField('timezone', event.target.value)}
                  options={timezoneOptions}
                  className="md:col-span-2"
                />
              </div>

              <div className="mt-8 flex justify-end">
                <Button size="lg" onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div className="mb-6">
                <p className="text-sm font-medium text-[var(--primary)]">Set up your halls</p>
                <h1 className="mt-2 text-3xl font-semibold text-white">
                  Configure your venue spaces
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  Halls are the bookable spaces in your center
                </p>
              </div>

              <div className="mb-5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm text-indigo-200">
                Hall created during signup already exists. Update it here.
              </div>

              <div className="space-y-5">
                {formData.halls.map((hall, index) => (
                  <div key={index} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                    <p className="mb-4 text-sm font-semibold text-slate-200">Hall {index + 1}</p>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Input
                        label="Hall Name"
                        name={`hall_name_${index}`}
                        placeholder="Main Auditorium"
                        value={hall.name}
                        onChange={(event) => updateHall(index, 'name', event.target.value)}
                      />
                      <Input
                        label="Capacity"
                        name={`hall_capacity_${index}`}
                        type="number"
                        value={hall.capacity}
                        onChange={(event) => updateHall(index, 'capacity', event.target.value)}
                      />
                      <Input
                        label="Price per Hour ₦"
                        name={`hall_price_${index}`}
                        type="number"
                        value={hall.price_per_hour}
                        onChange={(event) =>
                          updateHall(index, 'price_per_hour', event.target.value)
                        }
                        hint="Optional"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={addHall}
                  disabled={isFreePlan && formData.halls.length >= 1}
                  className="inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)] transition hover:brightness-125 disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  <Plus className="h-4 w-4" />
                  Add Another Hall
                </button>
                {isFreePlan && formData.halls.length >= 1 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Free plan supports 1 hall. Upgrade to add more venue spaces.
                  </p>
                ) : null}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
                <Button variant="ghost" onClick={() => setStep(3)}>
                  Skip for now
                </Button>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button onClick={() => setStep(3)}>Continue</Button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mx-auto max-w-xl text-center">
              <div className="mx-auto flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="h-12 w-12" />
              </div>

              <h1 className="mt-8 text-3xl font-semibold text-white">
                Welcome to EventsHub, {businessName}!
              </h1>
              <p className="mt-3 text-sm text-slate-400">
                Your workspace is ready. Complete setup and start managing your events center.
              </p>

              <ul className="mx-auto mt-8 max-w-sm space-y-4 text-left">
                <ChecklistItem>Business profile created</ChecklistItem>
                <ChecklistItem>Venue configured</ChecklistItem>
                <ChecklistItem>{tenant?.plan ?? 'Free'} plan active</ChecklistItem>
                {tenant?.plan_status === 'trialing' ? (
                  <ChecklistItem>{daysLeft} days trial remaining</ChecklistItem>
                ) : null}
              </ul>

              {error ? (
                <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/15 p-4 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <Button
                size="lg"
                className="mt-8 w-full"
                loading={submitting}
                onClick={handleFinish}
              >
                Go to Dashboard
              </Button>
            </div>
          ) : null}
        </Card>
      </section>
    </main>
  )
}
