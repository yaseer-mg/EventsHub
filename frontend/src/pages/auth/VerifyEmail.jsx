import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle } from 'lucide-react'
import { verifyEmail } from '../../api/authApi'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/shared/LoadingSpinner'

export default function VerifyEmail({ token: tokenProp }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = tokenProp ?? searchParams.get('token')
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let mounted = true

    async function verify() {
      if (!token) {
        setStatus('error')
        return
      }

      try {
        await verifyEmail(token)

        if (mounted) {
          setStatus('success')
        }
      } catch {
        if (mounted) {
          setStatus('error')
        }
      }
    }

    verify()

    return () => {
      mounted = false
    }
  }, [token])

  useEffect(() => {
    if (status !== 'success') return undefined

    const timer = window.setTimeout(() => {
      navigate('/login')
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [navigate, status])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-8 text-center">
        {status === 'loading' ? (
          <>
            <LoadingSpinner size="lg" className="mb-6" />
            <h1 className="text-2xl font-semibold text-white">Verifying your email...</h1>
          </>
        ) : null}

        {status === 'success' ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle className="h-9 w-9" />
            </div>
            <h1 className="mt-6 text-3xl font-semibold text-white">Email Verified!</h1>
            <p className="mt-3 text-sm text-slate-400">Redirecting to login in 3s...</p>
            <Link
              to="/login"
              className="mt-6 inline-flex text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
            >
              Go to login now
            </Link>
          </>
        ) : null}

        {status === 'error' ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400">
              <XCircle className="h-9 w-9" />
            </div>
            <h1 className="mt-6 text-3xl font-semibold text-white">Link Invalid or Expired</h1>
            <p className="mt-3 text-sm text-slate-400">
              The verification link is no longer valid. Request a new one to activate your account.
            </p>
            <Button className="mt-6 w-full" onClick={() => navigate('/check-email')}>
              Request new verification email
            </Button>
          </>
        ) : null}
      </section>
    </main>
  )
}
