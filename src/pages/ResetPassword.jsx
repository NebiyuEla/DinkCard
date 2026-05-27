import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import SecretInput from '@/components/SecretInput';

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useMemo(() => new URLSearchParams(location.search).get('token') || '', [location.search]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const resetPassword = useMutation({
    mutationFn: () => apiClient.auth.confirmPasswordReset({ token, password }),
    onSuccess: () => navigate('/login', { replace: true }),
    onError: (err) => setError(err.message || 'Could not reset password.')
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!token || password.length < 8 || password !== confirmPassword || resetPassword.isPending) return;
    resetPassword.mutate();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Choose a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set a new password for your Dink Card account.</p>
        </div>
        <div>
          <Label>New password</Label>
          <SecretInput value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5" autoComplete="new-password" />
        </div>
        <div>
          <Label>Confirm password</Label>
          <SecretInput value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5" autoComplete="new-password" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={!token || password.length < 8 || password !== confirmPassword || resetPassword.isPending}>
          {resetPassword.isPending ? 'Updating...' : 'Reset password'}
        </Button>
        <p className="text-sm text-center text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
