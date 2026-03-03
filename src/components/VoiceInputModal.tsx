import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Mic, StopCircle } from 'lucide-react';

export const VoiceInputModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onTranscriptComplete: (transcript: string) => void;
  isAiMode: boolean;
  onToggleAiMode: (isAi: boolean) => void;
}> = ({ isOpen, onClose, onTranscriptComplete, isAiMode, onToggleAiMode }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      setTranscript('');
      startListening();
    } else {
      stopListening();
    }
    return () => stopListening();
  }, [isOpen]);

  const startListening = () => {
    if (typeof window === 'undefined') return;
    
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('您的瀏覽器不支援語音輸入功能。');
      onClose();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'cmn-Hant-TW'; // Taiwan Traditional Chinese
    recognition.continuous = false; // Auto-stop after one sentence
    recognition.interimResults = true; // Show real-time results

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      setTranscript(finalTranscript || interimTranscript);
      
      if (finalTranscript) {
        onTranscriptComplete(finalTranscript);
        onClose();
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[200] flex flex-col justify-end backdrop-blur-sm">
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-white rounded-t-[32px] p-8 pb-12 shadow-2xl flex flex-col items-center"
          >
            <div className="w-full flex justify-between items-center mb-4">
               <h3 className="font-extrabold text-slate-800 text-lg">語音輸入</h3>
               <button onClick={onClose} className="p-2 rounded-full bg-slate-100 text-slate-500"><X className="w-5 h-5"/></button>
            </div>

            {/* AI Mode Toggle */}
            <div className="flex items-center gap-3 mb-8 bg-slate-50 p-2 rounded-full border border-slate-100">
                <button 
                    onClick={() => onToggleAiMode(false)}
                    className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${!isAiMode ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    🚀 極速模式
                </button>
                <button 
                    onClick={() => onToggleAiMode(true)}
                    className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${isAiMode ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    🧠 AI 智能模式
                </button>
            </div>

            <div className="relative mb-8 flex items-center justify-center">
               {/* Breathing Animation Circles */}
               {isListening && (
                 <>
                   <motion.div 
                     animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                     transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                     className="absolute w-24 h-24 rounded-full bg-blue-100"
                   />
                   <motion.div 
                     animate={{ scale: [1, 1.2, 1], opacity: [0.8, 0.2, 0.8] }}
                     transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                     className="absolute w-20 h-20 rounded-full bg-blue-200"
                   />
                 </>
               )}
               
               <div className={`w-16 h-16 rounded-full flex items-center justify-center relative z-10 shadow-lg transition-colors ${isListening ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                 <Mic className="w-8 h-8" />
               </div>
            </div>

            <p className="text-xl font-bold text-slate-700 text-center min-h-[3rem] px-4 break-words w-full">
              {transcript || (isListening ? "請說話..." : "準備中...")}
            </p>
            
            <p className="text-xs text-slate-400 mt-4 font-medium">
              例如：「明天幫阿明麵攤送 20 斤油麵」
            </p>
            
            {isListening && (
                <button onClick={stopListening} className="mt-6 flex items-center gap-2 px-6 py-3 bg-rose-50 text-rose-500 rounded-full font-bold text-sm hover:bg-rose-100 transition-colors">
                    <StopCircle className="w-4 h-4" /> 停止錄音
                </button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
