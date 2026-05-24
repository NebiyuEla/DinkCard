import { Toaster } from "@/components/ui/sonner";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import React from 'react';
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import PageNotFound from './lib/PageNotFound';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import LegalPage from './pages/LegalPage';
import Dashboard from './pages/Dashboard';
import AddMoney from './pages/AddMoney';
import WalletPage from './pages/WalletPage';
import CardsPage from './pages/CardsPage';
import CreateCard from './pages/CreateCard';
import FundCard from './pages/FundCard';
import Transactions from './pages/Transactions';
import KYCPage from './pages/KYCPage';
import SupportPage from './pages/SupportPage';
import NotificationsPage from './pages/NotificationsPage';
import AccountPage from './pages/AccountPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminKYC from './pages/admin/AdminKYC';
import AdminDeposits from './pages/admin/AdminDeposits';
import AdminCards from './pages/admin/AdminCards';
import AdminTickets from './pages/admin/AdminTickets';
import AdminFees from './pages/admin/AdminFees';
import AdminAuditLogs from './pages/admin/AdminAuditLogs';
import SuperAdminLogin from './pages/superadmin/SuperAdminLogin';
import SuperAdminLayout from './pages/superadmin/SuperAdminLayout';
import SAOverview from './pages/superadmin/SAOverview';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Dink Card render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="w-full max-w-md border border-border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold mb-2">Dink Card could not load</h1>
            <p className="text-sm text-muted-foreground mb-4">
              Refresh the page. If this continues, send support the browser console error.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 px-4 bg-primary text-primary-foreground text-sm font-medium"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function RequireAuth({ roles }) {
  const { isLoadingAuth, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user?.role)) {
    return <Navigate to={user?.role === 'superadmin' ? '/superadmin/dashboard' : '/dashboard'} replace />;
  }
  return <Outlet />;
}

function PublicOnly({ children }) {
  const { isLoadingAuth, isAuthenticated, user } = useAuth();
  if (isLoadingAuth) return <LoadingScreen />;
  if (!isAuthenticated) return children;
  return <Navigate to={user?.role === 'superadmin' ? '/superadmin/dashboard' : '/dashboard'} replace />;
}

function RequireOwner({ children }) {
  const { isLoadingAuth, user } = useAuth();
  if (isLoadingAuth) return <LoadingScreen />;
  return user?.role === 'superadmin' ? children : <Navigate to="/admin" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      {['terms', 'privacy', 'refund-policy', 'fee-disclosure', 'kyc-compliance', 'acceptable-use', 'risk-disclosure', 'contact-support', 'account-deletion', 'complaints'].map((slug) => (
        <Route key={slug} path={`/${slug}`} element={<LegalPage />} />
      ))}
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/superadmin" element={<SuperAdminLogin />} />

      <Route element={<RequireAuth roles={['superadmin']} />}>
        <Route element={<SuperAdminLayout />}>
          <Route path="/superadmin/dashboard" element={<SAOverview />} />
          <Route path="/superadmin/users" element={<AdminUsers />} />
          <Route path="/superadmin/kyc" element={<AdminKYC />} />
          <Route path="/superadmin/deposits" element={<AdminDeposits />} />
          <Route path="/superadmin/cards" element={<AdminCards />} />
          <Route path="/superadmin/tickets" element={<AdminTickets />} />
          <Route path="/superadmin/fees" element={<AdminFees />} />
          <Route path="/superadmin/audit" element={<AdminAuditLogs />} />
        </Route>
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/add-money" element={<AddMoney />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/cards/create" element={<CreateCard />} />
          <Route path="/cards/fund" element={<FundCard />} />
          <Route path="/cards/fund/:cardId" element={<FundCard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/kyc" element={<KYCPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>
      </Route>

      <Route element={<RequireAuth roles={['support', 'admin', 'superadmin']} />}>
        <Route path="/admin" element={<AdminDashboard />}>
          <Route path="users" element={<RequireOwner><AdminUsers /></RequireOwner>} />
          <Route path="kyc" element={<AdminKYC />} />
          <Route path="deposits" element={<AdminDeposits />} />
          <Route path="cards" element={<AdminCards />} />
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="fees" element={<RequireOwner><AdminFees /></RequireOwner>} />
          <Route path="audit" element={<RequireOwner><AdminAuditLogs /></RequireOwner>} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AppRoutes />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}

