import "@testing-library/jest-dom";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

Object.defineProperty(Element.prototype, "hasPointerCapture", {
  configurable: true,
  value: () => false,
});
Object.defineProperty(Element.prototype, "setPointerCapture", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(Element.prototype, "releasePointerCapture", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});
// jsdom does not implement window.scrollTo; Framer Motion calls it while measuring height: "auto".
Object.defineProperty(window, "scrollTo", {
  configurable: true,
  writable: true,
  value: () => undefined,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
