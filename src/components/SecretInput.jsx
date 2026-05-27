import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function SecretInput({
  value,
  onChange,
  className,
  inputClassName,
  numeric = false,
  maxLength,
  autoComplete,
  ...props
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn('relative', className)}>
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        inputMode={numeric ? 'numeric' : props.inputMode}
        pattern={numeric ? '[0-9]*' : props.pattern}
        maxLength={maxLength}
        autoComplete={autoComplete}
        className={cn('pr-10', inputClassName)}
      />
      <button
        type="button"
        aria-label={visible ? 'Hide value' : 'Show value'}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
