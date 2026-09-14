/** Browser recovery records contain only the client's contribution and public
 * commitment. Server seeds and signing keys never enter this store. */
export class GameWagerStore {
  constructor(name = "casino-nitro-wagers") { this.name = name; }
  async open() {
    if (!globalThis.indexedDB) throw new Error("Durable wager storage is unavailable");
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("wagers");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Wager storage upgrade is blocked"));
    });
  }
  async save(prepared) {
    const db = await this.open();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("wagers", "readwrite", { durability: "strict" });
        const store = transaction.objectStore("wagers");
        const key = prepared.request.roundId;
        const existing = store.get(key);
        let conflict;
        existing.onsuccess = () => {
          if (existing.result && JSON.stringify(existing.result) !== JSON.stringify(prepared)) {
            conflict = new Error("A different wager already uses this recovery identity");
            transaction.abort();
          } else store.put(structuredClone(prepared), key);
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(conflict ?? transaction.error ?? new Error("Wager storage aborted"));
        transaction.onerror = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }
  async load(roundId) {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("wagers", "readonly").objectStore("wagers").get(roundId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }
}
