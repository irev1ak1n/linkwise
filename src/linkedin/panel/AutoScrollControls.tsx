import { AUTO_SCROLL_SPEEDS, type AutoScrollSpeed } from "./autoScrollSpeedPreference";
import type { AutoScrollStatus } from "../autoScrollController";

interface AutoScrollControlsProps {
  speed: AutoScrollSpeed;
  status: AutoScrollStatus;
  pausedByUser: boolean;
  analyzing: boolean;
  onSpeedChange: (speed: AutoScrollSpeed) => void;
  onPause: () => void;
  onResume: () => void;
}

const STATUS_TEXT: Record<AutoScrollStatus, string | null> = {
  idle: null,
  running: "Auto scrolling",
  paused: "Paused",
  complete: "Complete",
};

export function AutoScrollControls({ speed, status, pausedByUser, analyzing, onSpeedChange, onPause, onResume }: AutoScrollControlsProps) {
  const index = Math.max(0, AUTO_SCROLL_SPEEDS.indexOf(speed));
  const text = status === "complete" && analyzing ? "Analyzing…" : status === "paused" && pausedByUser ? "Browsing manually" : STATUS_TEXT[status];
  return (
    <div className="lw-autoscroll">
      <label className="lw-autoscroll__row">
        <span className="lw-autoscroll__label">Auto scroll</span>
        <input
          type="range"
          min={0}
          max={AUTO_SCROLL_SPEEDS.length - 1}
          step={1}
          value={index}
          aria-label="Auto scroll speed"
          aria-valuetext={`${speed}x`}
          onChange={(e) => onSpeedChange(AUTO_SCROLL_SPEEDS[Number(e.target.value)] ?? speed)}
        />
        <span className="lw-autoscroll__speed">{speed}x</span>
      </label>
      {text && (
        <div className="lw-autoscroll__status">
          <span>{text}</span>
          {status === "running" && (
            <button type="button" className="lw-autoscroll__button" onClick={onPause}>
              Pause
            </button>
          )}
          {status === "paused" && (
            <button type="button" className="lw-autoscroll__button" onClick={onResume}>
              Resume
            </button>
          )}
        </div>
      )}
    </div>
  );
}
