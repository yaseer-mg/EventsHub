import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { resetPassword } from '../../api/authApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'

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

export default function ResetPassword({ token: tokenProp }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = tokenProp ?? searchParams.get('token')
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
      password: '',
      confirm_password: '',
    },
  })

  const password = watch('password')
  const strength = getStrengthMeta(getPasswordScore(password))

  async function onSubmit(values) {
    if (!token) {
      setApiError('Reset token is missing or invalid.')
      return
    }

    setApiError('')

    try {
      await resetPassword({
        token,
        password: values.password,
        password_confirmation: values.confirm_password,
      })
      toast.success('Password reset successfully. You can now sign in.')
      navigate('/login')
    } catch (error) {
      const payload = getErrorPayload(error)
      setApiError(payload.message ?? error.message ?? 'Reset link is invalid or expired.')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12 text-slate-100">
      <div className="w-full max-w-md">
        <Card padding>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300">
            <KeyRound className="h-8 w-8" />
          </div>

          <div className="mt-6 text-center">
            <h1 className="text-2xl font-semibold text-white">Set new password</h1>
            <p className="mt-2 text-sm text-slate-400">
              Choose a strong password for your account.
            </p>
          </div>

          {(!token || apiError) ? (
            <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/15 p-4 text-sm text-red-200">
              <p>{apiError || 'Reset token is missing or invalid.'}</p>
              <Link
                to="/forgot-password"
                className="mt-3 inline-flex font-medium text-red-100 underline-offset-4 hover:underline"
              >
                Request a new reset link
              </Link>
            </div>
          ) : null}

          {token ? (
            <form className="mt-6 space-y-5" onSubmit={handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <PasswordInput
                  id="password"
                  label="New Password"
                  placeholder="Enter new password"
                  error={errors.password?.message}
                  disabled={isSubmitting}
                  show={showPassword}
                  onToggle={() => setShowPassword((value) => !value)}
                  registerProps={register('password', {
                    required: 'New password is required',
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
                placeholder="Confirm new password"
                error={errors.confirm_password?.message}
                disabled={isSubmitting}
                show={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((value) => !value)}
                registerProps={register('confirm_password', {
                  required: 'Confirm your new password',
                  validate: (value) => value === password || 'Passwords do not match',
                })}
              />

              <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
                Reset Password
              </Button>
            </form>
          ) : null}
        </Card>
      </div>
    </main>
  )
}
