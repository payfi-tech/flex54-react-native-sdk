import { Flex54Controller, clearPendingResetForTesting } from '../controller';
import type { HostCommand } from '../types';

const HOUR = 60 * 60 * 1000;

function setup(now?: () => number) {
  const onOpen = jest.fn();
  const onClose = jest.fn();
  const c = new Flex54Controller({ onOpen, onClose }, now);
  const sent: HostCommand[] = [];
  c.attachSender((cmd) => sent.push(cmd));
  return { c, sent, onOpen, onClose };
}

beforeEach(() => clearPendingResetForTesting());

describe('Flex54Controller', () => {
  it('open before ready mounts, shows, and opens on ready', () => {
    const { c, sent } = setup();
    c.open();
    expect(c.getState()).toMatchObject({ mounted: true, visible: true, ready: false });
    expect(sent).toEqual([]);
    c.handleWidgetEvent('ready');
    expect(sent).toEqual(['open']);
    expect(c.getState().ready).toBe(true);
  });

  it('sends exactly one open for repeated open() before ready', () => {
    const { c, sent } = setup();
    c.open();
    c.open();
    c.handleWidgetEvent('ready');
    expect(sent).toEqual(['open']);
  });

  it('open then close before ready hides, sends a guarded close, and sends nothing on ready', () => {
    const { c, sent } = setup();
    c.open();
    c.close();
    expect(c.getState().visible).toBe(false);
    expect(sent).toEqual(['close']);
    c.handleWidgetEvent('ready');
    expect(sent).toEqual(['close']);
  });

  it('close while already hidden sends nothing', () => {
    const { c, sent } = setup();
    c.handleWidgetEvent('ready');
    c.close();
    expect(sent).toEqual([]);
  });

  it('opened while hidden sends close', () => {
    const { c, sent, onOpen } = setup();
    c.handleWidgetEvent('ready');
    c.handleWidgetEvent('opened');
    expect(sent).toEqual(['close']);
    expect(c.getState().visible).toBe(false);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('native close followed by widget closed calls onClose once and sends nothing extra', () => {
    const { c, sent, onClose } = setup();
    c.open();
    c.handleWidgetEvent('ready');
    c.handleWidgetEvent('opened');
    c.close();
    expect(sent).toEqual(['open', 'close']);
    c.handleWidgetEvent('closed');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sent).toEqual(['open', 'close']);
    expect(c.getState().visible).toBe(false);
  });

  it('onClose calling open() re-opens cleanly', () => {
    const { c, sent } = setup();
    c.setCallbacks({ onClose: () => c.open() });
    c.open();
    c.handleWidgetEvent('ready');
    c.handleWidgetEvent('opened');
    c.handleWidgetEvent('closed');
    expect(c.getState().visible).toBe(true);
    expect(sent).toEqual(['open', 'open']);
  });

  it('isOpen() is false inside onClose', () => {
    const { c } = setup();
    let seen: boolean | null = null;
    c.setCallbacks({ onClose: () => { seen = c.isOpen(); } });
    c.open();
    c.handleWidgetEvent('ready');
    c.handleWidgetEvent('opened');
    c.handleWidgetEvent('closed');
    expect(seen).toBe(false);
  });

  it('a throwing onClose still leaves the surface hidden', () => {
    const { c } = setup();
    c.setCallbacks({ onClose: () => { throw new Error('boom'); } });
    c.open();
    c.handleWidgetEvent('ready');
    c.handleWidgetEvent('opened');
    expect(() => c.handleWidgetEvent('closed')).toThrow('boom');
    expect(c.getState().visible).toBe(false);
  });

  it('reset before first open mounts hidden and sends reset on ready', () => {
    const { c, sent } = setup();
    c.reset();
    expect(c.getState()).toMatchObject({ mounted: true, visible: false });
    c.handleWidgetEvent('ready');
    expect(sent).toEqual(['reset']);
  });

  it('reset is sent before open on ready', () => {
    const { c, sent } = setup();
    c.reset();
    c.open();
    c.handleWidgetEvent('ready');
    expect(sent).toEqual(['reset', 'open']);
  });

  it('close when ready hides immediately and sends close', () => {
    const { c, sent } = setup();
    c.open();
    c.handleWidgetEvent('ready');
    c.close();
    expect(c.getState().visible).toBe(false);
    expect(sent).toEqual(['open', 'close']);
  });

  it('ignores closed without a prior opened', () => {
    const { c, onClose } = setup();
    c.open();
    c.handleWidgetEvent('ready');
    c.handleWidgetEvent('closed');
    expect(c.getState().visible).toBe(true);
    expect(c.isOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closed after opened hides and calls onOpen/onClose once each', () => {
    const { c, onOpen, onClose } = setup();
    c.open();
    c.handleWidgetEvent('ready');
    c.handleWidgetEvent('opened');
    expect(onOpen).toHaveBeenCalledTimes(1);
    c.handleWidgetEvent('closed');
    expect(c.getState().visible).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    c.handleWidgetEvent('closed');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('toggle flips visibility', () => {
    const { c, sent } = setup();
    c.handleWidgetEvent('ready');
    c.toggle();
    expect(c.isOpen()).toBe(true);
    c.toggle();
    expect(c.isOpen()).toBe(false);
    expect(sent).toEqual(['open', 'close']);
  });

  it('repeated ready re-sends open when visible', () => {
    const { c, sent } = setup();
    c.open();
    c.handleWidgetEvent('ready');
    c.handleWidgetEvent('ready');
    expect(sent).toEqual(['open', 'open']);
  });

  it('handleLoadError then retry bumps webViewKey and reopens on next ready', () => {
    const { c, sent } = setup();
    c.open();
    c.handleWidgetEvent('ready');
    c.handleLoadError();
    expect(c.getState()).toMatchObject({ loadError: true, ready: false });
    const key = c.getState().webViewKey;
    c.retry();
    expect(c.getState()).toMatchObject({ loadError: false, ready: false, webViewKey: key + 1 });
    c.handleWidgetEvent('ready');
    expect(sent).toEqual(['open', 'open']);
  });

  it('handleProcessTerminated keeps visibility and pending reset, bumps key', () => {
    const { c, sent } = setup();
    c.reset();
    c.open();
    const key = c.getState().webViewKey;
    c.handleProcessTerminated();
    expect(c.getState()).toMatchObject({ visible: true, mounted: true, ready: false, webViewKey: key + 1 });
    c.handleWidgetEvent('ready');
    expect(sent).toEqual(['reset', 'open']);
  });

  it('open() after a load error retries instead of showing the stale error', () => {
    const { c } = setup();
    c.open();
    c.handleLoadError();
    c.close();
    const key = c.getState().webViewKey;
    c.open();
    expect(c.getState()).toMatchObject({ loadError: false, visible: true, ready: false, webViewKey: key + 1 });
  });

  it('open() 11 h after ready sends open', () => {
    let now = 0;
    const { c, sent } = setup(() => now);
    c.open();
    c.handleWidgetEvent('ready');
    c.close();
    now = 11 * HOUR;
    c.open();
    expect(sent).toEqual(['open', 'close', 'open']);
  });

  it('open() 13 h after ready reloads the page and opens on the next ready', () => {
    let now = 0;
    const { c, sent } = setup(() => now);
    c.open();
    c.handleWidgetEvent('ready');
    c.close();
    now = 13 * HOUR;
    const key = c.getState().webViewKey;
    c.open();
    expect(sent).toEqual(['open', 'close']);
    expect(c.getState()).toMatchObject({ mounted: true, visible: true, ready: false, webViewKey: key + 1 });
    c.handleWidgetEvent('ready');
    expect(sent).toEqual(['open', 'close', 'open']);
    // The reloaded page's age counts from its own ready.
    c.close();
    now = 14 * HOUR;
    c.open();
    expect(sent).toEqual(['open', 'close', 'open', 'close', 'open']);
    expect(c.getState().webViewKey).toBe(key + 1);
  });

  it('getState is referentially stable between changes and listeners fire on change', () => {
    const { c } = setup();
    const listener = jest.fn();
    const unsubscribe = c.subscribe(listener);
    const s1 = c.getState();
    expect(c.getState()).toBe(s1);
    c.open();
    const s2 = c.getState();
    expect(s2).not.toBe(s1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(c.getState()).toBe(s2);
    c.open(); // no change
    expect(c.getState()).toBe(s2);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    c.close();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribe and getState work unbound', () => {
    const { c } = setup();
    const { subscribe, getState } = c;
    const listener = jest.fn();
    subscribe(listener);
    c.open();
    expect(getState().visible).toBe(true);
    expect(listener).toHaveBeenCalled();
  });
});

describe('pending reset shared across controllers', () => {
  it('a reset requested before ready reaches the next controller, which mounts hidden', () => {
    const a = setup();
    a.c.reset();
    // `a` is discarded (the widget unmounted) before its page posted ready.
    const b = setup();
    expect(b.c.getState()).toMatchObject({ mounted: true, visible: false });
    b.c.handleWidgetEvent('ready');
    expect(b.sent).toEqual(['reset']);
    expect(a.sent).toEqual([]);
  });

  it('the next controller sends reset, then open if it is visible', () => {
    setup().c.reset();
    const b = setup();
    b.c.open();
    b.c.handleWidgetEvent('ready');
    expect(b.sent).toEqual(['reset', 'open']);
  });

  it('is cleared once delivered', () => {
    setup().c.reset();
    setup().c.handleWidgetEvent('ready');
    const third = setup();
    expect(third.c.getState().mounted).toBe(false);
    third.c.handleWidgetEvent('ready');
    expect(third.sent).toEqual([]);
  });

  it('a reset on a ready controller is sent at once and leaves nothing pending', () => {
    const a = setup();
    a.c.handleWidgetEvent('ready');
    a.c.reset();
    expect(a.sent).toEqual(['reset']);
    const b = setup();
    expect(b.c.getState().mounted).toBe(false);
    b.c.handleWidgetEvent('ready');
    expect(b.sent).toEqual([]);
  });
});
