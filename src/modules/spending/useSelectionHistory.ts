import { useState } from 'react';

export function useSelectionHistory<T extends string>() {
  const [steps, setSteps] = useState<T[]>([]);
  const panel = steps[steps.length - 1] ?? null;
  const navigate = (next: T | null) => setSteps(current => {
    if (next === null) return [];
    const previous = current.indexOf(next);
    return previous >= 0 ? current.slice(0, previous + 1) : [...current, next];
  });
  const back = () => setSteps(current => current.slice(0, -1));
  return { panel, navigate, back, canGoBack: steps.length > 1 };
}
