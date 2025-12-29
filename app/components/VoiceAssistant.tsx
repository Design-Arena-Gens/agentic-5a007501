"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const RECOGNITION_ERROR =
  "Speech recognition is unavailable. Please use a Chromium-based browser.";

export default function VoiceAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const speechAvailable = useMemo(() => {
    if (typeof window === "undefined") return false;
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    };
    const recognitionCtor =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    return Boolean(recognitionCtor);
  }, []);

  useEffect(() => {
    if (!speechAvailable) {
      setRecognitionError(RECOGNITION_ERROR);
      return;
    }

    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    };

    const recognitionCtor =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!recognitionCtor) return;

    const recognition = new recognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setPendingText(transcript.trim());
    };

    recognition.onend = () => {
      setIsListening(false);
      if (!pendingText.trim()) return;
      void submitQuery(pendingText.trim());
      setPendingText("");
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setRecognitionError(event.error === "not-allowed" ? "Microphone access denied. Please enable it in your browser." : `Recognition error: ${event.error}`);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechAvailable]);

  const speakText = useCallback((text: string) => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.01;
    utterance.pitch = 1.02;
    utterance.lang = "en-US";
    synth.cancel();
    synth.speak(utterance);
  }, []);

  const submitQuery = useCallback(
    async (content: string) => {
      setIsProcessing(true);
      const userMessage: Message = {
        role: "user",
        content,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      try {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: content,
            history: messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Something went wrong");
        }

        const data: { reply: string } = await response.json();

        const assistantMessage: Message = {
          role: "assistant",
          content: data.reply,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        speakText(assistantMessage.content);
      } catch (error) {
        const assistantMessage: Message = {
          role: "assistant",
          content:
            error instanceof Error
              ? `I ran into a problem: ${error.message}`
              : "I ran into an unexpected problem processing that.",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } finally {
        setIsProcessing(false);
      }
    },
    [messages, speakText]
  );

  const handleMicPress = useCallback(() => {
    if (!speechAvailable) {
      setRecognitionError(RECOGNITION_ERROR);
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }

    setRecognitionError(null);
    setPendingText("");
    try {
      recognition.start();
      setIsListening(true);
    } catch (error) {
      setRecognitionError(
        error instanceof Error ? error.message : "Unable to access microphone"
      );
    }
  }, [isListening, speechAvailable]);

  const handleReset = useCallback(() => {
    controllerRef.current?.abort();
    setMessages([]);
    setPendingText("");
    setIsProcessing(false);
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData = new FormData(form);
      const text = (formData.get("prompt") as string).trim();
      if (!text) return;
      form.reset();
      await submitQuery(text);
    },
    [submitQuery]
  );

  return (
    <div className="assistant-shell">
      <div className="header">
        <div>
          <h1>VoiceSphere</h1>
          <p>Your AI voice companion, always ready to help.</p>
        </div>
        <button className="reset" onClick={handleReset} disabled={!messages.length && !pendingText}>
          Reset
        </button>
      </div>

      <div className="transcript">
        {messages.length === 0 && !pendingText ? (
          <div className="placeholder">
            <p>Tap the glowing orb or type a question to begin.</p>
          </div>
        ) : (
          <ul>
            {messages.map((message) => (
              <li key={message.timestamp} className={message.role}>
                <span className="role">{message.role === "assistant" ? "VoiceSphere" : "You"}</span>
                <p>{message.content}</p>
              </li>
            ))}
            {pendingText && (
              <li className="user pending">
                <span className="role">Listening…</span>
                <p>{pendingText}</p>
              </li>
            )}
            {isProcessing && (
              <li className="assistant pending">
                <span className="role">VoiceSphere</span>
                <p>Thinking…</p>
              </li>
            )}
          </ul>
        )}
      </div>

      {recognitionError && <div className="error">{recognitionError}</div>}

      <div className="controls">
        <button
          type="button"
          className={`mic-button ${isListening ? "listening" : ""}`}
          onClick={handleMicPress}
        >
          <span className="pulse" />
          {isListening ? "Listening" : "Speak"}
        </button>
        <form className="prompt-form" onSubmit={handleSubmit}>
          <input
            name="prompt"
            type="text"
            placeholder="Ask anything…"
            aria-label="Ask anything"
            disabled={isProcessing}
          />
          <button type="submit" disabled={isProcessing}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
