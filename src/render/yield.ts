/**
 * Yield to the event loop without setTimeout: background/hidden tabs clamp
 * timer delays to ~1s, which would turn a 120-frame encode into minutes.
 * MessageChannel messages are not throttled.
 */
export function yieldUI(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });
}

/** Paced sleep that survives background-tab throttling (used for backpressure). */
export function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (performance.now() - start >= ms) {
        resolve();
        return;
      }
      void yieldUI().then(tick);
    };
    tick();
  });
}
