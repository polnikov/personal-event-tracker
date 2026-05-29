// Makes the @testing-library/jest-dom matchers (toHaveTextContent, etc.)
// visible to TypeScript in *.test.tsx files. The runtime extension lives in
// vitest.setup.ts; this import only pulls in the type augmentation.
import "@testing-library/jest-dom/vitest";
