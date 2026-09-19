// Loads the real document-parsing code on demand instead of a static import. pdfjs and mammoth
// are heavy, so this keeps them out of the always-injected content script until a user
// actually uploads a document.
import type { DocumentReadResult } from "./readDocumentText";

export async function loadDocumentParser(): Promise<(file: File) => Promise<DocumentReadResult>> {
  const url = chrome.runtime.getURL("content/documentParsing.js");
  const module = (await import(/* @vite-ignore */ url)) as { readDocumentText: (file: File) => Promise<DocumentReadResult> };
  return module.readDocumentText;
}
