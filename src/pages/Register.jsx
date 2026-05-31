import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiClient } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import TermsContent from '@/components/TermsContent';
import LegalLinks from '@/components/LegalLinks';
import PoweredByDinkDev from '@/components/PoweredByDinkDev';
import BrandLogo from '@/components/BrandLogo';
import SecretInput from '@/components/SecretInput';
import ThemeToggle from '@/components/ThemeToggle';

export default function Register() {
  const { setAuthenticatedUser } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.auth.register({ firstName, lastName, username, email, phone, password, acceptedTerms });
      setAuthenticatedUser(result.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTermsChange = (value) => {
    if (!value) {
      setAcceptedTerms(false);
      return;
    }
    setShowTerms(true);
  };

  const acceptTermsFromDialog = () => {
    setAcceptedTerms(true);
    setShowTerms(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle compact />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <BrandLogo to="/" className="justify-center mb-4" imageClassName="h-14 w-14 rounded-2xl" showLabel={false} />
          <h1 className="text-3xl font-bold">Create your account</h1>
          <p className="text-sm text-muted-foreground mt-2">Agree to the Terms & Conditions before using the platform.</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>First Name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1.5" />
            </div>
          </div>
          <div>
            <Label>Username <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, ''))} className="mt-1.5" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Phone Number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Password</Label>
            <SecretInput value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" autoComplete="new-password" />
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={acceptedTerms} onCheckedChange={handleTermsChange} className="mt-0.5" />
            <span>
              I agree to the{' '}
              <button type="button" className="text-primary hover:underline" onClick={() => setShowTerms(true)}>
                Terms & Conditions
              </button>{' '}
              and understand I cannot use Dink Card without accepting them.
            </span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={loading || !acceptedTerms}>
            {loading ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>
        <p className="text-sm text-center text-muted-foreground mt-4">
          Already registered? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
        <div className="mt-4 flex justify-center">
          <PoweredByDinkDev compact />
        </div>
        <LegalLinks className="mt-5" />
      </div>

      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Terms & Conditions</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-80 rounded-lg border border-border bg-secondary/30 p-4">
            <TermsContent />
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTerms(false)}>Close</Button>
            <Button className="bg-primary text-primary-foreground" onClick={acceptTermsFromDialog}>
              I Have Read and Agree
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

