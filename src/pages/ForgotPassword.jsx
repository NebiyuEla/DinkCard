import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const requestReset = useMutation({
    mutationFn: () => apiClient.auth.requestPasswordReset({ identifier }),
    onSuccess: (payload) => {
      setResult(payload);
      setError('');
    },
    onError: (err) => setError(err.message || 'Could not request password reset.')
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your email, phone number, or username.</p>
        </div>
        <div>
          <Label>Account</Label>
          <Input value={identifier} onChange={(event) => setIdentifier(event.target.value)} className="mt-1.5" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result?.resetUrl && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Password reset ready</p>
            <a href={result.resetUrl} className="mt-2 block break-all text-primary hover:underline">{result.resetUrl}</a>
          </div>
        )}
        <Button className="w-full bg-primary text-primary-foreground" disabled={!identifier || requestReset.isPending} onClick={() => requestReset.mutate()}>
          {requestReset.isPending ? 'Preparing...' : 'Request password reset'}
        </Button>
        <p className="text-sm text-center text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
