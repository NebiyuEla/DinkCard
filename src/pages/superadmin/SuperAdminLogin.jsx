import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import SecretInput from '@/components/SecretInput';

export default function SuperAdminLogin() {
  const { user, isAuthenticated, setAuthenticatedUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated && user?.role === 'superadmin') {
      navigate('/superadmin/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.auth.login({ identifier: username, password, portal: 'superadmin' });
      setAuthenticatedUser(result.user);
      navigate('/superadmin/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Superadmin Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">Restricted access for Dink Card operations.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div>
            <Label className="text-sm">Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1.5" autoComplete="username" />
          </div>
          <div>
            <Label className="text-sm">Password</Label>
            <SecretInput value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" autoComplete="current-password" />
          </div>
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={loading}>
            {loading ? 'Verifying...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}

