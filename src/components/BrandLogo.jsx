import React from 'react';
import { cn } from '@/lib/utils';

export default function BrandLogo({ className, imageClassName, labelClassName, showLabel = true }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src="/dink-card-logo.png"
        alt="Dink Card"
        className={cn('h-9 w-9 rounded-xl object-cover shadow-sm', imageClassName)}
      />
      {showLabel && <span className={cn('text-lg font-bold tracking-tight', labelClassName)}>Dink Card</span>}
    </div>
  );
}
