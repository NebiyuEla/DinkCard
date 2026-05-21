import React from 'react';
import { Link } from 'react-router-dom';
import { legalLinks } from '@/lib/legal';

export default function LegalLinks({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground ${className}`}>
      {legalLinks.map((item) => (
        <Link key={item.path} to={item.path} className="hover:text-primary hover:underline">
          {item.label}
        </Link>
      ))}
    </div>
  );
}
