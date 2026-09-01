import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { UserScopeProvider, useUserScope } from './contexts/UserScopeContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AccountNoticeLayer from './components/AccountNoticeLayer';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-slate-900 dark:text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/cashflows" element={<Dashboard initialSection="Cash Flows" />} />
      <Route
        path="/captiveportal"
        element={user ? (
          <RequireSupervisor>
            <Dashboard initialSection="Captive Portal" />
          </RequireSupervisor>
        ) : null}
      />
      <Route
        path="/portal-management"
        element={user ? (
          <RequireSupervisor>
            <Dashboard initialSection="Portal Management" />
          </RequireSupervisor>
        ) : null}
      />
    </Routes>
  );
}

// Only renders children if user is supervisor, else shows a message
function RequireSupervisor({ children }: { children: React.ReactNode }) {
  const { isSupervisor } = useUserScope();
  if (!isSupervisor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Access Denied</h2>
          <p className="text-slate-700 dark:text-slate-200">This page is only available to supervisors.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UserScopeProvider>
          <AccountNoticeLayer />
          <Router>
            <AppContent />
          </Router>
        </UserScopeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
