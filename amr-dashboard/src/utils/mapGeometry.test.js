import { describe, it, expect } from 'vitest';
import {
  getYawFromQuaternion,
  getQuaternionFromYaw,
  screenToWorld,
  worldToScreen,
  getCellOccupancy,
  normalizeAngle,
} from './mapGeometry.js';

describe('mapGeometry quaternion and yaw math', () => {
  it('converts yaw to quaternion and back accurately', () => {
    const angles = [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2];
    for (const yaw of angles) {
      const q = getQuaternionFromYaw(yaw);
      const recoveredYaw = getYawFromQuaternion(q);
      expect(Math.abs(normalizeAngle(recoveredYaw - yaw))).toBeLessThan(1e-6);
    }
  });
});

describe('mapGeometry coordinate transformations', () => {
  const width = 200;
  const height = 100;
  const resolution = 0.05; // 5 cm per cell
  const scale = 2.0;
  const offX = 50;
  const offY = 30;

  it('performs roundtrip conversion with zero origin', () => {
    const origin = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    };

    const screenPoints = [
      { sx: 50, sy: 30 }, // top-left corner
      { sx: 250, sy: 130 }, // middle
      { sx: 448, sy: 228 }, // bottom-right corner inside grid
    ];

    for (const pt of screenPoints) {
      const world = screenToWorld({
        sx: pt.sx,
        sy: pt.sy,
        width,
        height,
        resolution,
        origin,
        scale,
        offX,
        offY,
      });

      const screen = worldToScreen({
        wx: world.wx,
        wy: world.wy,
        width,
        height,
        resolution,
        origin,
        scale,
        offX,
        offY,
      });

      expect(Math.abs(screen.sx - pt.sx)).toBeLessThan(1e-5);
      expect(Math.abs(screen.sy - pt.sy)).toBeLessThan(1e-5);
      expect(world.isInside).toBe(true);
    }
  });

  it('handles nonzero origin translation', () => {
    const origin = {
      position: { x: -10.5, y: -5.2, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    };

    // Bottom-left corner in canvas (canvasPx: 0, canvasPy: height = 100) -> grid origin (x: -10.5, y: -5.2)
    const worldBL = screenToWorld({
      sx: offX + 0 * scale,
      sy: offY + height * scale,
      width,
      height,
      resolution,
      origin,
      scale,
      offX,
      offY,
    });

    expect(Math.abs(worldBL.wx - (-10.5))).toBeLessThan(1e-5);
    expect(Math.abs(worldBL.wy - (-5.2))).toBeLessThan(1e-5);
  });

  it('handles nonzero origin yaw rotation (e.g. 90 degrees)', () => {
    const originYaw = Math.PI / 2; // 90 deg rotation
    const origin = {
      position: { x: 0, y: 0, z: 0 },
      orientation: getQuaternionFromYaw(originYaw),
    };

    // Point at grid X=2m, Y=0m relative to origin
    // Under 90 deg counter-clockwise rotation, (gx: 2, gy: 0) becomes (wx: 0, wy: 2)
    const canvasPx = 2 / resolution; // 40 cells
    const canvasPy = height; // row 0 in ROS grid is bottom

    const world = screenToWorld({
      sx: offX + canvasPx * scale,
      sy: offY + canvasPy * scale,
      width,
      height,
      resolution,
      origin,
      scale,
      offX,
      offY,
    });

    expect(Math.abs(world.wx - 0)).toBeLessThan(1e-5);
    expect(Math.abs(world.wy - 2)).toBeLessThan(1e-5);

    // Inverse roundtrip
    const screen = worldToScreen({
      wx: world.wx,
      wy: world.wy,
      width,
      height,
      resolution,
      origin,
      scale,
      offX,
      offY,
    });

    expect(Math.abs(screen.sx - (offX + canvasPx * scale))).toBeLessThan(1e-5);
    expect(Math.abs(screen.sy - (offY + canvasPy * scale))).toBeLessThan(1e-5);
  });

  it('detects boundary out_of_bounds correctly', () => {
    const origin = { position: { x: 0, y: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
    const outside = screenToWorld({
      sx: offX - 10,
      sy: offY - 10,
      width,
      height,
      resolution,
      origin,
      scale,
      offX,
      offY,
    });
    expect(outside.isInside).toBe(false);
  });
});

describe('getCellOccupancy', () => {
  const width = 4;
  const height = 3;
  const data = new Int8Array([
    0, 0, 100, -1, // row 0
    0, 100, 0, 0,  // row 1
    -1, 0, 0, 0,   // row 2
  ]);

  it('returns free, occupied, unknown, and out_of_bounds', () => {
    expect(getCellOccupancy(0, 0, width, height, data).type).toBe('free');
    expect(getCellOccupancy(2, 0, width, height, data).type).toBe('occupied');
    expect(getCellOccupancy(3, 0, width, height, data).type).toBe('unknown');
    expect(getCellOccupancy(0, 2, width, height, data).type).toBe('unknown');
    expect(getCellOccupancy(-1, 0, width, height, data).type).toBe('out_of_bounds');
    expect(getCellOccupancy(5, 5, width, height, data).type).toBe('out_of_bounds');
  });
});
