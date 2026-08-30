import type { ContentVersion } from "../content/catalog";

export type EventKey = string;

export interface SeededRng {
  nextUint32(): number;
  nextFloat(): number;
  nextInt(maxExclusive: number): number;
  pick<T>(values: readonly T[]): T;
  shuffle<T>(values: readonly T[]): readonly T[];
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 0x1_0000_0000;

function hashByte(hash: number, byte: number): number {
  return Math.imul((hash ^ byte) >>> 0, FNV_PRIME) >>> 0;
}

/**
 * FNV-1a hashes four length-prefixed UTF-16 byte sequences: the algorithm
 * marker, seed, content version, and event key. Length prefixes keep tuple
 * boundaries unambiguous; hashing both bytes of every code unit makes Unicode
 * behavior independent of locale and host text encoders.
 */
function hashStreamTuple(
  seed: string,
  contentVersion: ContentVersion,
  eventKey: EventKey,
): number {
  let hash = FNV_OFFSET_BASIS;
  const fields: readonly string[] = [
    "shardbreak-rng-v1",
    seed,
    contentVersion,
    eventKey,
  ];

  for (const field of fields) {
    const length = field.length >>> 0;
    hash = hashByte(hash, length & 0xff);
    hash = hashByte(hash, (length >>> 8) & 0xff);
    hash = hashByte(hash, (length >>> 16) & 0xff);
    hash = hashByte(hash, (length >>> 24) & 0xff);

    for (let index = 0; index < field.length; index += 1) {
      const codeUnit = field.charCodeAt(index);
      hash = hashByte(hash, codeUnit & 0xff);
      hash = hashByte(hash, codeUnit >>> 8);
    }
  }

  return hash >>> 0;
}

function requireNonBlank(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-blank string`);
  }
}

/**
 * Derive a fresh Mulberry32 stream from a stable FNV-1a tuple hash. Both the
 * `shardbreak-rng-v1` hash marker and Mulberry32 transition are compatibility
 * contracts for persisted `content-1` event keys.
 */
export function deriveStream(
  seed: string,
  contentVersion: ContentVersion,
  eventKey: EventKey,
): SeededRng {
  requireNonBlank(seed, "seed");
  requireNonBlank(contentVersion, "contentVersion");
  requireNonBlank(eventKey, "eventKey");

  let state = hashStreamTuple(seed, contentVersion, eventKey);

  const nextUint32 = (): number => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1) >>> 0;
    value =
      (value ^
        ((value + Math.imul(value ^ (value >>> 7), value | 61)) >>> 0)) >>>
      0;
    return (value ^ (value >>> 14)) >>> 0;
  };

  const nextInt = (maxExclusive: number): number => {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive safe integer");
    }
    if (maxExclusive > UINT32_RANGE) {
      throw new RangeError("maxExclusive must not exceed the uint32 range");
    }

    const acceptanceLimit =
      UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    let draw = nextUint32();
    while (draw >= acceptanceLimit) {
      draw = nextUint32();
    }
    return draw % maxExclusive;
  };

  const rng: SeededRng = {
    nextUint32,
    nextFloat: () => nextUint32() / UINT32_RANGE,
    nextInt,
    pick: <T>(values: readonly T[]): T => {
      if (values.length === 0) {
        throw new RangeError("cannot pick from an empty array");
      }
      return values[nextInt(values.length)]!;
    },
    shuffle: <T>(values: readonly T[]): readonly T[] => {
      const shuffled = [...values];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = nextInt(index + 1);
        [shuffled[index], shuffled[swapIndex]] = [
          shuffled[swapIndex]!,
          shuffled[index]!,
        ];
      }
      return Object.freeze(shuffled);
    },
  };

  return Object.freeze(rng);
}
