import React from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

function isImageUrl(url = '') {
  return /\.(jpg|jpeg|png|webp|gif|heic|heif)(\?|$)/i.test(url);
}

function isAudioUrl(url = '') {
  return /\.(mp3|wav|ogg|webm|m4a)(\?|$)/i.test(url);
}

function isVideoUrl(url = '') {
  return /\.(mp4|webm)(\?|$)/i.test(url);
}

export default function FilePreview({ url, label = 'Uploaded file', className = '' }) {
  if (!url) return null;

  return (
    <div className={`rounded-lg border border-border bg-secondary/20 overflow-hidden ${className}`}>
      {isImageUrl(url) ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img src={url} alt={label} className="h-32 w-full object-cover" loading="lazy" />
        </a>
      ) : isAudioUrl(url) ? (
        <div className="flex h-32 items-center px-3">
          <audio src={url} controls className="w-full" />
        </div>
      ) : isVideoUrl(url) ? (
        <video src={url} controls className="h-48 w-full bg-black object-contain" />
      ) : (
        <div className="h-32 flex flex-col items-center justify-center gap-2 px-3 text-center">
          <FileText className="w-8 h-8 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      )}
      <div className="border-t border-border p-2">
        <Button asChild variant="outline" size="sm" className="w-full">
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="w-3.5 h-3.5 mr-2" />
            Open file
          </a>
        </Button>
      </div>
    </div>
  );
}
