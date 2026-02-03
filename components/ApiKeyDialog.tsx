
import React from 'react';

interface ApiKeyDialogProps {
  onSuccess: () => void;
}

export const ApiKeyDialog: React.FC<ApiKeyDialogProps> = ({ onSuccess }) => {
  const handleSelectKey = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        // @ts-ignore
        await window.aistudio.openSelectKey();
        onSuccess();
      } catch (err) {
        console.error("金鑰選擇失敗", err);
        // 如果選擇失敗，但環境變數中已有金鑰，仍嘗試進入
        if (process.env.API_KEY) onSuccess();
      }
    } else {
      console.warn("環境中未偵測到 aistudio API，嘗試直接載入。");
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]/90 backdrop-blur-xl">
      <div className="glass max-w-md w-full p-10 rounded-[2.5rem] text-center space-y-8 border-indigo-500/30">
        <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto rotate-12 shadow-2xl shadow-indigo-500/20">
          <svg className="w-12 h-12 text-white -rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tighter italic">初始化影視系統</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            為了啟動 Veo 高階影片生成引擎，<br/>您需要選取具備付費權限的 API 金鑰。
          </p>
        </div>
        <button
          onClick={handleSelectKey}
          className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all active:scale-95 shadow-xl shadow-indigo-600/30 text-lg"
        >
          選取 API 金鑰
        </button>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">
          了解計費細節：<a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-indigo-400 underline underline-offset-4">Google Cloud Billing</a>
        </p>
      </div>
    </div>
  );
};
