
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
        const exists = await window.aistudio.hasSelectedApiKey();
        setHasKey(exists);
      } catch (e) {
        console.error("Key check error:", e);
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
      setStatus(WorkflowStatus.ERROR);
      if (e.message?.includes("429")) {
        setErrorMessage("請求次數過多 (Quota Exceeded)，請稍候再試或更換 API 金鑰。");
      } else if (e.message?.includes("entity was not found") || e.message?.includes("undefined")) {
        setHasKey(false);
      } else {
        setErrorMessage(`劇本規劃失敗: ${e.message}`);
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
        setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'processing' } : s));
        const img = await geminiService.current.generateImage(scenes[i].imagePrompt);
        const audio = await geminiService.current.generateSpeech(scenes[i].dialogue);
        const vid = await geminiService.current.generateVideo(img);
        
        setScenes(prev => prev.map((s, idx) => idx === i ? { 
          ...s, imageUrl: img, audioBuffer: audio, videoUrl: vid, status: 'completed' 
        } : s));
        setProgress(15 + ((i + 1) / scenes.length) * 85);
      } catch (e: any) {
        console.error(e);
        setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'error' } : s));
        if (e.message?.includes("429")) {
          setErrorMessage("API 配額已達上限，影片生成暫停。請檢查您的付費帳單或稍後再試。");
          break;
        } else if (e.message?.includes("entity was not found")) {
          setHasKey(false);
          setStatus(WorkflowStatus.IDLE);
          return;
        }
      }
    }
    setStatus(WorkflowStatus.COMPLETED);
    setCurrentIdx(0);
    setTimeout(() => playScene(0), 500);
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

  if (checkingKey) return <div className="min-h-screen bg-[#0a0a0a]" />;
  if (!hasKey) return <ApiKeyDialog onSuccess={() => setHasKey(true)} />;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">
      <header className="text-center space-y-4">
        <h1 className="text-6xl font-black gradient-text tracking-tighter italic animate-float">AI 電影工作室</h1>
        <p className="text-gray-400 font-medium tracking-widest uppercase text-xs">自動化影視生產線 • Veo 影片演算技術</p>
      </header>

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-400 text-center font-bold animate-pulse">
          系統訊息: {errorMessage}
        </div>
      )}

      {status === WorkflowStatus.IDLE && (
        <section className="glass p-12 rounded-[2.5rem] space-y-8 shadow-2xl transition-all">
          <div className="space-y-4">
            <label className="text-xs font-black text-indigo-400 tracking-[0.2em] uppercase">第一步：定義您的電影主題</label>
            <input 
              value={theme} onChange={e => setTheme(e.target.value)}
              placeholder="例如：雨夜中繁華的台北忠孝東路，一段未竟的對白..."
              className="w-full bg-black/60 border border-white/10 rounded-3xl px-8 py-6 text-xl focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-gray-700"
            />
          </div>
          <div className="flex gap-4">
            <select 
              value={numScenes} onChange={e => setNumScenes(Number(e.target.value))}
              className="bg-black/40 border border-white/10 rounded-2xl px-6 py-4 outline-none text-white font-bold"
            >
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} 個電影幕次</option>)}
            </select>
            <button onClick={planProduction} className="flex-1 py-5 bg-indigo-600 rounded-3xl font-black text-xl hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 active:scale-95">
              開始劇本與分鏡規劃
            </button>
          </div>
        </section>
      )}

      {status === WorkflowStatus.PLANNING && <ProgressBar progress={progress} label="導演正在構思鏡頭位置、光影構圖與編寫台灣在地對白..." />}

      {status === WorkflowStatus.REVIEW && (
        <section className="space-y-10 animate-in fade-in duration-1000 slide-in-from-bottom-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-l-8 border-indigo-500 pl-8">
            <div>
              <h2 className="text-4xl font-black tracking-tight italic">劇本審閱與對白調整</h2>
              <p className="text-gray-500 mt-2 font-medium">您可以修改視覺指令或對白內容，我們將依照您的需求進行「拍攝」。</p>
            </div>
            <button onClick={startGeneration} className="w-full md:w-auto px-12 py-5 bg-emerald-600 rounded-3xl font-black text-lg hover:bg-emerald-500 shadow-2xl shadow-emerald-900/40 active:scale-95 transition-all">
              確認細節，開始演算影片
            </button>
          </div>
          
          <div className="grid gap-8">
            {scenes.map((s, i) => (
              <div key={s.id} className="glass p-8 rounded-[2rem] border-white/5 grid lg:grid-cols-2 gap-10 hover:bg-white/[0.08] transition-colors">
                <div className="space-y-4">
                  <span className="text-xs font-black text-gray-400 tracking-widest uppercase">場景 {i+1} 視覺指令 (英文)</span>
                  <textarea 
                    value={s.imagePrompt}
                    onChange={e => setScenes(prev => prev.map((ps, pi) => pi === i ? {...ps, imagePrompt: e.target.value} : ps))}
                    className="w-full bg-black/40 border-white/10 rounded-2xl p-6 text-sm text-gray-400 h-32 focus:ring-2 focus:ring-indigo-500/30 outline-none resize-none"
                  />
                </div>
                <div className="space-y-4">
                  <span className="text-xs font-black text-gray-400 tracking-widest uppercase">場景 {i+1} 角色台詞 (繁體中文)</span>
                  <textarea 
                    value={s.dialogue}
                    onChange={e => setScenes(prev => prev.map((ps, pi) => pi === i ? {...ps, dialogue: e.target.value} : ps))}
                    className="w-full bg-black/40 border-white/10 rounded-2xl p-6 text-lg text-white font-medium h-32 focus:ring-2 focus:ring-pink-500/30 outline-none resize-none"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(status === WorkflowStatus.GENERATING_ASSETS || status === WorkflowStatus.COMPLETED) && (
        <section className="space-y-16 animate-in zoom-in-95 duration-1000">
          {status === WorkflowStatus.GENERATING_ASSETS && <ProgressBar progress={progress} label="製作中：正在演算 Veo 影片序列、合成情感化語音並進行數位剪輯..." />}
          
          {scenes.some(s => s.videoUrl) && (
            <div className="space-y-8">
              <div className="flex justify-between items-end border-l-8 border-indigo-500 pl-8">
                <h2 className="text-4xl font-black tracking-tighter uppercase italic">導演剪輯預覽版</h2>
                {status === WorkflowStatus.GENERATING_ASSETS && <div className="text-indigo-400 text-sm animate-pulse">影片分段生成中...</div>}
              </div>

              <div className="relative aspect-video rounded-[3rem] overflow-hidden shadow-[0_0_120px_rgba(79,70,229,0.15)] group border border-white/10 bg-black">
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
                
                <div className="absolute inset-x-0 bottom-16 z-20 text-center pointer-events-none px-4">
                  <p className="text-3xl md:text-5xl font-bold text-white tracking-wide" 
                     style={{ textShadow: '0 0 15px rgba(0,0,0,1), 3px 3px 0 rgba(0,0,0,1)' }}>
                    {scenes[currentIdx]?.dialogue}
                  </p>
                </div>

                <div className="absolute bottom-0 inset-x-0 h-1.5 bg-white/5 z-30">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-300" 
                    style={{ width: `${((currentIdx + 1) / scenes.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {scenes.map((s, i) => (
              <div 
                key={s.id} 
                onClick={() => { if(s.status === 'completed') { setCurrentIdx(i); playScene(i); } }}
                className={`glass rounded-[1.5rem] overflow-hidden aspect-video relative group border-2 cursor-pointer transition-all duration-500 ${currentIdx === i ? 'border-indigo-500 scale-105 z-10 shadow-indigo-500/20 shadow-2xl' : 'border-transparent opacity-40 grayscale hover:grayscale-0 hover:opacity-100'}`}
              >
                {s.imageUrl ? <img src={s.imageUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500 font-bold uppercase tracking-widest">Processing...</div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Scene {i+1}</span>
                  {s.status === 'processing' && <div className="absolute top-2 right-2 w-3 h-3 border border-indigo-500 border-t-transparent animate-spin rounded-full" />}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      
      <footer className="mt-32 text-center opacity-20 text-[10px] tracking-[0.5em] uppercase font-black">
        Powered by Google Gemini & Veo 3.1
      </footer>
    </div>
  );
};

export default App;
