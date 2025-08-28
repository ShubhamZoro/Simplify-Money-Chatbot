import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./index.css";

function App() {
  const [text, settext] = useState("");
  const [displaytext, setdisplaytext] = useState([]);
  const [listening, setListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const lastSpokenIndex = useRef(-1);

  const recognitionRef = useRef(null);
  const listeningRef = useRef(false);
  const lastInputMethodRef = useRef("text");

  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

  const [voices, setVoices] = useState([]);
  useEffect(() => {
    if (!synth) return;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.onvoiceschanged = load;
    return () => { if (synth) synth.onvoiceschanged = null; };
  }, [synth]);

  function pickVoiceForLang(langCode = "en") {
    if (!voices?.length) return null;
    const target = langCode === "hi" ? "hi-IN" : "en-IN";

   
    let v = voices.find(v => v.lang === target);
    if (v) return v;

    v = voices.find(v => v.lang?.toLowerCase().startsWith(langCode));
    if (v) return v;

    const fb = langCode === "hi" ? ["hi", "en-IN", "en-US"] : ["en-IN", "en-US", "en-GB"];
    for (const code of fb) {
      v = voices.find(voice => voice.lang === code)
        || voices.find(voice => voice.lang?.toLowerCase().startsWith(code.split("-")[0].toLowerCase()));
      if (v) return v;
    }
    return voices[0] || null;
  }
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang = "en-IN";          // default; you could infer from text if desired
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (event) => {
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalChunk += res[0].transcript;
      }
      if (finalChunk) {
        const cleaned = finalChunk.replace(/\s+/g, " ").trim();
        settext(prev => (prev ? `${prev} ${cleaned}` : cleaned));
        lastInputMethodRef.current = "voice";
      }
    };

    rec.onerror = () => {
      setListening(false);
      listeningRef.current = false;
    };

    rec.onend = () => {
      if (listeningRef.current) {
        try { rec.start(); } catch {}
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = rec;
    return () => { try { rec.stop(); } catch {} };
  }, []);

  useEffect(() => { listeningRef.current = listening; }, [listening]);

  // Cleanup for TTS + SR (unchanged)
  useEffect(() => {
    const rec = recognitionRef.current;

    if (synth && synth.speaking) {
      try { synth.cancel(); } catch {}
    }

    const handleBeforeUnload = () => {
      try { if (synth) synth.cancel(); } catch {}
      try { if (rec) rec.stop(); } catch {}
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      try { if (synth) synth.cancel(); } catch {}
      try { if (rec) rec.stop(); } catch {}
    };
  }, [synth]);

  function handlechange(e) {
    settext(e.target.value);
    lastInputMethodRef.current = "text";
  }

  // --- FETCH that returns { message, lang } ---
  async function Response(promptText) {
    const res = await fetch(
      `http://127.0.0.1:5000/query?q=${encodeURIComponent(promptText)}`
    );
    if (!res.ok) throw new Error("Network error");
    const data = await res.json();
    // Expecting: { message: string, lang: "hi" | "en" }
    return data;
  }

  function toggleListening() {
    const rec = recognitionRef.current;
    if (!rec) {
      alert("Speech Recognition not supported in this browser");
      return;
    }
    if (!listening) {
      setListening(true);
      listeningRef.current = true;
      try { rec.start(); } catch {}
    } else {
      setListening(false);
      listeningRef.current = false;
      try { rec.stop(); } catch {}
    }
  }

  function speak(index, textToSpeak, langCode = "en") {
    if (!synth) {
      alert("Text-to-Speech not supported in this browser");
      return;
    }

    if (speakingIndex === index && synth.speaking) {
 
      setTimeout(() => {
        try { synth.cancel(); } catch {}
        setSpeakingIndex(null);
      }, 200); 
      return;
    }
  
    if (synth.speaking) synth.cancel();
  
    const utter = new SpeechSynthesisUtterance(textToSpeak);
    const v = pickVoiceForLang(langCode);
    if (v) utter.voice = v;
    utter.lang = v?.lang || (langCode === "hi" ? "hi-IN" : "en-IN");
    utter.rate = 1;
    utter.pitch = 1;
  
    utter.onstart = () => setSpeakingIndex(index);
    utter.onend = () => setSpeakingIndex(null);
    utter.onerror = () => setSpeakingIndex(null);
  
    synth.speak(utter);
  }
  

  function toggleSpeak(index, textToSpeak) {
    const langCode = displaytext[index]?.lang || "en";
    speak(index, textToSpeak, langCode);
  }

  function dothis() {
    const q = text.trim();
    if (!q) return;

    const fromVoice = lastInputMethodRef.current === "voice" || listeningRef.current;

    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });

    setdisplaytext(prev => [
      ...prev,
      { user: q, bot: null, lang: null, status: "pending", shouldAutoSpeak: fromVoice },
    ]);

    settext("");

    if (listening) {
      const rec = recognitionRef.current;
      try { rec.stop(); } catch {}
      setListening(false);
      listeningRef.current = false;
    }

    Response(q)
      .then(({ message, lang }) => {
        setdisplaytext(prev => {
          const next = [...prev];
          const i = next.length - 1;
          if (i >= 0 && next[i]) {
            next[i] = { ...next[i], bot: message, lang: lang || "en", status: "done" };
          }
          return next;
        });
      })
      .catch(err => {
        console.error(err);
        setdisplaytext(prev => {
          const next = [...prev];
          const i = next.length - 1;
          const errorText = "⚠️ Sorry—couldn’t fetch a reply. Please try again.";
          if (i >= 0 && next[i]) {
            next[i] = { ...next[i], bot: errorText, lang: "en", status: "error" };
          }
          return next;
        });
      });
  }

  useEffect(() => {
    if (!synth) return;
    const i = displaytext.length - 1;
    if (i < 0) return;

    const latest = displaytext[i];
    if (!latest?.bot) return;
    if (!latest?.shouldAutoSpeak) return;
    if (lastSpokenIndex.current === i) return;

    const langCode = latest.lang || "en";
    speak(i, latest.bot, langCode); 
    lastSpokenIndex.current = i;
  }, [displaytext, synth]);

  return (
    <div className="container chat-app">
      <div className="messages">
        {displaytext.map((item, i) => (
          <li key={i} className="message">
            <div className="bubble user">{item.user}</div>

            <div className="bot-row">
              <div className={`bubble bot ${item.status || ""}`}>
                <ReactMarkdown>{item.bot ?? "Thinking…"}</ReactMarkdown>
              </div>
              {item.bot && (
                <button
                  className={`tts-btn ${speakingIndex === i ? "speaking" : ""}`}
                  onClick={() => toggleSpeak(i, item.bot)}
                  aria-label={speakingIndex === i ? "Stop reading" : "Read this message"}
                  title={speakingIndex === i ? "Stop reading" : "Read this message"}
                >
                  {speakingIndex === i ? "🔇 Stop" : "🔊 Read"}
                </button>
              )}
            </div>
          </li>
        ))}
      </div>

      <div className="composer">
        <input
          className="chat-input"
          type="text"
          value={text}
          onChange={handlechange}
          placeholder="Type or dictate a message…"
          onKeyDown={(e) => e.key === "Enter" && dothis()}
          aria-label="Message input"
        />
        <button
          className={`voice-btn ${listening ? "listening" : ""}`}
          onClick={toggleListening}
          aria-label={listening ? "Stop dictation" : "Start dictation"}
          title={listening ? "Stop dictation" : "Start dictation"}
        >
          {listening ? "🛑" : "🎤"}
        </button>
        <button className="send-btn" onClick={dothis} aria-label="Send message">
          ➡️
        </button>
      </div>
    </div>
  );
}

export default App;
