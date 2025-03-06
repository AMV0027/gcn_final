import React, { useState } from 'react';
import { HiMiniSpeakerWave, HiMiniSpeakerXMark } from "react-icons/hi2";

const TextToSpeech = ({ text }) => {
    const [isSpeaking, setIsSpeaking] = useState(false);

    const toggleSpeech = () => {
        if ('speechSynthesis' in window) {
            if (isSpeaking) {
                window.speechSynthesis.cancel(); // Stop speaking
                setIsSpeaking(false);
            } else {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.onend = () => setIsSpeaking(false); // Reset state when speech ends
                window.speechSynthesis.speak(utterance);
                setIsSpeaking(true);
            }
        } else {
            alert('Sorry, your browser does not support text-to-speech.');
        }
    };

    return (
        <button onClick={toggleSpeech} className="text-gray-400 p-2 hover:text-white">
            {isSpeaking ? <HiMiniSpeakerWave /> : <HiMiniSpeakerXMark />}
        </button>
    );
};

export default TextToSpeech;
