import '@testing-library/jest-dom/vitest';

// recharts' ResponsiveContainer relies on ResizeObserver, absent in jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

// jsdom doesn't lay out elements, so give charts a non-zero box to render into.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 640 });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 300 });
