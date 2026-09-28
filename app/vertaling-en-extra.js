// Handmatige aanvullingen op het Engelse woordenboek (vertaling-en.js wordt
// gegenereerd en kan overschreven worden; nieuwe teksten van na 27 sep 2026
// komen hier). Sleutel = exacte Nederlandse tekst.
i18nLaad({
  // Handleiding als PDF downloaden (help.js)
  "Download als PDF:": "Download as PDF:",
  // Zelf een omgeving starten (start_bedrijf)
  "Welkom! Hoe wil je verder?": "Welcome! How would you like to continue?",
  "Je account is nog nergens aan gekoppeld. Kies wat bij jou past.": "Your account isn't linked to anything yet. Pick what fits you.",
  "Ik ben uitgenodigd door een coach of gym": "I was invited by a coach or gym",
  "Open de link uit de e-mail van je coach; daarmee koppelt je account zich vanzelf. Geen mail gekregen? Vraag je coach om een nieuwe uitnodiging.": "Open the link in the email from your coach; that links your account automatically. No email? Ask your coach for a new invitation.",
  "Ik ben coach en start mijn eigen omgeving": "I'm a coach and I'm starting my own workspace",
  "Je wordt eigenaar van een nieuwe, lege omgeving met eigen klanten, programmering en berichten. Daarna kun je meteen klanten en collega-coaches uitnodigen.": "You become the owner of a new, empty workspace with your own clients, programming and messages. After that you can invite clients and fellow coaches straight away.",
  "Naam van je bedrijf of gym": "Name of your business or gym",
  "Start mijn omgeving": "Start my workspace",
  "Vul eerst de naam van je bedrijf of gym in.": "Enter the name of your business or gym first.",
  "Starten mislukt, probeer het opnieuw.": "Starting failed, please try again.",
  "Je omgeving staat klaar, welkom!": "Your workspace is ready, welcome!",
  "Geef een bedrijfsnaam van 2 tot 60 tekens": "Enter a business name of 2 to 60 characters",
  "Dit account hoort al bij een bedrijf": "This account already belongs to a business",
  "Niet ingelogd": "Not logged in",
  "Profiel niet gevonden": "Profile not found",
  "per week": "per week",
  // Dashboard-restjes (gevonden bij de Engelse handleiding-screenshots)
  "Verberg": "Hide",
  "Afgerond ({n})": "Completed ({n})",
  "Open het programma van {naam}": "Open {naam}'s program",
  "{n} deelnemer · {n} score vandaag": "{n} participant · {n} score today",
  "{n} deelnemers · {n} scores vandaag": "{n} participants · {n} scores today",
  "{n} deelnemer · {n} scores vandaag": "{n} participant · {n} scores today",
  "{n} deelnemers · {n} score vandaag": "{n} participants · {n} score today",
  "Notities van de coach": "Coach notes",
  "Demo-video toevoegen aan warming-up": "Add a demo video to the warm-up",
  "Demo-video toevoegen aan cooldown": "Add a demo video to the cool-down",
  "+ Oefening": "+ Exercise",
  "+ Programma": "+ Program",
  "Herken oefeningen in de tekst en stel demo-video's voor": "Recognise exercises in the text and suggest demo videos",
  "Vul de scores in voor deze klant. Leeg laten = nog niet gelogd. Klik op het rode kruis om een blok als gemist te markeren.": "Enter the scores for this client. Leave blank = not logged yet. Click the red cross to mark a block as missed.",
  "Eén gedeeld leaderboard voor 1-op-1 klanten én gratis blog-leden. Alleen scores die een lid op \"openbaar\" zet staan erop; privé-scores ziet alleen de eigen coach.": "One shared leaderboard for 1-on-1 clients and free blog members. Only scores a member sets to \"public\" appear on it; private scores are only visible to their own coach.",
  "Overig /": "Other /", "Mannen /": "Men /", "Vrouwen /": "Women /",
  "blog-lid": "blog member", "1-op-1 klant": "1-on-1 client",
  "Deze coach heeft nog": "This coach still has",
  "De klanten van deze coach": "This coach's clients",
  "{n} actieve klant": "{n} active client", "{n} actieve klanten": "{n} active clients",
});
// Samengestelde regels (worden na het woordenboek geprobeerd)
if (typeof i18nRegel === "function") {
  i18nRegel(/^Laatste consult: (.+)$/, "Last consultation: $1");
  i18nRegel(/^gepubliceerd (.+)$/, "published $1");
  i18nRegel(/^Jij: (.*)$/, "You: $1");
  i18nRegel(/^Gepland: (.+)$/, "Scheduled: $1");
  i18nRegel(/^(\d+) klanten · (.+)$/, "$1 clients · $2");
  i18nRegel(/^1 klant · (.+)$/, "1 client · $1");
  i18nRegel(/^Rechten van (.+)$/, "Permissions of $1");
  i18nRegel(/^(\d+) rondes? \+ (\d+) · (.*)$/, (m, a, b, rest) => a + (a === "1" ? " round + " : " rounds + ") + b + " · " + rest.replace("1-op-1 klant", "1-on-1 client").replace("blog-lid", "blog member"));
  i18nRegel(/^(\d+) rondes? \+ (\d+)$/, (m, a, b) => a + (a === "1" ? " round + " : " rounds + ") + b);
  i18nRegel(/^(.+) · 1-op-1 klant(.*)$/, "$1 · 1-on-1 client$2");
  i18nRegel(/^(.+) · blog-lid(.*)$/, "$1 · blog member$2");
}
// Teksten die de code samenstelt met een datum of naam erin.
if (typeof i18nRegel === "function") {
  i18nRegel(/^Gedaan op (.+)$/, "Done on $1");
  i18nRegel(/^Gemist op (.+)$/, "Missed on $1");
  i18nRegel(/^(.*?) · (\d+) deelnemers? · (\d+) scores? vandaag$/, (m, a, d, s) => a + " · " + d + (d === "1" ? " participant · " : " participants · ") + s + (s === "1" ? " score today" : " scores today"));
  i18nRegel(/^week van maandag (.+)$/, "week of Monday $1");
  i18nRegel(/^Programma van (.+) geopend$/, "Opened $1's program");
}
