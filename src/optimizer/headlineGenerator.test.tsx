// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HeadlineGenerator, HeadlineOptionCard, buildHeadlineRequest } from "./HeadlineGenerator";
import { copyText } from "./copyText";
import type { OptimizeProfileRequestBody } from "./optimizerClient";
import type { HeadlineOptionsOutcome } from "./optimizerTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const body: OptimizeProfileRequestBody = {
  profile: { identity: "me", evidence: [{ id: "headline:0", section: "headline", text: "Student developer", evidenceType: "headline" }] },
  sections: [],
  userContext: "I know Rust",
};

let root: Root | null = null;
function render(node: React.ReactNode): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
}

function setInput(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("headline generator", () => {
  it("builds the request from known evidence plus the one steering field and the format", () => {
    const request = buildHeadlineRequest(body, "Student developer", { include: " robotics, Python ", format: "Role | Specialty | Proof" });
    expect(request).toEqual({
      profile: body.profile,
      currentHeadline: "Student developer",
      include: "robotics, Python",
      format: "Role | Specialty | Proof",
      language: "English",
      userContext: "I know Rust",
    });
  });

  it("shows the current headline, drops the old fields, sends the form and lists the returned options", async () => {
    const outcome: HeadlineOptionsOutcome = { status: "ok", options: [{ label: "Technical", headline: "Aspiring Software Engineer | C++" }] };
    const request = vi.fn(() => ({ requestId: "r", promise: Promise.resolve(outcome), cancel: vi.fn() }));
    const container = render(<HeadlineGenerator body={body} currentHeadline="Student developer" request={request} />);
    expect(container.textContent).toContain("Student developer");
    expect(container.textContent).not.toMatch(/Target role|Keywords to include|Additional context|Language/);
    const include = container.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(container.textContent).toContain("Add anything you want the AI to consider when creating your header.");
    expect(include.placeholder).toBe("Achievements, projects, leadership, results, target roles, or anything you want highlighted...");
    const format = container.querySelector<HTMLInputElement>("input")!;
    expect(format.placeholder).toBe("Role | Focus | Proof");
    expect(container.textContent).toContain("Optional. Set the structure you want.");
    expect(container.textContent).not.toMatch(/X • Y • Z/);
    const button = () => container.querySelector<HTMLButtonElement>(".lw-primary-button")!;
    expect(button().textContent).toBe("Generate headlines");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(include, "C++, robotics");
      include.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => setInput(format, "Role • Proof"));
    await act(async () => button().click());
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ include: "C++, robotics", format: "Role • Proof", language: "English" }));
    expect(container.textContent).toContain("Aspiring Software Engineer | C++");
    expect(button().textContent).toBe("Generate again");
    expect(button().disabled).toBe(false);
  });

  it("copies an option and confirms it", async () => {
    const copy = vi.fn(() => Promise.resolve(true));
    const container = render(<HeadlineOptionCard option={{ label: "Balanced", headline: "Student developer | C++" }} copy={copy} />);
    await act(async () => container.querySelector("button")!.click());
    expect(copy).toHaveBeenCalledWith("Student developer | C++");
    expect(container.textContent).toContain("Copied ✓");
  });

  it("falls back to a temporary text area when the clipboard API is refused", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
    await expect(copyText("hello")).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
