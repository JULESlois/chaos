import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom test environment.
 *
 * jsdom has no canvas, no WebGL, no matchMedia and no observers, so the
 * application would fail before any assertion ran. The stubs below are
 * deliberately dumb: they let the code execute without pretending to render
 * anything. Because getContext('webgl') returns null, the app under test
 * detects render level 3 and exercises the DOM degradation path.
 */

type Mutable = Record<string, unknown>;

function createContext2DStub(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const noop = (): void => {};

  const state: Mutable = {
    canvas,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '10px monospace',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    imageSmoothingEnabled: false,
    filter: 'none',
    measureText: () => ({ width: 6 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(Math.max(1, width * height * 4)),
      width,
      height,
      colorSpace: 'srgb',
    }),
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(Math.max(1, width * height * 4)),
      width,
      height,
      colorSpace: 'srgb',
    }),
  };

  // Any drawing call we have not listed resolves to a no-op.
  return new Proxy(state, {
    get: (target, property) =>
      property in target ? target[property as string] : noop,
    set: (target, property, value) => {
      target[property as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement,
  contextId: string,
) {
  return contextId === '2d' ? createContext2DStub(this) : null;
} as HTMLCanvasElement['getContext'];

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    addListener: (): void => {},
    removeListener: (): void => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

class ObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

// jsdom ships neither observer; the stubs simply never report a change.
window.IntersectionObserver = ObserverStub as unknown as typeof IntersectionObserver;
window.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;

// jsdom declares these but throws "Not implemented" when they are called.
window.scrollTo = (): void => {};
HTMLCanvasElement.prototype.toDataURL = (): string =>
  'data:image/png;base64,iVBORw0KGgo=';

/**
 * React Router builds a `Request` for every client-side navigation. Under
 * jsdom the global `AbortController` comes from jsdom while `Request` comes
 * from Node, and Node refuses a foreign `AbortSignal`, which turns any
 * programmatic navigate() into an unhandled rejection. The app declares no
 * loaders or actions, so a structural stand-in is enough.
 */
class RequestStub {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly signal: AbortSignal | null;
  readonly body: unknown;

  constructor(input: string | { url: string }, init: RequestInit = {}) {
    this.url = typeof input === 'string' ? input : input.url;
    this.method = (init.method ?? 'GET').toUpperCase();
    this.headers = new Headers(init.headers);
    this.signal = init.signal ?? null;
    this.body = init.body ?? null;
  }
}

vi.stubGlobal('Request', RequestStub);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-signal');
  document.documentElement.removeAttribute('data-stabilised');
});
