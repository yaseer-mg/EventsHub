import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
  Users,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { resendVerification } from '../../api/authApi'
import { useAuthStore } from '../../store/authStore'

const features = [
  {
    icon: Calendar,
    text: 'Track bookings, events, and venue availability in one place.',
  },
  {
    icon: Users,
    text: 'Manage attendees, gate passes, and QR scanning workflows.',
  },
  {
    icon: BarChart3,
    text: 'Monitor revenue, usage, and performance with clear reports.',
  },
]

function getPayload(response) {
  return response?.data ?? response ?? {}
}

function getErrorPayload(error) {
  return error?.response?.data?.data ?? error?.response?.data ?? {}
}

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const [showPassword, setShowPassword] = useState(false)
  const [apiError, setApiError] = useState('')
  const [verifyEmail, setVerifyEmail] = useState(null)
  const [resending, setResending] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
  })

  async function onSubmit(values) {
    setApiError('')
    setVerifyEmail(null)

    try {
      const response = await login(values)
      const payload = getPayload(response)
      const user = payload.user ?? {}

      if (!user.onboarding_complete) {
        navigate('/onboarding')
        return
      }

      navigate('/dashboard')
    } catch (error) {
      const payload = getErrorPayload(error)

      if (error?.response?.status === 403 && payload.action === 'VERIFY_EMAIL') {
        setVerifyEmail(values.email)
        setApiError(payload.message ?? 'Please verify your email address before signing in.')
        return
      }

      setApiError(payload.message ?? error.message ?? 'Unable to sign in. Please try again.')
    }
  }

  async function handleResendVerification() {
    if (!verifyEmail) return

    setResending(true)
    setApiError('')

    try {
      await resendVerification(verifyEmail)
      setApiError('Verification email sent. Check your inbox.')
    } catch (error) {
      const payload = getErrorPayload(error)
      setApiError(payload.message ?? error.message ?? 'Could not resend verification email.')
    } finally {
      setResending(false)
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-900 text-slate-100 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-slate-900 px-12 py-12 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300">
            <Calendar className="h-9 w-9" />
          </div>

          <div className="mt-8">
            <h1 className="text-4xl font-semibold tracking-tight text-white">EventsHub</h1>
            <p className="mt-3 text-lg text-slate-400">Manage your events center smarter</p>
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
          to="/signup"
          className="inline-flex w-fit items-center text-sm font-medium text-indigo-300 transition hover:text-indigo-200"
        >
          Don&apos;t have an account? Sign up free →
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
            <h2 className="text-3xl font-semibold tracking-tight text-white">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-400">Sign in to your account</p>
          </div>

          {apiError ? (
            <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/15 p-4 text-sm text-red-200">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
                <div>
                  <p>{apiError}</p>
                  {verifyEmail ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={resending}
                      disabled={isSubmitting}
                      onClick={handleResendVerification}
                      className="mt-3 text-red-100 hover:bg-red-500/20"
                      icon={<CheckCircle2 className="h-4 w-4" />}
                    >
                      Resend verification
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
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

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-300">
                Password <span className="ml-1 text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  disabled={isSubmitting}
                  aria-invalid={errors.password ? 'true' : 'false'}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  className={[
                    'w-full rounded-lg border bg-slate-900 py-2 pl-3 pr-11 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60',
                    errors.password ? 'border-red-500' : 'border-slate-700',
                  ].join(' ')}
                  {...register('password', {
                    required: 'Password is required',
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password ? (
                <p id="password-error" className="mt-1 text-xs text-red-400">
                  {errors.password.message}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-slate-300 transition hover:text-white"
              >
                Forgot password?
              </Link>
            </div>

            <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
              Sign In
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}
