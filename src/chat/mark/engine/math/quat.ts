/**
 * Quaternion / rotation matrix base layer.
 * Convention: Quat = [w, x, y, z]; Mat3 is row-major 3x3; euler-angle interfaces are all radians (call layers convert with DEG).
 */
import type { Mat3, Quat, Vec3 } from "../../types";

export const DEG = Math.PI / 180;

export function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

export function quatAxisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

export function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

// Shortest arc between two unit vectors
export function quatBetween(from: Vec3, to: Vec3): Quat {
  return quatNormalize([
    1 + (from[0] * to[0] + from[1] * to[1] + from[2] * to[2]),
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0],
  ]);
}

export function quatToMat3(q: Quat): Mat3 {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

// Rz(z)·Ry(y)·Rx(x); parameters in radians
export function quatFromEulerXYZ(x: number, y: number, z: number): Quat {
  return quatMul(quatAxisAngle([0, 0, 1], z), quatMul(quatAxisAngle([0, 1, 0], y), quatAxisAngle([1, 0, 0], x)));
}

// ZYX extraction, output in radians
export function mat3ToEuler(m: Mat3): Vec3 {
  const m00 = m[0], m10 = m[3], m12 = m[5], m11 = m[4], m20 = m[6], m21 = m[7], m22 = m[8];
  const c = Math.max(-1, Math.min(1, -m20));
  const pitch = Math.asin(c);
  return Math.abs(c) > 0.999999
    ? [Math.atan2(-m12, m11), pitch, 0]
    : [Math.atan2(m21, m22), pitch, Math.atan2(m10, m00)];
}

export function quatToEuler(q: Quat): Vec3 {
  return mat3ToEuler(quatToMat3(q));
}

export function mat3MulVec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}
