import { describe, it, expect } from 'vitest';
import {
  projectToXY, ragColorVar, markerColorVar, isValidLatLng, PK_BBOX,
} from './geo';

describe('geo projection', () => {
  it('maps the bbox corners to the SVG box edges', () => {
    const [x0, y0] = projectToXY(PK_BBOX.lat1, PK_BBOX.lng0, 100, 200);
    expect(x0).toBeCloseTo(0);
    expect(y0).toBeCloseTo(0);
    const [x1, y1] = projectToXY(PK_BBOX.lat0, PK_BBOX.lng1, 100, 200);
    expect(x1).toBeCloseTo(100);
    expect(y1).toBeCloseTo(200);
  });

  it('places Islamabad in the upper-right quadrant', () => {
    const [x, y] = projectToXY(33.69, 73.06, 100, 100);
    expect(x).toBeGreaterThan(50); // east
    expect(y).toBeLessThan(50);    // north
  });
});

describe('marker colours', () => {
  it('RAG by schedule slippage', () => {
    expect(ragColorVar(40, 40)).toBe('var(--rag-green)'); // on plan
    expect(ragColorVar(35, 40)).toBe('var(--rag-amber)'); // -5
    expect(ragColorVar(25, 40)).toBe('var(--rag-red)');   // -15
  });

  it('distinct tints per org level', () => {
    expect(markerColorVar('hq')).toBe('var(--command)');
    expect(markerColorVar('pd_hq')).toBe('var(--signal)');
    expect(markerColorVar('project')).not.toBe(markerColorVar('pd_hq'));
  });
});

describe('lat/lng validation', () => {
  it('accepts in-range numbers and rejects junk', () => {
    expect(isValidLatLng(33.6, 73.0)).toBe(true);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, 200)).toBe(false);
    expect(isValidLatLng(undefined, 73)).toBe(false);
    expect(isValidLatLng(NaN, 73)).toBe(false);
  });
});
