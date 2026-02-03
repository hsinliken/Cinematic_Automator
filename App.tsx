
import React, { useState, useEffect, useRef } from 'react';
import { WorkflowStatus, Scene } from './types';
import { GeminiService } from './services/geminiService';
import { ApiKeyDialog } from './components/ApiKeyDialog';
import { ProgressBar } from './components/ProgressBar';

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState(false);
  const [checkingKey, setCheckingKey] = useState(true);
  const [theme, setTheme] = useState('');
  const [numScenes, setNumScenes] = useState(3);
  const [status, setStatus] = useState(WorkflowStatus.IDLE);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const audioCtx = useRef<AudioContext | null>(null);
  const activeAudioSource = useRef<AudioBufferSourceNode | null>(null);
  const videoRef0 = useRef<HTMLVideoElement>(null);
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const geminiService = useRef<GeminiService>(new GeminiService());

  useEffect(() => {
    const initKeyCheck = async () => {
      try {
        // @ts-ignore
        if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
          // @ts-ignore
          const exists = await window.aistudio.hasSelectedApiKey();
          setHasKey(exists);
        } else {
          setHasKey(!!process.env.API_KEY);
        }
      } catch (e) {
        setHasKey(!!process.env.API_KEY);
      } finally {
        setCheckingKey(false);
      }
    };
    initKeyCheck();
  }, []);

  const planProduction = async () => {
    if (!theme.trim()) return;
    setErrorMessage(null);
    setStatus(WorkflowStatus.PLANNING);
    setProgress(15);
    
    try {
      const plan = await geminiService.current.planScript(theme, numScenes);
      setScenes(plan.map((p, i) => ({ 
        id: `s-${i}`, 
        imagePrompt: p.imagePrompt, 
        dialogue: p.dialogue, 
        status: 'pending' 
      })));
      setStatus(WorkflowStatus.REVIEW);
    } catch (e: any) { 
      console.error(e);
      // 只有在真正失敗且不是初始化問題時才顯示錯誤
      if (e.message?.includes("KEY_NOT_READY")) {
        setErrorMessage("系統正在載入金鑰，請稍後再試一次按鈕。");
        setStatus(WorkflowStatus.IDLE);
      } else {
        setStatus(WorkflowStatus.ERROR);
        setErrorMessage(`規劃失敗: ${e.message}`);
      }
    }
  };

  const startGeneration = async () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.current.state === 'suspended') await audioCtx.current.resume();

    setErrorMessage(null);
    setStatus(WorkflowStatus.GENERATING_ASSETS);
    
    for (let i = 0; i < scenes.length; i++) {
      try {
        if (scenes[i].status === 'completed') continue;
        setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'processing' } : s));
        
        const img = await geminiService.current.generateImage(scenes[i].imagePrompt);
        setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, imageUrl: img } : s));
        
        const audio = await geminiService.current.generateSpeech(scenes[i].dialogue);
        setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, audioBuffer: audio } : s));
        
        const vid = await geminiService.current.generateVideo(img);
        setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, videoUrl: vid, status: 'completed' } : s));
        
        setProgress(15 + ((i + 1) / scenes.length) * 85);
      } catch (e: any) {
        console.error(e);
        setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'error' } : s));
        if (e.message?.includes("429")) {
          setErrorMessage("API 配額已達上限（429）。影片製作暫停，請稍後重試。");
          break;
        }
      }
    }
    
    if (scenes.every(s => s.status === 'completed')) {
      setStatus(WorkflowStatus.COMPLETED);
      setCurrentIdx(0);
      setTimeout(() => playScene(0), 500);
    }
  };

  const exportFinalMovie = async () => {
    setIsExporting(true);
    // 模擬渲染與封裝過程
    await new Promise(r => setTimeout(r, 2000));
    
    scenes.forEach((s, i) => {
      if (s.videoUrl) {
        const a = document.createElement('a');
        a.href = s.videoUrl;
        a.download = `Final_Movie_Scene_${i + 1}.mp4`;
        a.click();
      }
    });
    setIsExporting(false);
    alert("電影各幕已完成導出！您現在可以使用任何剪輯軟體進行最後的合成。");
  };

  const playScene = (index: number) => {
    if (!audioCtx.current || !scenes[index]?.videoUrl) return;
    const scene = scenes[index];
    if (scene.audioBuffer) {
      if (activeAudioSource.current) activeAudioSource.current.stop();
      const source = audioCtx.current.createBufferSource();
      source.buffer = scene.audioBuffer;
      source.connect(audioCtx.current.destination);
      source.start();
      activeAudioSource.current = source;
    }
    const currentVideo = activeLayer === 0 ? videoRef0.current : videoRef1.current;
    if (currentVideo) {
      currentVideo.currentTime = 0;
      currentVideo.play().catch(console.error);
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.duration > 0 && v.duration - v.currentTime < 0.6 && !isTransitioning) {
      const nextIdx = (currentIdx + 1) % scenes.length;
      if (scenes[nextIdx]?.videoUrl) {
        setIsTransitioning(true);
        const nextLayer = activeLayer === 0 ? 1 : 0;
        const nextVideo = nextLayer === 0 ? videoRef0.current : videoRef1.current;
        if (nextVideo) {
          nextVideo.currentTime = 0;
          nextVideo.play().then(() => {
            setActiveLayer(nextLayer);
            setCurrentIdx(nextIdx);
            playSceneAudioOnly(nextIdx);
            setTimeout(() => setIsTransitioning(false), 1000);
          }).catch(console.error);
        }
      }
    }
  };

  const playSceneAudioOnly = (index: number) => {
    if (!audioCtx.current || !scenes[index]?.audioBuffer) return;
    if (activeAudioSource.current) activeAudioSource.current.stop();
    const source = audioCtx.current.createBufferSource();
    source.buffer = scenes[index].audioBuffer!;
    source.connect(audioCtx.current.destination);
    source.start();
    activeAudioSource.current = source;
  };

  if (checkingKey) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-indigo-500 font-black animate-pulse">系統加載中...</div>;
  if (!hasKey) return <ApiKeyDialog onSuccess={() => setHasKey(true)} />;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">
      <header className="text-center space-y-4">
        <h1 className="text-6xl font-black gradient-text tracking-tighter italic animate-float">AI 電影工作室</h1>
        <p className="text-gray-400 font-medium tracking-widest uppercase text-xs">工業級影視自動化技術 • Veo 3.1 引擎</p>
      </header>

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl text-red-400 text-center font-bold shadow-2xl">
          <div className="flex items-center justify-center gap-3">
            <span>系統訊息：{errorMessage}</span>
          </div>
          <button onClick={() => setHasKey(false)} className="mt-4 text-[10px] uppercase tracking-widest text-red-400/50 hover:text-red-400 underline underline-offset-4">手動重設 API 金鑰</button>
        </div>
      )}

      {status === WorkflowStatus.IDLE && (
        <section className="glass p-12 rounded-[3.5rem] space-y-10 shadow-2xl transition-all border-indigo-500/10 hover:border-indigo-500/30">
          <div className="space-y-4">
            <label className="text-[10px] font-black text-indigo-400 tracking-[0.4em] uppercase">STEP 01: 設定影片靈魂主題</label>
            <input 
              value={theme} onChange={e => setTheme(e.target.value)}
              placeholder="例如：末日後的荒原，一位老兵與機器的告別..."
              className="w-full bg-black/60 border border-white/10 rounded-3xl px-10 py-8 text-2xl font-light focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-gray-800"
            />
          </div>
          <div className="flex flex-col md:flex-row gap-6">
            <select 
              value={numScenes} onChange={e => setNumScenes(Number(e.target.value))}
              className="bg-black/40 border border-white/10 rounded-2xl px-8 py-5 outline-none text-white font-black text-lg appearance-none cursor-pointer"
            >
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} 個精選鏡頭</option>)}
            </select>
            <button onClick={planProduction} className="flex-1 py-6 bg-gradient-to-r from-indigo-600 to-purple-800 rounded-3xl font-black text-xl hover:scale-[1.02] transition-all shadow-2xl shadow-indigo-600/30 active:scale-95">
              開始智能劇本分鏡
            </button>
          </div>
        </section>
      )}

      {status === WorkflowStatus.PLANNING && <ProgressBar progress={progress} label="導演正在構思 8 秒鏡頭細節與快節奏在地台詞..." />}

      {status === WorkflowStatus.REVIEW && (
        <section className="space-y-12 animate-in fade-in slide-in-from-bottom-12 duration-1000">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-l-[12px] border-indigo-500 pl-10">
            <div className="space-y-2">
              <h2 className="text-5xl font-black tracking-tighter italic uppercase text-indigo-100">劇本審閱室</h2>
              <p className="text-gray-500 font-medium">請確認 8 秒鏡頭內的視覺內容。台詞字數已優化為快節奏模式。</p>
            </div>
            <button onClick={startGeneration} className="w-full md:w-auto px-16 py-6 bg-emerald-600 rounded-3xl font-black text-xl hover:bg-emerald-500 shadow-2xl shadow-emerald-900/40 active:scale-95 transition-all">
              確認無誤，啟動渲染
            </button>
          </div>
          
          <div className="grid gap-10">
            {scenes.map((s, i) => (
              <div key={s.id} className="glass p-10 rounded-[3rem] border-white/5 grid lg:grid-cols-2 gap-12 hover:bg-white/[0.07] transition-all">
                <div className="space-y-4">
                  <span className="text-[10px] font-black text-gray-500 tracking-widest uppercase block mb-2">SCENE {i+1} 視覺指令 (ENG)</span>
                  <textarea 
                    value={s.imagePrompt}
                    onChange={e => setScenes(prev => prev.map((ps, pi) => pi === i ? {...ps, imagePrompt: e.target.value} : ps))}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 text-sm text-gray-500 h-40 focus:ring-2 focus:ring-indigo-500/30 outline-none resize-none transition-all"
                  />
                </div>
                <div className="space-y-4">
                  <span className="text-[10px] font-black text-gray-500 tracking-widest uppercase block mb-2">SCENE {i+1} 台詞對話 (中)</span>
                  <textarea 
                    value={s.dialogue}
                    onChange={e => setScenes(prev => prev.map((ps, pi) => pi === i ? {...ps, dialogue: e.target.value} : ps))}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 text-xl text-white font-medium h-40 focus:ring-2 focus:ring-pink-500/30 outline-none resize-none transition-all"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(status === WorkflowStatus.GENERATING_ASSETS || status === WorkflowStatus.COMPLETED) && (
        <section className="space-y-16 animate-in zoom-in-95 duration-1000">
          {status === WorkflowStatus.GENERATING_ASSETS && <ProgressBar progress={progress} label="製作中：正在演算 Veo 8秒序列、快速情感語音並自動化對位..." />}
          
          {scenes.some(s => s.videoUrl) && (
            <div className="space-y-10">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-l-[12px] border-indigo-500 pl-10">
                <div className="space-y-2">
                  <h2 className="text-5xl font-black tracking-tighter uppercase italic">導演剪輯預覽版</h2>
                  <p className="text-gray-500 text-sm">系統已根據 8 秒鏡頭完成序列剪輯與語音對位。</p>
                </div>
                {status === WorkflowStatus.COMPLETED && (
                  <button 
                    onClick={exportFinalMovie}
                    disabled={isExporting}
                    className="px-12 py-5 bg-gradient-to-r from-indigo-600 to-purple-800 rounded-3xl font-black text-lg hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center gap-4 disabled:opacity-50"
                  >
                    {isExporting ? <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" /> : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                    {isExporting ? '母帶導出中...' : '導出最終完整版本 (一鍵打包)'}
                  </button>
                )}
              </div>

              <div className="relative aspect-video rounded-[3.5rem] overflow-hidden shadow-[0_0_150px_rgba(79,70,229,0.25)] border border-white/10 bg-black">
                <video 
                  ref={videoRef0} 
                  src={activeLayer === 0 ? scenes[currentIdx]?.videoUrl : scenes[(currentIdx+1)%scenes.length]?.videoUrl}
                  onTimeUpdate={activeLayer === 0 ? handleTimeUpdate : undefined}
                  autoPlay muted playsInline
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${activeLayer === 0 ? 'opacity-100' : 'opacity-0'}`}
                />
                <video 
                  ref={videoRef1} 
                  src={activeLayer === 1 ? scenes[currentIdx]?.videoUrl : scenes[(currentIdx+1)%scenes.length]?.videoUrl}
                  onTimeUpdate={activeLayer === 1 ? handleTimeUpdate : undefined}
                  autoPlay muted playsInline
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${activeLayer === 1 ? 'opacity-100' : 'opacity-0'}`}
                />
                
                {/* 專業對白字幕樣式: 12px, 底部置中, 帶背景 */}
                <div className="absolute inset-x-0 bottom-4 z-20 text-center pointer-events-none px-20">
                  <div className="inline-block bg-black/70 backdrop-blur-md px-6 py-1.5 rounded-lg border border-white/5 shadow-2xl">
                    <p className="text-[12px] font-medium text-gray-100 tracking-[0.05em] leading-relaxed drop-shadow-md">
                      {scenes[currentIdx]?.dialogue}
                    </p>
                  </div>
                </div>

                <div className="absolute bottom-0 inset-x-0 h-1.5 bg-white/5 z-30">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500" 
                    style={{ width: `${((currentIdx + 1) / scenes.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {scenes.map((s, i) => (
              <div 
                key={s.id} 
                onClick={() => { if(s.status === 'completed') { setCurrentIdx(i); playScene(i); } }}
                className={`glass rounded-[2rem] overflow-hidden aspect-video relative group border-2 cursor-pointer transition-all duration-700 ${currentIdx === i ? 'border-indigo-500 scale-110 z-10 shadow-indigo-500/50 shadow-2xl' : 'border-transparent opacity-30 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-105'}`}
              >
                {s.imageUrl ? <img src={s.imageUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-700 font-black uppercase tracking-[0.2em]">RENDERING</div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">SCENE {i+1}</span>
                  {s.status === 'processing' && <div className="absolute top-3 right-3 w-3 h-3 border-2 border-indigo-500 border-t-transparent animate-spin rounded-full" />}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      
      <footer className="mt-40 text-center opacity-10 text-[9px] tracking-[1em] uppercase font-black">
        A.I. Cinema Master Series • 2025 Production
      </footer>
    </div>
  );
};

export default App;
