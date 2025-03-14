import { db, ref, set } from "./firebase.js";

const avatars = [
    { src: "images/avatar1.png", id: "avatar1" },
    { src: "images/avatar2.png", id: "avatar2" },
    { src: "images/avatar3.png", id: "avatar3" },
    { src: "images/avatar4.png", id: "avatar4" }
];

let currentAvatarIndex = 0;
const avatarDisplay = document.getElementById("avatar-display");
const prevButton = document.getElementById("prev-avatar");
const nextButton = document.getElementById("next-avatar");

function showAvatar(index) {
    const avatar = avatars[index];
    avatarDisplay.src = avatar.src;
    avatarDisplay.setAttribute("data-avatar", avatar.id);
}

prevButton.addEventListener("click", () => {
    currentAvatarIndex = (currentAvatarIndex - 1 + avatars.length) % avatars.length;
    showAvatar(currentAvatarIndex);
});

nextButton.addEventListener("click", () => {
    currentAvatarIndex = (currentAvatarIndex + 1) % avatars.length;
    showAvatar(currentAvatarIndex);
});

showAvatar(currentAvatarIndex);

document.getElementById("create-room").addEventListener("click", async () => {
    const playerName = document.getElementById("player-name").value.trim();
    if (!playerName) {
        alert("Bitte gib deinen Namen ein!");
        return;
    }

    const selectedAvatar = document.getElementById("avatar-display").getAttribute("data-avatar");
    if (!selectedAvatar) {
        alert("Bitte wähle einen Avatar aus!");
        return;
    }

    let playerId = sessionStorage.getItem("playerId");
    if (!playerId) {
        playerId = `player-${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem("playerId", playerId);
    }

    sessionStorage.setItem("playerName", playerName);
    sessionStorage.setItem("playerAvatar", selectedAvatar);

    const roomCode = Math.floor(100000 + Math.random() * 900000).toString();  
    const roomRef = ref(db, `rooms/${roomCode}`);

    try {
        await set(ref(db, `rooms/${roomCode}/players`), null);

        await set(roomRef, {
            host: playerId,
            players: {
                [playerId]: { name: playerName, avatar: selectedAvatar, id: playerId }
            },
            status: "waiting"
        });

        console.log(`Raum ${roomCode} erfolgreich erstellt!`);
        window.location.href = `lobby.html?roomId=${roomCode}&playerId=${playerId}`;
    } catch (error) {
        console.error("Fehler beim Erstellen des Raums:", error);
        alert("Fehler beim Erstellen des Raums. Bitte versuche es erneut.");
    }
});

document.getElementById("join-room").addEventListener("click", () => {
    const playerName = document.getElementById("player-name").value.trim();
    if (!playerName) return alert("Bitte gib deinen Namen ein!");
    
    const selectedAvatar = document.getElementById("avatar-display").getAttribute("data-avatar");
    if (!selectedAvatar) return alert("Bitte wähle einen Avatar aus!");

    let playerId = sessionStorage.getItem("playerId");
    if (!playerId) {
        playerId = `player-${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem("playerId", playerId);
    }

    sessionStorage.setItem("playerName", playerName);
    sessionStorage.setItem("playerAvatar", selectedAvatar);

    window.location.href = `join.html?playerId=${playerId}`;
});