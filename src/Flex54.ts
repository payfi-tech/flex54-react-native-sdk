import { clearPendingResetForTesting } from './controller';
import type { Flex54Controller } from './controller';

type Call = (c: Flex54Controller) => void;

let active: Flex54Controller | null = null;
let buffered: Call[] = [];

function dispatch(call: Call): void {
  if (active) call(active);
  else buffered.push(call);
}

/** Imperative API. Calls made before a widget mounts are buffered and replayed in order. */
export const Flex54 = {
  open: (): void => dispatch((c) => c.open()),
  close: (): void => dispatch((c) => c.close()),
  toggle: (): void => dispatch((c) => c.toggle()),
  reset: (): void => dispatch((c) => c.reset()),
  isOpen: (): boolean => (active ? active.isOpen() : false),
};

/** Last registration wins. The returned function only unregisters if `c` is still active. */
export function registerController(c: Flex54Controller): () => void {
  active = c;
  const pending = buffered;
  buffered = [];
  pending.forEach((call) => call(c));
  return () => {
    if (active === c) active = null;
  };
}

/** Test helper: clears the active controller, the pending-call buffer and any pending reset. */
export function resetFlex54ForTesting(): void {
  active = null;
  buffered = [];
  clearPendingResetForTesting();
}
