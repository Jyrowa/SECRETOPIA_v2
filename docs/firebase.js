import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, get, push } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC0iIBNkO4JAzj3Gaxh8FtSwrVWPfxBAJ8",
  authDomain: "secretopia-d4de2.firebaseapp.com",
  databaseURL: "https://secretopia-d4de2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "secretopia-d4de2",
  storageBucket: "secretopia-d4de2.firebasestorage.app",
  messagingSenderId: "2409202183",
  appId: "1:2409202183:web:78e66d2e7359aa18aaa0a2",
  measurementId: "G-GX67QT4FQB"
};

// Firebase initialisieren
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Exportiere alles korrekt
export { app, db, getDatabase, ref, set, update, onValue, get, push };