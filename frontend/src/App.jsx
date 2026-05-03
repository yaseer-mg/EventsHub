import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from 'react-router-dom'
import Button from './components/ui/Button'
import Input from './components/ui/Input'
import Card from './components/ui/Card'
import ImpersonationBanner from './components/layout/ImpersonationBanner'
import Navbar from './components/layout/Navbar'
import Sidebar from './components/layout/Sidebar'
import LoadingSpinner from './components/shared/LoadingSpinner'
import { useBranding } from './hooks/useBranding'
import { useAuthStore } from './store/authStore'
import AdminLayout from './pages/admin/AdminLayout'
import AuditLog from './pages/admin/AuditLog'
import PlatformOverview from './pages/admin/PlatformOverview'
import TenantDetail from './pages/admin/TenantDetail'
import TenantsPage from './pages/admin/TenantsPage'
import CheckEmail from './pages/auth/CheckEmail'
import ForgotPassword from './pages/auth/ForgotPassword'
import Login from './pages/auth/Login'
import ResetPassword from './pages/auth/ResetPassword'
import Signup from './pages/auth/Signup'
import VerifyEmail from './pages/auth/VerifyEmail'
import BookingDetail from './pages/bookings/BookingDetail'
import BookingForm from './pages/bookings/BookingForm'
import BookingList from './pages/bookings/BookingList'
import CalendarPage from './pages/calendar/CalendarPage'
import Dashboard from './pages/dashboard/Dashboard'
import AttendeesForm from './pages/events/AttendeesForm'
import EventDetail from './pages/events/EventDetail'
import UpcomingEvents from './pages/events/UpcomingEvents'
import GatePassCard from './pages/gatepass/GatePassCard'
import ScanConfirm from './pages/gatepass/ScanConfirm'
import Onboarding from './pages/onboarding/Onboarding'
import Reports from './pages/reports/Reports'
import Settings from './pages/settings/Settings'

const routeTitles = [
  { pattern: /^\/dashboard$/, title: 'Dashboard' },
  { pattern: /^\/bookings$/, title: 'Bookings' },
  { pattern: /^\/bookings\/new$/, title: 'New Booking' },
  { pattern: /^\/bookings\/[^/]+\/edit$/, title: 'Edit Booking' },
  { pattern: /^\/bookings\/[^/]+$/, title: 'Booking Details' },
  { pattern: /^\/events$/, title: 'Upcoming Events' },
  { pattern: /^\/events\/[^/]+\/attendees$/, title: 'Event Attendees' },
  { pattern: /^\/events\/[^/]+$/, title: 'Event Details' },
  { pattern: /^\/gatepass\/[^/]+$/, title: 'Gate Pass' },
  { pattern: /^\/scan$/, title: 'QR Scanner' },
  { pattern: /^\/calendar$/, title: 'Calendar' },
  { pattern: /^\/reports$/, title: 'Reports' },
  { pattern: /^\/settings(\/.*)?$/, title: 'Settings' },
]

function getPageTitle(pathname) {
  return routeTitles.find((route) => route.pattern.test(pathname))?.title ?? 'EventsHub'
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <LoadingSpinner size="lg" />
    </div>
  )
}

function AuthBootstrap() {
  const loadUser = useAuthStore((state) => state.loadUser)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    let mounted = true

    async function restoreSession() {
      try {
        await loadUser()
      } catch {
        // Route guards handle unauthenticated and failed restore states.
      } finally {
        if (mounted) {
          setCheckingAuth(false)
        }
      }
    }

    restoreSession()

    return () => {
      mounted = false
    }
  }, [loadUser])

  if (checkingAuth) {
    return <FullScreenLoader />
  }

  return <AppRoutes />
}

function PublicRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

function ProtectedRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!user?.onboarding_complete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}

function AdminRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const role = useAuthStore((state) => state.user?.role)

  if (!isAuthenticated || role !== 'super_admin') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

function MainLayout() {
  useBranding()

  const loadUser = useAuthStore((state) => state.loadUser)
  const location = useLocation()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    async function refreshUser() {
      setLoading(true)

      try {
        await loadUser()
      } catch {
        // Axios/global route guards own auth failure handling.
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    refreshUser()

    return () => {
      mounted = false
    }
  }, [loadUser])

  if (loading) {
    return <FullScreenLoader />
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <ImpersonationBanner />
      <Sidebar />
      <div className="min-h-screen pl-64">
        <Navbar title={getPageTitle(location.pathname)} />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function TokenAwarePage({ Component }) {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  return <Component token={token} />
}

function AcceptInvitation() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12 text-slate-100">
      <Card title="Accept Invitation" subtitle="Create your account to join the workspace.">
        <form className="space-y-4">
          <input type="hidden" name="token" value={token ?? ''} />
          <Input label="Full name" name="name" required />
          <Input label="Password" name="password" type="password" required />
          <Button type="submit" className="w-full">
            Accept Invitation
          </Button>
        </form>
      </Card>
    </main>
  )
}

function PublicPlansPage() {
  const plans = [
    { name: 'Free', price: '$0', description: 'Start managing small events.' },
    { name: 'Pro', price: '$29', description: 'Scale bookings, reports, and attendee flows.' },
    { name: 'Enterprise', price: 'Custom', description: 'Advanced controls for large teams.' },
  ]

  return (
    <main className="min-h-screen bg-slate-900 px-6 py-16 text-slate-100">
      <section className="mx-auto max-w-5xl">
        <div className="mb-10 max-w-2xl">
          <h1 className="text-4xl font-semibold">Choose your EventsHub plan</h1>
          <p className="mt-3 text-slate-400">
            Pick the workspace plan that matches your current event operations.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.name} title={plan.name} subtitle={plan.description}>
              <p className="mb-6 text-3xl font-semibold text-slate-100">{plan.price}</p>
              <Button>{plan.name === 'Enterprise' ? 'Contact sales' : 'Start now'}</Button>
            </Card>
          ))}
        </div>
      </section>
    </main>
  )
}

function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <p className="text-sm font-medium uppercase text-slate-500">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-100">Page not found</h1>
      <p className="mt-3 max-w-md text-slate-400">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button className="mt-6" onClick={() => window.history.back()}>
        Go Back
      </Button>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/check-email" element={<CheckEmail />} />
        <Route path="/verify-email" element={<TokenAwarePage Component={VerifyEmail} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<TokenAwarePage Component={ResetPassword} />} />
        <Route path="/accept-invite" element={<AcceptInvitation />} />
        <Route path="/billing/plans" element={<PublicPlansPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<Onboarding />} />

        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/bookings" element={<BookingList />} />
          <Route path="/bookings/new" element={<BookingForm />} />
          <Route path="/bookings/:id/edit" element={<BookingForm />} />
          <Route path="/bookings/:id" element={<BookingDetail />} />
          <Route path="/events" element={<UpcomingEvents />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/events/:id/attendees" element={<AttendeesForm />} />
          <Route path="/gatepass/:attendeeId" element={<GatePassCard />} />
          <Route path="/scan" element={<ScanConfirm />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/:tab" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/overview" replace />} />
          <Route path="overview" element={<PlatformOverview />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="tenants/:id" element={<TenantDetail />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap />
    </BrowserRouter>
  )
}
