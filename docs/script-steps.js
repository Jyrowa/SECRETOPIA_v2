let currentStep = 1;

const prevButton = document.getElementById("prev-step");
const nextButton = document.getElementById("next-step");
const stepsWrapper = document.querySelector(".steps-wrapper");
const progress = document.getElementById("progress"); // Fortschrittsbalken-Element

// Funktion zum Anzeigen des aktuellen Schritts
function showStep(step, direction) {
    // Aktuellen Schritt ausblenden
    const currentStepElement = document.querySelector(".step.active");
    if (currentStepElement) {
        currentStepElement.classList.remove("active");
        currentStepElement.classList.add(direction === "left" ? "right" : "left");
    }

    // Neuen Schritt anzeigen
    const stepElement = document.getElementById(`step${step}`);
    if (stepElement) {
        stepElement.classList.remove("left", "right");
        stepElement.classList.add("active");
    }

    // Pfeile aktivieren/deaktivieren
    prevButton.disabled = step === 1;
    nextButton.disabled = step === 7;

    // Fortschrittsbalken aktualisieren
    const totalSteps = 7; // Anzahl der Schritte
    const progressWidth = (step / totalSteps) * 100; // Prozentuale Breite
    progress.style.width = `${progressWidth}%`;
}

// Vorheriger Schritt
prevButton.addEventListener("click", () => {
    if (currentStep > 1) {
        currentStep--;
        showStep(currentStep, "left");
    }
});

// Nächster Schritt
nextButton.addEventListener("click", () => {
    if (currentStep < 7) {
        currentStep++;
        showStep(currentStep, "right");
    }
});

// Standardmäßig den ersten Schritt anzeigen
showStep(currentStep, "right");