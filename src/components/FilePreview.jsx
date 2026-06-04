import React, { useState } from 'react';
import { ExternalLink, FileText, RotateCcw, RotateCw } from 'lucide-react';
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
  const [rotation, setRotation] = useState(0);
  if (!url) return null;
  const isImage = isImageUrl(url);

  return (
    <div className={`rounded-lg border border-border bg-secondary/20 overflow-hidden ${className}`}>
      {isImage ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <div className="flex h-40 w-full items-center justify-center overflow-hidden bg-background/70">
            <img
              src={url}
              alt={label}
              className="max-h-full max-w-full object-contain transition-transform"
              loading="lazy"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          </div>
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
        {isImage && (
          <div className="mb-2 grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRotation((value) => value - 90)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Rotate
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRotation((value) => value + 90)}>
              <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Rotate
            </Button>
          </div>
        )}
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
