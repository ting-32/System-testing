import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue } from 'firebase/database';

const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY,
  databaseURL: (import.meta as any).env.VITE_FIREBASE_DATABASE_URL,
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export const broadcastDataChange = async () => {
  try {
    const syncRef = ref(db, 'sync/lastUpdateTime');
    await set(syncRef, Date.now());
  } catch (error) {
    console.error('Failed to broadcast data change:', error);
  }
};

export const listenToDataChange = (onSignalReceived: () => void) => {
  const syncRef = ref(db, 'sync/lastUpdateTime');
  let isFirstLoad = true;

  const unsubscribe = onValue(syncRef, (snapshot) => {
    if (isFirstLoad) {
      isFirstLoad = false;
      return;
    }
    
    if (snapshot.exists()) {
      onSignalReceived();
    }
  });

  return () => unsubscribe();
};
