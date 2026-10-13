// The async clipboard can be refused in a content script, so fall back to a temporary textarea.
export async function copyText(text: string, doc: Document = document): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = doc.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    doc.body.appendChild(area);
    area.select();
    const copied = doc.execCommand?.("copy") ?? false;
    area.remove();
    return copied;
  }
}
