import type { HostCommand, WidgetEvent } from './types';

export type SurfaceState = {
  mounted: boolean;
  visible: boolean;
  ready: boolean;
  loadError: boolean;
  webViewKey: number;
};

export type ControllerCallbacks = { onOpen?: () => void; onClose?: () => void };

/**
 * The widget fetches its config and token once per page load, and the token expires, so a
 * page older than this is reloaded on open instead of being reused.
 */
export const MAX_PAGE_AGE_MS = 12 * 60 * 60 * 1000;

// Shared by every controller (only one widget is supported at a time), so a reset requested
// before `ready` still reaches the page when the widget unmounts and a new one mounts.
let pendingReset = false;

/** Internal: clears the shared pending reset. Used by `resetFlex54ForTesting`; not exported from the package. */
export function clearPendingResetForTesting(): void {
  pendingReset = false;
}

/**
 * Pure state machine behind the widget surface. Implements the "Host responsibilities"
 * of PROTOCOL.md: sync state on every `ready` instead of replaying a command queue.
 * `subscribe` and `getState` are arrow properties, so they can be passed around unbound
 * (e.g. straight into `useSyncExternalStore`).
 */
export class Flex54Controller {
  private state: SurfaceState = {
    // Mount hidden when a reset is pending, so it is delivered without the user opening the chat.
    mounted: pendingReset,
    visible: false,
    ready: false,
    loadError: false,
    webViewKey: 0,
  };
  private listeners = new Set<() => void>();
  private sender: ((c: HostCommand) => void) | null = null;
  private callbacks: ControllerCallbacks;
  private now: () => number;
  private readyAt = 0;
  private widgetOpen = false;

  constructor(callbacks: ControllerCallbacks = {}, now: () => number = Date.now) {
    this.callbacks = callbacks;
    this.now = now;
  }

  setCallbacks(cb: ControllerCallbacks): void {
    this.callbacks = cb;
  }

  attachSender(send: ((c: HostCommand) => void) | null): void {
    this.sender = send;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): SurfaceState => this.state;

  private update(patch: Partial<SurfaceState>): void {
    const next = { ...this.state, ...patch };
    const changed = (Object.keys(next) as (keyof SurfaceState)[]).some(
      (k) => next[k] !== this.state[k],
    );
    if (!changed) return;
    this.state = next;
    [...this.listeners].forEach((l) => l());
  }

  private send(command: HostCommand): void {
    this.sender?.(command);
  }

  open(): void {
    // A load error is sticky until retried, so reopening retries.
    if (this.state.loadError) this.retry();
    this.update({ mounted: true, visible: true });
    if (!this.state.ready) return;
    // The next `ready` opens the reloaded page.
    if (this.now() - this.readyAt > MAX_PAGE_AGE_MS) this.remount();
    else this.send('open');
  }

  close(): void {
    if (!this.state.visible) return;
    this.update({ visible: false });
    // Sent even before ready: the injected script is guarded by `window.Flex54Bridge&&`,
    // so it is a no-op on a page without the bridge.
    this.send('close');
  }

  toggle(): void {
    if (this.state.visible) this.close();
    else this.open();
  }

  reset(): void {
    pendingReset = true;
    this.update({ mounted: true });
    if (this.state.ready) {
      pendingReset = false;
      this.send('reset');
    }
  }

  isOpen(): boolean {
    return this.state.visible;
  }

  handleWidgetEvent(e: WidgetEvent): void {
    switch (e) {
      case 'ready':
        this.readyAt = this.now();
        this.update({ ready: true, loadError: false });
        if (pendingReset) {
          pendingReset = false;
          this.send('reset');
        }
        if (this.state.visible) this.send('open');
        break;
      case 'opened':
        this.widgetOpen = true;
        // Never leave the chat open behind a hidden surface (billing invariant).
        if (!this.state.visible) this.send('close');
        this.callbacks.onOpen?.();
        break;
      case 'closed':
        if (!this.widgetOpen) return;
        this.widgetOpen = false;
        // Hide first so onClose sees consistent state and may safely call open().
        if (this.state.visible) this.update({ visible: false });
        this.callbacks.onClose?.();
        break;
    }
  }

  handleLoadError(): void {
    this.update({ loadError: true, ready: false });
  }

  retry(): void {
    this.update({ loadError: false });
    this.remount();
  }

  handleProcessTerminated(): void {
    this.remount();
  }

  private remount(): void {
    this.widgetOpen = false;
    this.update({ ready: false, webViewKey: this.state.webViewKey + 1 });
  }
}
