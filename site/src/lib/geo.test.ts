import { describe, expect, it } from "vitest";
import type { BBox } from "./types";
import {
  bboxCenter,
  bboxIntersects,
  bboxOfPoints,
  bboxUnion,
  boundsToBBox,
  containsPoint,
  coordsInBBox,
  indicesWithKey,
  nearestCopyX,
  pointsInBBox,
} from "./geo";

const CONUS: BBox = [-125, 24, -66.5, 49.5];

describe("containsPoint", () => {
  it("includes the edges and excludes points outside", () => {
    expect(containsPoint(CONUS, -125, 24)).toBe(true);
    expect(containsPoint(CONUS, -118.24, 34.05)).toBe(true);
    expect(containsPoint(CONUS, -150, 61)).toBe(false);
    expect(containsPoint(CONUS, -100, 50)).toBe(false);
  });

  it("handles a viewport over the antimeridian (MapLibre reports west below -180)", () => {
    const pacific: BBox = [-200, 10, -150, 60];
    expect(containsPoint(pacific, 170, 50)).toBe(true);
    expect(containsPoint(pacific, -160, 20)).toBe(true);
    expect(containsPoint(pacific, 100, 50)).toBe(false);
    expect(containsPoint([150, 10, 200, 60], -170, 50)).toBe(true);
  });

  it("treats a viewport wider than the world as containing every longitude", () => {
    expect(containsPoint([-400, -80, 400, 80], 179, 0)).toBe(true);
  });
});

describe("nearestCopyX", () => {
  it("moves a projected point onto the world copy nearest the reference x", () => {
    expect(nearestCopyX(300, 320, 2048)).toBe(300);
    expect(nearestCopyX(2300, 260, 2048)).toBe(252);
    expect(nearestCopyX(-1800, 260, 2048)).toBe(248);
    expect(nearestCopyX(5000, 100, 1024)).toBe(-120);
  });
});

describe("membership", () => {
  it("returns the indices inside, in input order", () => {
    const points: [number, number][] = [
      [-118, 34],
      [-150, 61],
      [-80, 35],
    ];
    expect(pointsInBBox(points, CONUS)).toEqual([0, 2]);
    expect(coordsInBBox([-118, -150, -80], [34, 61, 35], CONUS)).toEqual([0, 2]);
    expect(indicesWithKey(["06", "02", "06", "37"], new Set(["06", "37"]))).toEqual([0, 2, 3]);
  });

  it("reads a MapLibre-style bounds object", () => {
    const bounds = { getWest: () => -125, getSouth: () => 24, getEast: () => -66.5, getNorth: () => 49.5 };
    expect(boundsToBBox(bounds)).toEqual(CONUS);
  });
});

describe("bbox helpers", () => {
  it("unions, intersects, and centers", () => {
    expect(bboxUnion([])).toBeNull();
    expect(
      bboxUnion([
        [0, 0, 1, 1],
        [-1, 0.5, 0.5, 3],
      ]),
    ).toEqual([-1, 0, 1, 3]);
    expect(
      bboxOfPoints([
        [2, 3],
        [-1, 5],
      ]),
    ).toEqual([-1, 3, 2, 5]);
    expect(bboxIntersects([0, 0, 1, 1], [1, 1, 2, 2])).toBe(true);
    expect(bboxIntersects([0, 0, 1, 1], [1.1, 0, 2, 1])).toBe(false);
    expect(bboxCenter([-10, 20, 10, 40])).toEqual([0, 30]);
  });
});
