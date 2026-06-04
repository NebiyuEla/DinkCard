import React, { useEffect, useMemo, useState } from 'react';
import { Crop, RotateCcw, RotateCw, Upload } from 'lucide-react';
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

async function renderEditedFile({ file, url, rotation, zoom }) {
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
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.scale(coverScale, coverScale);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Could not prepare the edited image. Try again.');
  const originalName = file?.name?.replace(/\.[^.]+$/, '') || 'kyc-upload';
  return new File([blob], `${originalName}-edited.jpg`, { type: 'image/jpeg' });
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
    setEditor({ file, url, rotation: 0, zoom: 1 });
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

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit upload</DialogTitle>
          </DialogHeader>
          {editor && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-secondary/25 p-3">
                <div className="mx-auto flex aspect-[10/7] max-h-[420px] w-full max-w-lg items-center justify-center overflow-hidden rounded-lg bg-black/80">
                  <img
                    src={editor.url}
                    alt="Upload preview"
                    className="h-full w-full select-none object-cover transition-transform"
                    style={{ transform: `rotate(${editor.rotation}deg) scale(${editor.zoom})` }}
                  />
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  The saved file will match this framed view. Zoom in to crop tighter.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Button type="button" variant="outline" onClick={() => setEditor((value) => ({ ...value, rotation: value.rotation - 90 }))}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Left
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditor((value) => ({ ...value, rotation: value.rotation + 90 }))}>
                  <RotateCw className="mr-2 h-4 w-4" /> Right
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditor((value) => ({ ...value, rotation: 0, zoom: 1 }))}>
                  <Crop className="mr-2 h-4 w-4" /> Reset
                </Button>
              </div>

              <div>
                <Label className="text-xs">Crop zoom</Label>
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
                <Button type="button" variant="outline" className="flex-1" onClick={closeEditor}>Cancel</Button>
                <Button type="button" className="flex-1 bg-primary text-primary-foreground" onClick={saveEdited} disabled={saving}>
                  <Upload className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : 'Save edited upload'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ExistingImageEditButton({ url, onSave, disabled, label = 'Edit image', className = '' }) {
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);

  const openEditor = () => {
    if (!url || disabled) return;
    setEditor({ url, rotation: 0, zoom: 1 });
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

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit document image</DialogTitle>
          </DialogHeader>
          {editor && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-secondary/25 p-3">
                <div className="mx-auto flex aspect-[10/7] max-h-[420px] w-full max-w-lg items-center justify-center overflow-hidden rounded-lg bg-black/80">
                  <img
                    src={editor.url}
                    alt="Document preview"
                    className="h-full w-full select-none object-cover transition-transform"
                    style={{ transform: `rotate(${editor.rotation}deg) scale(${editor.zoom})` }}
                  />
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Apply saves a new corrected copy and updates this KYC record.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Button type="button" variant="outline" onClick={() => setEditor((value) => ({ ...value, rotation: value.rotation - 90 }))}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Left
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditor((value) => ({ ...value, rotation: value.rotation + 90 }))}>
                  <RotateCw className="mr-2 h-4 w-4" /> Right
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditor((value) => ({ ...value, rotation: 0, zoom: 1 }))}>
                  <Crop className="mr-2 h-4 w-4" /> Reset
                </Button>
              </div>

              <div>
                <Label className="text-xs">Crop zoom</Label>
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
                <Button type="button" variant="outline" className="flex-1" onClick={closeEditor}>Cancel</Button>
                <Button type="button" className="flex-1 bg-primary text-primary-foreground" onClick={saveEdited} disabled={saving}>
                  <Upload className="mr-2 h-4 w-4" /> {saving ? 'Applying...' : 'Apply'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
