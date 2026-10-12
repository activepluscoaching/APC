/** Immutable light-paper palette for canvas/PDF output, independent of screen theme.
 * Shared by receipts and reports; coordinates, fonts and pagination are unchanged.
 */
export const PRINT_COLORS = Object.freeze({
  forest: '#2864bd', forestDark: '#194f9d', ink: '#202b3c',
  muted: '#526176', line: '#dce3ed', zebra: '#f7f9fc',
  white: '#ffffff', mint: '#edf3fb', correct: '#187346', wrong: '#b83239'
});
