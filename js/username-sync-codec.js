/* RTDB forbids . # $ / [ ] and control characters in object keys.
   Generated Login IDs contain dots (name.role.apc). Encode only the wire
   keys: IDs displayed to users and the local registry remain unchanged. */
export function encodeUsernameKey(username) {
  return encodeURIComponent(username).replace(/\./g, '%2E');
}

export function encodeUsernameRegistry(registry) {
  return Object.fromEntries(Object.entries(registry).map(([username, owner]) =>
    [encodeUsernameKey(username), owner]));
}

export function decodeUsernameRegistry(registry) {
  return Object.fromEntries(Object.entries(registry).map(([key, owner]) => {
    // Older valid keys (e.g. "dolon") are also accepted unchanged.
    try { return [decodeURIComponent(key), owner]; }
    catch { return [key, owner]; }
  }));
}
