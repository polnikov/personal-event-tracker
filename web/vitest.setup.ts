import "@testing-library/jest-dom/vitest";
// jsdom has no IndexedDB; Dexie-backed modules use it during tests.
import "fake-indexeddb/auto";
