const DB_NAME = 'CoupangSalesDB';
const STORE_NAME = 'sales_data';
const DB_VERSION = 1;

export const DB = {
    open: (): Promise<IDBDatabase> => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };

            request.onsuccess = (event) => {
                resolve((event.target as IDBOpenDBRequest).result);
            };

            request.onerror = (event) => {
                reject((event.target as IDBOpenDBRequest).error);
            };
        });
    },

    get: async <T>(key: string): Promise<T | null> => {
        const db = await DB.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result as T || null);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    set: async (key: string, value: any): Promise<void> => {
        const db = await DB.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(value, key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    delete: async (key: string): Promise<void> => {
        const db = await DB.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }
};
