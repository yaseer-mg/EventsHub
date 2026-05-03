import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Mail } from 'lucide-react'
import { forgotPassword } from '../../api/authApi'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'

function getErrorPayload(error) {
  return error?.response?.data?.data ?? error?.response?.data ?? {}
}

export default function ForgotPassword() {
  const [successEmail, setSuccessEmail] = useState('')
  const [apiError, setApiError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      email: '',
    },
  })

  async function onSubmit(values) {
    setApiError('')

    try {
      await forgotPassword(values.email)
      setSuccessEmail(values.email)
    } catch (error) {
      const payload = getErrorPayload(error)
      setApiError(payload.message ?? error.message ?? 'Could not send reset link.')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12 text-slate-100">
      <div className="w-full max-w-md">
        <Link
          to="/login"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <Card padding>
          {successEmail ? (
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <CheckCircle className="h-9 w-9" />
              </div>
              <h1 className="mt-6 text-2xl font-semibold text-white">Check your email</h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                We sent a password reset link to{' '}
                <span className="font-medium text-slate-200">{successEmail}</span>.
              </p>
            </div>
          ) : (
            <>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300">
                <Mail className="h-8 w-8" />
              </div>

              <div className="mt-6 text-center">
                <h1 className="text-2xl font-semibold text-white">Forgot your password?</h1>
                <p className="mt-2 text-sm text-slate-400">
                  Enter your email and we&apos;ll send a reset link
                </p>
              </div>

              {apiError ? (
                <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/15 p-4 text-sm text-red-200">
                  {apiError}
                </div>
              ) : null}

              <form className="mt-6 space-y-5" onSubmit={handleSubmit(onSubmit)}>
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

                <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
                  Send Reset Link
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </main>
  )
}
