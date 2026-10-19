import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { clampChannel, hexToRgb, hsvToRgb, normalizeHex, rgba, rgbToHex, rgbToHsv, type Hsv, type Rgb } from "../highlightColor";
import type { CustomHighlightColor } from "../highlightPalette";

interface HighlightColorEditorProps {
  name: string;
  value: CustomHighlightColor;
  /** `live` while a drag or slide is still going; the settled value comes without it. */
  onChange: (value: CustomHighlightColor, live: boolean) => void;
  recent: string[];
  /** A color the user settled on, for Recent Colors. */
  onSettle: (hex: string) => void;
}

const CHANNELS = ["r", "g", "b"] as const;

// The square and the hue slider are HSV, which loses the hue of a gray or black: the hue the user
// last chose is kept so dragging to a corner and back does not jump to red.
function hsvFor(hex: string, previous: Hsv): Hsv {
  const next = rgbToHsv(hexToRgb(hex));
  return next.s === 0 || next.v === 0 ? { ...next, h: previous.h, s: next.v === 0 ? previous.s : next.s } : next;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// Pointer drags with capture, so a drag keeps working when it leaves the control.
function usePointerDrag(onMove: (x: number, y: number, live: boolean) => void) {
  const dragging = useRef(false);
  const at = (event: PointerEvent<HTMLElement>, live: boolean) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onMove(clamp01((event.clientX - rect.left) / (rect.width || 1)), clamp01((event.clientY - rect.top) / (rect.height || 1)), live);
  };
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      dragging.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.focus();
      at(event, true);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (dragging.current) at(event, true);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (!dragging.current) return;
      dragging.current = false;
      at(event, false);
    },
  };
}

// A compact Photoshop-style picker sized for the sidebar: saturation/brightness square, vertical
// hue slider, and the exact values beside them. Every control shows the same color.
export function HighlightColorEditor({ name, value, onChange, recent, onSettle }: HighlightColorEditorProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hsvFor(value.hex, { h: 0, s: 0, v: 0 }));
  const [hexDraft, setHexDraft] = useState(value.hex);
  const [rgbDraft, setRgbDraft] = useState<Record<(typeof CHANNELS)[number], string>>(() => toDrafts(hexToRgb(value.hex)));
  const editing = useRef<"hex" | "rgb" | null>(null);

  // Any outside change (a recent color, another tab) moves every control to it. The field being
  // typed in keeps the user's text until they leave it.
  useEffect(() => {
    setHsv((prev) => (rgbToHex(hsvToRgb(prev)) === value.hex ? prev : hsvFor(value.hex, prev)));
    if (editing.current !== "hex") setHexDraft(value.hex);
    if (editing.current !== "rgb") setRgbDraft(toDrafts(hexToRgb(value.hex)));
  }, [value.hex]);

  const latest = useRef(value);
  latest.current = value;
  const settled = useRef(value.hex);
  const settle = () => {
    if (latest.current.hex === settled.current) return;
    settled.current = latest.current.hex;
    onSettle(latest.current.hex);
  };
  // Leaving the page counts as settling on the color shown.
  const settleRef = useRef(settle);
  settleRef.current = settle;
  useEffect(() => () => settleRef.current(), []);

  const applyHsv = (next: Hsv, live: boolean) => {
    setHsv(next);
    const hex = rgbToHex(hsvToRgb(next));
    latest.current = { ...latest.current, hex };
    onChange({ hex, opacity: value.opacity }, live);
    if (!live) settle();
  };
  const applyHex = (hex: string) => {
    latest.current = { ...latest.current, hex };
    onChange({ hex, opacity: value.opacity }, false);
  };

  const square = usePointerDrag((x, y, live) => applyHsv({ h: hsv.h, s: x, v: 1 - y }, live));
  const hue = usePointerDrag((_x, y, live) => applyHsv({ ...hsv, h: Math.min(359.9, y * 360) }, live));

  const squareKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    applyHsv({ h: hsv.h, s: clamp01(hsv.s + move[0]), v: clamp01(hsv.v + move[1]) }, true);
  };
  const hueKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? step : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -step : 0;
    if (!delta) return;
    event.preventDefault();
    applyHsv({ ...hsv, h: Math.min(359.9, Math.max(0, hsv.h + delta)) }, true);
  };

  const onHexInput = (text: string) => {
    setHexDraft(text);
    const hex = normalizeHex(text);
    if (hex && hex !== value.hex) applyHex(hex);
  };
  const onRgbInput = (channel: (typeof CHANNELS)[number], text: string) => {
    const digits = text.replace(/[^\d]/g, "").slice(0, 3);
    if (digits === "") {
      setRgbDraft((d) => ({ ...d, [channel]: "" }));
      return;
    }
    const clamped = clampChannel(Number(digits));
    setRgbDraft((d) => ({ ...d, [channel]: String(clamped) }));
    const hex = rgbToHex({ ...hexToRgb(value.hex), [channel]: clamped });
    if (hex !== value.hex) applyHex(hex);
  };
  const leaveField = (event: FocusEvent<HTMLInputElement>) => {
    // R, G, and B are one value: moving between them is still the same edit.
    const next = event.relatedTarget;
    if (next instanceof Element && next.closest(".lw-ce__rgb") && event.currentTarget.closest(".lw-ce__rgb")) return;
    editing.current = null;
    setHexDraft(latest.current.hex);
    setRgbDraft(toDrafts(hexToRgb(latest.current.hex)));
    settle();
  };
  const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
  };

  const opacityPercent = Math.round(value.opacity * 100);
  const setOpacity = (percent: number, live: boolean) => onChange({ hex: latest.current.hex, opacity: clamp01(percent / 100) }, live);
  const pure = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));

  return (
    <section className="lw-ce" aria-label={`${name} color`}>
      <h4 className="lw-ce__heading">Color</h4>
      <div className="lw-ce__main">
        <div
          className="lw-ce__square"
          role="slider"
          tabIndex={0}
          aria-label="Saturation and brightness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.s * 100)}
          aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
          style={{ backgroundColor: pure }}
          onKeyDown={squareKeys}
          onBlur={settle}
          {...square}
        >
          <span className="lw-ce__square-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: value.hex }} />
        </div>
        <div
          className="lw-ce__hue"
          role="slider"
          tabIndex={0}
          aria-label="Hue"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          onKeyDown={hueKeys}
          onBlur={settle}
          {...hue}
        >
          <span className="lw-ce__hue-thumb" style={{ top: `${(hsv.h / 360) * 100}%` }} />
        </div>
        <div className="lw-ce__values">
          <span className="lw-ce__label">Preview</span>
          <span className="lw-ce__preview" role="img" aria-label={`Preview: ${value.hex} at ${opacityPercent}% opacity`}>
            <span style={{ backgroundColor: rgba(value.hex, value.opacity) }} />
          </span>
          <label className="lw-ce__label" htmlFor="lw-ce-hex">
            HEX
          </label>
          <input
            id="lw-ce-hex"
            className="lw-ce__hex"
            value={hexDraft}
            maxLength={9}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={normalizeHex(hexDraft) === null}
            onFocus={() => (editing.current = "hex")}
            onChange={(e) => onHexInput(e.target.value)}
            onBlur={leaveField}
            onKeyDown={commitOnEnter}
          />
          <span className="lw-ce__label">RGB</span>
          <div className="lw-ce__rgb">
            {CHANNELS.map((channel) => (
              <label key={channel} className="lw-ce__channel">
                <span aria-hidden="true">{channel.toUpperCase()}</span>
                <input
                  inputMode="numeric"
                  aria-label={{ r: "Red", g: "Green", b: "Blue" }[channel]}
                  value={rgbDraft[channel]}
                  onFocus={() => (editing.current = "rgb")}
                  onChange={(e) => onRgbInput(channel, e.target.value)}
                  onBlur={leaveField}
                  onKeyDown={commitOnEnter}
                />
              </label>
            ))}
          </div>
        </div>
      </div>
      <span className="lw-ce__label">Recent Colors</span>
      <div className="lw-ce__recent" role="group" aria-label="Recent colors">
        {recent.map((hex) => (
          <button
            key={hex}
            type="button"
            className={hex === value.hex ? "lw-ce__recent-color lw-ce__recent-color--selected" : "lw-ce__recent-color"}
            aria-label={`Use ${hex}`}
            aria-pressed={hex === value.hex}
            title={hex}
            style={{ backgroundColor: hex }}
            onClick={() => {
              applyHex(hex);
              settled.current = hex;
            }}
          />
        ))}
      </div>
      <label className="lw-ce__label" htmlFor="lw-ce-opacity">
        Opacity
      </label>
      <div className="lw-ce__opacity">
        <input
          id="lw-ce-opacity"
          type="range"
          min={0}
          max={100}
          step={1}
          value={opacityPercent}
          aria-valuetext={`${opacityPercent}%, ${opacityPercent === 0 ? "invisible" : opacityPercent === 100 ? "fully solid" : "partly see-through"}`}
          style={{ background: `linear-gradient(to right, ${rgba(value.hex, 0)}, ${value.hex})` }}
          onChange={(e) => setOpacity(Number(e.target.value), true)}
          onPointerUp={(e) => setOpacity(Number(e.currentTarget.value), false)}
          onKeyUp={(e) => setOpacity(Number(e.currentTarget.value), false)}
          onBlur={(e) => setOpacity(Number(e.currentTarget.value), false)}
        />
        <output htmlFor="lw-ce-opacity" className="lw-ce__percent">
          {opacityPercent}%
        </output>
      </div>
      <p className="lw-ce__hint">0% is invisible, 100% fully solid.</p>
    </section>
  );
}

function toDrafts({ r, g, b }: Rgb): Record<(typeof CHANNELS)[number], string> {
  return { r: String(r), g: String(g), b: String(b) };
}
