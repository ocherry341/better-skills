import { render } from "ink-testing-library";
import React from "react";
import { Text } from "ink";

/**
 * Render a React hook in a minimal Ink component for testing.
 * Access hook result via `result.current` (always reflects latest render).
 */
export function renderHook<T>(useHook: () => T) {
  let value: T;

  function TestComponent() {
    value = useHook();
    return <Text>{" "}</Text>;
  }

  const instance = render(<TestComponent />);

  return {
    get current() {
      return value!;
    },
    unmount: instance.unmount,
  };
}

/**
 * Wait for async effects (useEffect + promise resolution + re-render).
 */
export function flush(ms = 10): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Strip ANSI escape codes from rendered frame text.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
}
