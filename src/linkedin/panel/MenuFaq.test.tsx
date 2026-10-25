// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FAQ_ITEMS, MenuFaq } from "./MenuFaq";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<MenuFaq />));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  root = null;
});

const questions = () => [...container.querySelectorAll<HTMLButtonElement>(".lw-faq__question")];
const expanded = () => questions().map((q) => q.getAttribute("aria-expanded"));

describe("MenuFaq", () => {
  it("lists every question under the heading, all closed", async () => {
    await mount();
    expect(container.querySelector(".lw-faq__title")!.textContent).toBe("Frequently Asked Questions");
    expect(questions().map((q) => q.textContent)).toEqual(FAQ_ITEMS.map((i) => i.question));
    expect(expanded().every((e) => e === "false")).toBe(true);
  });

  it("opens one answer at a time and closes it on a second click", async () => {
    await mount();
    await act(async () => questions()[0].click());
    expect(expanded()).toEqual(["true", "false", "false", "false", "false", "false"]);
    await act(async () => questions()[2].click());
    expect(expanded()).toEqual(["false", "false", "true", "false", "false", "false"]);
    expect(container.querySelector(".lw-faq__item--open p")!.textContent).toBe(FAQ_ITEMS[2].answer);
    await act(async () => questions()[2].click());
    expect(expanded().every((e) => e === "false")).toBe(true);
  });
});
