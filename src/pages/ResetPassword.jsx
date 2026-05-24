import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PoweredByDinkDev from '@/components/PoweredByDinkDev';

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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Choose a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set a new password for your Dink Card account.</p>
        </div>
        <div>
          <Label>New password</Label>
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5" />
        </div>
        <div>
          <Label>Confirm password</Label>
          <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full bg-primary text-primary-foreground" disabled={!token || password.length < 8 || password !== confirmPassword || resetPassword.isPending} onClick={() => resetPassword.mutate()}>
          {resetPassword.isPending ? 'Updating...' : 'Reset password'}
        </Button>
        <p className="text-sm text-center text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">Back to sign in</Link>
        </p>
        <div className="flex justify-center">
          <PoweredByDinkDev compact />
        </div>
      </div>
    </div>
  );
}
