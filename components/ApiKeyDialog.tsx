
import React from 'react';

interface ApiKeyDialogProps {
  onSuccess: () => void;
}

export const ApiKeyDialog: React.FC<ApiKeyDialogProps> = ({ onSuccess }) => {
  const handleSelectKey = async () => {
    try {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      onSuccess();
    } catch (err) {
      console.error("Key selection failed", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="glass max-w-md w-full p-8 rounded-2xl text-center space-y-6">
        <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold">API Key Required</h2>
        <p className="text-gray-400 text-sm">
          To generate videos using the Veo model, you must select an API key from a paid project.
        </p>
        <button
          onClick={handleSelectKey}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
        >
          Select API Key
        </button>
        <p className="text-xs text-gray-500">
          More info about <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-indigo-400 underline">Gemini API billing</a>.
        </p>
      </div>
    </div>
  );
};
