import { Flex54, registerController, resetFlex54ForTesting } from '../Flex54';
import { Flex54Controller } from '../controller';
import type { HostCommand } from '../types';

function fakeController() {
  const calls: string[] = [];
  let open = false;
  const c = {
    open: jest.fn(() => { calls.push('open'); open = true; }),
    close: jest.fn(() => { calls.push('close'); open = false; }),
    toggle: jest.fn(() => { calls.push('toggle'); }),
    reset: jest.fn(() => { calls.push('reset'); }),
    isOpen: jest.fn(() => open),
  };
  return { c: c as unknown as Flex54Controller, calls, mocks: c };
}

function realController() {
  const c = new Flex54Controller();
  const sent: HostCommand[] = [];
  c.attachSender((cmd) => sent.push(cmd));
  return { c, sent };
}

describe('Flex54', () => {
  beforeEach(() => resetFlex54ForTesting());

  it('buffers calls made before a widget registers', () => {
    const { c, calls } = fakeController();
    Flex54.open();
    Flex54.reset();
    registerController(c);
    expect(calls).toEqual(['open', 'reset']);
    // buffer is drained: registering again does not replay
    const second = fakeController();
    registerController(second.c);
    expect(second.calls).toEqual([]);
  });

  it('routes calls to the last registered controller and stops after unregister', () => {
    const a = fakeController();
    const b = fakeController();
    const unA = registerController(a.c);
    const unB = registerController(b.c);
    Flex54.open();
    expect(a.calls).toEqual([]);
    expect(b.calls).toEqual(['open']);
    expect(Flex54.isOpen()).toBe(true);
    unA(); // stale unregister must not clear b
    Flex54.close();
    expect(b.calls).toEqual(['open', 'close']);
    unB();
    Flex54.toggle();
    expect(b.calls).toEqual(['open', 'close']);
    expect(Flex54.isOpen()).toBe(false);
  });

  it('isOpen is false with no controller', () => {
    expect(Flex54.isOpen()).toBe(false);
  });

  it('a reset made before ready survives the widget unmounting and reaches the next one', () => {
    const a = realController();
    const unA = registerController(a.c);
    Flex54.reset();
    unA();
    const b = realController();
    registerController(b.c);
    expect(b.c.getState()).toMatchObject({ mounted: true, visible: false });
    b.c.handleWidgetEvent('ready');
    expect(b.sent).toEqual(['reset']);
    expect(a.sent).toEqual([]);
  });

  it('resetFlex54ForTesting clears a pending reset', () => {
    realController().c.reset();
    resetFlex54ForTesting();
    const b = realController();
    expect(b.c.getState().mounted).toBe(false);
    b.c.handleWidgetEvent('ready');
    expect(b.sent).toEqual([]);
  });
});
