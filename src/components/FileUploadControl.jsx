import React from 'react';
import { cn } from '@/lib/utils';

export const UPLOAD_ACCEPT = 'image/*,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf';

export default function FileUploadControl({ onFile, disabled, className = '', children }) {
  const handleChange = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) await onFile(file);
  };

  return (
    <label
      className={cn('relative block cursor-pointer overflow-hidden', disabled && 'pointer-events-none opacity-60', className)}
    >
      {children}
      <input
        type="file"
        accept={UPLOAD_ACCEPT}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={handleChange}
        disabled={disabled}
      />
    </label>
  );
}
