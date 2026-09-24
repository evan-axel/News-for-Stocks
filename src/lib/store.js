import { createStore, newId } from './jsonStore';

// The thesis journal's collection. The storage primitives live in jsonStore so
// the journal and the coverage universe share one implementation of atomic
// writes and write serialization.
const store = createStore('theses.json');

export const readAll = store.readAll;
export const transact = store.transact;
export { newId };
