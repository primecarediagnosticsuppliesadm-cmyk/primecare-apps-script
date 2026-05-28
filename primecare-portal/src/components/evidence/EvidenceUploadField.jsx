import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Camera, ImagePlus, Loader2, X, AlertCircle } from "lucide-react";

/**
 * Mobile-first image picker with preview (upload happens on parent save).
 * @param {object} props
 * @param {File|null} props.file
 * @param {(file: File|null) => void} props.onFileChange
 * @param {string} [props.label]
 * @param {boolean} [props.disabled]
 * @param {string} [props.hint]
 */
export default function EvidenceUploadField({
  file,
  onFileChange,
  label = "Attach photo proof",
  disabled = false,
  hint = "Camera or gallery · JPEG/PNG",
}) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState("");

  function applyFile(next) {
    setError("");
    if (!next) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      onFileChange(null);
      return;
    }
    if (!next.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (next.size > 8 * 1024 * 1024) {
      setError("Image must be under 8MB.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(next));
    onFileChange(next);
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-2.5">
      <p className="text-xs font-semibold text-slate-800">{label}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>

      {previewUrl ? (
        <div className="relative mt-2 overflow-hidden rounded-lg border bg-white">
          <img src={previewUrl} alt="Proof preview" className="max-h-48 w-full object-contain" />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-1 top-1 h-7 w-7"
            disabled={disabled}
            onClick={() => applyFile(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={disabled}
            onChange={(e) => applyFile(e.target.files?.[0] || null)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(e) => applyFile(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 flex-1 text-xs"
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="mr-1.5 h-3.5 w-3.5" />
            Camera
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 flex-1 text-xs"
            disabled={disabled}
            onClick={() => galleryRef.current?.click()}
          >
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            Gallery
          </Button>
        </div>
      )}

      {file ? (
        <p className="mt-1.5 text-[10px] text-emerald-700">
          Ready to upload on save · {(file.size / 1024).toFixed(0)} KB
        </p>
      ) : null}

      {error ? (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-red-600">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function EvidenceUploadProgress({ uploading, message }) {
  if (!uploading) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-800">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {message || "Uploading proof…"}
    </div>
  );
}
