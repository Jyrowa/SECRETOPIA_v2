import { db, ref, push, onValue, set, get } from "./firebase.js";

// Globale Variablen
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId") || "defaultRoom";
let playerId = urlParams.get("playerId") || sessionStorage.getItem(`playerId_${roomId}`);
console.log("🔍 Verwende roomId:", roomId, "playerId:", playerId);

let playerName;
const secretsRef = ref(db, `rooms/${roomId}/secrets`);
const votesRef = ref(db, `rooms/${roomId}/votes`);
const roastsRef = ref(db, `rooms/${roomId}/roasts`);
const statusRef = ref(db, `rooms/${roomId}/status`);
const playersRef = ref(db, `rooms/${roomId}/players`);
const hostRef = ref(db, `rooms/${roomId}/host`);
const resultsAnonymousRef = ref(db, `rooms/${roomId}/resultsAnonymous`);
const usedSecretsRef = ref(db, `rooms/${roomId}/usedSecrets`);

// Initialisierung beim Laden
document.addEventListener("DOMContentLoaded", async () => {
    console.log("🔧 Seite wird geladen für roomId:", roomId, "playerId:", playerId);

    if (!playerId || !roomId) {
        console.error("❌ Fehler: roomId oder playerId fehlt in URL!");
        window.location.href = "index.html";
        return;
    }

    const secretInputSection = document.getElementById("secret-input-section");
    if (!secretInputSection) {
        console.error("❌ Fehler: #secret-input-section nicht gefunden. Prüfe game.html!");
        return;
    }
    console.log("🔍 #secret-input-section gefunden");

    const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
    const playerSnapshot = await get(playerRef);
    if (!playerSnapshot.exists()) {
        console.error("❌ Fehler: Spieler-ID", playerId, "existiert nicht in Firebase. Zurück zur Startseite.");
        window.location.href = "index.html";
        return;
    }

    const playerData = playerSnapshot.val();
    playerName = playerData.name;
    console.log("👤 Spieler registriert:", playerName, "mit ID:", playerId);

    const hostSnapshot = await get(hostRef);
    if (!hostSnapshot.exists()) {
        await set(hostRef, playerId);
        console.log("🎮 Spieler", playerId, "ist jetzt Host");
    }

    const statusSnapshot = await get(statusRef);
    const currentStatus = statusSnapshot.val();
    if (!statusSnapshot.exists()) {
        await set(statusRef, "waiting");
        console.log("✅ Status auf 'waiting' gesetzt (neuer Raum)");
    } else if (currentStatus === "started") {
        await set(statusRef, "waiting");
        console.log("✅ Status von 'started' auf 'waiting' zurückgesetzt");
    } else {
        console.log("🔄 Bestehender Status:", currentStatus);
    }

    secretInputSection.classList.remove("hidden");
    console.log("✅ #secret-input-section sichtbar gemacht für", playerName);

    setupSecretInput();
    setupAutoTransitions();
    onValue(statusRef, handleStatusChange);
    onValue(playersRef, (snapshot) => {
        const players = snapshot.val();
        const playerCount = players ? Object.keys(players).length : 0;
        console.log("👥 Aktuelle Spieleranzahl:", playerCount, "Spieler:", players);
    });
});

// Geheimnis-Eingabe
function setupSecretInput() {
    console.log("🔧 setupSecretInput wird initialisiert für Spieler:", playerId);
    const secretInputSection = document.getElementById("secret-input-section");
    const secretInput = document.getElementById("secretInput");
    const submitSecretBtn = document.getElementById("submit-secret");
    const secretStatus = document.getElementById("secret-status");

    if (!secretInputSection || !secretInput || !submitSecretBtn || !secretStatus) {
        console.error("❌ Fehler: Elemente fehlen für", playerId);
        return;
    }

    submitSecretBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        const secretText = secretInput.value.trim();
        if (!secretText) {
            alert("Bitte gib ein Geheimnis ein!");
            console.log("⚠️ Kein Geheimnis eingegeben von Spieler:", playerId);
            return;
        }

        console.log("📤 Sende Geheimnis für Spieler:", playerId);
        await push(secretsRef, { text: secretText, playerId: playerId });
        console.log("✅ Geheimnis gesendet:", secretText, "von", playerId);
        secretInput.value = "";
        secretInputSection.classList.add("hidden");
        document.getElementById("waiting-section").classList.remove("hidden");
    });
}

// Automatische Übergänge
function setupAutoTransitions() {
    onValue(secretsRef, async (snapshot) => {
        const secrets = snapshot.val();
        if (!secrets) return;

        const playersSnapshot = await get(playersRef);
        const players = playersSnapshot.val();
        const playerCount = players ? Object.keys(players).length : 0;
        const secretPlayerIds = new Set(Object.values(secrets).map(secret => secret.playerId));

        const currentStatusSnapshot = await get(statusRef);
        const currentStatus = currentStatusSnapshot.val();

        if ((currentStatus === "waiting" || currentStatus === "started") && secretPlayerIds.size === playerCount) {
            console.log("✅ Alle Spieler haben Geheimnisse abgegeben, starte Abstimmung");
            const secretKeys = Object.keys(secrets);
            const usedSecrets = (await get(usedSecretsRef)).val() || [];
            const unusedSecretIds = secretKeys.filter(id => !usedSecrets.includes(id));
            console.log("🔍 Verfügbare Geheimnisse:", unusedSecretIds);
            if (unusedSecretIds.length > 0) {
                const randomIndex = Math.floor(Math.random() * unusedSecretIds.length);
                const randomSecretKey = unusedSecretIds[randomIndex];
                const selectedSecretText = secrets[randomSecretKey].text;

                usedSecrets.push(randomSecretKey);
                await set(usedSecretsRef, usedSecrets);
                await set(ref(db, `rooms/${roomId}/currentSecret`), selectedSecretText);
                await set(statusRef, "guessing");
                console.log("✅ Gewähltes Geheimnis:", selectedSecretText);
            }
        }
    });

    onValue(votesRef, async (snapshot) => {
        const votes = snapshot.val();
        if (!votes) return;

        const playersSnapshot = await get(playersRef);
        const players = playersSnapshot.val();
        const playerCount = players ? Object.keys(players).length : 0;
        const voteCount = Object.keys(votes).length;

        const currentStatusSnapshot = await get(statusRef);
        const currentStatus = currentStatusSnapshot.val();

        if (currentStatus === "guessing" && voteCount === playerCount) {
            console.log("✅ Alle Spieler haben abgestimmt, zeige Ergebnisse");
            const showAnonymous = Math.random() < 0.5; // Globaler Status für alle
            await set(resultsAnonymousRef, showAnonymous);
            console.log("🔍 Ergebnisse werden anonym angezeigt?", showAnonymous);
            await set(statusRef, "voting");
        }
    });
}

// Abstimmungslogik mit Avataren
function setupGuessInput() {
    console.log("🗳️ Abstimmungsphase gestartet");
    document.getElementById("waiting-section").classList.add("hidden");
    const secretDisplaySection = document.getElementById("secret-display-section");
    const displayedSecret = document.getElementById("displayedSecret");
    const guessButtons = document.getElementById("guessButtons");
    const guessStatus = document.getElementById("guess-status");

    if (!secretDisplaySection || !displayedSecret || !guessButtons || !guessStatus) {
        console.error("❌ Fehler: Elemente fehlen!");
        return;
    }

    secretDisplaySection.classList.remove("hidden");
    guessButtons.innerHTML = "";

    onValue(ref(db, `rooms/${roomId}/currentSecret`), (snapshot) => {
        const currentSecretText = snapshot.val();
        if (!currentSecretText) {
            console.error("❌ Kein aktuelles Geheimnis gefunden!");
            displayedSecret.textContent = "Fehler: Kein Geheimnis verfügbar";
            return;
        }
        displayedSecret.textContent = currentSecretText;

        get(playersRef).then((playersSnapshot) => {
            const players = playersSnapshot.val();
            if (!players) return;

            Object.keys(players).forEach((pId) => {
                const player = players[pId];
                const button = document.createElement("button");
                button.classList.add("player-vote-button");
                button.dataset.playerId = pId;
                button.innerHTML = `
                    <img class="player-avatar" src="images/${player.avatar}.png" alt="${player.name}'s Avatar" />
                    <span>${player.name}</span>
                `;
                button.addEventListener("click", async () => {
                    console.log("🗳️ Abstimmung für", player.name, "von Spieler:", playerId);
                    await set(ref(db, `rooms/${roomId}/votes/${playerId}`), {
                        guessedPlayerId: pId,
                        secret: currentSecretText,
                        timestamp: Date.now()
                    });
                    secretDisplaySection.classList.add("hidden");
                    document.getElementById("waiting-votes-section").classList.remove("hidden");
                    guessButtons.querySelectorAll("button").forEach(btn => btn.disabled = true);
                });
                guessButtons.appendChild(button);
            });
        });
    }, { onlyOnce: true });
}

// Ergebnisse anzeigen mit Avataren
async function showResults() {
    console.log("🎨 Render Results Start");
    document.getElementById("waiting-votes-section").classList.add("hidden");
    const resultsSection = document.getElementById("results-section");
    const resultsList = document.getElementById("results-list");
    const resultsStatus = document.getElementById("results-status");

    if (!resultsSection || !resultsList || !resultsStatus) {
        console.error("❌ Fehler: Ergebnis-Elemente fehlen!");
        return;
    }

    resultsSection.classList.remove("hidden");
    resultsList.innerHTML = "";

    const votesSnapshot = await get(votesRef);
    const votes = votesSnapshot.val();
    if (!votes) {
        resultsList.innerHTML = "<p>Keine Ergebnisse.</p>";
        return;
    }

    const playersSnapshot = await get(playersRef);
    const players = playersSnapshot.val();
    const anonymousSnapshot = await get(resultsAnonymousRef);
    const showAnonymous = anonymousSnapshot.exists() ? anonymousSnapshot.val() : false;
    console.log("📊 Ergebnisse anonym für alle?", showAnonymous);

    if (showAnonymous) {
        const voteCounts = {};
        for (const voterId in votes) {
            const vote = votes[voterId];
            voteCounts[vote.guessedPlayerId] = (voteCounts[vote.guessedPlayerId] || 0) + 1;
        }
        const totalVotes = Object.keys(votes).length;
        for (const playerId in voteCounts) {
            const count = voteCounts[playerId];
            const percentage = ((count / totalVotes) * 100).toFixed(2);
            const playerName = players[playerId].name;
            const playerAvatar = players[playerId].avatar;

            const resultItem = document.createElement("div");
            resultItem.classList.add("result-item");
            resultItem.innerHTML = `
                <img class="player-avatar" src="images/${playerAvatar}.png" alt="${playerName}'s Avatar" />
                <div class="result-player-name">${playerName}</div>
                <div class="result-bar-container">
                    <div class="result-bar" style="width: ${percentage}%"></div>
                </div>
                <div class="result-percentage">${percentage}%</div>
            `;
            resultsList.appendChild(resultItem);
        }
    } else {
        for (const voterId in votes) {
            const vote = votes[voterId];
            const voterName = players[voterId]?.name || "Unbekannt";
            const voterAvatar = players[voterId]?.avatar || "default";
            const guessedName = players[vote.guessedPlayerId].name;
            const guessedAvatar = players[vote.guessedPlayerId].avatar;

            const voteItem = document.createElement("div");
            voteItem.classList.add("result-item");
            voteItem.innerHTML = `
                <img class="player-avatar" src="images/${voterAvatar}.png" alt="${voterName}'s Avatar" />
                <div class="result-player-name">${voterName} hat für</div>
                <img class="player-avatar" src="images/${guessedAvatar}.png" alt="${guessedName}'s Avatar" />
                <div class="result-player-name">${guessedName} gestimmt</div>
            `;
            resultsList.appendChild(voteItem);
        }
    }

    setTimeout(async () => {
        console.log("✅ Ergebnisse angezeigt, starte Roasting");
        await set(statusRef, "roasting");
    }, 3000);
}

// Roast-Handler
async function submitRoastHandler() {
    const roastInput = document.getElementById("roast-input");
    const roastText = roastInput.value.trim();
    if (!roastText) return;

    console.log("📤 Sende Roast für Spieler:", playerId);
    await push(roastsRef, {
        text: roastText,
        playerId: playerId,
        isAnonymous: Math.random() < 0.5,
    });
    console.log("✅ Roast gesendet:", roastText, "von", playerId);
    roastInput.value = "";
}

// Roast-Eingabe mit Weiter-Button für Host
async function setupRoastInput() {
    console.log("🔥 Roast-Phase gestartet");
    const roastInputSection = document.getElementById("roast-input-section");
    const currentSecretRef = ref(db, `rooms/${roomId}/currentSecret`);
    const roastStatus = document.getElementById("roast-status");
    const submitRoastBtn = document.getElementById("submit-roast");

    if (!roastInputSection || !roastStatus || !submitRoastBtn) {
        console.error("❌ Fehler: Roast-Elemente fehlen!");
        return;
    }

    roastInputSection.classList.remove("hidden");

    const existingButton = document.getElementById("next-round-button");
    if (existingButton) existingButton.remove();

    onValue(currentSecretRef, (snapshot) => {
        const secret = snapshot.val();
        if (secret) {
            document.getElementById("current-secret").textContent = secret;
        } else {
            console.error("❌ Kein aktuelles Geheimnis für Roasting gefunden!");
            document.getElementById("current-secret").textContent = "Fehler: Kein Geheimnis verfügbar";
        }
    }, { onlyOnce: true });

    submitRoastBtn.removeEventListener("click", submitRoastHandler);
    submitRoastBtn.addEventListener("click", submitRoastHandler);

    get(hostRef).then(async (hostSnapshot) => {
        const hostId = hostSnapshot.val();
        if (playerId === hostId) {
            const nextButton = document.createElement("button");
            nextButton.id = "next-round-button";
            nextButton.textContent = "Weiter zur nächsten Runde";
            nextButton.classList.add("next-btn");
            nextButton.addEventListener("click", async () => {
                console.log("🟢 Host hat 'Weiter' geklickt, nächste Runde wird gestartet");
                await nextRound();
            });
            roastInputSection.appendChild(nextButton);
            roastStatus.textContent = "Klicke 'Weiter', wenn alle fertig sind";
        } else {
            roastStatus.textContent = "Warte auf den Host...";
        }
    });
}

// Roasts anzeigen mit Reaktionen
function showRoasts() {
    console.log("📜 Roasts werden angezeigt");
    onValue(roastsRef, async (snapshot) => {
        const roasts = snapshot.val();
        const roastsList = document.getElementById("roasts-list");
        roastsList.innerHTML = "";

        if (!roasts) {
            roastsList.innerHTML = "<p>Keine Roasts abgegeben.</p>";
            return;
        }

        const playersSnapshot = await get(playersRef);
        const players = playersSnapshot.val() || {};

        for (const roastId in roasts) {
            const roast = roasts[roastId];
            const playerName = roast.isAnonymous ? "Anonym" : (players[roast.playerId]?.name || "Unbekannt");
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

        document.querySelectorAll(".reaction-btn").forEach((btn) => {
            btn.removeEventListener("click", handleReaction);
            btn.addEventListener("click", handleReaction);
        });
    });
}

async function handleReaction(event) {
    const btn = event.target;
    const roastId = btn.dataset.roastId;
    const reaction = btn.dataset.reaction;
    const reactionRef = ref(db, `rooms/${roomId}/roasts/${roastId}/reactions/${reaction}`);
    const snapshot = await get(reactionRef);
    const currentCount = snapshot.val() || 0;
    await set(reactionRef, currentCount + 1);
    triggerEmojiAnimation(reaction);
}

// Fliegende Emojis
function triggerEmojiAnimation(emoji) {
    const app = document.getElementById("app");
    const count = 10;

    for (let i = 0; i < count; i++) {
        const emojiElement = document.createElement("div");
        emojiElement.classList.add("emoji-animation");
        emojiElement.textContent = emoji;
        const startX = Math.random() * window.innerWidth;
        const startY = Math.random() * window.innerHeight;
        emojiElement.style.left = `${startX}px`;
        emojiElement.style.top = `${startY}px`;
        const endX = (Math.random() - 0.5) * 400;
        const endY = (Math.random() - 0.5) * 400;
        const rotateEnd = (Math.random() - 0.5) * 360;
        emojiElement.style.setProperty("--x-end", `${endX}px`);
        emojiElement.style.setProperty("--y-end", `${endY}px`);
        emojiElement.style.setProperty("--rotate-end", `${rotateEnd}deg`);
        app.appendChild(emojiElement);
        setTimeout(() => emojiElement.remove(), 1000);
    }
}

// Nächste Runde
async function nextRound() {
    console.log("🔄 Nächste Runde wird vorbereitet");
    const secretsSnapshot = await get(secretsRef);
    const secrets = secretsSnapshot.val();
    if (!secrets) {
        console.log("🏁 Keine Geheimnisse vorhanden, Spiel wird beendet");
        await set(statusRef, "finished");
        return;
    }

    let usedSecrets = (await get(usedSecretsRef)).val() || [];
    const allSecretIds = Object.keys(secrets);
    const unusedSecretIds = allSecretIds.filter(id => !usedSecrets.includes(id));
    console.log("🔍 Alle Geheimnisse:", allSecretIds.length, "Genutzt:", usedSecrets.length, "Ungenutzt:", unusedSecretIds.length);

    if (unusedSecretIds.length > 0) {
        const randomIndex = Math.floor(Math.random() * unusedSecretIds.length);
        const randomSecretId = unusedSecretIds[randomIndex];
        const selectedSecret = secrets[randomSecretId].text;

        usedSecrets.push(randomSecretId);
        await set(usedSecretsRef, usedSecrets);
        await set(ref(db, `rooms/${roomId}/currentSecret`), selectedSecret);
        await set(statusRef, "guessing");
        await set(votesRef, null);
        await set(roastsRef, null);
        await set(resultsAnonymousRef, null);
        console.log("🔄 Neue Runde mit Geheimnis:", selectedSecret);
    } else {
        console.log("🏁 Alle Geheimnisse verwendet, Spiel wird beendet");
        await set(statusRef, "finished");
    }
}

// Status-Handler
function handleStatusChange(snapshot) {
    const status = snapshot.val();
    console.log("📡 Status geändert zu:", status, "für Spieler:", playerId);

    document.querySelectorAll("#secret-input-section, #waiting-section, #secret-display-section, #waiting-votes-section, #results-section, #roast-input-section")
        .forEach(section => section.classList.add("hidden"));

    switch (status) {
        case "waiting":
        case "started":
            const secretInputSection = document.getElementById("secret-input-section");
            if (secretInputSection) {
                secretInputSection.classList.remove("hidden");
                console.log("✅ #secret-input-section sichtbar für Spieler:", playerId);
            }
            break;
        case "guessing":
            setupGuessInput();
            break;
        case "voting":
            showResults();
            break;
        case "roasting":
            setupRoastInput();
            showRoasts();
            break;
        case "finished":
            alert("Spiel beendet – alle Geheimnisse wurden geroastet!");
            document.getElementById("results-section")?.classList.remove("hidden");
            break;
        default:
            console.warn("⚠️ Unbekannter Status:", status, "für", playerId);
            break;
    }
}