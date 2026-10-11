// Protected Sync queue contract.
// The durable per-record outboxes remain implemented by js/record-sync.js;
// this facade is the only queue surface exposed to UI code.
import { createRecordSync } from '../js/record-sync.js';
export { createRecordSync };
export const QUEUE_STORAGE_PREFIX = 'activePlus.syncOutbox.v2:';