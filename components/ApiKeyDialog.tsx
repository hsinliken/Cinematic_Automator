
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
      console.error("金鑰選擇失敗", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="glass max-w-md w-full p-8 rounded-[2rem] text-center space-y-6">
        <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold">需要 API 金鑰</h2>
        <p className="text-gray-400 text-sm">
          為了使用 Veo 模型生成影片，您必須選擇一個來自付費專案的 API 金鑰。
        </p>
        <button
          onClick={handleSelectKey}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
        >
          選擇 API 金鑰
        </button>
        <p className="text-xs text-gray-500">
          了解更多關於 <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-indigo-400 underline">Gemini API 計費方式</a>。
        </p>
      </div>
    </div>
  );
};
