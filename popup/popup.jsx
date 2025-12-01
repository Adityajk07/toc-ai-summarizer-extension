import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

//
// ★★★★★ CONFIDENCE BAR COMPONENT ★★★★★
//
const ConfidenceBar = () => {
    const [confidence, setConfidence] = useState(null);

    useEffect(() => {
        chrome.storage.local.get(['currentTOCConfidence'], (items) => {
            const val = items.currentTOCConfidence;
            if (typeof val === 'number') {
                setConfidence(Math.min(1, Math.max(0, val)));
            } else {
                setConfidence(0);
            }
        });
    }, []);

    if (confidence === null) return null; // hidden until known
    const pct = Math.round(confidence * 100);

    // color transitions based on score
    let barColor =
        confidence >= 0.75
            ? 'bg-gradient-to-r from-green-400 to-cyan-500'
            : confidence >= 0.4
            ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
            : 'bg-gradient-to-r from-red-500 to-red-700';

    return (
        <div className="w-full mt-5 mb-2">
            <div className="flex justify-between mb-1">
                <span className="text-gray-300 font-medium tracking-wide">Confidence Score</span>
                <span className="text-gray-400 text-sm">{pct}%</span>
            </div>

            <div className="w-full bg-gray-800 rounded-full h-3 shadow-inner overflow-hidden border border-gray-700">
                <div
                    className={`${barColor} h-3 rounded-full transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                ></div>
            </div>

            <p className="text-gray-500 text-xs mt-1">
                Indicates agreement between Gemini & OpenAI’s interpretation.
            </p>
        </div>
    );
};


//
// ★★★★★ POPUP UI ★★★★★
//
const App = () => {
    const [summary, setSummary] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const summarizeTerms = () => {
        setLoading(true);
        setSummary('');
        setError('');

        chrome.runtime.sendMessage({ action: 'summarizeCurrentPage' }, (response) => {
            if (response.success) {
                setSummary(response.summary);
            } else {
                setError(response.error || 'An unknown error occurred.');
            }
            setLoading(false);
        });
    };

    return (
        <div className="flex flex-col items-center p-6 bg-gradient-to-br from-gray-950 to-black rounded-xl shadow-2xl w-[380px] min-h-[250px] mx-auto my-0"
             style={{ fontFamily: "'Outfit', sans-serif" }}>

            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 mb-6 drop-shadow-[0_0_8px_rgba(0,192,255,0.7)]">
                TOC Summarizer AI
            </h1>

            <button
                onClick={summarizeTerms}
                disabled={loading}
                className="relative w-full px-8 py-4 bg-gradient-to-r from-blue-800 to-purple-800 text-white font-semibold text-lg rounded-xl shadow-lg
                           hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-75
                           transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed
                           overflow-hidden group
                           shadow-[0_0_15px_rgba(0,192,255,0.2)] hover:drop-shadow-[0_0_20px_rgba(0,192,255,0.8)]
                           active:scale-[0.98] active:shadow-[inset_0_0_15px_rgba(0,192,255,0.5)]"
                style={{ textShadow: '0 0 5px rgba(255,255,255,0.5)' }}
            >
                {loading ? (
                    <span className="flex items-center justify-center">
                        <svg className="animate-spin h-6 w-6 mr-3 text-white" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Summarizing...
                    </span>
                ) : (
                    'Summarize Terms & Conditions'
                )}
            </button>

            {/* ★ Insert the confidence bar HERE, only shows when summary exists ★ */}
            {summary && <ConfidenceBar />}

            <div className="mt-8 w-full max-h-96 overflow-y-auto bg-gray-900 p-5 rounded-xl border border-blue-800/50 shadow-inner-lg text-white text-base leading-relaxed"
                 style={{ boxShadow: 'inset 0 0 15px rgba(0,255,255,0.1), 0 0 10px rgba(0,255,255,0.1)' }}>

                {loading && (
                    <p className="text-center text-blue-400 flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5 mr-3 inline-block" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Getting summary...
                    </p>
                )}

                {error && <p className="text-red-500 text-sm">{error}</p>}

                {summary && (
                    <div>
                        <h3 className="font-bold text-xl mb-3 text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-300 drop-shadow-[0_0_5px_rgba(0,255,255,0.5)]">
                            Summary:
                        </h3>
                        <p className="text-gray-200 whitespace-pre-wrap">{summary}</p>
                    </div>
                )}

                {!loading && !error && !summary && (
                    <p className="text-gray-400 text-center">
                        Disclaimer:
This AI summary is provided for convenience only. It is not a substitute for reading the full Terms & Conditions. It is not legal advice, and the developer of this extension is not responsible for any decisions made based on this summary.
Always review the full Terms & Conditions yourself for complete and accurate information.
                    </p>
                )}
            </div>
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
} else {
    console.error("Root element not found.");
}
