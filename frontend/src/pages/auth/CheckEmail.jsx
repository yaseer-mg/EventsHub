import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { resendVerification } from '../../api/authApi'
import Button from '../../components/ui/Button'

function getErrorPayload(error) {
  return error?.response?.data?.data ?? error?.response?.data ?? {}
}

export default function CheckEmail() {
  const location = useLocation()
  const email = location.state?.email ?? ''
  const [cooldown, setCooldown] = useState(60)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (cooldown <= 0) return undefined

    const timer = window.setTimeout(() => {
      setCooldown((value) => value - 1)
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function handleResend() {
    if (!email || cooldown > 0) return

    setLoading(true)
    setMessage('')
    setError('')

    try {
      await resendVerification(email)
      setMessage('Verification email sent again. Check your inbox.')
      setCooldown(60)
    } catch (err) {
      const payload = getErrorPayload(err)
      setError(payload.message ?? err.message ?? 'Could not resend verification email.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12 text-slate-100">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto flex h-20 w-20 animate-pulse items-center justify-center rounded-3xl bg-indigo-500/20 text-indigo-300">
          <MailCheck className="h-11 w-11" />
        </div>

        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-white">Check your email</h1>
        <p className="mt-3 text-sm text-slate-400">We sent a verification link to:</p>

        <div className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm font-medium text-indigo-200">
          {email || 'your email address'}
        </div>

        <p className="mt-5 text-sm leading-6 text-slate-400">
          Click the link in the email to activate your account.
        </p>

        <div className="my-8 h-px bg-slate-800" />

        <div>
          <h2 className="text-sm font-semibold text-slate-100">Didn&apos;t receive it?</h2>
          <p className="mt-2 text-sm text-slate-500">
            Check your spam folder, or resend the verification email.
          </p>

          {message ? <p className="mt-4 text-sm text-emerald-400">{message}</p> : null}
          {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

          <Button
            type="button"
            onClick={handleResend}
            loading={loading}
            disabled={!email || cooldown > 0}
            className="mt-5 w-full"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
          </Button>
        </div>

        <Link
          to="/signup"
          className="mt-6 inline-flex text-sm font-medium text-slate-400 transition hover:text-slate-100"
        >
          Wrong email? Go back
        </Link>
      </section>
    </main>
  )
}
