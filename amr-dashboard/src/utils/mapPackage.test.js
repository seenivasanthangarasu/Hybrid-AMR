import { describe, it, expect } from 'vitest';
import {
  parseMapYaml,
  serializeMapYaml,
  serializeP5Pgm,
  parseP5Pgm,
  computeSha256,
} from './mapPackage.js';

describe('mapPackage YAML handling', () => {
  it('serializes and parses map YAML roundtrip', () => {
    const original = {
      image: 'map.pgm',
      resolution: 0.05,
      origin: [-10.5, -20.25, 1.57],
      negate: 0,
      occupied_thresh: 0.65,
      free_thresh: 0.25,
      mode: 'trinary',
    };

    const yaml = serializeMapYaml(original);
    const parsed = parseMapYaml(yaml);

    expect(parsed.image).toBe('map.pgm');
    expect(parsed.resolution).toBe(0.05);
    expect(parsed.origin).toEqual([-10.5, -20.25, 1.57]);
    expect(parsed.occupied_thresh).toBe(0.65);
    expect(parsed.free_thresh).toBe(0.25);
    expect(parsed.mode).toBe('trinary');
  });

  it('rejects invalid YAML without required fields', () => {
    expect(() => parseMapYaml('image: map.pgm\n')).toThrow(/resolution/i);
    expect(() => parseMapYaml('resolution: 0.05\norigin: [0, 0, 0]\n')).toThrow(/map.pgm/i);
    expect(() => parseMapYaml('image: map.pgm\nresolution: -1\norigin: [0,0,0]')).toThrow(/resolution/i);
  });
});

describe('mapPackage binary PGM handling', () => {
  it('encodes and decodes P5 PGM binary with Y-flip preservation', () => {
    const width = 3;
    const height = 2;
    // Row 0 (bottom row in ROS): [0, 100, -1]
    // Row 1 (top row in ROS):    [-1, 0, 100]
    const gridData = new Int8Array([
      0, 100, -1,
      -1, 0, 100,
    ]);

    const pgmBytes = serializeP5Pgm(width, height, gridData);
    expect(pgmBytes.length).toBeGreaterThan(width * height);

    const decoded = parseP5Pgm(pgmBytes);
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(Array.from(decoded.data)).toEqual(Array.from(gridData));
  });

  it('rejects mismatching dimensions or truncated buffer', () => {
    expect(() => serializeP5Pgm(3, 3, new Int8Array(4))).toThrow(/Data length/i);
    expect(() => parseP5Pgm(new Uint8Array([80, 53, 10, 50, 32, 50, 10, 50, 53, 53, 10]))).toThrow(/Truncated/i);
  });
});

describe('computeSha256', () => {
  it('computes 64-character hex hash', async () => {
    const hash = await computeSha256('hello world');
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });
});
