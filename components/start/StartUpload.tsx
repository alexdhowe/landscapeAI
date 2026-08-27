"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { MAX_UPLOAD_BYTES, megabytes } from "@/lib/image/limits";
import {
  UPLOAD_ACCEPT_ATTRIBUTE,
  UPLOAD_MEDIA_TYPE_LABEL,
} from "@/lib/image/mediaTypes";
import { nothingToUploadMessage, pickImage } from "@/lib/image/transfer";

import { Callout } from "@/components/ui/Card";
import { buttonClass } from "@/components/ui/Button";

/**
 * Choosing the photo, and the wait that follows.
 *
 * ---------------------------------------------------------------------
 * The three ways in, and which device gets which
 * ---------------------------------------------------------------------
 * On a phone: the camera, then the camera roll. `capture` is ignored on a
 * desktop browser, so the camera button is hidden where there is no
 * camera — otherwise it is two buttons that do the same thing.
 *
 * On a desktop there is no camera, so the photo is one the customer
 * already has, and the three ways to hand it over are drop, paste and
 * browse. Drop and browse are one target rather than two: the dashed
 * region *is* the button, so the largest thing on the screen is also the
 * thing you can throw a file at. Paste is bound at the window because a
 * clipboard has no target — Cmd/Ctrl+V anywhere on this page uploads,
 * which is what somebody who just screenshotted a listing will try.
 *
 * A paste or a drop carrying nothing usable says so (see
 * lib/image/transfer). Silence there is the worst outcome: the gesture
 * looks broken and there is nothing to read.
 *
 * The upload is not a spinner. The moment a file is chosen the browser's
 * own copy of it is shown at full width, dimmed, with a band of light
 * travelling down it: the customer sees their yard within a few hundred
 * milliseconds of tapping, long before the server has finished with it.
 * That is most of §2's thirty seconds — the rest of the wait happens on
 * the design page, over the same picture, so the two reads as one motion.
 */
export function StartUpload() {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URLs are a leak if nobody revokes them.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        setError(
          `That photo is ${(file.size / 1024 / 1024).toFixed(0)} MB — over our ` +
            `${megabytes(MAX_UPLOAD_BYTES)} MB limit. A photo straight ` +
            "from your camera should be well under it.",
        );
        return;
      }
      setError(null);
      setPreviewFailed(false);
      // Shown immediately; a HEIC will not render in Chrome, which is
      // exactly why the server is converting it, so the failure is handled
      // rather than left as a broken image.
      setPreview(URL.createObjectURL(file));
      setBusy(true);
      try {
        const form = new FormData();
        form.append("photo", file);
        const res = await fetch("/api/projects", { method: "POST", body: form });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "That upload didn't go through — try again.");
          setPreview(null);
          return;
        }
        const { projectId } = (await res.json()) as { projectId: string };
        router.push(`/design/${projectId}`);
      } catch {
        setError("That upload didn't go through — check your connection and try again.");
        setPreview(null);
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  function onPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void upload(file);
    event.target.value = "";
  }

  /** A paste or a drop: same bag, same choice, same refusal. */
  const fromTransfer = useCallback(
    (files: FileList | null | undefined, gesture: "paste" | "drop") => {
      const picked = pickImage(Array.from(files ?? []));
      if (picked) {
        void upload(picked);
        return;
      }
      setError(nothingToUploadMessage(gesture));
    },
    [upload],
  );

  // Paste, bound at the window: a clipboard has nothing to aim at, so
  // there is no element that would be the right target for it. Skipped
  // while an upload is already in flight, so a second Cmd+V during the
  // wait cannot start a second project.
  useEffect(() => {
    if (busy || preview) return;
    const onPaste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files;
      if (!files || files.length === 0) return;
      event.preventDefault();
      fromTransfer(files, "paste");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [busy, preview, fromTransfer]);

  if (preview || busy) {
    return (
      <section aria-live="polite" className="mt-8">
        <div className="relative overflow-hidden rounded-2xl bg-bark-900 shadow-e3">
          <div className="aspect-[3/4] w-full sm:aspect-[4/3]">
            {preview && !previewFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt=""
                className="size-full object-cover opacity-70"
                onError={() => setPreviewFailed(true)}
              />
            ) : (
              <div className="skeleton size-full opacity-25" />
            )}
          </div>
          {/* The band of light. Decorative, and it stops moving for anyone
              who asked for reduced motion. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-1/3 animate-sweep bg-gradient-to-b from-transparent via-white/25 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bark-950/85 to-transparent px-5 pb-5 pt-12">
            <p className="text-base font-medium text-white">Reading your photo…</p>
            <p className="mt-0.5 text-sm text-canopy-200">
              Finding the lawn, beds and hardscape.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8">
      {/*
        The canonical accessible file control: the input IS the button,
        visually hidden inside a styled <label>. One tab stop, announced as
        a file input, and the label carries the focus ring — as against a
        separate button plus a hidden input, which is either two tab stops
        or a control a keyboard cannot reach at all.
      */}
      {/*
        The show/hide lives on these wrappers rather than on the buttons
        themselves, and that is not a style preference. `buttonClass`
        starts with `inline-flex`, and Tailwind emits its display
        utilities in a fixed order that puts `inline-flex` after `hidden`
        — so a button carrying both was visible whatever the class
        attribute said. The camera button was showing on desktops, next
        to a second button that did exactly the same thing: the two
        buttons this component's own comment says it exists to avoid. A
        bare <div> has no competing display utility, so `hidden` means
        hidden.
      */}
      <div className="flex flex-col gap-3">
        <div className="hidden coarse:block">
          <FilePicker tone="primary" capture onPicked={onPicked}>
            <CameraIcon />
            Take a photo
          </FilePicker>
        </div>
        <div className="hidden coarse:block">
          <FilePicker tone="secondary" onPicked={onPicked}>
            Choose from your photos
          </FilePicker>
        </div>
      </div>

      {/*
        The desktop target. One region, not a button beside a drop zone:
        the whole dashed area is the label wrapping the file input, so
        clicking anywhere in it browses and dropping anywhere in it
        uploads. No camera glyph — this opens a file picker.
      */}
      <div className="coarse:hidden">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            fromTransfer(e.dataTransfer.files, "drop");
          }}
          className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-canopy-700 ${
            dragging
              ? "border-canopy-500 bg-canopy-50"
              : "border-bark-300 bg-white/50 hover:border-canopy-400 hover:bg-canopy-50/40"
          }`}
        >
          <input
            type="file"
            accept={UPLOAD_ACCEPT_ATTRIBUTE}
            className="sr-only"
            onChange={onPicked}
          />
          <span className="text-base font-medium text-bark-900">
            Drop a photo here
          </span>
          <span className="mt-1 text-sm text-bark-600">
            or paste one, or <span className="underline underline-offset-4">browse</span>
          </span>
        </label>
      </div>

      <p className="mt-3 text-xs text-bark-500">
        {UPLOAD_MEDIA_TYPE_LABEL} — including photos straight off an iPhone.
        Up to {megabytes(MAX_UPLOAD_BYTES)} MB.
      </p>

      {error ? (
        <Callout tone="clay" className="mt-4" role="alert">
          {error}
        </Callout>
      ) : null}
    </section>
  );
}

/** A styled <label> wrapping a visually-hidden file input. */
function FilePicker({
  tone,
  capture = false,
  onPicked,
  children,
}: {
  tone: "primary" | "secondary";
  capture?: boolean;
  onPicked: (event: React.ChangeEvent<HTMLInputElement>) => void;
  children: React.ReactNode;
}) {
  return (
    // No display utility is ever passed in here: see the wrappers above.
    <label
      className={`${buttonClass(tone, "lg")} w-full cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-canopy-700`}
    >
      <input
        type="file"
        accept={UPLOAD_ACCEPT_ATTRIBUTE}
        {...(capture ? { capture: "environment" as const } : {})}
        className="sr-only"
        onChange={onPicked}
      />
      {children}
    </label>
  );
}

function CameraIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      focusable="false"
    >
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7a1 1 0 0 0 .83-.45l.94-1.4A1 1 0 0 1 9.8 3.7h4.4a1 1 0 0 1 .83.45l.94 1.4A1 1 0 0 0 16.8 6h1.7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5Z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  );
}
