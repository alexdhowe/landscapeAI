"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * The entry point: upload a yard photo, no address, no form. The goal is
 * the customer clicking around their own yard inside thirty seconds.
 */
export default function StartPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/projects", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Upload failed — try again.");
        return;
      }
      const { projectId } = (await res.json()) as { projectId: string };
      router.push(`/design/${projectId}`);
    } catch {
      setError("Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
      <h1 className="text-center text-3xl font-semibold tracking-tight text-neutral-900">
        See what your yard could be
      </h1>
      <p className="mt-3 max-w-md text-center text-neutral-600">
        Upload a photo of the area you want worked on. We&apos;ll label what&apos;s
        there and you can start swapping materials — no address, no forms.
      </p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !busy) void upload(file);
        }}
        className={`mt-8 flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-16 text-center transition ${
          dragging
            ? "border-emerald-500 bg-emerald-50"
            : "border-neutral-300 bg-white hover:border-neutral-400"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <p className="text-lg font-medium text-neutral-800">
          {busy ? "Uploading…" : "Drop a photo here or click to choose"}
        </p>
        <p className="mt-1 text-sm text-neutral-500">JPEG, PNG, or WebP · up to 8 MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  );
}
