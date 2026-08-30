import { describe, expect, it } from "vitest";

import type { ContentVersion } from "../content/catalog";
import { CONTENT_VERSION } from "../content/catalog";
import { deriveStream } from "./seededRng";

const asContentVersion = (value: string): ContentVersion =>
  value as ContentVersion;

describe("seeded named random streams", () => {
  it("pins the v1 tuple hash and Mulberry32 draws with golden vectors", () => {
    const routeStream = deriveStream(
      "run-alpha",
      CONTENT_VERSION,
      "route:content-1:run-17:2",
    );
    const unicodeStream = deriveStream(
      "seed-λ",
      CONTENT_VERSION,
      "room:boss-null-architect:3",
    );

    expect(Array.from({ length: 5 }, () => routeStream.nextUint32())).toEqual([
      3_124_311_682,
      1_661_274_326,
      889_375_167,
      3_028_071_244,
      2_182_653_980,
    ]);
    expect(Array.from({ length: 3 }, () => unicodeStream.nextUint32())).toEqual([
      3_352_045_804,
      2_558_658_847,
      619_689_827,
    ]);
  });

  it("restarts the same tuple at the same immutable stream", () => {
    const first = deriveStream("repeatable", CONTENT_VERSION, "shop:depth:8");
    const second = deriveStream("repeatable", CONTENT_VERSION, "shop:depth:8");

    expect(Object.isFrozen(first)).toBe(true);
    expect(Array.from({ length: 12 }, () => first.nextUint32())).toEqual(
      Array.from({ length: 12 }, () => second.nextUint32()),
    );
  });

  it("isolates event keys from unrelated stream draws", () => {
    const unrelated = deriveStream("isolated", CONTENT_VERSION, "route:depth:2");
    const expectedRoom = deriveStream(
      "isolated",
      CONTENT_VERSION,
      "room:battle:depth:2",
    );
    const expectedDraws = Array.from({ length: 6 }, () =>
      expectedRoom.nextUint32(),
    );

    Array.from({ length: 100 }, () => unrelated.nextUint32());
    const actualRoom = deriveStream(
      "isolated",
      CONTENT_VERSION,
      "room:battle:depth:2",
    );

    expect(Array.from({ length: 6 }, () => actualRoom.nextUint32())).toEqual(
      expectedDraws,
    );
    expect(
      deriveStream("isolated", CONTENT_VERSION, "room:elite:depth:2").nextUint32(),
    ).not.toBe(expectedDraws[0]);
  });

  it("keeps floats and unbiased bounded draws below their exclusive bounds", () => {
    const rng = deriveStream("bounds", CONTENT_VERSION, "bounded-draws");
    const floats = Array.from({ length: 2_000 }, () => rng.nextFloat());

    expect(Math.min(...floats)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...floats)).toBeLessThan(1);
    expect(rng.nextInt(1)).toBe(0);
    for (const bound of [2, 3, 7, 255, 65_537, 0x1_0000_0000]) {
      const values = Array.from({ length: 2_000 }, () => rng.nextInt(bound));
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...values)).toBeLessThan(bound);
      expect(values.every(Number.isSafeInteger)).toBe(true);
    }
  });

  it("picks and shuffles deterministically without mutating input", () => {
    const values = Object.freeze(["warden", "broodmother", "architect", "leech"]);
    const first = deriveStream("choices", CONTENT_VERSION, "boss:12");
    const second = deriveStream("choices", CONTENT_VERSION, "boss:12");

    expect(first.pick(values)).toBe(second.pick(values));
    const firstShuffle = first.shuffle(values);
    const secondShuffle = second.shuffle(values);
    expect(firstShuffle).toEqual(secondShuffle);
    expect([...firstShuffle].sort()).toEqual([...values].sort());
    expect(Object.isFrozen(firstShuffle)).toBe(true);
    expect(values).toEqual(["warden", "broodmother", "architect", "leech"]);
  });

  it("rejects blank stream coordinates and invalid bounded operations", () => {
    expect(() => deriveStream("", CONTENT_VERSION, "event")).toThrow(TypeError);
    expect(() => deriveStream("seed", asContentVersion("   "), "event")).toThrow(
      TypeError,
    );
    expect(() => deriveStream("seed", CONTENT_VERSION, "\n\t")).toThrow(TypeError);

    const rng = deriveStream("invalid", CONTENT_VERSION, "bounds");
    for (const bound of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => rng.nextInt(bound)).toThrow(RangeError);
    }
    expect(() => rng.nextInt(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});
