import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue } from 'firebase/database';

const configuredDbUrl = (import.meta as any).env.VITE_FIREBASE_DATABASE_URL || "https://orderapp-sync-default-rtdb.asia-southeast1.firebasedatabase.app";
const configuredApiKey = (import.meta as any).env.VITE_FIREBASE_API_KEY;
const configuredProjectId = (import.meta as any).env.VITE_FIREBASE_PROJECT_ID;

const firebaseConfig: any = {
  databaseURL: configuredDbUrl,
};

if (configuredApiKey) firebaseConfig.apiKey = configuredApiKey;
if (configuredProjectId) firebaseConfig.projectId = configuredProjectId;

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
