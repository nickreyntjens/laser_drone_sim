import { Vec3 } from "./types";

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3, factor: number): Vec3 {
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function length(v: Vec3): number {
  return Math.sqrt(dot(v, v));
}

export function horizontalLength(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.z * v.z);
}

export function normalize(v: Vec3): Vec3 {
  const magnitude = length(v);
  if (magnitude < 1e-6) {
    return vec3();
  }

  return scale(v, 1 / magnitude);
}

export function horizontalNormalize(v: Vec3): Vec3 {
  const magnitude = horizontalLength(v);
  if (magnitude < 1e-6) {
    return vec3();
  }

  return { x: v.x / magnitude, y: 0, z: v.z / magnitude };
}

export function clampLength(v: Vec3, maxLength: number): Vec3 {
  const magnitude = length(v);
  if (magnitude <= maxLength || magnitude < 1e-6) {
    return v;
  }

  return scale(v, maxLength / magnitude);
}

export function distance(a: Vec3, b: Vec3): number {
  return length(subtract(a, b));
}

export function horizontalDistance(a: Vec3, b: Vec3): number {
  return horizontalLength(subtract(a, b));
}

export function angleFromVector(v: Vec3): number {
  return Math.atan2(v.z, v.x);
}

export function wrapAngleRad(angle: number): number {
  const revolution = Math.PI * 2;
  let wrapped = (angle + Math.PI) % revolution;
  if (wrapped < 0) {
    wrapped += revolution;
  }
  return wrapped - Math.PI;
}

export function shortestAngleDeltaRad(current: number, target: number): number {
  return wrapAngleRad(target - current);
}

export function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

export function createRng(seed: number): () => number {
  let state = seed >>> 0;

  return function rng(): number {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleNormal(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-7);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function samplePoisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) {
    return 0;
  }

  if (lambda < 30) {
    const limit = Math.exp(-lambda);
    let product = 1;
    let count = 0;

    do {
      count += 1;
      product *= rng();
    } while (product > limit);

    return count - 1;
  }

  const normalApprox = Math.round(lambda + Math.sqrt(lambda) * sampleNormal(rng));
  return Math.max(normalApprox, 0);
}
