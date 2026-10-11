/* Loaded before every harness child. Only when TWO_DEVICE_QUIET is set does it
   silence the app's expected console.error/console.warn output (a device under
   test deliberately hits broken cloud paths); the process result stays exact. */
if (process.env.TWO_DEVICE_QUIET) {
  console.error = () => {};
  console.warn = () => {};
}
