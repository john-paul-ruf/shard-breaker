// Shared Testing Library matchers for component tests. Importing this module
// only extends Vitest's `expect`; it does not touch the DOM, so it stays safe
// in the Node environment used by pure domain tests. Persistence tests opt into
// `fake-indexeddb` themselves rather than installing it globally here.
import "@testing-library/jest-dom/vitest";
