import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client'; // Explicitly import createRoot for React 18

// Define the App component for the extension popup UI
const App = () => {
    const [summary, setSummary] = useState(''); // State to store the summarized text
    const [loading, setLoading] = useState(false); // State to indicate loading status
    const [error, setError] = useState(''); // State to store any error messages

    // Removed: useEffect to load the summary from storage on popup open
    // Removed: storageChangeListener and its cleanup

    // Function to handle the manual summarization request
    const summarizeTerms = () => {
        setLoading(true); // Set loading to true when summarization starts
        setSummary(''); // Clear previous summary
        setError(''); // Clear previous errors

        // Send a message to the background script to initiate summarization
        chrome.runtime.sendMessage({ action: 'summarizeCurrentPage' }, (response) => {
            if (response.success) {
                setSummary(response.summary); // Set the summary if successful
            } else {
                setError(response.error || 'An unknown error occurred during summarization.'); // Set error message
            }
            setLoading(false); // Set loading to false when summarization is complete
        });
    };

    return (
        // Main container with dark gradient background and futuristic font
        <div className="flex flex-col items-center p-6 bg-gradient-to-br from-gray-950 to-black rounded-xl shadow-2xl w-[380px] min-h-[250px] mx-auto my-0"
             style={{ fontFamily: "'Outfit', sans-serif" }}>
            
            {/* Title with glowing text effect */}
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 mb-6 drop-shadow-[0_0_8px_rgba(0,192,255,0.7)]">
                TOC Summarizer AI
            </h1>

            {/* Button with neon glow and gradient */}
            <button
                onClick={summarizeTerms}
                disabled={loading} // Disable button when loading
                className="relative w-full px-8 py-4 bg-gradient-to-r from-blue-800 to-purple-800 text-white font-semibold text-lg rounded-xl shadow-lg
                           hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-75
                           transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed
                           overflow-hidden group
                           shadow-[0_0_15px_rgba(0,192,255,0.2)] hover:drop-shadow-[0_0_20px_rgba(0,192,255,0.8)]
                           active:scale-[0.98] active:shadow-[inset_0_0_15px_rgba(0,192,255,0.5)]"
                style={{ textShadow: '0 0 5px rgba(255,255,255,0.5)' }}
            >
                {/* Subtle glowing border effect */}
                <span className="absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-blue-400 group-hover:animate-pulse-slow"></span>
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

            {/* Display area for loading, error, or summary */}
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
                        Click 'Summarize Terms & Conditions' to get a summary of this page.
                    </p>
                )}
            </div>
        </div>
    );
};

// Mount the App component to the root div using createRoot
const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
} else {
    console.error("Root element not found.");
}

// No default export needed for createRoot setup
// export default App;
