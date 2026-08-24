// The `chats.persona` values, in one place.
//
// D49 (DEEP_SWEEP): `deleteThread` (research.ts) needs to know the HISTORY persona in order to
// delete history threads at all, and history-threads.ts is where that constant lived. Importing
// one module into the other put a top-level `const` in the other's evaluation order and produced
// a TDZ ReferenceError at module load. Constants belong somewhere neither module has to reach
// through the other for — this file imports nothing.
export const THREAD_PERSONA = 'ask';
export const HISTORY_PERSONA = 'history';
