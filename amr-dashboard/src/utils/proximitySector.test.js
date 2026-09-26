import { describe, it, expect } from 'vitest';
import {
  normalizeAngle,
  getProximitySector,
  classifyProximity,
  CRITICAL_PROXIMITY_M,
  WARNING_PROXIMITY_M,
} from './proximitySector.js';

describe('proximitySector utilities', () => {
  describe('normalizeAngle', () => {
    it('keeps angles within [-PI, PI] unchanged', () => {
      expect(normalizeAngle(0)).toBe(0);
      expect(normalizeAngle(1.5)).toBeCloseTo(1.5, 5);
      expect(normalizeAngle(-2)).toBeCloseTo(-2, 5);
    });

    it('wraps angles outside [-PI, PI]', () => {
      expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 5);
      expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI, 5);
      expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0, 5);
    });
  });

  describe('getProximitySector', () => {
    it('classifies 0 radians as FRONT', () => {
      expect(getProximitySector(0)).toBe('FRONT');
      expect(getProximitySector(0.1)).toBe('FRONT');
      expect(getProximitySector(-0.1)).toBe('FRONT');
    });

    it('classifies left quadrants (+rad)', () => {
      expect(getProximitySector(Math.PI / 4)).toBe('FRONT-LEFT');
      expect(getProximitySector(Math.PI / 2)).toBe('LEFT');
      expect(getProximitySector((3 * Math.PI) / 4)).toBe('REAR-LEFT');
    });

    it('classifies right quadrants (-rad)', () => {
      expect(getProximitySector(-Math.PI / 4)).toBe('FRONT-RIGHT');
      expect(getProximitySector(-Math.PI / 2)).toBe('RIGHT');
      expect(getProximitySector((-3 * Math.PI) / 4)).toBe('REAR-RIGHT');
    });

    it('classifies pi and -pi as REAR', () => {
      expect(getProximitySector(Math.PI)).toBe('REAR');
      expect(getProximitySector(-Math.PI)).toBe('REAR');
    });
  });

  describe('classifyProximity', () => {
    it('returns NO_DATA when range is null, undefined, or non-finite', () => {
      expect(classifyProximity(null)).toBe('NO_DATA');
      expect(classifyProximity(undefined)).toBe('NO_DATA');
      expect(classifyProximity(NaN)).toBe('NO_DATA');
      expect(classifyProximity(Infinity)).toBe('NO_DATA');
    });

    it('returns CRITICAL when minRange <= 0.50m', () => {
      expect(classifyProximity(0.15)).toBe('CRITICAL');
      expect(classifyProximity(CRITICAL_PROXIMITY_M)).toBe('CRITICAL');
    });

    it('returns WARNING when 0.50m < minRange <= 1.20m', () => {
      expect(classifyProximity(0.51)).toBe('WARNING');
      expect(classifyProximity(1.0)).toBe('WARNING');
      expect(classifyProximity(WARNING_PROXIMITY_M)).toBe('WARNING');
    });

    it('returns CLEAR when minRange > 1.20m', () => {
      expect(classifyProximity(1.21)).toBe('CLEAR');
      expect(classifyProximity(4.5)).toBe('CLEAR');
    });
  });
});
