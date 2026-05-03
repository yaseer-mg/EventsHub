import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, CheckCircle2, Eye, EyeOff, LineChart, ShieldCheck, Sparkles } from 'lucide-react'
import { signup } from '../../api/authApi'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

const features = [
  {
    icon: CheckCircle2,
    text: 'Launch booking workflows for halls, clients, and events in minutes.',
  },
  {
    icon: LineChart,
    text: 'Track utilization, revenue, and upcoming activity from one dashboard.',
  },
  {
    icon: ShieldCheck,
    text: 'Keep tenant data, team access, and attendee operations organized.',
  },
]

function getErrorPayload(error) {
  return error?.response?.data?.data ?? error?.response?.data ?? {}
}

function getPasswordScore(password = '') {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]

  return checks.filter(Boolean).length
}

function getStrengthMeta(score) {
  if (score <= 1) {
    return { label: 'Weak', color: 'bg-red-500', width: '25%' }
  }

  if (score <= 3) {
    return { label: 'Medium', color: 'bg-amber-500', width: '65%' }
  }

  return { label: 'Strong', color: 'bg-emerald-500', width: '100%' }
}

function PasswordInput({
  id,
  label,
  placeholder,
  error,
  disabled,
  registerProps,
  show,
  onToggle,
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-300">
        {label} <span className="ml-1 text-red-400">*</span>
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${id}-error` : undefined}
          className={[
            'w-full rounded-lg border bg-slate-900 py-2 pl-3 pr-11 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60',
            error ? 'border-red-500' : 'border-slate-700',
          ].join(' ')}
          {...registerProps}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200"
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default function Signup() {
  const navigate = useNavigate()
  const [apiError, setApiError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      full_name: '',
      business_name: '',
      email: '',
      phone: '',
      password: '',
      confirm_password: '',
      terms: false,
    },
  })

  const password = watch('password')
  const strength = getStrengthMeta(getPasswordScore(password))

  async function onSubmit(values) {
    setApiError('')

    try {
      await signup({
        full_name: values.full_name,
        business_name: values.business_name,
        email: values.email,
        phone: values.phone || undefined,
        password: values.password,
      })

      navigate('/check-email', { state: { email: values.email } })
    } catch (error) {
      const payload = getErrorPayload(error)
      setApiError(payload.message ?? error.message ?? 'Could not create your account.')
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-900 text-slate-100 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-slate-900 px-12 py-12 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300">
            <Sparkles className="h-9 w-9" />
          </div>

          <div className="mt-8">
            <h1 className="text-4xl font-semibold tracking-tight text-white">
              Join 100+ events centers
            </h1>
            <p className="mt-3 max-w-md text-lg text-slate-400">
              Bring bookings, events, attendees, and reporting into one focused workspace.
            </p>
          </div>

          <div className="mt-12 space-y-5">
            {features.map((feature) => {
              const Icon = feature.icon

              return (
                <div key={feature.text} className="flex gap-4">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-indigo-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="max-w-md text-sm leading-6 text-slate-300">{feature.text}</p>
                </div>
              )
            })}
          </div>
        </div>

        <Link
          to="/login"
          className="inline-flex w-fit items-center text-sm font-medium text-indigo-300 transition hover:text-indigo-200"
        >
          Already have an account? Sign in
        </Link>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-slate-800 px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300">
              <Calendar className="h-7 w-7" />
            </div>
            <p className="text-lg font-semibold text-white">EventsHub</p>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              Create your free account
            </h2>
            <p className="mt-2 text-sm text-slate-400">14-day trial, no credit card</p>
          </div>

          {apiError ? (
            <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/15 p-4 text-sm text-red-200">
              {apiError}
            </div>
          ) : null}

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            <Input
              label="Full Name"
              name="full_name"
              placeholder="Your full name"
              error={errors.full_name?.message}
              required
              disabled={isSubmitting}
              {...register('full_name', { required: 'Full name is required' })}
            />

            <Input
              label="Business Name"
              name="business_name"
              placeholder="Grand Hall Events"
              hint="Your events center's name"
              error={errors.business_name?.message}
              required
              disabled={isSubmitting}
              {...register('business_name', { required: 'Business name is required' })}
            />

            <Input
              label="Email"
              name="email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              required
              disabled={isSubmitting}
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Enter a valid email address',
                },
              })}
            />

            <Input
              label="Phone"
              name="phone"
              type="tel"
              placeholder="+234 801 234 5678"
              hint="Optional. Include +234 prefix for Nigerian numbers."
              error={errors.phone?.message}
              disabled={isSubmitting}
              {...register('phone')}
            />

            <div className="space-y-2">
              <PasswordInput
                id="password"
                label="Password"
                placeholder="Create a password"
                error={errors.password?.message}
                disabled={isSubmitting}
                show={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                registerProps={register('password', {
                  required: 'Password is required',
                  validate: (value) =>
                    getPasswordScore(value) >= 3 ||
                    'Use at least 8 characters with uppercase, number, or symbol',
                })}
              />

              <div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className={['h-full rounded-full transition-all', strength.color].join(' ')}
                    style={{ width: password ? strength.width : '0%' }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Password strength: {password ? strength.label : 'Not started'}
                </p>
              </div>
            </div>

            <PasswordInput
              id="confirm_password"
              label="Confirm Password"
              placeholder="Confirm your password"
              error={errors.confirm_password?.message}
              disabled={isSubmitting}
              show={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((value) => !value)}
              registerProps={register('confirm_password', {
                required: 'Confirm your password',
                validate: (value) => value === password || 'Passwords do not match',
              })}
            />

            <label className="flex items-start gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                disabled={isSubmitting}
                className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-[var(--primary)] focus:ring-[var(--primary)]"
                {...register('terms', {
                  required: 'You must agree to the Terms of Service',
                })}
              />
              <span>
                I agree to{' '}
                <a href="/terms" className="font-medium text-indigo-300 hover:text-indigo-200">
                  Terms of Service
                </a>
              </span>
            </label>
            {errors.terms ? <p className="text-xs text-red-400">{errors.terms.message}</p> : null}

            <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
              Create Account
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}
