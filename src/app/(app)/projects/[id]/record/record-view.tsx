"use client";

/**
 * The download, and only the download (FR-27).
 *
 * A client component because turning the payload into a file is a client
 * act: it is already on the page, so it is a Blob and an anchor rather than
 * a round trip. Everything else on this screen renders on the server — what
 * a person reads is not interactive, and shipping it to the browser would
 * hand the record's assembly to the least trustworthy place to do it.
 *
 * What downloads is byte-for-byte the payload that was rendered, never a
 * second assembly. Two assemblies of the same record can disagree, and the
 * one in the file is the one that leaves the building.
 */
import * as React from "react";
import type { RecordPayload } from "@/lib/use-case-record";
import { recordFilename } from "@/lib/use-case-record";

export function DownloadRecord({
  payload,
  assessment,
}: {
  payload: RecordPayload;
  assessment: string;
}) {
  const [saved, setSaved] = React.useState(false);
  const text = JSON.stringify(payload, null, 2);

  function download() {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = recordFilename(assessment, new Date());
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking in the same tick as the click can cancel the download before
    // the browser has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setSaved(true);
  }

  return (
    <>
      <button type="button" className="btn" onClick={download}>
        Download the payload
      </button>
      {/* The confirmation is a status region, not a toast: a person who
          tabbed to the button hears that it worked (§23). */}
      <span role="status" aria-live="polite" className="meta">
        {saved ? "Saved to your downloads. Nothing was sent." : ""}
      </span>
    </>
  );
}
