import { db, ref, push, onValue, set, get } from "./firebase.js";

// Globale Initialisierung
const playerId = sessionStorage.getItem("playerId") || null;
const playerName = sessionStorage.getItem("playerName") || "Unbekannter Spieler";
const roomId = new URLSearchParams(window.location.search).get("roomId");

console.log("🔑 Player ID aus sessionStorage:", playerId);
console.log("🆔 Player Name aus sessionStorage:", playerName);

const secretsRef = ref(db, `rooms/${roomId}/secrets`);
const playersRef = ref(db, `rooms/${roomId}/players`);
const statusRef = ref(db, `rooms/${roomId}/status`);
const chosenSecretRef = ref(db, `rooms/${roomId}/chosenSecret`);
const votesRef = ref(db, `rooms/${roomId}/votes`);
const roastsRef = ref(db, `rooms/${roomId}/roasts`);

// Status-Verwaltung
let currentStatus = null; // Verfolgt den aktuellen Status, um Mehrfachaufrufe zu verhindern

// Geheimnis absenden (anonym)
document.getElementById("submit-secret").addEventListener("click", async () => {
    const secretInput = document.getElementById("secretInput").value.trim();
    if (!secretInput) return alert("Bitte gib ein Geheimnis ein!");

    await push(secretsRef, { text: secretInput });

    document.getElementById("secret-input-section").classList.add("hidden");
    document.getElementById("waiting-section").classList.remove("hidden");

    checkSecrets();
});

// Überprüfen, ob alle Spieler Geheimnisse abgegeben haben
async function checkSecrets() {
    const playersSnapshot = await get(playersRef);
    if (!playersSnapshot.exists()) return;

    const totalPlayers = Object.keys(playersSnapshot.val()).length;

    const secretsSnapshot = await get(secretsRef);
    const secrets = secretsSnapshot.val();
    if (secrets && Object.keys(secrets).length === totalPlayers) {
        const secretIds = Object.keys(secrets);
        const randomSecretId = secretIds[Math.floor(Math.random() * secretIds.length)];
        const randomSecret = secrets[randomSecretId].text;

        await set(chosenSecretRef, randomSecret);
        await set(statusRef, "voting");
    }
}

// Spieler für Abstimmung anzeigen
async function showVoteOptions() {
    const playersSnapshot = await get(playersRef);
    if (!playersSnapshot.exists()) return;

    const players = playersSnapshot.val();
    const guessButtons = document.getElementById("guessButtons");
    guessButtons.innerHTML = "";

    Object.keys(players).forEach(pid => {
        const player = players[pid];
        const avatarUrl = `images/${player.avatar}.png`;

        const button = document.createElement("div");
        button.classList.add("player-vote-button");
        button.innerHTML = `
            <img src="${avatarUrl}" alt="${player.name}" class="player-avatar">
            <p>${player.name}</p>
        `;
        button.addEventListener("click", () => submitVote(pid));
        guessButtons.appendChild(button);
    });
}

// Abstimmung abschicken
async function submitVote(guessedPlayerId) {
    let currentPlayerId = playerId;
    if (!currentPlayerId) {
        currentPlayerId = await getPlayerId();
        if (!currentPlayerId) {
            alert("Fehler: Deine Spieler-ID konnte nicht ermittelt werden.");
            return;
        }
        sessionStorage.setItem("playerId", currentPlayerId);
    }

    await push(votesRef, { voterId: currentPlayerId, guessedPlayerId });

    document.getElementById("secret-display-section").classList.add("hidden");
    document.getElementById("waiting-votes-section").classList.remove("hidden");

    checkVotes();
}

async function getPlayerId() {
    const playerName = sessionStorage.getItem("playerName");
    if (!playerName) return null;

    const playersSnapshot = await get(playersRef);
    if (playersSnapshot.exists()) {
        const players = playersSnapshot.val();
        for (const id in players) {
            if (players[id].name === playerName) return id;
        }
    }
    return null;
}

// Überprüfen, ob alle Spieler abgestimmt haben
async function checkVotes() {
    const playersSnapshot = await get(playersRef);
    if (!playersSnapshot.exists()) return;

    const totalPlayers = Object.keys(playersSnapshot.val()).length;

    const votesSnapshot = await get(votesRef);
    const votes = votesSnapshot.val();
    if (votes && Object.keys(votes).length === totalPlayers) {
        await set(statusRef, "results");
    }
}

// Ergebnisse anzeigen mit automatischem Übergang zur Roast-Runde
async function showResults() {
    console.log("🎨 Render Results Start");
    document.getElementById("waiting-votes-section").classList.add("hidden");
    const resultsSection = document.getElementById("results-section");
    resultsSection.classList.remove("hidden");

    const resultsList = document.getElementById("results-list");
    resultsList.innerHTML = "";

    const votesSnapshot = await get(votesRef);
    const votes = votesSnapshot.val();

    if (!votes) {
        resultsList.innerHTML = "<p>Noch keine Abstimmungsergebnisse.</p>";
        return;
    }

    const playersSnapshot = await get(playersRef);
    const players = playersSnapshot.val();

    const resultsAnonymousRef = ref(db, `rooms/${roomId}/resultsAnonymous`);
    const hostId = (await get(ref(db, `rooms/${roomId}/host`))).val();

    // Host setzt resultsAnonymous, falls nicht gesetzt
    let showAnonymous;
    const anonymousSnapshot = await get(resultsAnonymousRef);
    if (!anonymousSnapshot.exists()) {
        if (playerId === hostId) {
            showAnonymous = Math.random() < 0.5; // 50/50 Chance
            await set(resultsAnonymousRef, showAnonymous);
            console.log("🎲 Host hat resultsAnonymous gesetzt auf:", showAnonymous);
        } else {
            // Nicht-Host wartet, bis der Wert gesetzt ist
            await new Promise((resolve) => {
                onValue(resultsAnonymousRef, (snap) => {
                    if (snap.exists()) {
                        showAnonymous = snap.val();
                        console.log("🎲 Nicht-Host hat resultsAnonymous empfangen:", showAnonymous);
                        resolve();
                    }
                }, { onlyOnce: true });
            });
        }
    } else {
        showAnonymous = anonymousSnapshot.val();
        console.log("🎲 Bereits gesetzter Wert für resultsAnonymous:", showAnonymous);
    }

    console.log("🎲 Ergebnisse werden", showAnonymous ? "anonym" : "öffentlich", "angezeigt");

    if (showAnonymous) {
        const voteCounts = {};
        for (const voteId in votes) {
            const vote = votes[voteId];
            voteCounts[vote.guessedPlayerId] = (voteCounts[vote.guessedPlayerId] || 0) + 1;
        }
        const totalVotes = Object.keys(votes).length;
        const sortedResults = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
        const displayedPlayers = new Set();

        sortedResults.forEach(([playerId, count]) => {
            if (displayedPlayers.has(playerId)) return;
            displayedPlayers.add(playerId);

            const percentage = ((count / totalVotes) * 100).toFixed(2);
            const playerName = players[playerId] ? players[playerId].name : playerId;

            const resultItem = document.createElement("div");
            resultItem.classList.add("result-item");
            resultItem.innerHTML = `
                <div class="result-player-name">${playerName}</div>
                <div class="result-bar-container">
                    <div class="result-bar" style="width: 0%"></div>
                </div>
                <div class="result-percentage">${percentage}%</div>
            `;
            resultsList.appendChild(resultItem);

            setTimeout(() => {
                resultItem.querySelector(".result-bar").style.width = `${percentage}%`;
            }, 100);
        });
    } else {
        for (const voteId in votes) {
            const vote = votes[voteId];
            const voterName = players[vote.voterId] ? players[vote.voterId].name : vote.voterId;
            const guessedName = players[vote.guessedPlayerId] ? players[vote.guessedPlayerId].name : vote.guessedPlayerId;

            const voteItem = document.createElement("div");
            voteItem.classList.add("result-item");
            voteItem.innerHTML = `
                <div class="result-player-name">${voterName} hat für ${guessedName} gestimmt</div>
            `;
            resultsList.appendChild(voteItem);
        }
    }

    console.log("🎨 Render Results Ende");

    // Zufälliges Geheimnis auswählen und speichern (nur Host)
    if (playerId === hostId) {
        const secretsSnapshot = await get(secretsRef);
        const secrets = secretsSnapshot.val();
        if (secrets) {
            const secretIds = Object.keys(secrets);
            const randomSecretId = secretIds[Math.floor(Math.random() * secretIds.length)];
            const selectedSecret = secrets[randomSecretId].text;
            await set(ref(db, `rooms/${roomId}/currentSecret`), selectedSecret);
        }
    }

    setTimeout(async () => {
        console.log("⏩ Wechsel zur Roast-Runde");
        await set(statusRef, "roasting");
    }, 10000);
}

// Roast-Anzeige anpassen, um das Geheimnis zu zeigen
function setupRoastInput() {
    const roastInputSection = document.getElementById("roast-input-section");
    const currentSecretRef = ref(db, `rooms/${roomId}/currentSecret`);

    onValue(currentSecretRef, (snapshot) => {
        const secret = snapshot.val();
        if (secret) {
            document.getElementById("current-secret").textContent = secret;
            roastInputSection.classList.remove("hidden");
        }
    });
}

// Aufruf der Funktion beim Laden oder Statuswechsel
onValue(statusRef, (snapshot) => {
    const status = snapshot.val();
    if (status === "roasting") {
        setupRoastInput();
    }
});

// Status-Listener
onValue(statusRef, async (snapshot) => {
    const status = snapshot.val();
    console.log("📡 Status geändert zu:", status);

    if (status === currentStatus) return;
    currentStatus = status;

    if (status === "voting") {
        const chosenSecretSnapshot = await get(chosenSecretRef);
        if (!chosenSecretSnapshot.exists()) return;

        const chosenSecret = chosenSecretSnapshot.val();
        document.getElementById("waiting-section").classList.add("hidden");
        document.getElementById("secret-display-section").classList.remove("hidden");
        document.getElementById("displayedSecret").textContent = chosenSecret;

        showVoteOptions();
    } else if (status === "results") {
        console.log("🔍 showResults wird aufgerufen");
        await showResults();
    } else if (status === "roasting") {
        console.log("🔥 Roast-Runde beginnt");
        document.getElementById("results-section").classList.add("hidden");
        document.getElementById("roast-input-section").classList.remove("hidden");
        document.getElementById("roasts-list").classList.remove("hidden"); // Optional: Roasts anzeigen
        showRoasts(); // Funktion zum Anzeigen der Roasts aufrufen
    }
});

// Roast absenden
document.addEventListener("DOMContentLoaded", () => {
    console.log("📜 DOM geladen, initialisiere Roast-Handler");
    const submitRoastButton = document.getElementById("submit-roast");
    const roastInput = document.getElementById("roast-input");

    if (!submitRoastButton) {
        console.error("❌ Fehler: #submit-roast Button nicht gefunden!");
        return;
    }
    if (!roastInput) {
        console.error("❌ Fehler: #roast-input nicht gefunden!");
        return;
    }

    submitRoastButton.addEventListener("click", async () => {
        console.log("🔘 Roast-Submit-Button geklickt");

        const roastText = roastInput.value.trim();
        console.log("📝 Eingabe-Roast-Text:", roastText);

        if (!roastText) {
            console.log("⚠ Kein Text eingegeben");
            alert("Bitte gib einen Roast ein!");
            return;
        }

        const roastData = {
            text: roastText,
            playerId: playerName,
            secretId: roomId, // Kann später angepasst werden, um spezifisches Geheimnis zu referenzieren
            isAnonymous: Math.random() < 0.5,
            timestamp: Date.now() // Für Debugging und Sortierung
        };
        console.log("🔥 Roast-Daten zum Senden:", roastData);

        try {
            const roastRef = await push(roastsRef, roastData);
            console.log("✅ Roast erfolgreich gesendet, ID:", roastRef.key);
            roastInput.value = ""; // Eingabe leeren
            alert("Dein Roast wurde erfolgreich abgegeben!");
        } catch (error) {
            console.error("❌ Fehler beim Senden des Roasts:", error);
            alert("Fehler beim Senden des Roasts: " + error.message);
        }
    });
});

// Roasts anzeigen
function showRoasts() {
    onValue(roastsRef, (snapshot) => {
        const roasts = snapshot.val();
        const roastsList = document.getElementById("roasts-list");
        roastsList.innerHTML = "";

        if (!roasts) {
            roastsList.innerHTML = "<p>Keine Roasts abgegeben.</p>";
            return;
        }

        for (const roastId in roasts) {
            const roast = roasts[roastId];
            const playerName = roast.isAnonymous ? "Anonym" : roast.playerId;
            const roastText = roast.text;
            const reactions = roast.reactions || {};

            const roastItem = document.createElement("div");
            roastItem.classList.add("roast-item");
            roastItem.innerHTML = `
                <div class="roast-bubble" data-author="${playerName}">${roastText}</div>
                <div class="reaction-buttons">
                    <button class="reaction-btn" data-reaction="😂" data-roast-id="${roastId}">${reactions["😂"] || 0} 😂</button>
                    <button class="reaction-btn" data-reaction="🔥" data-roast-id="${roastId}">${reactions["🔥"] || 0} 🔥</button>
                    <button class="reaction-btn" data-reaction="👎" data-roast-id="${roastId}">${reactions["👎"] || 0} 👎</button>
                </div>
            `;
            roastsList.appendChild(roastItem);
        }
        roastsList.scrollTop = roastsList.scrollHeight;

        // Event-Listener für Reaktionen
        document.querySelectorAll(".reaction-btn").forEach((btn) => {
            // Reaktion mit Trigger
btn.addEventListener("click", async () => {
    const roastId = btn.dataset.roastId;
    const reaction = btn.dataset.reaction;
    const reactionRef = ref(db, `rooms/${roomId}/roasts/${roastId}/reactions/${reaction}`);
    const triggerRef = ref(db, `rooms/${roomId}/roasts/${roastId}/reactionTrigger`);

    const snapshot = await get(reactionRef);
    const currentCount = snapshot.val() || 0;
    await set(reactionRef, currentCount + 1);
    await set(triggerRef, { emoji: reaction, timestamp: Date.now() }); // Trigger setzen
});

// Listener für Animation
function setupRoastReactions() {
    onValue(roastsRef, (snapshot) => {
        const roasts = snapshot.val();
        if (!roasts) return;

        for (const roastId in roasts) {
            const roast = roasts[roastId];
            if (roast.reactionTrigger && roast.reactionTrigger.timestamp) {
                const lastTrigger = roast.reactionTrigger.timestamp;
                const now = Date.now();
                if (now - lastTrigger < 1000) { // Nur innerhalb 1 Sekunde
                    triggerEmojiAnimation(roast.reactionTrigger.emoji);
                }
                // Trigger nach 1 Sekunde zurücksetzen
                setTimeout(async () => {
                    await set(ref(db, `rooms/${roomId}/roasts/${roastId}/reactionTrigger`), null);
                }, 1000);
            }
        }
    });
}
        });
    });
}

// Funktion für fliegende Emojis
function triggerEmojiAnimation(emoji) {
    const app = document.getElementById("app");
    const count = 10; // Anzahl fliegender Emojis

    for (let i = 0; i < count; i++) {
        const emojiElement = document.createElement("div");
        emojiElement.classList.add("emoji-animation");
        emojiElement.textContent = emoji;

        // Zufällige Startposition
        const startX = Math.random() * window.innerWidth;
        const startY = Math.random() * window.innerHeight;
        emojiElement.style.left = `${startX}px`;
        emojiElement.style.top = `${startY}px`;

        // Zufällige Endposition und Rotation
        const endX = (Math.random() - 0.5) * 400; // -200 bis +200px
        const endY = (Math.random() - 0.5) * 400;
        const rotateEnd = (Math.random() - 0.5) * 360; // -180 bis +180 Grad

        emojiElement.style.setProperty("--x-end", `${endX}px`);
        emojiElement.style.setProperty("--y-end", `${endY}px`);
        emojiElement.style.setProperty("--rotate-end", `${rotateEnd}deg`);

        app.appendChild(emojiElement);

        // Entfernen nach Animation
        setTimeout(() => {
            emojiElement.remove();
        }, 1000);
    }
}

// Synchronisation der Animation über Firebase
function setupRoastReactions() {
    onValue(roastsRef, (snapshot) => {
        const roasts = snapshot.val();
        if (!roasts) return;

        // Prüfe jede Reaktion und triggere Animation bei Änderung
        for (const roastId in roasts) {
            const reactions = roasts[roastId].reactions || {};
            Object.keys(reactions).forEach((reaction) => {
                // Hier könnten wir die Animation bei Änderung auslösen,
                // aber das wird durch den lokalen Klick + Firebase-Update bereits abgedeckt
            });
        }
    });
}

// Aufruf beim Statuswechsel
onValue(statusRef, (snapshot) => {
    const status = snapshot.val();
    if (status === "roasting") {
        setupRoastInput();
        showRoasts();
        setupRoastReactions(); // Zusätzliche Synchronisation
    } else if (status === "guessing") {
        document.getElementById("roast-input-section").classList.add("hidden");
    } else if (status === "finished") {
        document.getElementById("roast-input-section").classList.add("hidden");
        alert("Spiel beendet – alle Geheimnisse wurden geroastet!");
    }
});

// Roast-Eingabe mit Timer
async function setupRoastInput() {
    const roastInputSection = document.getElementById("roast-input-section");
    const currentSecretRef = ref(db, `rooms/${roomId}/currentSecret`);
    const roastTimer = document.getElementById("roast-timer");

    onValue(currentSecretRef, async (snapshot) => {
        const secret = snapshot.val();
        if (secret) {
            document.getElementById("current-secret").textContent = secret;
            roastInputSection.classList.remove("hidden");

            // Timer nur vom Host starten
            const hostId = (await get(ref(db, `rooms/${roomId}/host`))).val();
            if (playerId === hostId) {
                let timeLeft = 15;
                roastTimer.textContent = timeLeft;
                const timerInterval = setInterval(async () => {
                    timeLeft--;
                    roastTimer.textContent = timeLeft;
                    if (timeLeft <= 0) {
                        clearInterval(timerInterval);
                        await nextRound();
                    }
                }, 1000);
            }
        }
    });
}

// Nächste Runde starten
async function nextRound() {
    const secretsSnapshot = await get(secretsRef);
    const secrets = secretsSnapshot.val();
    if (!secrets) return;

    const usedSecretsRef = ref(db, `rooms/${roomId}/usedSecrets`);
    let usedSecrets = (await get(usedSecretsRef)).val() || [];
    const allSecretIds = Object.keys(secrets);
    const unusedSecretIds = allSecretIds.filter(id => !usedSecrets.includes(id));

    if (unusedSecretIds.length > 0) {
        // Neues zufälliges Geheimnis
        const randomSecretId = unusedSecretIds[Math.floor(Math.random() * unusedSecretIds.length)];
        const selectedSecret = secrets[randomSecretId].text;

        // Zu verwendeten Geheimnissen hinzufügen
        usedSecrets.push(randomSecretId);
        await set(usedSecretsRef, usedSecrets);
        await set(ref(db, `rooms/${roomId}/currentSecret`), selectedSecret);

        // Zurück zur Abstimmung
        await set(statusRef, "guessing");
        console.log("🔄 Neue Runde mit Geheimnis:", selectedSecret);

        // Votes zurücksetzen für neue Abstimmung
        await set(votesRef, null);
    } else {
        // Spiel beendet
        console.log("🏁 Spiel beendet – alle Geheimnisse waren dran!");
        await set(statusRef, "finished");
    }
}

// Status-Listener
onValue(statusRef, (snapshot) => {
    const status = snapshot.val();
    if (status === "roasting") {
        setupRoastInput();
    } else if (status === "guessing") {
        document.getElementById("roast-input-section").classList.add("hidden");
        // Hier ggf. Abstimmungslogik neu starten (z. B. setupGuessInput aufrufen)
        // Angenommen, es gibt eine Funktion dafür:
        // setupGuessInput();
    } else if (status === "finished") {
        document.getElementById("roast-input-section").classList.add("hidden");
        alert("Spiel beendet – alle Geheimnisse wurden geroastet!");
    }
});