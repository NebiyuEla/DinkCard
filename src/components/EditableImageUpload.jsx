import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, Move, RotateCcw, RotateCw, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This image could not be edited. Try another clear image.'));
    image.src = url;
  });
}

async function renderEditedFile({ file, url, rotation, zoom, offsetX = 0, offsetY = 0 }) {
  const image = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 840;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const rotated = normalizedRotation === 90 || normalizedRotation === 270;
  const sourceWidth = rotated ? image.naturalHeight : image.naturalWidth;
  const sourceHeight = rotated ? image.naturalWidth : image.naturalHeight;
  const coverScale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight) * zoom;

  ctx.save();
  ctx.translate(canvas.width / 2 + offsetX * canvas.width, canvas.height / 2 + offsetY * canvas.height);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.scale(coverScale, coverScale);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Could not prepare the edited image. Try again.');
  const originalName = file?.name?.replace(/\.[^.]+$/, '') || 'kyc-upload';
  return new File([blob], `${originalName}-edited.jpg`, { type: 'image/jpeg' });
}

function ImageEditorDialog({ editor, title, note, saving, saveLabel, onClose, onSave, setEditor }) {
  const dragRef = useRef(null);

  const startDrag = (event) => {
    if (!editor) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: rect.width || 1,
      height: rect.height || 1
    };
  };

  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.x) / drag.width;
    const dy = (event.clientY - drag.y) / drag.height;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setEditor((value) => ({
      ...value,
      offsetX: Math.max(-0.7, Math.min(0.7, Number(value.offsetX || 0) + dx)),
      offsetY: Math.max(-0.7, Math.min(0.7, Number(value.offsetY || 0) + dy))
    }));
  };

  const stopDrag = (event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  };

  return (
    <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {editor && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/25 p-3">
              <div
                className="mx-auto flex aspect-[10/7] max-h-[420px] w-full max-w-lg touch-none cursor-grab items-center justify-center overflow-hidden rounded-lg bg-black/80 active:cursor-grabbing"
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
                onPointerLeave={stopDrag}
              >
                <img
                  src={editor.url}
                  alt="Upload preview"
                  draggable={false}
                  className="h-full w-full select-none object-cover transition-transform duration-150"
                  style={{
                    transform: `translate(${Number(editor.offsetX || 0) * 100}%, ${Number(editor.offsetY || 0) * 100}%) rotate(${editor.rotation}deg) scale(${editor.zoom})`
                  }}
                />
              </div>
              <p className="mt-2 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                <Move className="h-3.5 w-3.5" /> Drag the image to position it. The saved file matches this frame.
              </p>
              {note && <p className="mt-1 text-center text-xs text-muted-foreground">{note}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Button type="button" variant="outline" onClick={() => setEditor((value) => ({ ...value, rotation: value.rotation - 90 }))}>
                <RotateCcw className="mr-2 h-4 w-4" /> Left
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditor((value) => ({ ...value, rotation: value.rotation + 90 }))}>
                <RotateCw className="mr-2 h-4 w-4" /> Right
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditor((value) => ({ ...value, rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 }))}>
                <Crop className="mr-2 h-4 w-4" /> Reset
              </Button>
            </div>

            <div>
              <Label className="text-xs">Image size</Label>
              <input
                type="range"
                min="1"
                max="2.4"
                step="0.05"
                value={editor.zoom}
                onChange={(event) => setEditor((value) => ({ ...value, zoom: Number(event.target.value) }))}
                className="mt-2 w-full accent-primary"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button type="button" className="flex-1 bg-primary text-primary-foreground" onClick={onSave} disabled={saving}>
                <Upload className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : saveLabel}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function EditableImageUpload({ onUpload, disabled, uploading, className = '', children }) {
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const inputId = useMemo(() => `image-upload-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => () => {
    if (editor?.url) URL.revokeObjectURL(editor.url);
  }, [editor?.url]);

  const handleFile = (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      onUpload(file);
      return;
    }
    const url = URL.createObjectURL(file);
    setEditor({ file, url, rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 });
  };

  const closeEditor = () => {
    if (editor?.url) URL.revokeObjectURL(editor.url);
    setEditor(null);
    setSaving(false);
  };

  const saveEdited = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      const editedFile = await renderEditedFile(editor);
      await onUpload(editedFile);
      closeEditor();
    } catch (error) {
      setSaving(false);
      toast.error(error.message || 'Could not save edited upload.');
    }
  };

  return (
    <>
      <label
        htmlFor={inputId}
        className={cn('relative block cursor-pointer overflow-hidden', (disabled || uploading) && 'pointer-events-none opacity-60', className)}
      >
        {children}
        <input
          id={inputId}
          type="file"
          accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif"
          className="sr-only"
          onChange={handleFile}
          disabled={disabled || uploading}
        />
      </label>

      <ImageEditorDialog
        editor={editor}
        title="Edit upload"
        saving={saving}
        saveLabel="Save edited upload"
        onClose={closeEditor}
        onSave={saveEdited}
        setEditor={setEditor}
      />
    </>
  );
}

export function ExistingImageEditButton({ url, onSave, disabled, label = 'Edit image', className = '' }) {
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);

  const openEditor = () => {
    if (!url || disabled) return;
    setEditor({ url, rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 });
  };

  const closeEditor = () => {
    setEditor(null);
    setSaving(false);
  };

  const saveEdited = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      const editedFile = await renderEditedFile(editor);
      await onSave(editedFile);
      closeEditor();
    } catch (error) {
      setSaving(false);
      toast.error(error.message || 'Could not save edited image.');
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={openEditor} disabled={!url || disabled} className={className}>
        <Crop className="mr-2 h-4 w-4" /> {label}
      </Button>

      <ImageEditorDialog
        editor={editor}
        title="Edit document image"
        note="Apply saves a new corrected copy and updates this KYC record."
        saving={saving}
        saveLabel="Apply"
        onClose={closeEditor}
        onSave={saveEdited}
        setEditor={setEditor}
      />
    </>
  );
}
