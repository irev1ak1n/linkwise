// Every content-script repository goes through here instead of calling chrome.storage.local
// directly, so a stale script (extension reloaded/updated/disabled while it was still running)
// fails quietly — an empty read, a dropped write — rather than throwing or leaving an
// unhandled promise rejection. A genuine bug still surfaces normally, only this one specific,
// expected failure mode is absorbed.
import { isContextInvalidatedError, isExtensionContextValid } from "../linkedin/extensionContext";

export async function safeStorageGet(keys: string | string[]): Promise<Record<string, unknown>> {
  if (!isExtensionContextValid()) return {};
  try {
    return await chrome.storage.local.get(keys);
  } catch (error) {
    if (isContextInvalidatedError(error)) return {};
    throw error;
  }
}

export async function safeStorageSet(items: Record<string, unknown>): Promise<void> {
  if (!isExtensionContextValid()) return;
  try {
    await chrome.storage.local.set(items);
  } catch (error) {
    if (!isContextInvalidatedError(error)) throw error;
  }
}

export async function safeStorageRemove(keys: string | string[]): Promise<void> {
  if (!isExtensionContextValid()) return;
  try {
    await chrome.storage.local.remove(keys);
  } catch (error) {
    if (!isContextInvalidatedError(error)) throw error;
  }
}
