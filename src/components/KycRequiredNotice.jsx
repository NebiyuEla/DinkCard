import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function KycRequiredNotice({ status, compact = false, className = '' }) {
  const needsCorrection = ['rejected', 'resubmit_required', 'fix_requested'].includes(String(status || '').toLowerCase());

  return (
    <div className={`flex items-start gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-yellow-600 ${className}`}>
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{needsCorrection ? 'KYC correction required' : 'Complete your KYC verification'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {needsCorrection
            ? 'Please update your identity information before creating cards or making deposits.'
            : 'You need to verify your identity before creating cards or making deposits.'}
        </p>
        {!compact && (
          <Link to="/kyc">
            <Button size="sm" variant="outline" className="mt-3 border-yellow-500/30 text-yellow-600 hover:bg-yellow-500/10">
              Complete KYC <ArrowUpRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
