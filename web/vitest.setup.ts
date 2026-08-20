import "@testing-library/jest-dom/vitest";
// jsdom has no IndexedDB; Dexie-backed modules use it during tests.
import "fake-indexeddb/auto";

// jsdom ships no matchMedia, which useIsMobile needs. Answers "desktop" by
// default; a test wanting the phone layout replaces window.matchMedia itself.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
