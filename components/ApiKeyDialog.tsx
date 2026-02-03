
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
        // 直接標記成功，給予系統注入 API_KEY 的緩衝時間
        onSuccess();
      } catch (err) {
        console.error("金鑰選擇失敗", err);
        // 如果選擇失敗，但環境變數中已有金鑰，仍嘗試進入
        if (process.env.API_KEY) {
          onSuccess();
        } else {
          alert("金鑰選取未成功，請重試。");
        }
      }
    } else {
      console.warn("環境中未偵測到 aistudio API，嘗試直接載入。");
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]/95 backdrop-blur-2xl">
      <div className="glass max-w-md w-full p-12 rounded-[3rem] text-center space-y-10 border-indigo-500/30 shadow-[0_0_100px_rgba(79,70,229,0.2)]">
        <div className="w-28 h-28 bg-gradient-to-br from-indigo-500 to-purple-700 rounded-[2rem] flex items-center justify-center mx-auto rotate-12 shadow-2xl">
          <svg className="w-14 h-14 text-white -rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-black tracking-tighter italic">初始化虛擬片廠</h2>
          <p className="text-gray-400 text-sm leading-relaxed px-4">
            Veo 高階影音引擎需要付費權限。<br/>請從對話框選取具備有效帳單的金鑰。
          </p>
        </div>
        <button
          onClick={handleSelectKey}
          className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all active:scale-95 shadow-2xl shadow-indigo-600/40 text-xl"
        >
          選取 API 金鑰
        </button>
        <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em]">
          Powered by Google Cloud AI
        </p>
      </div>
    </div>
  );
};
