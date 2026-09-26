import { beforeEach, describe, expect, it } from "vitest";
import { decodeView, encodeView } from "@/lib/urlCodec";
import type { PlaceRef } from "@/lib/types";
import {
  armCompareState,
  createCompareActions,
  pinCompareState,
  resetToastText,
  unpinCompareState,
  useCompareToast,
} from "./compareSlice";
import { DEFAULT_VIEW, selectView, useStore } from "./useStore";

const LA: PlaceRef = { kind: "county", id: "06037" };
const SF: PlaceRef = { kind: "county", id: "06075" };
const COOK: PlaceRef = { kind: "county", id: "17031" };
const CA: PlaceRef = { kind: "state", id: "06" };
const off = { armed: false, pins: [] };

describe("compare reducers (SPEC.md 3.9)", () => {
  it("arming keeps pins and disarming clears them", () => {
    expect(armCompareState(off, true)).toEqual({ armed: true, pins: [] });
    expect(armCompareState({ armed: true, pins: [LA, SF] }, false)).toEqual(off);
    const armed = { armed: true, pins: [LA] };
    expect(armCompareState(armed, true)).toBe(armed);
  });

  it("pins A then B, and a third pin replaces B", () => {
    const one = pinCompareState({ armed: true, pins: [] }, LA).compare;
    expect(one.pins).toEqual([LA]);
    const two = pinCompareState(one, SF).compare;
    expect(two.pins).toEqual([LA, SF]);
    const three = pinCompareState(two, COOK);
    expect(three.compare.pins).toEqual([LA, COOK]);
    expect(three.resetTo).toBeUndefined();
  });

  it("pinning arms compare mode", () => {
    expect(pinCompareState(off, CA).compare).toEqual({ armed: true, pins: [CA] });
  });

  it("pinning an area that is already pinned unpins it", () => {
    expect(pinCompareState({ armed: true, pins: [LA, SF] }, LA).compare).toEqual({ armed: true, pins: [SF] });
  });

  it("a pin at another level replaces the pins and reports the reset level", () => {
    const r = pinCompareState({ armed: true, pins: [LA, SF] }, CA);
    expect(r.compare).toEqual({ armed: true, pins: [CA] });
    expect(r.resetTo).toBe("state");
    expect(resetToastText("state")).toBe("Compare pins reset to state level");
    expect(pinCompareState({ armed: true, pins: [CA] }, LA).resetTo).toBe("county");
  });

  it("ignores places that are not areas", () => {
    const c = { armed: true, pins: [LA] };
    expect(pinCompareState(c, { kind: "school", id: "060000000001" }).compare).toBe(c);
    expect(pinCompareState(c, { kind: "city", id: "CA:Los Angeles" }).compare).toBe(c);
  });

  it("unpinning A promotes B, and compare stays armed", () => {
    expect(unpinCompareState({ armed: true, pins: [LA, SF] }, LA)).toEqual({ armed: true, pins: [SF] });
    expect(unpinCompareState({ armed: true, pins: [SF] }, SF)).toEqual({ armed: true, pins: [] });
    const c = { armed: true, pins: [LA] };
    expect(unpinCompareState(c, COOK)).toBe(c);
  });
});

describe("compare actions on the store", () => {
  beforeEach(() => {
    useStore.setState({ ...DEFAULT_VIEW });
    useStore.setState(createCompareActions(useStore.setState, useStore.getState));
    useCompareToast.setState({ message: null, seq: 0 });
  });

  it("arm, pin, replace, reset with a toast, and clear", () => {
    const s = () => useStore.getState();
    s().armCompare(true);
    expect(s().compare).toEqual({ armed: true, pins: [] });
    s().pinCompare(LA);
    s().pinCompare(SF);
    expect(s().compare.pins).toEqual([LA, SF]);
    s().pinCompare(COOK);
    expect(s().compare.pins).toEqual([LA, COOK]);
    expect(useCompareToast.getState().message).toBeNull();

    s().pinCompare(CA);
    expect(s().compare.pins).toEqual([CA]);
    expect(useCompareToast.getState().message).toBe("Compare pins reset to state level");

    s().unpinCompare(CA);
    expect(s().compare).toEqual({ armed: true, pins: [] });
    s().pinCompare(LA);
    s().armCompare(false);
    expect(s().compare).toEqual({ armed: false, pins: [] });
  });

  it("round-trips compare state through the URL `cmp` parameter", () => {
    const s = () => useStore.getState();
    const roundTrip = () => decodeView(encodeView(selectView(s()))).compare;

    s().armCompare(true);
    expect(encodeView(selectView(s()))).toBe("cmp=");
    expect(roundTrip()).toEqual({ armed: true, pins: [] });

    s().pinCompare(SF);
    s().pinCompare(LA);
    expect(encodeView(selectView(s()))).toBe("cmp=county:06075,county:06037");
    expect(roundTrip()).toEqual(s().compare);

    s().pinCompare(CA);
    expect(roundTrip()).toEqual({ armed: true, pins: [CA] });

    s().armCompare(false);
    expect(encodeView(selectView(s()))).toBe("");
    expect(roundTrip()).toEqual({ armed: false, pins: [] });
  });
});
