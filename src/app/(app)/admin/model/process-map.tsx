"use client";

import * as React from "react";
import type { Lens, ProcessModel, Stop } from "@/lib/process-model";

/**
 * The assessment as a map (FR-48): four stages as lanes on a board, every
 * screen as a stop, the route between them, and what each stop leaves
 * behind standing beside it.
 *
 * Three-dimensional by CSS transform rather than WebGL. The board is a real
 * DOM: every stop is a button, the order is the reading order, and a screen
 * reader gets the same list a sighted person gets — which a canvas could
 * not give them. The signs on the tiles are counter-rotated so they always
 * face the viewer, however the board is turned; in the flat view the same
 * rule yields no rotation at all.
 *
 * Drag to turn, arrow keys to turn, Tab through the stops, Enter to open
 * one. Motion respects prefers-reduced-motion.
 */
const TILE = { w: 190, h: 112 };
const STEP = { x: 248 };
const LANE = { full: 188, empty: 46, gap: 10 };
const PAD = 56;
const VIEW = { tilt: 52, turn: -24 };
const STAGES = [1, 2, 3, 4] as const;

type Placed = { stop: Stop; at: number; x: number; y: number };
type Board = {
  placed: Placed[];
  lanes: { stage: number; top: number; height: number; empty: boolean }[];
  w: number;
  h: number;
};

/**
 * Stages are lanes; stops run along them. A lane with nothing in it — the
 * requester's stages, seen from the assessor's side — stays on the board,
 * shallow, because leaving it out would hide where this person comes in.
 */
function place(stops: Stop[]): Board {
  const perLane: Partial<Record<number, number>> = {};
  const lanes: Board["lanes"] = [];
  let y = PAD;
  for (const stage of STAGES) {
    const empty = !stops.some((s) => s.stage === stage);
    const height = empty ? LANE.empty : LANE.full;
    lanes.push({ stage, top: y, height, empty });
    y += height + LANE.gap;
  }
  const placed = stops.map((stop, at) => {
    const slot = perLane[stop.stage] ?? 0;
    perLane[stop.stage] = slot + 1;
    const lane = lanes[stop.stage - 1]!;
    return { stop, at, x: PAD + slot * STEP.x, y: lane.top + 34 };
  });
  const widest = Math.max(...Object.values(perLane).map((n) => n ?? 0));
  return {
    placed,
    lanes,
    w: PAD * 2 + (widest - 1) * STEP.x + TILE.w,
    h: y - LANE.gap + PAD,
  };
}

/** The route between stops: along a lane, then down and across to the next. */
function route(placed: Placed[]): string {
  const pts: string[] = [];
  placed.forEach((p, i) => {
    const cx = p.x + TILE.w / 2;
    const cy = p.y + TILE.h / 2;
    const q = placed[i - 1];
    if (q && q.stop.stage !== p.stop.stage) {
      const qx = q.x + TILE.w / 2;
      const my = (q.y + TILE.h / 2 + cy) / 2;
      pts.push(`${qx},${my}`, `${cx},${my}`);
    }
    pts.push(`${cx},${cy}`);
  });
  return pts.join(" ");
}

/** A zoom that gets the whole turned board into the scene. */
function fit(el: HTMLElement, w: number, h: number, tilt: number, turn: number) {
  const t = (Math.abs(turn) * Math.PI) / 180;
  const W = w * Math.cos(t) + h * Math.sin(t);
  const H = (w * Math.sin(t) + h * Math.cos(t)) * Math.cos((tilt * Math.PI) / 180) + 80;
  return clamp(Math.min((el.clientWidth - 50) / W, (el.clientHeight - 40) / H), 0.4, 1.2);
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function ProcessMap({ models }: { models: Record<Lens, ProcessModel> }) {
  const [lens, setLens] = React.useState<Lens>("requester");
  const model = models[lens];
  const [selectedId, setSelectedId] = React.useState(model.stops[0]?.id ?? "");
  const [tilt, setTilt] = React.useState(VIEW.tilt);
  const [turn, setTurn] = React.useState(VIEW.turn);
  const [zoom, setZoom] = React.useState(0.7);
  const [flat, setFlat] = React.useState(false);
  const scene = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ x: number; y: number; on: boolean } | null>(null);
  const dragged = React.useRef(false);

  const { placed, lanes, w, h } = React.useMemo(() => place(model.stops), [model]);
  const stageName = (stage: number) =>
    models.requester.stops.find((s) => s.stage === stage)?.stageName ??
    models.assessor.stops.find((s) => s.stage === stage)?.stageName ??
    "";
  const selected =
    placed.find((p) => p.stop.id === selectedId) ?? placed[0] ?? null;

  // Fit the board to the scene once, so the whole journey is in view on
  // arrival whatever the window. The person can zoom from there.
  React.useEffect(() => {
    const el = scene.current;
    if (el) setZoom(fit(el, w, h, flat ? 0 : VIEW.tilt, flat ? 0 : VIEW.turn));
  }, [w, h, flat]);

  function chooseLens(next: Lens) {
    setLens(next);
    setSelectedId(models[next].stops[0]?.id ?? "");
  }
  function move(step: number) {
    if (!selected) return;
    const next = placed[clamp(selected.at + step, 0, placed.length - 1)];
    if (next) setSelectedId(next.stop.id);
  }
  function reset() {
    setTilt(VIEW.tilt);
    setTurn(VIEW.turn);
    setFlat(false);
    const el = scene.current;
    if (el) setZoom(fit(el, w, h, VIEW.tilt, VIEW.turn));
  }
  function onKey(event: React.KeyboardEvent) {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => setTurn((t) => t - 6),
      ArrowRight: () => setTurn((t) => t + 6),
      ArrowUp: () => setTilt((t) => clamp(t + 4, 0, 78)),
      ArrowDown: () => setTilt((t) => clamp(t - 4, 0, 78)),
      "+": () => setZoom((z) => clamp(z + 0.08, 0.3, 1.6)),
      "=": () => setZoom((z) => clamp(z + 0.08, 0.3, 1.6)),
      "-": () => setZoom((z) => clamp(z - 0.08, 0.3, 1.6)),
      "0": reset,
    };
    const act = keys[event.key];
    if (act && event.target === event.currentTarget) {
      event.preventDefault();
      act();
    }
  }

  const tiltNow = flat ? 0 : tilt;
  const turnNow = flat ? 0 : turn;

  return (
    <div className="model">
      <div className="model-controls">
        <div className="model-lens" role="group" aria-label="Whose journey">
          <button
            type="button"
            aria-pressed={lens === "requester"}
            onClick={() => chooseLens("requester")}
          >
            As the requester
          </button>
          <button
            type="button"
            aria-pressed={lens === "assessor"}
            onClick={() => chooseLens("assessor")}
          >
            As the risk assessor
          </button>
        </div>
        <div className="model-view" role="group" aria-label="View">
          <button type="button" onClick={() => setTurn((t) => t - 15)} aria-label="Turn left">
            ⟲
          </button>
          <button type="button" onClick={() => setTurn((t) => t + 15)} aria-label="Turn right">
            ⟳
          </button>
          <button type="button" onClick={() => setTilt((t) => clamp(t - 8, 0, 78))} aria-label="Tilt up">
            ▲
          </button>
          <button type="button" onClick={() => setTilt((t) => clamp(t + 8, 0, 78))} aria-label="Tilt down">
            ▼
          </button>
          <button type="button" onClick={() => setZoom((z) => clamp(z - 0.1, 0.3, 1.6))} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => setZoom((z) => clamp(z + 0.1, 0.3, 1.6))} aria-label="Zoom in">
            +
          </button>
          <button type="button" aria-pressed={flat} onClick={() => setFlat((f) => !f)}>
            {flat ? "3D" : "Flat"}
          </button>
          <button type="button" onClick={reset}>
            Reset
          </button>
        </div>
        <p className="model-hint">
          Drag to turn · arrow keys · Tab through the stops
        </p>
      </div>

      <div className="model-layout">
        <div
          ref={scene}
          className="model-scene"
          tabIndex={0}
          role="group"
          aria-label="The map. Drag or use the arrow keys to turn it; Tab moves through the stops."
          onKeyDown={onKey}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, on: false };
            dragged.current = false;
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || flat) return;
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            // Capturing on the way down swallowed the click on a stop; a
            // drag begins only once the pointer has actually travelled.
            if (!d.on) {
              if (Math.hypot(dx, dy) < 5) return;
              d.on = true;
              dragged.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
            }
            drag.current = { x: e.clientX, y: e.clientY, on: true };
            setTurn((t) => t + dx * 0.35);
            setTilt((t) => clamp(t - dy * 0.3, 0, 78));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <div
            className={`model-board${flat ? " flat" : ""}`}
            style={
              {
                width: w,
                height: h,
                "--w": `${w}px`,
                "--h": `${h}px`,
                "--tilt": `${tiltNow}deg`,
                "--turn": `${turnNow}deg`,
                transform: `rotateX(${tiltNow}deg) rotateZ(${turnNow}deg) scale(${zoom})`,
              } as React.CSSProperties
            }
          >
            {lanes.map((lane) => (
              <div
                key={lane.stage}
                className={`model-lane${lane.empty ? " empty" : ""}`}
                style={{ left: 20, width: w - 40, top: lane.top, height: lane.height }}
              >
                <span className="model-lane-name">
                  {lane.stage} · {stageName(lane.stage)}
                  {lane.empty ? " — not this person’s part" : ""}
                </span>
              </div>
            ))}
            <svg className="model-path" width={w} height={h} aria-hidden="true">
              <polyline points={route(placed)} />
            </svg>
            {placed.map((p) => {
              const on = selected?.stop.id === p.stop.id;
              return (
                <button
                  key={p.stop.id}
                  type="button"
                  className={`model-tile${on ? " selected" : ""}`}
                  style={{ left: p.x, top: p.y, width: TILE.w, height: TILE.h }}
                  aria-pressed={on}
                  aria-label={`Stop ${p.at + 1} of ${placed.length}: ${p.stop.title}`}
                  onClick={() => {
                    if (!dragged.current) setSelectedId(p.stop.id);
                  }}
                >
                  <span className="model-slab" aria-hidden="true" />
                  <span className="model-tile-num" aria-hidden="true">
                    {p.at + 1}
                  </span>
                  <span className="model-sign" aria-hidden="true">
                    <span className="model-sign-title">{p.stop.title}</span>
                    {p.stop.count && (
                      <span className="model-sign-count">{p.stop.count}</span>
                    )}
                  </span>
                  {p.stop.produces.length > 0 && (
                    <span className="model-artifacts" aria-hidden="true">
                      {p.stop.produces.map((a) => (
                        <span key={a.name} className="model-artifact">
                          {a.name}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selected && (
          <aside className="model-detail" aria-live="polite">
            <p className="eyebrow">
              Stage {selected.stop.stage} · {selected.stop.stageName} · stop{" "}
              {selected.at + 1} of {placed.length}
            </p>
            <h2>{selected.stop.title}</h2>
            <h3>What they see</h3>
            <p>{selected.stop.sees}</p>
            <h3>The logic</h3>
            <ul className="model-logic">
              {selected.stop.logic.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <h3>What it leaves behind</h3>
            {selected.stop.produces.length === 0 ? (
              <p className="help">
                Nothing. This is a reading or an answer on the way to one — the
                record it feeds is made at a later stop.
              </p>
            ) : (
              <ul className="model-artifact-list">
                {selected.stop.produces.map((a) => (
                  <li key={a.name}>
                    <span className="model-artifact-mark" aria-hidden="true">
                      ▤
                    </span>
                    <span>
                      <strong>{a.name}</strong>
                      <br />
                      {a.kept}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="model-where">
              <span>Where</span>
              {selected.stop.where}
            </p>
            <div className="model-nav">
              <button type="button" className="btn ghost btn-small" onClick={() => move(-1)} disabled={selected.at === 0}>
                ← Previous stop
              </button>
              <button type="button" className="btn btn-small" onClick={() => move(1)} disabled={selected.at === placed.length - 1}>
                Next stop →
              </button>
            </div>
            <details className="model-everywhere">
              <summary>
                The rules that hold on every screen ({model.everywhere.length})
              </summary>
              <ul className="model-logic">
                {model.everywhere.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          </aside>
        )}
      </div>
    </div>
  );
}
