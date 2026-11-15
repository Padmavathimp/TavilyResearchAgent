
async function startResearch() {
    const topic = document.getElementById("topic").value.trim();
    const meetingDate = document.getElementById("meetingDate").value;
    const output = document.getElementById("output");
    const button = document.getElementById("researchBtn");

    if (!topic || !meetingDate) {
        output.textContent =
            "Please enter a company/person name and meeting date.";
        return;
    }

    output.textContent = "Researching... Please wait.";
    button.disabled = true;

    try {
        const response = await fetch("/.netlify/functions/research", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                topic: topic,
                meetingDate: meetingDate
            })
        });

        const data = await response.json();

        if (!response.ok) {
            const message = typeof data.error === "string"
                ? data.error
                : JSON.stringify(data.error || data);

            throw new Error(message);
        }

        output.textContent = data.briefing;

    } catch (error) {
        output.textContent = "Error: " + error.message;
    } finally {
        button.disabled = false;
    }
}
