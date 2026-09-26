// Shared helpers for the command tests: a resolver over the bundled fixtures and a recording apply target.

import gazetteer from "@/test/fixtures/gazetteer.json";
import schools from "@/test/fixtures/schools/all.json";
import type { GazetteerFile, SchoolsFile } from "@/lib/dataTypes";
import type { ViewState } from "@/lib/types";
import { DEFAULT_VIEW } from "@/store/useStore";
import type { ApplyTarget, CameraMove } from "./apply";
import { createResolver, type Resolver } from "./resolver";

let resolver: Resolver | undefined;

export function fixtureResolver(): Resolver {
  return (resolver ??= createResolver(gazetteer as GazetteerFile, schools as unknown as SchoolsFile));
}

export interface RecordingTarget extends ApplyTarget {
  view: ViewState;
  moves: CameraMove[];
}

/** An apply target over a plain view object, starting from `start` (default: the app's default view). */
export function recordingTarget(start: Partial<ViewState> = {}): RecordingTarget {
  const target: RecordingTarget = {
    view: { ...DEFAULT_VIEW, ...start },
    moves: [],
    update(patch) {
      target.view = { ...target.view, ...patch };
    },
    move(move) {
      target.moves.push(move);
    },
  };
  return target;
}

export const refString = (r?: { kind: string; id: string }) => (r ? `${r.kind}:${r.id}` : null);
