// extension/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getVertexAI, getGenerativeModel } from 'firebase/vertexai-preview';
import { firebaseConfig } from './firebaseConfig';

// --- Initialize Firebase and Services ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const vertex = getVertexAI(app);
const model = getGenerativeModel(vertex, { model: "gemini-2.5-flash" });

// --- Authentication Function ---
const signIn = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error(chrome.runtime.lastError);
        return reject(chrome.runtime.lastError);
      }
      const credential = GoogleAuthProvider.credential(null, token);
      signInWithCredential(auth, credential)
        .then(() => resolve())
        .catch((error) => {
          console.error("Firebase sign-in error:", error);
          reject(error);
        });
    });
  });
};

// --- Export Services ---
export { auth, model, signIn };
