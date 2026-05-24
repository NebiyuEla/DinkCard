import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Eye, EyeOff, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import LegalLinks from '@/components/LegalLinks';

export default function Login() {
  const { setAuthenticatedUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const destination = location.state?.from?.pathname || '/dashboard';
  const requiresTwoFactor = Boolean(challengeToken);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.auth.login({ identifier, password });
      if (result.requiresTwoFactor) {
        setChallengeToken(result.challengeToken);
        setTwoFactorCode('');
        return;
      }
      setAuthenticatedUser(result.user);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.auth.verifyTwoFactorLogin({ challengeToken, code: twoFactorCode });
      setAuthenticatedUser(result.user);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const returnToPasswordStep = () => {
    setChallengeToken('');
    setTwoFactorCode('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold">Sign in to Dink Card</h1>
          <p className="text-sm text-muted-foreground mt-2">You must agree to the Terms & Conditions before using the platform.</p>
        </div>
        <form onSubmit={requiresTwoFactor ? handleTwoFactorSubmit : handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          {!requiresTwoFactor ? (
            <>
              <div>
                <Label>Email, Phone, or Username</Label>
                <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com, +251..., or username" className="mt-1.5" autoComplete="username" />
              </div>
              <div>
                <Label>Password</Label>
                <div className="relative mt-1.5">
                  <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" autoComplete="current-password" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Two-factor authentication</p>
                    <p className="mt-1 text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app or use one recovery code.</p>
                  </div>
                </div>
              </div>
              <div>
                <Label>Authentication Code</Label>
                <Input value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} placeholder="123456 or ABCDE-12345" className="mt-1.5 tracking-[0.2em]" autoComplete="one-time-code" inputMode="numeric" />
              </div>
              <Button type="button" variant="ghost" className="px-0 text-muted-foreground" onClick={returnToPasswordStep}>
                <ArrowLeft className="mr-2 h-4 w-4" />Use a different account
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={loading}>
            {loading ? 'Signing in...' : requiresTwoFactor ? 'Verify and Sign In' : 'Sign In'}
          </Button>
          {!requiresTwoFactor && (
            <div className="text-right">
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link>
            </div>
          )}
        </form>
        <p className="text-sm text-center text-muted-foreground mt-4">
          New here? <Link to="/register" className="text-primary hover:underline">Create your account</Link>
        </p>
        <LegalLinks className="mt-5" />
      </div>
    </div>
  );
}

