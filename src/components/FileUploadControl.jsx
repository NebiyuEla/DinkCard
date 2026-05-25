import React, { useRef } from 'react';
import { cn } from '@/lib/utils';

export const UPLOAD_ACCEPT = 'image/*,audio/*,video/*,application/pdf,text/plain,text/csv,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf,.txt,.csv,.mp3,.wav,.ogg,.webm,.m4a,.mp4,.doc,.docx,.xls,.xlsx';

export default function FileUploadControl({ onFile, disabled, className = '', children }) {
  const inputRef = useRef(null);

  const handleChange = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) await onFile(file);
  };

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <button
      type="button"
      className={cn('relative cursor-pointer overflow-hidden', disabled && 'pointer-events-none opacity-60', className)}
      onClick={openPicker}
      disabled={disabled}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        onChange={handleChange}
        disabled={disabled}
      />
    </button>
  );
}
