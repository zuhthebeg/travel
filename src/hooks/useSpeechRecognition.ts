import { useState, useEffect, useRef } from 'react';

// Local type definitions for Web Speech API to avoid global conflicts
interface LocalSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((this: LocalSpeechRecognition, ev: LocalSpeechRecognitionEvent) => any) | null;
  onerror: ((this: LocalSpeechRecognition, ev: LocalSpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: LocalSpeechRecognition, ev: Event) => any) | null;
  onstart: ((this: LocalSpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface LocalSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: LocalSpeechRecognitionResultList;
}

interface LocalSpeechRecognitionErrorEvent extends Event {
  readonly error: string; // Simplified error type
  readonly message: string;
}

interface LocalSpeechRecognitionResultList {
  [index: number]: LocalSpeechRecognitionResult;
  readonly length: number;
  item(index: number): LocalSpeechRecognitionResult;
}

interface LocalSpeechRecognitionResult {
  [index: number]: LocalSpeechRecognitionAlternative;
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): LocalSpeechRecognitionAlternative;
}

interface LocalSpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}


interface SpeechRecognitionHook {
  transcript: string;
  isListening: boolean;
  error: string;
  startListening: () => void;
  stopListening: () => void;
  browserSupportsSpeechRecognition: boolean;
  setLanguage: (lang: string) => void;
}

const useSpeechRecognition = (initialLang: string = 'ko-KR'): SpeechRecognitionHook => {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState(initialLang);

  const recognitionRef = useRef<LocalSpeechRecognition | null>(null);

  useEffect(() => {
    // Check for browser compatibility
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech Recognition API is not supported by this browser.');
      return;
    }

    // Initialize SpeechRecognition object
    const recognition: LocalSpeechRecognition = new SpeechRecognition();
    recognition.continuous = false; // Listen for a single utterance
    recognition.interimResults = true; // Get interim results as they come
    recognition.lang = language; // Set language dynamically

    // Event handler for when recognition starts
    recognition.onstart = () => {
      setIsListening(true);
      setError(''); // Clear any previous errors
      console.log('Speech recognition started');
    };

    // Event handler for when a result is received
    recognition.onresult = (event: LocalSpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      // Loop through results to get both interim and final transcripts
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart;
        } else {
          interimTranscript += transcriptPart;
        }
      }
      // Update transcript state with final or interim result
      setTranscript(finalTranscript || interimTranscript);
    };

    // Event handler for errors
    recognition.onerror = (event: LocalSpeechRecognitionErrorEvent) => {
      setError(event.error);
      setIsListening(false);
      console.error('Speech recognition error', event.error);
    };

    // Event handler for when recognition ends
    recognition.onend = () => {
      setIsListening(false);
      console.log('Speech recognition ended');
    };

    // Store the recognition object in a ref
    recognitionRef.current = recognition;

    // Cleanup function to stop recognition when component unmounts
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [language]); // Re-initialize when language changes

  // Function to start listening
  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setTranscript(''); // Clear previous transcript before starting
      recognitionRef.current.start();
    }
  };

  // Function to stop listening
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  return {
    transcript,
    isListening,
    error,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition: !!recognitionRef.current, // Indicate if API is supported
    setLanguage,
  };
};

export default useSpeechRecognition;
