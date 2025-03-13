import { db, ref, push, onValue, set, get } from "./firebase.js";

// Globale Variablen
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId") || "defaultRoom";
console.log("🔍 Verwende roomId:", roomId);

let playerId = urlParams.get("playerId");
const storedPlayerId = sessionStorage.getItem(`playerId_${roomId}`);

if (playerId) {
    sessionStorage.setItem(`playerId_${roomId}`, playerId);
    console.log("📌 playerId aus URL:", playerId);
} else if (storedPlayerId) {
    playerId = storedPlayerId;
    console.log("🔄 playerId aus sessionStorage:", playerId);
} else {
    console.warn("⚠️ Keine playerId angegeben.");
}

const playerName = urlParams.get("playerName") || (playerId ? "Spieler" + playerId.slice(-4) : "Gast");
const secretsRef = ref(db, `rooms/${roomId}/secrets`);
const votesRef = ref(db, `rooms/${roomId}/votes`);
const roastsRef = ref(db, `rooms/${roomId}/roasts`);
const statusRef = ref(db, `rooms/${roomId}/status`);
const playersRef = ref(db, `rooms/${roomId}/players`);
const hostRef = ref(db, `rooms/${roomId}/host`);

// Initialisierung
document.addEventListener("DOMContentLoaded", async () => {
    console.log("🔧 Seite lädt für Spieler:", playerId);

    const secretInputSection = document.getElementById("secret-input-section");
    if (!secretInputSection) {
        console.error("❌ #secret-input-section fehlt!");
        return;
    }

    if (playerId) {
        const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
        const playerSnapshot = await get(playerRef);
        if (!playerSnapshot.exists()) {
            await set(playerRef, { name: playerName, joinedAt: Date.now() });
            console.log("👤 Spieler registriert:", playerName);
        }

        const hostSnapshot = await get(hostRef);
        if (!hostSnapshot.exists()) {
            await set(hostRef, playerId);
            console.log("🎮 Host:", playerId);
        }
    }

    const statusSnapshot = await get(statusRef);
    if (!statusSnapshot.exists()) {
        await set(statusRef, "waiting");
        console.log("✅ Status auf 'waiting'");
    }

    setupSecretInput();
    onValue(statusRef, handleStatusChange);
    onValue(playersRef, (snapshot) => {
        const players = snapshot.val();
        console.log("👥 Spieleranzahl:", players ? Object.keys(players).length : 0);
    });
    checkAndUpdateGameStatus();
});

// Geheimnis-Eingabe
function setupSecretInput() {
    console.log("🔧 setupSecretInput für Spieler:", playerId);
    const secretInputSection = document.getElementById("secret-input-section");
    const secretInput = document.getElementById("secretInput");
    const submitSecretBtn = document.getElementById("submit-secret");
    const secretForm = document.getElementById("secret-form");

    if (!secretInputSection || !secretInput || !submitSecretBtn) {
        console.error("❌ Eingabe-Elemente fehlen:", {
            secretInputSection: !!secretInputSection,
            secretInput: !!secretInput,
            submitSecretBtn: !!submitSecretBtn
        });
        return;
    }

    secretInputSection.classList.remove("hidden");
    console.log("✅ Eingabe sichtbar für:", playerId);

    submitSecretBtn.removeEventListener("click", submitSecretHandler);
    submitSecretBtn.addEventListener("click", submitSecretHandler);
    submitSecretBtn.addEventListener("click", () => console.log("🔍 BUTTON KLICK ERKANNT"));

    if (secretForm) {
        secretForm.removeEventListener("submit", submitSecretHandler);
        secretForm.addEventListener("submit", submitSecretHandler);
    }

    async function submitSecretHandler(event) {
        event.preventDefault();
        console.log("🖱️ Submit ausgelöst von:", playerId);

        const secretText = secretInput.value.trim();
        if (!secretText) {
            console.log("⚠️ Kein Geheimnis eingegeben von:", playerId);
            alert("Bitte gib ein Geheimnis ein!");
            return;
        }

        if (!playerId) {
            console.error("❌ Keine playerId vorhanden!");
            alert("Fehler: Spieler-ID fehlt!");
            return;
        }

        const secretsSnapshot = await get(secretsRef);
        const secrets = secretsSnapshot.val();
        if (secrets && Object.values(secrets).some(secret => secret.playerId === playerId)) {
            console.log("⚠️ Bereits abgegeben von:", playerId);
            alert("Du hast bereits ein Geheimnis abgegeben!");
            return;
        }

        console.log("📤 Sende:", secretText, "von:", playerId);
        try {
            await push(secretsRef, { text: secretText, playerId: playerId });
            console.log("✅ Gesendet:", secretText);
            secretInput.value = "";
            secretInputSection.classList.add("hidden");
            document.getElementById("waiting-section")?.classList.remove("hidden");
            submitSecretBtn.disabled = true;
        } catch (error) {
            console.error("❌ Fehler:", error.message);
            alert("Fehler beim Senden: " + error.message);
        }
    }
}

// Status-Überprüfung
function checkAndUpdateGameStatus() {
    onValue(secretsRef, async (snapshot) => {
        const secrets = snapshot.val();
        const secretCount = secrets ? Object.keys(secrets).length : 0;

        const playersSnapshot = await get(playersRef);
        const players = playersSnapshot.val();
        const playerCount = players ? Object.keys(players).length : 0;

        const currentStatusSnapshot = await get(statusRef);
        const currentStatus = currentStatusSnapshot.val();

        console.log("🔍 Status-Check:", { secretCount, playerCount, currentStatus });

        if (currentStatus === "waiting" && secrets && playerCount > 0) {
            const secretPlayerIds = new Set(Object.values(secrets).map(secret => secret.playerId));
            if (secretPlayerIds.size === playerCount) {
                const secretKeys = Object.keys(secrets);
                const randomSecretKey = secretKeys[Math.floor(Math.random() * secretKeys.length)];
                const selectedSecretText = secrets[randomSecretKey].text;

                await set(ref(db, `rooms/${roomId}/currentSecret`), selectedSecretText);
                await set(statusRef, "guessing");
                console.log("✅ Übergang zu 'guessing' mit:", selectedSecretText);
            } else {
                console.log("⏳ Warte auf alle:", secretPlayerIds.size, "/", playerCount);
            }
        }
    });
}

// Abstimmungslogik
function setupGuessInput() {
    console.log("🗳️ Abstimmungsphase");
    document.getElementById("waiting-section")?.classList.add("hidden");
    const secretDisplaySection = document.getElementById("secret-display-section");
    const displayedSecret = document.getElementById("displayedSecret");
    const guessButtons = document.getElementById("guessButtons");

    if (!secretDisplaySection || !displayedSecret || !guessButtons) {
        console.error("❌ Abstimmungselemente fehlen!");
        return;
    }

    secretDisplaySection.classList.remove("hidden");

    onValue(ref(db, `rooms/${roomId}/currentSecret`), (snapshot) => {
        const currentSecretText = snapshot.val();
        if (!currentSecretText) {
            displayedSecret.textContent = "Warte auf Geheimnis...";
            return;
        }

        displayedSecret.textContent = currentSecretText;
        console.log("🔍 Geheimnis:", currentSecretText);

        if (guessButtons.children.length === 0) {
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
                    button.addEventListener("click", async () => {
                        const voterId = playerId;
                        if (!voterId) {
                            console.error("❌ Keine playerId für Abstimmung!");
                            alert("Fehler: Spieler-ID fehlt!");
                            return;
                        }

                        await set(ref(db, `rooms/${roomId}/votes/${voterId}`), {
                            guessedPlayerId: pId,
                            secret: currentSecretText,
                            timestamp: Date.now()
                        });
                        console.log("✅ Abstimmung von", voterId);
                        secretDisplaySection.classList.add("hidden");
                        document.getElementById("waiting-votes-section")?.classList.remove("hidden");

                        guessButtons.querySelectorAll("button").forEach(btn => btn.disabled = true);

                        const votesSnapshot = await get(votesRef);
                        const votes = votesSnapshot.val();
                        if (votes && Object.keys(votes).length >= Object.keys(players).length) {
                            await set(statusRef, "voting");
                            console.log("✅ Alle haben abgestimmt");
                        }
                    });
                    guessButtons.appendChild(button);
                });
            });
        }
    });
}

// Ergebnisse anzeigen
function showResults() {
    console.log("🎨 Ergebnisse");
    document.getElementById("waiting-votes-section")?.classList.add("hidden");
    const resultsSection = document.getElementById("results-section");
    const resultsList = document.getElementById("results-list");

    if (!resultsSection || !resultsList) {
        console.error("❌ Ergebniselemente fehlen!");
        return;
    }

    resultsSection.classList.remove("hidden");
    resultsList.innerHTML = "";

    get(votesRef).then((votesSnapshot) => {
        const votes = votesSnapshot.val();
        if (!votes) {
            resultsList.innerHTML = "<p>Keine Ergebnisse.</p>";
            return;
        }

        get(playersRef).then((playersSnapshot) => {
            const players = playersSnapshot.val();

            const showAnonymous = Math.random() < 0.5;
            console.log("🎲 Ergebnisse:", showAnonymous ? "anonym" : "öffentlich");

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
                            <div class="result-bar" style="width: ${percentage}%"></div>
                        </div>
                        <div class="result-percentage">${percentage}%</div>
                    `;
                    resultsList.appendChild(resultItem);
                }
            } else {
                for (const voterId in votes) {
                    const vote = votes[voterId];
                    const voterName = players[voterId] ? players[voterId].name : "Unbekannt";
                    const guessedName = players[vote.guessedPlayerId].name;

                    const voteItem = document.createElement("div");
                    voteItem.classList.add("result-item");
                    voteItem.innerHTML = `<div class="result-player-name">${voterName} hat für ${guessedName} gestimmt</div>`;
                    resultsList.appendChild(voteItem);
                }
            }

            setTimeout(async () => {
                console.log("⏩ Wechsel zu Roastrunde");
                await set(statusRef, "roasting");
            }, 10000);
        });
    });
}

// Roast-Eingabe
function setupRoastInput() {
    console.log("🔥 Roastrunde");
    const roastInputSection = document.getElementById("roast-input-section");
    const roastTimer = document.getElementById("roast-timer");

    if (!roastInputSection || !roastTimer) {
        console.error("❌ Roast-Elemente fehlen!");
        return;
    }

    onValue(ref(db, `rooms/${roomId}/currentSecret`), (snapshot) => {
        const secret = snapshot.val();
        if (secret) {
            document.getElementById("current-secret").textContent = secret;
            roastInputSection.classList.remove("hidden");
        }
    });

    get(hostRef).then((hostSnapshot) => {
        const hostId = hostSnapshot.val();
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
    });

    const submitRoastBtn = document.getElementById("submit-roast");
    if (submitRoastBtn) {
        submitRoastBtn.removeEventListener("click", submitRoastHandler);
        submitRoastBtn.addEventListener("click", submitRoastHandler);
    }

    async function submitRoastHandler() {
        const roastInput = document.getElementById("roast-input");
        const roastText = roastInput.value.trim();
        if (!roastText) return;

        await push(roastsRef, {
            text: roastText,
            playerId: playerName,
            isAnonymous: Math.random() < 0.5,
        });
        roastInput.value = "";
    }
}

// Roasts anzeigen
function showRoasts() {
    console.log("📜 Roasts anzeigen");
    onValue(roastsRef, (snapshot) => {
        const roasts = snapshot.val();
        const roastsList = document.getElementById("roasts-list");
        roastsList.innerHTML = roasts ? "" : "<p>Keine Roasts.</p>";

        if (roasts) {
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
                btn.removeEventListener("click", reactionHandler);
                btn.addEventListener("click", reactionHandler);
            });

            async function reactionHandler() {
                const roastId = this.dataset.roastId;
                const reaction = this.dataset.reaction;
                const reactionRef = ref(db, `rooms/${roomId}/roasts/${roastId}/reactions/${reaction}`);
                const snapshot = await get(reactionRef);
                const currentCount = snapshot.val() || 0;
                await set(reactionRef, currentCount + 1);
                triggerEmojiAnimation(reaction);
            }
        }
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
        emojiElement.style.left = `${Math.random() * window.innerWidth}px`;
        emojiElement.style.top = `${Math.random() * window.innerHeight}px`;
        emojiElement.style.setProperty("--x-end", `${(Math.random() - 0.5) * 400}px`);
        emojiElement.style.setProperty("--y-end", `${(Math.random() - 0.5) * 400}px`);
        emojiElement.style.setProperty("--rotate-end", `${(Math.random() - 0.5) * 360}deg`);
        app.appendChild(emojiElement);
        setTimeout(() => emojiElement.remove(), 1000);
    }
}

// Nächste Runde
async function nextRound() {
    console.log("🔄 Nächste Runde");
    const secretsSnapshot = await get(secretsRef);
    const secrets = secretsSnapshot.val();
    if (!secrets) return;

    const usedSecretsRef = ref(db, `rooms/${roomId}/usedSecrets`);
    let usedSecrets = (await get(usedSecretsRef)).val() || [];
    const allSecretIds = Object.keys(secrets);
    const unusedSecretIds = allSecretIds.filter(id => !usedSecrets.includes(id));

    if (unusedSecretIds.length > 0) {
        const randomSecretId = unusedSecretIds[Math.floor(Math.random() * unusedSecretIds.length)];
        const selectedSecret = secrets[randomSecretId].text;

        usedSecrets.push(randomSecretId);
        await set(usedSecretsRef, usedSecrets);
        await set(ref(db, `rooms/${roomId}/currentSecret`), selectedSecret);
        await set(statusRef, "guessing");
        await set(votesRef, null);
        await set(roastsRef, null);
        console.log("🔄 Neue Runde mit:", selectedSecret);
    } else {
        console.log("🏁 Spiel beendet!");
        await set(statusRef, "finished");
    }
}

// Status-Handler
function handleStatusChange(snapshot) {
    const status = snapshot.val();
    console.log("📡 Status:", status, "für Spieler:", playerId);

    document.querySelectorAll("#secret-input-section, #waiting-section, #secret-display-section, #waiting-votes-section, #results-section, #roast-input-section")
        .forEach(section => section.classList.add("hidden"));

    if (!status || status === "waiting") {
        const secretInputSection = document.getElementById("secret-input-section");
        if (secretInputSection) {
            secretInputSection.classList.remove("hidden");
            console.log("✅ Eingabe sichtbar für:", playerId);
        }
    } else if (status === "guessing") {
        setupGuessInput();
    } else if (status === "voting") {
        showResults();
    } else if (status === "roasting") {
        setupRoastInput();
        showRoasts();
    } else if (status === "finished") {
        alert("Spiel beendet!");
    } else {
        console.warn("⚠️ Unbekannter Status:", status);
    }
}