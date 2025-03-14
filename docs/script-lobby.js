import { db, ref, update, onValue, set, get } from './firebase.js';

// URL-Parameter auslesen
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");
let playerId = urlParams.get("playerId") || sessionStorage.getItem("playerId");
const playerName = sessionStorage.getItem("playerName");
const playerAvatar = sessionStorage.getItem("playerAvatar");

// Initialisierung beim Laden
document.addEventListener("DOMContentLoaded", () => {
    console.log("🔍 Lobby geladen mit roomId:", roomId, "playerId:", playerId);

    // Falls Spieler-ID oder Raum-ID fehlt, Fehler behandeln
    if (!roomId) {
        console.error("❌ Fehler: Raum-ID fehlt in URL!");
        window.location.href = "index.html";
        return; // Jetzt korrekt innerhalb der Funktion
    }
    if (!playerId) {
        console.warn("⚠️ Keine playerId in URL oder sessionStorage gefunden!");
        playerId = `player-${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem("playerId", playerId);
        console.log("🆕 Temporäre playerId generiert:", playerId);
        // Aktualisiere URL mit playerId
        window.history.replaceState({}, document.title, `lobby.html?roomId=${roomId}&playerId=${playerId}`);
    }

    // HTML-Elemente holen
    const roomCodeElement = document.getElementById("room-code");
    const hostNameElement = document.getElementById("host-name");
    const playersListElement = document.getElementById("players");
    const startGameButton = document.getElementById("start-game");
    const playerWaitingElement = document.getElementById("player-waiting");

    // Raum-Code anzeigen
    roomCodeElement.textContent = roomId;

    // Firebase-Referenzen
    const roomRef = ref(db, `rooms/${roomId}`);
    const playersRef = ref(db, `rooms/${roomId}/players`);
    const statusRef = ref(db, `rooms/${roomId}/status`);

    // 🔄 Spieler in Firebase hinzufügen, falls noch nicht vorhanden
    (async function addPlayerToRoom() {
        const roomSnapshot = await get(roomRef);
        if (roomSnapshot.exists()) {
            const roomData = roomSnapshot.val();

            if (!roomData.players) {
                await set(playersRef, {});
            }

            if (!roomData.players[playerId]) {
                console.log(`👤 Neuer Spieler ${playerName} (${playerId}) tritt bei...`);
                await update(playersRef, { 
                    [playerId]: { 
                        name: playerName, 
                        avatar: playerAvatar,
                        id: playerId
                    }
                });
            } else {
                console.log("⚠️ Spieler existiert bereits:", playerId);
            }
        } else {
            console.error("❌ Fehler: Raum existiert nicht.");
            window.location.href = "index.html";
        }
    })();

    // 🎧 Raum-Änderungen überwachen
    onValue(roomRef, (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) {
            window.location.href = "index.html";
            return;
        }

        const hostId = roomData.host;
        const players = roomData.players || {};

        hostNameElement.textContent = players[hostId]?.name || "Unbekannt";

        playersListElement.innerHTML = "";
        const sortedPlayers = Object.entries(players).map(([id, player]) => ({ ...player, id }))
            .sort((a, b) => (a.id === hostId ? -1 : 1));

        sortedPlayers.forEach(player => {
            const playerEntry = document.createElement("div");
            playerEntry.classList.add("player-entry");
            playerEntry.innerHTML = `
                <img class="player-avatar" src="images/${player.avatar}.png" />
                <p class="player-name">${player.name}</p>
                <span class="player-status">Bereit</span>
            `;
            playersListElement.appendChild(playerEntry);
        });

        if (playerId === hostId) {
            startGameButton.style.display = "block";
            startGameButton.disabled = Object.keys(players).length < 2;
            playerWaitingElement.style.display = "none";
        } else {
            startGameButton.style.display = "none";
            playerWaitingElement.style.display = "block";
        }
    });

    // 🚀 Spiel starten (nur Host)
    startGameButton.addEventListener("click", async () => {
        console.log("🟢 Spielstart-Button wurde geklickt!");
        await set(statusRef, "started");
        console.log("🚀 Spiel gestartet! Weiterleitung für Host mit playerId:", playerId);
        window.location.href = `game.html?roomId=${roomId}&playerId=${playerId}`;
    });

    // ⏳ Listener für Spielstart -> alle Spieler weiterleiten
    onValue(statusRef, (snapshot) => {
        if (snapshot.exists() && snapshot.val() === "started") {
            console.log("🚀 Spiel gestartet! Weiterleitung für Spieler", playerId, "...");
            window.location.href = `game.html?roomId=${roomId}&playerId=${playerId}`;
        }
    });
});