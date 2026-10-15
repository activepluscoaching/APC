/* The unit suite's hand-made browser windows usually provide localStorage but
 * not navigator.locks. Node 24 exposes a native global Navigator.locks even
 * outside a browser; treating that as the test window's Web Locks API can
 * leave browser-storage tests waiting indefinitely. Preserve the Node 22 test
 * environment without changing the app or a jsdom window's own navigator. */
if (globalThis.navigator?.locks && typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis.navigator, 'locks', {
    value: undefined,
    configurable: true,
    writable: true
  });
}
