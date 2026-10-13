// Import this small facade in lazy Firebase Auth modules. The mode decision
// lives in cloud-access.js so the login first-paint graph does not grow.
export { backendMode } from './cloud-access.js';
