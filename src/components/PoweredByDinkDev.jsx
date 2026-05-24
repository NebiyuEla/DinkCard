import React from 'react';

export default function PoweredByDinkDev({ className = '', compact = false }) {
  return (
    <a
      href="https://dinkdev.base44.app"
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 text-sm font-medium text-primary transition hover:opacity-80 ${className}`.trim()}
    >
      <span>{compact ? '⚡ Powered by DinkDev' : '⚡ Powered by DinkDevLabs'}</span>
    </a>
  );
}
