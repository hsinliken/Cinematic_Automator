
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
    
    // 強制檢查環境變數
    if (!process.env.API_KEY) {
      setHasKey(false);
      return;
    }

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
      setStatus(WorkflowStatus.ERROR);
      const msg = e.message || "";
      if (msg.includes("429")) {
        setErrorMessage("請求過於頻繁（429 錯誤），請稍候片刻再試。");
      } else if (msg.includes("金鑰尚未就緒") || msg.includes("key")) {
        setHasKey(false);
        setErrorMessage("金鑰失效或尚未準備好，請重新選擇。");
      } else {
        setErrorMessage(`規劃失敗: ${msg}`);
      }
    }
  };

  const startGeneration = async () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.current.state === 'suspended') {
      await audioCtx.current.resume();
    }

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
        
        setScenes(prev => prev.map((s, idx) => idx === i ? { 
          ...s, videoUrl: vid, status: 'completed' 
        } : s));
        
        setProgress(15 + ((i + 1) / scenes.length) * 85);
      } catch (e: any) {
        console.error(e);
        setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'error' } : s));
        if (e.message?.includes("429")) {
          setErrorMessage("API 配額已達上限（429）。請稍候再試。");
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

  const downloadVideo = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAll = () => {
    scenes.forEach((scene, i) => {
      if (scene.videoUrl) {
        downloadVideo(scene.videoUrl, `scene-${i + 1}.mp4`);
      }
    });
  };

  const playScene = (index: number) => {
    if (!audioCtx.current || !scenes[index]?.videoUrl) return;
    const scene = scenes[index];
    if (scene.audioBuffer) {
      if (activeAudioSource.current) { activeAudioSource.current.stop(); }
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

  if (checkingKey) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-indigo-500 font-black animate-pulse">系統啟動中...</div>;
  if (!hasKey) return <ApiKeyDialog onSuccess={() => setHasKey(true)} />;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">
      <header className="text-center space-y-4">
        <h1 className="text-6xl font-black gradient-text tracking-tighter italic animate-float">AI 虛擬片廠</h1>
        <p className="text-gray-400 font-medium tracking-widest uppercase text-xs">下一代影視自動化技術 • Google Veo 3.1 驅動</p>
      </header>

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl text-red-400 text-center font-bold shadow-2xl">
          <div className="flex items-center justify-center gap-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span>系統警報：{errorMessage}</span>
          </div>
          <button 
            onClick={() => { setErrorMessage(null); setHasKey(false); }}
            className="mt-4 text-xs underline text-red-400/60 hover:text-red-400"
          >
            點擊此處重設金鑰
          </button>
        </div>
      )}

      {status === WorkflowStatus.IDLE && (
        <section className="glass p-12 rounded-[3rem] space-y-10 shadow-2xl transition-all border-indigo-500/10 hover:border-indigo-500/30">
          <div className="space-y-4">
            <label className="text-[10px] font-black text-indigo-400 tracking-[0.3em] uppercase">STEP 01: 創意主題構思</label>
            <input 
              value={theme} onChange={e => setTheme(e.target.value)}
              placeholder="例如：2045 年的台北大稻埕，霓虹燈下的雨中武打戲..."
              className="w-full bg-black/60 border border-white/10 rounded-3xl px-8 py-7 text-2xl font-light focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-gray-800"
            />
          </div>
          <div className="flex flex-col md:flex-row gap-6">
            <select 
              value={numScenes} onChange={e => setNumScenes(Number(e.target.value))}
              className="bg-black/40 border border-white/10 rounded-2xl px-8 py-5 outline-none text-white font-black text-lg appearance-none cursor-pointer hover:bg-black/60 transition-colors"
            >
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} 幕經典劇本</option>)}
            </select>
            <button onClick={planProduction} className="flex-1 py-6 bg-gradient-to-r from-indigo-600 to-purple-700 rounded-3xl font-black text-xl hover:scale-[1.02] transition-all shadow-2xl shadow-indigo-600/30 active:scale-95">
              開始劇本分鏡規劃
            </button>
          </div>
        </section>
      )}

      {status === WorkflowStatus.PLANNING && <ProgressBar progress={progress} label="導演正在構思鏡頭、光影布局並編寫在地口語對白..." />}

      {status === WorkflowStatus.REVIEW && (
        <section className="space-y-12 animate-in fade-in slide-in-from-bottom-12 duration-1000">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-l-[12px] border-indigo-500 pl-10">
            <div className="space-y-2">
              <h2 className="text-5xl font-black tracking-tighter italic uppercase">劇本審閱室</h2>
              <p className="text-gray-500 font-medium">請校閱視覺描述與對白，每一幕將以 8 秒時長進行製作。</p>
            </div>
            <button onClick={startGeneration} className="w-full md:w-auto px-16 py-6 bg-emerald-600 rounded-3xl font-black text-xl hover:bg-emerald-500 shadow-2xl shadow-emerald-900/40 active:scale-95 transition-all">
              確認細節，開始演算
            </button>
          </div>
          
          <div className="grid gap-10">
            {scenes.map((s, i) => (
              <div key={s.id} className="glass p-10 rounded-[3rem] border-white/5 grid lg:grid-cols-2 gap-12 hover:bg-white/[0.07] transition-all group">
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-400">視</span>
                    <span className="text-xs font-black text-gray-400 tracking-[0.2em] uppercase">場景 {i+1} 視覺指令</span>
                  </div>
                  <textarea 
                    value={s.imagePrompt}
                    onChange={e => setScenes(prev => prev.map((ps, pi) => pi === i ? {...ps, imagePrompt: e.target.value} : ps))}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 text-sm text-gray-500 h-40 focus:ring-2 focus:ring-indigo-500/30 outline-none resize-none transition-all"
                  />
                </div>
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center text-xs font-black text-pink-400">音</span>
                    <span className="text-xs font-black text-gray-400 tracking-[0.2em] uppercase">場景 {i+1} 角色台詞 (約 8 秒)</span>
                  </div>
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
          {status === WorkflowStatus.GENERATING_ASSETS && <ProgressBar progress={progress} label="製作中：正在演算影片、合成快節奏對白並進行剪輯..." />}
          
          {scenes.some(s => s.videoUrl) && (
            <div className="space-y-10">
              <div className="flex justify-between items-end border-l-[12px] border-indigo-500 pl-10">
                <div className="space-y-2">
                  <h2 className="text-5xl font-black tracking-tighter uppercase italic">導演剪輯預覽</h2>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => scenes[currentIdx]?.videoUrl && downloadVideo(scenes[currentIdx].videoUrl!, `scene-${currentIdx+1}.mp4`)}
                      className="text-[10px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full border border-white/10 transition-all flex items-center gap-2"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      下載當前鏡頭
                    </button>
                    {status === WorkflowStatus.COMPLETED && (
                      <button 
                        onClick={downloadAll}
                        className="text-[10px] font-black uppercase tracking-widest bg-indigo-600/80 hover:bg-indigo-600 px-4 py-2 rounded-full border border-indigo-500/30 transition-all flex items-center gap-2"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        下載所有素材 (導出影片)
                      </button>
                    )}
                  </div>
                </div>
                {status === WorkflowStatus.GENERATING_ASSETS && <div className="text-indigo-400 text-xs font-black animate-pulse tracking-widest uppercase bg-indigo-500/10 px-4 py-2 rounded-full border border-indigo-500/20">渲染中...</div>}
              </div>

              <div className="relative aspect-video rounded-[3.5rem] overflow-hidden shadow-[0_0_150px_rgba(79,70,229,0.2)] group border border-white/10 bg-black/40">
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
                
                <div className="absolute inset-x-0 bottom-12 z-20 text-center pointer-events-none px-12">
                  <div className="inline-block bg-black/60 backdrop-blur-md px-6 py-2 rounded-xl border border-white/10 shadow-2xl">
                    <p className="text-[14px] font-bold text-white tracking-wider leading-relaxed">
                      {scenes[currentIdx]?.dialogue}
                    </p>
                  </div>
                </div>

                <div className="absolute bottom-0 inset-x-0 h-2 bg-white/5 z-30">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500" 
                    style={{ width: `${((currentIdx + 1) / scenes.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {scenes.map((s, i) => (
              <div 
                key={s.id} 
                onClick={() => { if(s.status === 'completed') { setCurrentIdx(i); playScene(i); } }}
                className={`glass rounded-[2rem] overflow-hidden aspect-video relative group border-2 cursor-pointer transition-all duration-700 ${currentIdx === i ? 'border-indigo-500 scale-110 z-10 shadow-indigo-500/40 shadow-2xl' : 'border-transparent opacity-30 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-105'}`}
              >
                {s.imageUrl ? <img src={s.imageUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-600 font-black uppercase tracking-[0.3em] animate-pulse">處理中</div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-6">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">SCENE {i+1}</span>
                  {s.status === 'processing' && <div className="absolute top-4 right-4 w-4 h-4 border-2 border-indigo-500 border-t-transparent animate-spin rounded-full" />}
                  {s.status === 'completed' && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); s.videoUrl && downloadVideo(s.videoUrl, `scene-${i+1}.mp4`); }}
                      className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 p-2 rounded-full hover:bg-indigo-500"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      
      <footer className="mt-40 text-center opacity-10 text-[10px] tracking-[0.8em] uppercase font-black">
        Industrial Cinema Engine • 2025 AI Systems
      </footer>
    </div>
  );
};

export default App;
