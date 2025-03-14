import { db, ref, push, onValue, set, get, getDatabase } from "./firebase.js";

// Globale Variablen
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId") || "defaultRoom";
let playerId = urlParams.get("playerId") || sessionStorage.getItem(`playerId_${roomId}`);
console.log("🔍 Verwende roomId:", roomId, "playerId:", playerId);

let playerName; // Deklariert, aber noch nicht initialisiert
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

    // URL-Validierung
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

    const secretInput = document.getElementById("secretInput");
    const submitSecretBtn = document.getElementById("submit-secret");
    if (!secretInput || !submitSecretBtn) {
        console.error("❌ Fehler: #secretInput oder #submit-secret nicht gefunden!");
        return;
    }
    console.log("🔍 Eingabefeld und Button gefunden");

    const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
    const playerSnapshot = await get(playerRef);
    if (!playerSnapshot.exists()) {
        console.error("❌ Fehler: Spieler-ID", playerId, "existiert nicht in Firebase. Zurück zur Startseite.");
        window.location.href = "index.html";
        return;
    }

    // playerName erst nach Zuweisung verwenden
    const playerData = playerSnapshot.val();
    playerName = playerData.name; // Zuweisung VOR dem Log
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

    const submitRoastBtn = document.getElementById("submit-roast");
    if (submitRoastBtn) {
        submitRoastBtn.removeEventListener("click", submitRoastHandler);
        submitRoastBtn.addEventListener("click", submitRoastHandler);
    } else {
        console.error("❌ Fehler: #submit-roast nicht gefunden!");
    }

    onValue(statusRef, handleStatusChange);
    onValue(playersRef, (snapshot) => {
        const players = snapshot.val();
        const playerCount = players ? Object.keys(players).length : 0;
        console.log("👥 Aktuelle Spieleranzahl:", playerCount, "Spieler:", players);
    });

    checkAndUpdateGameStatus();
});

// Funktion zur Statusüberprüfung und -änderung
async function checkAndUpdateGameStatus() {
    onValue(secretsRef, async (snapshot) => {
        const secrets = snapshot.val();
        const secretCount = secrets ? Object.keys(secrets).length : 0;

        const playersSnapshot = await get(playersRef);
        const players = playersSnapshot.val();
        const playerCount = players ? Object.keys(players).length : 0;

        const currentStatusSnapshot = await get(statusRef);
        const currentStatus = currentStatusSnapshot.val();

        console.log("🔍 Status-Check für", playerName, ": Geheimnisse:", secretCount, "Spieler:", playerCount, "Aktueller Status:", currentStatus);

        if ((currentStatus === "waiting" || currentStatus === "started") && secrets && playerCount > 0) {
            const secretPlayerIds = new Set(Object.values(secrets).map(secret => secret.playerId));
            if (secretPlayerIds.size === playerCount) {
                const secretKeys = Object.keys(secrets);
                const randomSecretKey = secretKeys[Math.floor(Math.random() * secretKeys.length)];
                const selectedSecretText = secrets[randomSecretKey].text;

                let usedSecrets = (await get(usedSecretsRef)).val() || [];
                usedSecrets.push(randomSecretKey);
                await set(usedSecretsRef, usedSecrets);

                await set(ref(db, `rooms/${roomId}/currentSecret`), selectedSecretText);
                await set(statusRef, "guessing");
                console.log("✅ Automatischer Übergang zu 'guessing' mit Geheimnis:", selectedSecretText, "für", playerName);
            } else {
                console.log("⏳ Warte auf Geheimnisse von allen Spielern für", playerName, "... (Eindeutige Spieler mit Geheimnissen:", secretPlayerIds.size, "benötigt:", playerCount, ")");
            }
        } else if (currentStatus === "waiting" || currentStatus === "started") {
            console.log("⏳ Warte auf weitere Geheimnisse für", playerName, "... (Geheimnisse:", secretCount, "Spieler:", playerCount, ")");
        }
    });
}

// Geheimnis-Eingabe
function setupSecretInput() {
    console.log("🔧 setupSecretInput wird initialisiert für Spieler:", playerId);
    const secretInputSection = document.getElementById("secret-input-section");
    const secretInput = document.getElementById("secretInput");
    const submitSecretBtn = document.getElementById("submit-secret");

    if (!secretInputSection || !secretInput || !submitSecretBtn || !db) {
        console.error("❌ Fehler: Elemente oder db fehlen für", playerId);
        return;
    }

    secretInputSection.classList.remove("hidden");
    console.log("✅ #secret-input-section ist sichtbar für Spieler:", playerId);

    submitSecretBtn.removeEventListener("click", submitSecretHandler);
    submitSecretBtn.addEventListener("click", submitSecretHandler);

    async function submitSecretHandler(event) {
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
    }
}

// Abstimmungslogik
function setupGuessInput() {
    console.log("🗳️ Abstimmungsphase gestartet");
    document.getElementById("waiting-section").classList.add("hidden");
    const secretDisplaySection = document.getElementById("secret-display-section");
    const displayedSecret = document.getElementById("displayedSecret");
    const guessButtons = document.getElementById("guessButtons");

    if (!secretDisplaySection || !displayedSecret || !guessButtons) {
        console.error("❌ Fehler: Elemente fehlen!");
        return;
    }

    secretDisplaySection.classList.remove("hidden");
    guessButtons.innerHTML = "";

    onValue(ref(db, `rooms/${roomId}/currentSecret`), (snapshot) => {
        const currentSecretText = snapshot.val();
        if (!currentSecretText) {
            displayedSecret.textContent = "Warte auf Geheimnis...";
            return;
        }

        displayedSecret.textContent = currentSecretText;
        console.log("🔍 Synchrones Geheimnis für alle Spieler:", currentSecretText);

        get(playersRef).then((playersSnapshot) => {
            const players = playersSnapshot.val();
            if (!players) return;

            guessButtons.innerHTML = "";
            Object.keys(players).forEach((pId) => {
                const player = players[pId];
                const button = document.createElement("button");
                button.textContent = player.name;
                button.classList.add("player-vote-button");
                button.dataset.playerId = pId;
                button.disabled = false;
                button.addEventListener("click", async () => {
                    console.log("🗳️ Abstimmung für", player.name, "von Spieler:", playerId);
                    const voteRef = ref(db, `rooms/${roomId}/votes/${playerId}`);
                    await set(voteRef, {
                        guessedPlayerId: pId,
                        secret: currentSecretText,
                        timestamp: Date.now()
                    });
                    console.log("✅ Abstimmung gespeichert von", playerId);

                    secretDisplaySection.classList.add("hidden");
                    document.getElementById("waiting-votes-section").classList.remove("hidden");

                    guessButtons.querySelectorAll("button").forEach(btn => btn.disabled = true);

                    const votesSnapshot = await get(votesRef);
                    const votes = votesSnapshot.val();
                    const voteCount = votes ? Object.keys(votes).length : 0;
                    const playerCount = Object.keys(players).length;

                    if (voteCount >= playerCount) {
                        console.log("✅ Alle haben abgestimmt, Status wird 'voting'");
                        await set(statusRef, "voting");

                        const anonymousSnapshot = await get(resultsAnonymousRef);
                        if (!anonymousSnapshot.exists()) {
                            const showAnonymous = Math.random() < 0.5;
                            await set(resultsAnonymousRef, showAnonymous);
                            console.log("🎲 Anonymität für alle festgelegt:", showAnonymous);
                        }
                    }
                });
                guessButtons.appendChild(button);
            });
            console.log("✅ Buttons erstellt für", Object.keys(players).length, "Spieler");
        });
    }, { onlyOnce: false });
}

// Ergebnisse anzeigen
async function showResults() {
    console.log("🎨 Render Results Start");
    document.getElementById("waiting-votes-section").classList.add("hidden");
    const resultsSection = document.getElementById("results-section");
    const resultsList = document.getElementById("results-list");

    if (!resultsSection || !resultsList) {
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
    console.log("🎲 Ergebnisse werden", showAnonymous ? "anonym" : "öffentlich", "angezeigt für alle");

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
        }
    } else {
        for (const voterId in votes) {
            const vote = votes[voterId];
            const voterName = players[voterId]?.name || "Unbekannt";
            const guessedName = players[vote.guessedPlayerId].name;

            const voteItem = document.createElement("div");
            voteItem.classList.add("result-item");
            voteItem.innerHTML = `
                <div class="result-player-name">${voterName} hat für ${guessedName} gestimmt</div>
            `;
            resultsList.appendChild(voteItem);
        }
    }

    setTimeout(async () => {
        console.log("⏩ Wechsel zur Roast-Runde");
        await set(statusRef, "roasting");
    }, 10000);
}

// Roast-Handler
async function submitRoastHandler() {
    const roastInput = document.getElementById("roast-input");
    const roastText = roastInput.value.trim();
    if (!roastText) return;

    console.log("📤 Sende Roast für Spieler:", playerId);
    await push(roastsRef, {
        text: roastText,
        playerId: playerName,
        isAnonymous: Math.random() < 0.5,
    });
    console.log("✅ Roast gesendet:", roastText, "von", playerName);
    roastInput.value = "";
}

// Roast-Eingabe mit Timer
async function setupRoastInput() {
    console.log("🔥 Roast-Phase gestartet");
    const roastInputSection = document.getElementById("roast-input-section");
    const currentSecretRef = ref(db, `rooms/${roomId}/currentSecret`);
    const roastTimer = document.getElementById("roast-timer");

    if (!roastInputSection || !roastTimer) {
        console.error("❌ Fehler: Roast-Elemente fehlen!");
        return;
    }

    roastInputSection.classList.remove("hidden");

    onValue(currentSecretRef, async (snapshot) => {
        const secret = snapshot.val();
        if (secret) {
            document.getElementById("current-secret").textContent = secret;

            const hostId = (await get(hostRef)).val();
            if (playerId === hostId) {
                let timeLeft = 15;
                roastTimer.textContent = timeLeft;
                const timerInterval = setInterval(async () => {
                    timeLeft--;
                    roastTimer.textContent = timeLeft;
                    if (timeLeft <= 0) {
                        clearInterval(timerInterval);
                        console.log("⏳ Roast-Timer abgelaufen, nächste Runde wird gestartet");
                        await nextRound();
                    }
                }, 1000);
            }
        }
    }, { onlyOnce: true });
}

// Roasts anzeigen mit Reaktionen
function showRoasts() {
    console.log("📜 Roasts werden angezeigt");
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

        document.querySelectorAll(".reaction-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const roastId = btn.dataset.roastId;
                const reaction = btn.dataset.reaction;
                const reactionRef = ref(db, `rooms/${roomId}/roasts/${roastId}/reactions/${reaction}`);
                const snapshot = await get(reactionRef);
                const currentCount = snapshot.val() || 0;
                await set(reactionRef, currentCount + 1);
                triggerEmojiAnimation(reaction);
            });
        });
    });
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

    console.log("🔍 Verfügbare Geheimnisse:", allSecretIds.length, "Genutzte Geheimnisse:", usedSecrets.length, "Ungenutzte Geheimnisse:", unusedSecretIds.length);

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
                console.log("✅ #secret-input-section sichtbar für Spieler:", playerId, "im Status:", status);
            } else {
                console.error("❌ Fehler: #secret-input-section nicht gefunden im Status", status);
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