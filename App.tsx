
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
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const audioCtx = useRef<AudioContext | null>(null);
  const activeAudioSource = useRef<AudioBufferSourceNode | null>(null);

  const videoRef0 = useRef<HTMLVideoElement>(null);
  const videoRef1 = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // @ts-ignore
    window.aistudio.hasSelectedApiKey().then((exists: boolean) => {
      setHasKey(exists);
      setCheckingKey(false);
    });
  }, []);

  const planProduction = async () => {
    if (!theme.trim()) return;
    setStatus(WorkflowStatus.PLANNING);
    setProgress(10);
    const gemini = new GeminiService(process.env.API_KEY || '');
    try {
      const plan = await gemini.planScript(theme, numScenes);
      setScenes(plan.map((p, i) => ({ 
        id: `s-${i}`, 
        imagePrompt: p.imagePrompt, 
        dialogue: p.dialogue, 
        status: 'pending' 
      })));
      setStatus(WorkflowStatus.REVIEW);
    } catch (e) { 
      setStatus(WorkflowStatus.ERROR); 
    }
  };

  const startGeneration = async () => {
    // Initialize AudioContext on user interaction
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.current.state === 'suspended') {
      await audioCtx.current.resume();
    }

    setStatus(WorkflowStatus.GENERATING_ASSETS);
    const gemini = new GeminiService(process.env.API_KEY || '');
    
    for (let i = 0; i < scenes.length; i++) {
      try {
        setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'processing' } : s));
        const img = await gemini.generateImage(scenes[i].imagePrompt);
        const audio = await gemini.generateSpeech(scenes[i].dialogue);
        const vid = await gemini.generateVideo(img);
        
        setScenes(prev => prev.map((s, idx) => idx === i ? { 
          ...s, imageUrl: img, audioBuffer: audio, videoUrl: vid, status: 'completed' 
        } : s));
        setProgress(10 + ((i + 1) / scenes.length) * 90);
      } catch (e) {
        setScenes(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'error' } : s));
      }
    }
    setStatus(WorkflowStatus.COMPLETED);
    setCurrentIdx(0);
    setTimeout(() => {
      playScene(0);
    }, 500);
  };

  const playScene = (index: number) => {
    if (!audioCtx.current) return;
    
    const scene = scenes[index];
    if (scene.audioBuffer) {
      // Stop previous audio if any
      if (activeAudioSource.current) {
        activeAudioSource.current.stop();
      }
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
    // Trigger transition shortly before the video ends
    if (v.duration > 0 && v.duration - v.currentTime < 0.6 && !isTransitioning) {
      const nextIdx = (currentIdx + 1) % scenes.length;
      if (scenes[nextIdx]?.videoUrl) {
        setIsTransitioning(true);
        const nextLayer = activeLayer === 0 ? 1 : 0;
        
        // Prepare next video
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

  const downloadVideo = (url: string, i: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `cinema-scene-${i + 1}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (checkingKey) return <div className="min-h-screen bg-black" />;
  if (!hasKey) return <ApiKeyDialog onSuccess={() => setHasKey(true)} />;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">
      <header className="text-center space-y-4">
        <h1 className="text-6xl font-black gradient-text tracking-tighter italic animate-float">AI FILM STUDIO</h1>
        <p className="text-gray-400 font-medium tracking-widest uppercase text-sm">Automated Cinematic Production Suite</p>
      </header>

      {status === WorkflowStatus.IDLE && (
        <section className="glass p-12 rounded-[2.5rem] space-y-8 shadow-2xl transition-all hover:border-white/20">
          <div className="space-y-4">
            <label className="text-xs font-black text-indigo-400 tracking-[0.2em] uppercase">Phase 1: Concept & Direction</label>
            <input 
              value={theme} onChange={e => setTheme(e.target.value)}
              placeholder="輸入影片主題，例如：台北街頭的雨中浪漫邂逅..."
              className="w-full bg-black/60 border border-white/10 rounded-3xl px-8 py-6 text-xl focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-gray-700"
            />
          </div>
          <div className="flex gap-4">
            <select 
              value={numScenes} onChange={e => setNumScenes(Number(e.target.value))}
              className="bg-black/40 border border-white/10 rounded-2xl px-6 py-4 outline-none"
            >
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} 幕劇本</option>)}
            </select>
            <button onClick={planProduction} className="flex-1 py-5 bg-indigo-600 rounded-3xl font-black text-xl hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 active:scale-95">
              開始劇本規劃
            </button>
          </div>
        </section>
      )}

      {status === WorkflowStatus.PLANNING && <ProgressBar progress={progress} label="導演正在構思分鏡與對白..." />}

      {status === WorkflowStatus.REVIEW && (
        <section className="space-y-10 animate-in fade-in duration-1000 slide-in-from-bottom-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-l-8 border-indigo-500 pl-8">
            <div>
              <h2 className="text-4xl font-black tracking-tight">劇本審閱與修改</h2>
              <p className="text-gray-500 mt-2 font-medium italic">您可以自由修改對白，確保符合您想要的情感表達。</p>
            </div>
            <button onClick={startGeneration} className="w-full md:w-auto px-12 py-5 bg-emerald-600 rounded-3xl font-black text-lg hover:bg-emerald-500 shadow-2xl shadow-emerald-900/40 active:scale-95 transition-all">
              確認劇本並開始製作
            </button>
          </div>
          
          <div className="grid gap-8">
            {scenes.map((s, i) => (
              <div key={s.id} className="glass p-8 rounded-[2rem] border-white/5 grid lg:grid-cols-2 gap-10 hover:bg-white/[0.08] transition-colors group">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-black">V</span>
                    <span className="text-xs font-black text-gray-400 tracking-widest uppercase">第 {i+1} 幕 視覺描述</span>
                  </div>
                  <textarea 
                    value={s.imagePrompt}
                    onChange={e => setScenes(prev => prev.map((ps, pi) => pi === i ? {...ps, imagePrompt: e.target.value} : ps))}
                    className="w-full bg-black/40 border-white/5 rounded-2xl p-6 text-sm text-gray-300 h-32 focus:ring-2 focus:ring-indigo-500/30 outline-none resize-none"
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center text-xs font-black">A</span>
                    <span className="text-xs font-black text-gray-400 tracking-widest uppercase">第 {i+1} 幕 角色對白 (台灣口語)</span>
                  </div>
                  <textarea 
                    value={s.dialogue}
                    onChange={e => setScenes(prev => prev.map((ps, pi) => pi === i ? {...ps, dialogue: e.target.value} : ps))}
                    className="w-full bg-black/40 border-white/5 rounded-2xl p-6 text-lg text-white font-medium h-32 focus:ring-2 focus:ring-pink-500/30 outline-none resize-none shadow-inner"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(status === WorkflowStatus.GENERATING_ASSETS || status === WorkflowStatus.COMPLETED) && (
        <section className="space-y-16 animate-in zoom-in-95 duration-1000">
          {status === WorkflowStatus.GENERATING_ASSETS && <ProgressBar progress={progress} label="製作中：正在生成高品質影像、擬真語音與電影分鏡..." />}
          
          {scenes[0]?.videoUrl && (
            <div className="space-y-8">
              <div className="flex justify-between items-end border-l-8 border-indigo-500 pl-8">
                <h2 className="text-4xl font-black tracking-tighter uppercase italic">Final Preview</h2>
                <div className="flex gap-4">
                   <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Master Production Active</span>
                   </div>
                </div>
              </div>

              <div className="relative aspect-video rounded-[3rem] overflow-hidden shadow-[0_0_120px_rgba(79,70,229,0.15)] group border border-white/10">
                {/* Cinema Cross-fade Player */}
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
                
                {/* Ultra-Sharp DOM Subtitles */}
                <div className="absolute inset-x-0 bottom-16 z-20 text-center pointer-events-none select-none">
                  <div className="inline-block px-10 py-3 rounded-2xl">
                    <p className="text-3xl md:text-4xl font-bold text-white tracking-wider leading-relaxed drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]" 
                       style={{ fontSmooth: 'always', textShadow: '0 0 20px rgba(0,0,0,1), 2px 2px 0 rgba(0,0,0,1)' }}>
                      {scenes[currentIdx]?.dialogue}
                    </p>
                  </div>
                </div>
                
                <div className="absolute top-8 right-8 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button 
                     onClick={() => downloadVideo(scenes[currentIdx].videoUrl!, currentIdx)} 
                     className="p-5 bg-black/60 hover:bg-indigo-600 rounded-full backdrop-blur-xl border border-white/10 transition-all active:scale-90"
                     title="下載此片段"
                   >
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                   </button>
                </div>

                {/* Progress Bar */}
                <div className="absolute bottom-0 inset-x-0 h-2 bg-white/5 z-30">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-300" 
                    style={{ width: `${((currentIdx + 1) / scenes.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Asset Reel */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {scenes.map((s, i) => (
              <div 
                key={s.id} 
                onClick={() => { if(s.status === 'completed') { setCurrentIdx(i); playScene(i); } }}
                className={`glass rounded-[1.5rem] overflow-hidden aspect-video relative group border-2 cursor-pointer transition-all duration-500 ${currentIdx === i ? 'border-indigo-500 scale-105 shadow-2xl z-10' : 'border-transparent opacity-40 grayscale hover:grayscale-0 hover:opacity-100'}`}
              >
                {s.imageUrl ? <img src={s.imageUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/5 animate-pulse flex items-center justify-center"><span className="text-[10px] text-gray-500">Wait...</span></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Scene {i+1}</span>
                  {s.status === 'processing' && <div className="absolute top-2 right-2 w-4 h-4 border-2 border-indigo-500 border-t-transparent animate-spin rounded-full" />}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      
      <footer className="mt-32 text-center opacity-20 text-[10px] tracking-[0.5em] uppercase font-black">
        Aistudio Cinema Engine • Professional Grade Production
      </footer>
    </div>
  );
};

export default App;
