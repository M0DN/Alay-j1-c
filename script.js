// Inizializza plugin Compromise se disponibili
try {
  if (typeof compromiseDates === "function") nlp.extend(compromiseDates);
  if (typeof compromiseNumbers === "function") nlp.extend(compromiseNumbers);
} catch (err) {
  console.warn("Errore nell'estensione di Compromise:", err);
}

// DOM
const chatBox = document.getElementById("chat-box");
const inputField = document.getElementById("user-input");
const sendButton = document.getElementById("send-btn");

// Storico e contesto
const contextHistory = [];
const previousQuestions = {};
const fuse = new Fuse(qaData, { keys: ["question"], threshold: 0.3 });
const stopWords = ["che", "e", "il", "la", "di", "a", "in", "da", "per", "con", "su", "come", "ma", "o", "un", "una"];

let currentContext = {
  reminderPending: false,
  reminderText: null,
  lastIntent: null,
};

function addMessage(sender, text, slow = false) {
  return new Promise(resolve => {
    const msg = document.createElement("div");
    msg.classList.add("message", sender);
    chatBox.appendChild(msg);

    if (slow) {
      let i = 0;
      const interval = setInterval(() => {
        if (i < text.length) {
          msg.innerHTML += text.charAt(i);
          i++;
          chatBox.scrollTop = chatBox.scrollHeight;
        } else {
          clearInterval(interval);
          resolve();
        }
      }, 30 + Math.random() * 40);
    } else {
      msg.innerHTML = text;
      chatBox.scrollTop = chatBox.scrollHeight;
      resolve();
    }
  });
}

async function showTypingAnimation(duration = 1500) {
  const typingMsg = document.createElement("div");
  typingMsg.classList.add("message", "bot");
  chatBox.appendChild(typingMsg);
  let dots = 0;
  typingMsg.innerHTML = "✏️ Sta scrivendo";
  const interval = setInterval(() => {
    dots = (dots + 1) % 4;
    typingMsg.innerHTML = "✏️ Sta scrivendo" + ".".repeat(dots);
    chatBox.scrollTop = chatBox.scrollHeight;
  }, 500);
  await new Promise(res => setTimeout(res, duration));
  clearInterval(interval);
  chatBox.removeChild(typingMsg);
}

function analyzeInput(text) {
  // Controllo se stiamo aspettando testo per il promemoria
  if (currentContext.reminderPending) {
    return { intent: "reminder_text", text };
  }

  const doc = nlp(text.toLowerCase());
  const greetings = ["ciao", "salve", "buongiorno", "buonasera", "hey"];
  if (greetings.some(g => text.includes(g))) return { intent: "greeting" };
  if (/che\s*ora/.test(text) || text.includes("ore")) return { intent: "time" };
  if (text.includes("come ti chiami")) return { intent: "ask_name" };
  if (text.includes("barzelletta") || text.includes("scherzo")) return { intent: "joke" };
  if (text.includes("consiglio")) return { intent: "advice" };
  if (text.includes("motivazione") || text.includes("motivami")) return { intent: "motivation" };
  if (text.includes("citazione")) return { intent: "quote" };
  if (text.includes("curiosità") || text.includes("interessante")) return { intent: "interesting_fact" };
  if (text.includes("significa") || text.includes("definizione")) return { intent: "definition_query" };
  if (text.includes("testa o croce")) return { intent: "coin_flip" };
  if (text.includes("timer") || text.includes("conto alla rovescia")) return { intent: "timer" };
  if (text.includes("numero casuale")) return { intent: "random_number" };
  if (/\d+.*[\+\-\*\/].*\d+/.test(text)) return { intent: "math_solver" };
  if (text.includes("promemoria") || text.includes("ricordami")) return { intent: "reminder", text: text };

  const people = doc.people().out("array");
  const places = doc.places().out("array");
  const dates = typeof doc.dates === "function" ? doc.dates().out("array") : [];
  if (people.length > 0) return { intent: "person_query", entities: people };
  if (places.length > 0) return { intent: "place_query", entities: places };
  if (dates.length > 0) return { intent: "date_query", entities: dates };

  return { intent: "general_question" };
}

function parseReminder(text) {
  const regex = /(\d+)\s*(second[oi]|minut[oi]|or[ae])/i;
  const match = text.match(regex);
  if (!match) return null;
  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  let millis = 0;
  if (unit.startsWith("second")) millis = amount * 1000;
  else if (unit.startsWith("minut")) millis = amount * 60000;
  else if (unit.startsWith("or")) millis = amount * 3600000;

  return millis;
}

const jokes = ["Perché i programmatori odiano la natura? Perché ha troppi bug!", "Ho visto un'eccezione... era davvero fuori dal normale!","Perché i fantasmi non mentono mai? Perché si vede attraverso di loro!", "Cosa fa un gallo in una biblioteca? Cerca il “chicchiriciclo”!", "Dottore, ho un problema con la memoria... Da quanto tempo? Da quanto tempo cosa?", "Qual'é il colmo per un elettricista? Non fare scintille al primo appuntamento!", "Qual è il colmo per un panettiere? Avere gravi problemi di impasto.", "Perché l’arancia non va mai in vacanza? Perché si spremerebbe troppo!", "Cosa dice un muro a un altro muro? Ci vediamo all’angolo!", "Perché i pomodori non parlano? Perché si arrossiscono!", "Qual è il colmo per un giardiniere? Seminare zizzania."];
const advices = ["Ricorda di fare delle pause mentre lavori.", "Bevi acqua e mantieni una buona postura.", "Muovi il corpo almeno 30 minuti al giorno (anche una camminata va benissimo).", "Non saltare la colazione, ma non ingozzarti di zuccheri.", "Riduci gli schermi prima di dormire: la qualità del sonno migliorerà.", "Fermati prima di reagire di impulso: respira, pensa, poi agisci.", "Fai prima la cosa che meno hai voglia di fare.", "Dividi i compiti grandi in piccoli passi.", "Non multitaskare: fai una cosa per volta.", "Impara a dire di no senza sentirti in colpa.", "Ascolta davvero quando qualcuno parla.", "Dì “grazie” più spesso, anche per le piccole cose.", "Chiedi scusa subito, senza cercare scuse.", "Non interrompere chi si sta sfogando.", "Evita di parlare male degli altri: dice più su di te che su loro." ];
const motivations = ["Ogni giorno è un'opportunità per migliorare.", "Non arrenderti, anche le stelle impiegano tempo per brillare." ];
const quotes = ["La conoscenza parla, ma la saggezza ascolta. - Jimi Hendrix", "Sii il cambiamento che vuoi vedere nel mondo. - Gandhi"];
const facts = ["Gli alberi comunicano tra loro attraverso segnali chimici nel terreno!", "Le meduse esistono da prima dei dinosauri.", "Il giorno su Venere è più lungo del suo anno: ci mette più tempo a ruotare su sé stessa che a girare attorno al Sole.", "Ci sono più alberi sulla Terra che stelle nella Via Lattea: circa 3 trilioni di alberi contro 100-400 miliardi di stelle", "I polpi hanno tre cuori e il loro sangue è blu, non rosso.", "Gli squali sono più antichi dei dinosauri: esistono da oltre 400 milioni di anni.", "Le farfalle “assaggiano” con i piedi: hanno recettori gustativi nelle zampe.", "Il cervello umano consuma circa il 20% dell’energia totale del corpo, anche se pesa solo il 2%.", "Il tuo naso può distinguere oltre un trilione di odori.", "Le ossa, per peso, sono più resistenti dell’acciaio.", "Quando arrossisci, anche il tuo stomaco si arrossisce (a causa della dilatazione dei vasi sanguigni).", "Ricordare un evento può “modificarlo” nel cervello: ogni volta che lo recuperi, lo ricostruisci.", "Cleopatra visse più vicino all'invenzione dell'iPhone che alla costruzione delle piramidi.", "Napoleone era alto nella media per la sua epoca, non basso come si crede.", "Il ketchup era venduto come medicina nel XIX secolo.", "La Grande Muraglia Cinese non è visibile dalla Luna a occhio nudo, contrariamente alla leggenda.", "Shakespeare ha inventato oltre 1700 parole inglesi, tra cui “lonely” e “fashionable”.", "Esiste un colore che gli esseri umani non possono vedere, chiamato “rosso-verde” (non un mix, ma un colore “vietato” per il cervello umano).", "I pinguini propongono con un sasso: quando un maschio trova il “sasso perfetto”, lo offre alla femmina.", "Le mucche hanno migliori amiche e si stressano quando vengono separate.", "I bancomat sono più vecchi dei telefoni cellulari: il primo fu installato nel 1967.", "Il 90% delle informazioni che il cervello riceve è visiva, ma può essere facilmente ingannato da illusioni ottiche."];

async function sendMessage() {
  const input = inputField.value.trim();
  if (!input) return;

  sendButton.disabled = true;
  await addMessage("user", input);
  inputField.value = "";

  const analysis = analyzeInput(input);
  await showTypingAnimation();

  switch (analysis.intent) {
    case "greeting":
      await addMessage("bot", "Ciao! Come posso aiutarti oggi?", true);
      break;
    case "time":
      const now = new Date();
      await addMessage("bot", `🕒 Sono le ${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`, true);
      break;
    case "ask_name":
      await addMessage("bot", "Mi chiamo Alay-j1, ma puoi chiamarmi Alay. Sono il tuo assistente virtuale!", true);
      break;
    case "joke":
      await addMessage("bot", jokes[Math.floor(Math.random() * jokes.length)], true);
      break;
    case "advice":
      await addMessage("bot", advices[Math.floor(Math.random() * advices.length)], true);
      break;
    case "motivation":
      await addMessage("bot", motivations[Math.floor(Math.random() * motivations.length)], true);
      break;
    case "quote":
      await addMessage("bot", quotes[Math.floor(Math.random() * quotes.length)], true);
      break;
    case "interesting_fact":
      await addMessage("bot", facts[Math.floor(Math.random() * facts.length)], true);
      break;
    case "definition_query":
      const word = input.split(" ").pop();
      await addMessage("bot", `🔍 Cerco la definizione di \"${word}\"...`, true);
      const def = await getWikipediaSummary(word);
      await addMessage("bot", def, true);
      break;
    case "person_query":
    case "place_query":
      const entity = analysis.entities[0];
      await addMessage("bot", `🔎 Cerco informazioni su \"${entity}\"...`, true);
      const wiki = await getWikipediaSummary(entity);
      await addMessage("bot", wiki, true);
      break;
    case "date_query":
      await addMessage("bot", `📅 Hai menzionato: ${analysis.entities.join(", ")}. Vuoi sapere qualcosa in particolare?`, true);
      break;
    case "coin_flip":
      const flip = Math.random() < 0.5 ? "Testa" : "Croce";
      await addMessage("bot", `🪙 È uscito: ${flip}!`, true);
      break;
    case "timer":
      await addMessage("bot", "⏲️ Timer impostato per 10 secondi!", true);
      setTimeout(() => addMessage("bot", "⏰ Tempo scaduto!", true), 10000);
      break;
    case "random_number":
      const rand = Math.floor(Math.random() * 100) + 1;
      await addMessage("bot", `🎲 Il numero casuale generato è: ${rand}`, true);
      break;
    case "math_solver":
      try {
        const result = eval(input);
        await addMessage("bot", `🧮 Il risultato è: ${result}`, true);
      } catch {
        await addMessage("bot", "❌ Espressione matematica non valida.", true);
      }
      break;
    case "reminder":
      currentContext.reminderPending = true;
      await addMessage("bot", "📌 Dimmi cosa vuoi che ti ricordi e per quanto tempo (es. 10 minuti).", true);
      break;
    case "reminder_text":
      currentContext.reminderPending = false;
      currentContext.reminderText = analysis.text;
      const delay = parseReminder(analysis.text);
      if (delay) {
        await addMessage("bot", `📌 Promemoria impostato. Ti avviso tra ${Math.round(delay / 1000)} secondi.`, true);
        setTimeout(() => addMessage("bot", `🔔 È ora! Questo è il tuo promemoria: ${currentContext.reminderText}`), delay);
      } else {
        await addMessage("bot", "❌ Non ho capito per quanto tempo vuoi il promemoria. Usa secondi, minuti o ore.", true);
      }
      break;
    case "general_question":
    default:
      const filteredWords = input.toLowerCase().split(/\s+/).filter(w => !stopWords.includes(w));
      if (!filteredWords.length) {
        await addMessage("bot", "🤖 La tua domanda è troppo generica, puoi essere più specifico?", true);
        break;
      }
      const results = fuse.search(input);
      if (results.length > 0) {
        const item = results[0].item;
        const key = item.question.toLowerCase();
        const answers = item.answers || [item.answer];
        if (!previousQuestions[key]) previousQuestions[key] = 0;
        const index = previousQuestions[key] % answers.length;
        previousQuestions[key]++;
        await addMessage("bot", answers[index], true);
        if (item.relatedQuestions) addRelatedQuestions(item.relatedQuestions);
      } else {
        await addMessage("bot", "🤖 Non ho trovato una risposta precisa. Cerco su Wikipedia...", true);
        const wikiAnswer = await getWikipediaSummary(input);
        await addMessage("bot", wikiAnswer, true);
      }
      break;
  }

  contextHistory.push({ question: input, intent: analysis.intent });
  if (contextHistory.length > 10) contextHistory.shift();

  sendButton.disabled = false;
}

sendButton.addEventListener("click", sendMessage);
inputField.addEventListener("keydown", e => { if (e.key === "Enter") sendMessage(); });
