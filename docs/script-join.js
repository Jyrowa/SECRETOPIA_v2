import { db, ref, get, update } from "./firebase.js";

document.getElementById("room-code").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, ""); // Nur Zahlen erlauben
});

document.getElementById("join-game").addEventListener("click", async () => {
    const roomCode = document.getElementById("room-code").value.trim();
    const errorMessage = document.getElementById("error-message");

    if (!roomCode || roomCode.length !== 6) {
        errorMessage.textContent = "Bitte gib einen 6-stelligen Code ein!";
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    let playerId = urlParams.get("playerId") || sessionStorage.getItem("playerId");
    if (!playerId) {
        playerId = `player-${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem("playerId", playerId);
    }

    const playerName = sessionStorage.getItem("playerName");
    const playerAvatar = sessionStorage.getItem("playerAvatar");

    if (!playerName || !playerAvatar) {
        errorMessage.textContent = "Fehler: Spieler-Informationen fehlen!";
        return;
    }

    const roomRef = ref(db, `rooms/${roomCode}`);
    const playersRef = ref(db, `rooms/${roomCode}/players`);

    const roomSnapshot = await get(roomRef);
    if (!roomSnapshot.exists()) {
        errorMessage.textContent = "Raum existiert nicht!";
        return;
    }

    errorMessage.textContent = ""; // Fehler zurücksetzen
    await update(playersRef, { 
        [playerId]: { 
            name: playerName, 
            avatar: playerAvatar,
            id: playerId
        }
    });

    window.location.href = `lobby.html?roomId=${roomCode}&playerId=${playerId}`;
});