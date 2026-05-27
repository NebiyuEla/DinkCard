import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function BrandLogo({ className, imageClassName, labelClassName, showLabel = true, to }) {
  const content = (
    <div className={cn('flex items-center gap-2.5', to && 'cursor-pointer', className)}>
      <img
        src="/dink-card-logo.png"
        alt="Dink Card"
        className={cn('h-9 w-9 rounded-xl object-cover shadow-sm', imageClassName)}
      />
      {showLabel && <span className={cn('text-lg font-bold tracking-tight', labelClassName)}>Dink Card</span>}
    </div>
  );

  if (to) {
    return (
      <Link to={to} aria-label="Go to Dink Card home" className="inline-flex">
        {content}
      </Link>
    );
  }

  return content;
}
