// Reads a locally-selected file's text entirely client-side, never uploaded anywhere.
// Supports text/Markdown directly, PDF/DOCX via bundled libraries. Loaded lazily, see
// loadDocumentParser.ts, since pdfjs and mammoth are heavy.
import * as pdfjsLib from "pdfjs-dist";

// Points at a real copied worker file instead of Vite's asset URL resolution, which doesn't
// produce a usable URL in this build and made pdfjs fall back to a mode Chrome's CSP blocks.
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("content/pdf.worker.min.mjs");

export interface DocumentReadResult {
  text?: string;
  error?: string;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB, generous but bounds worst-case parse time

async function readPlainText(file: File): Promise<DocumentReadResult> {
  try {
    const text = (await file.text()).trim();
    if (!text) return { error: "This file appears to be empty." };
    return { text };
  } catch {
    return { error: "Could not read this file as text." };
  }
}

async function readPdfText(file: File): Promise<DocumentReadResult> {
  try {
    const buffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      pageTexts.push(pageText);
    }
    const text = pageTexts.join("\n").replace(/\s+/g, " ").trim();
    if (!text) {
      return {
        error: "This PDF has no extractable text — it may be a scanned image. OCR isn't supported; try a text-based file instead.",
      };
    }
    return { text };
  } catch {
    return { error: "Could not read this PDF file. It may be corrupted or password-protected." };
  }
}

async function readDocxText(file: File): Promise<DocumentReadResult> {
  try {
    const mammoth = await import("mammoth");
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = (result.value ?? "").trim();
    if (!text) return { error: "This document appears to be empty." };
    return { text };
  } catch {
    return { error: "Could not read this .docx file. It may be corrupted or in an unsupported format." };
  }
}

// Dispatches by file extension, since MIME type isn't reliable across browsers here.
export async function readDocumentText(file: File): Promise<DocumentReadResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: "This file is too large (max 10 MB). Please use a shorter document." };
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md")) return readPlainText(file);
  if (name.endsWith(".pdf")) return readPdfText(file);
  if (name.endsWith(".docx")) return readDocxText(file);

  return { error: "Unsupported file type. Please upload a .txt, .md, .pdf, or .docx file." };
}
