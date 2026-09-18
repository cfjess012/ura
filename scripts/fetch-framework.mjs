/**
 * Transcribe a public framework from its publisher's own machine-readable
 * source into `src/data/reference/frameworks/`.
 *
 * This script exists so the transcription is reproducible and auditable
 * rather than typed. **Nothing here is written from memory**: a framework
 * item is only ever what the publisher's file said, and the output records
 * where it came from, when it was fetched, and by what. Re-running it on a
 * later edition produces a new file rather than editing the old one.
 *
 *   node scripts/fetch-framework.mjs nist-csf-2.0
 *
 * Licensed frameworks (ISO, SOC 2) are deliberately absent: their text may
 * not be redistributed, so they are loaded by the organisation that holds
 * the licence (FR-54), never shipped here.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = "src/data/reference/frameworks";

/** Undo the five XML entities a spreadsheet part may carry. */
const unescape = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/**
 * The cells of one worksheet in an .xlsx, as `{ A: "…", B: "…" }` per row.
 * Hand-rolled because this runs once per framework edition and a build-time
 * dependency for it would be a dependency for the app.
 */
function sheetRows(dir, sheet) {
  const shared = [];
  const ss = readFileSync(join(dir, "xl", "sharedStrings.xml"), "utf8");
  for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const runs = [...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
    shared.push(runs.map((r) => unescape(r[1])).join(""));
  }
  const xml = readFileSync(join(dir, "xl", "worksheets", sheet), "utf8");
  const rows = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    const cellRe = /<c\s([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    while ((c = cellRe.exec(row[1]))) {
      const attrs = c[1];
      const body = c[3] ?? "";
      const col = (attrs.match(/r="([A-Z]+)\d+"/) ?? [])[1];
      if (!col) continue;
      const kind = (attrs.match(/\bt="([^"]+)"/) ?? [])[1];
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];
      const inline = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
        .map((t) => unescape(t[1]))
        .join("");
      cells[col] =
        kind === "s" && v !== undefined
          ? (shared[Number(v)] ?? "")
          : v !== undefined
            ? unescape(v)
            : inline;
    }
    rows.push(cells);
  }
  return rows;
}

const unTag = (s) =>
  unescape(s.replace(/<[^>]+>/g, " "))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * An EU regulation as the Publications Office serves it: one item per
 * article, headed by the article's own title.
 *
 * Article level is the granularity a crosswalk can defend. Finer would mean
 * choosing which paragraph of Article 32 a control satisfies, which is a
 * legal reading this product has no business making on its own.
 */
function articles(html) {
  const items = [];
  const parts = html.split(/<div class="eli-subdivision" id="art_(\d+)">/);
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1]
      .replace(/<p[^>]*class="oj-ti-art"[^>]*>[\s\S]*?<\/p>/, "")
      .replace(/<div class="eli-title"[\s\S]*?<\/div>/, "");
    const heading = (parts[i + 1].match(/<p[^>]*class="oj-sti-art"[^>]*>([\s\S]*?)<\/p>/) ?? [])[1];
    const text = unTag(body);
    if (!text) continue;
    items.push({ ref: `Article ${parts[i]}`, heading: heading ? unTag(heading) : "", text });
  }
  return items;
}

const SOURCES = {
  "nist-csf-2.0": {
    id: "nist-csf-2.0",
    name: "NIST Cybersecurity Framework",
    edition: "2.0",
    publisher: "National Institute of Standards and Technology",
    published: "2024-02-26",
    quotable: true,
    licence:
      "A work of the United States government, not subject to copyright in the United States.",
    source: {
      title: "CSF 2.0 Core, machine-readable export from the CSF Reference Tool",
      url: "https://csrc.nist.gov/extensions/nudp/services/json/csf/download?olirids=all",
      format: "xlsx",
    },
    /** Subcategories are the mappable unit; the category is the heading. */
    read(dir) {
      const rows = sheetRows(dir, "sheet2.xml");
      const items = [];
      const seen = new Set();
      let group = "";
      for (const row of rows) {
        const b = (row.B ?? "").trim();
        const c = (row.C ?? "").trim();
        if (/\([A-Z]{2}\.[A-Z]{2}\):/.test(b)) group = b.split(":")[0].trim();
        const m = c.match(/^([A-Z]{2}\.[A-Z]{2}-\d{2}):\s*([\s\S]+)$/);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);
        const text = m[2].replace(/\s+/g, " ").trim();
        const withdrawn = /^\[Withdrawn/i.test(text);
        items.push({ ref: m[1], heading: group, text, ...(withdrawn ? { withdrawn: true } : {}) });
      }
      return items;
    },
  },
  "gdpr-2016-679": {
    id: "gdpr-2016-679",
    name: "General Data Protection Regulation",
    edition: "Regulation (EU) 2016/679",
    publisher: "European Union",
    published: "2016-04-27",
    quotable: true,
    licence:
      "Reuse of European Commission documents is authorised under Decision 2011/833/EU, with the source acknowledged.",
    source: {
      title:
        "Regulation (EU) 2016/679, English text as published in the Official Journal — the act as adopted, not a consolidated version",
      url: "https://publications.europa.eu/resource/celex/32016R0679",
      format: "xhtml",
      accept: "application/xhtml+xml",
      language: "eng",
    },
    read: (dir) => articles(readFileSync(join(dir, "download"), "utf8")),
  },

  "eu-ai-act-2024-1689": {
    id: "eu-ai-act-2024-1689",
    name: "EU Artificial Intelligence Act",
    edition: "Regulation (EU) 2024/1689",
    publisher: "European Union",
    published: "2024-06-13",
    quotable: true,
    licence:
      "Reuse of European Commission documents is authorised under Decision 2011/833/EU, with the source acknowledged.",
    source: {
      title:
        "Regulation (EU) 2024/1689, English text as published in the Official Journal — the act as adopted, not a consolidated version",
      url: "https://publications.europa.eu/resource/celex/32024R1689",
      format: "xhtml",
      accept: "application/xhtml+xml",
      language: "eng",
    },
    read: (dir) => articles(readFileSync(join(dir, "download"), "utf8")),
  },
};

const id = process.argv[2];
const spec = SOURCES[id];
if (!spec) {
  console.error(
    `Unknown framework "${id ?? ""}". Known: ${Object.keys(SOURCES).join(", ")}`,
  );
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "framework-"));
try {
  const archive = join(work, "download");
  const headers = [];
  if (spec.source.accept) headers.push("-H", `Accept: ${spec.source.accept}`);
  if (spec.source.language) headers.push("-H", `Accept-Language: ${spec.source.language}`);
  execFileSync("curl", [
    "-sS", "--fail", "--location", "--max-time", "180",
    "-A", "ura-framework-transcriber/1.0",
    ...headers,
    "-o", archive, spec.source.url,
  ]);
  if (spec.source.format === "xlsx") execFileSync("unzip", ["-o", "-q", archive, "-d", work]);
  const items = spec.read(work);
  if (items.length === 0) throw new Error("the source yielded no items");

  const today = new Date().toISOString().slice(0, 10);
  const doc = {
    id: spec.id,
    name: spec.name,
    edition: spec.edition,
    publisher: spec.publisher,
    published: spec.published,
    quotable: spec.quotable,
    licence: spec.licence,
    source: {
      title: spec.source.title,
      url: spec.source.url,
      format: spec.source.format,
      retrieved: today,
    },
    checkedOn: today,
    checkedBy: "scripts/fetch-framework.mjs",
    reviewWindowMonths: 12,
    items,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${spec.id}.json`), JSON.stringify(doc, null, 2) + "\n");
  const live = items.filter((i) => !i.withdrawn).length;
  console.log(
    `${spec.id}: ${items.length} items (${live} current, ${items.length - live} withdrawn) → ${OUT}/${spec.id}.json`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
