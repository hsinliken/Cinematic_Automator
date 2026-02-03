
import { GoogleGenAI, Type, Modality } from "@google/genai";

export class GeminiService {
  private audioContext: AudioContext;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }

  // 強化金鑰讀取，避免短暫的 undefined 導致崩潰
  private createClient() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      // 提供更友善的錯誤，而不是直接拋出讓 App 重新導向
      console.warn("API Key 尚未就緒，嘗試等待環境注入...");
      throw new Error("KEY_NOT_READY");
    }
    return new GoogleGenAI({ apiKey });
  }

  async planScript(theme: string, n: number): Promise<{imagePrompt: string, dialogue: string}[]> {
    try {
      const ai = this.createClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `你是一位專業電影編導。請為主題 "${theme}" 規劃一個 ${n} 幕的短片。
        每一幕需要包含：
        1. imagePrompt: 視覺構圖描述（請用英文，包含光影、鏡頭角度、質感）。
        2. dialogue: 角色台詞（請用繁體中文，語氣需符合台灣在地口語，富有情感）。
        
        【劇本節奏控制】：
        - 每一幕的時長固定為 8 秒。
        - 由於語速會加快，台詞（dialogue）請控制在 45 至 55 個中文字。
        - 內容要緊湊、資訊密度高，確保能填滿 8 秒的影片且不拖泥帶水。
        
        請以 JSON 陣列格式回傳。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                imagePrompt: { type: Type.STRING },
                dialogue: { type: Type.STRING }
              },
              required: ["imagePrompt", "dialogue"]
            }
          }
        }
      });
      return JSON.parse(response.text.trim());
    } catch (e: any) {
      if (e.message === "KEY_NOT_READY") throw new Error("系統正在初始化金鑰，請稍後再試一次。");
      throw e;
    }
  }

  async generateImage(prompt: string): Promise<string> {
    const ai = this.createClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: `Cinematic 8k photo, ultra-realistic, cinematic lighting, highly detailed: ${prompt}` }] },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });
    const part = response.candidates[0].content.parts.find(p => p.inlineData);
    if (!part) throw new Error("場景影像生成失敗。");
    return `data:image/png;base64,${part.inlineData.data}`;
  }

  async generateSpeech(text: string): Promise<AudioBuffer> {
    const ai = this.createClient();
    // 明確要求語速加快
    const prompt = `請以「台灣在地口語」且「充滿故事感染力」的情感語氣朗讀這段台詞。
    【語速要求】：請將語速加快（約 1.25 倍速），節奏明快、語氣急促但清晰，確保在 8 秒內講完。
    台詞：\n"${text}"`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("語音合成失敗。");
    
    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    return this.decodeAudioData(bytes, 24000, 1);
  }

  private async decodeAudioData(data: Uint8Array, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = this.audioContext.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  async generateVideo(imageBase64: string): Promise<string> {
    const ai = this.createClient();
    const base64Data = imageBase64.split(',')[1];
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: `Cinematic movie scene, 8 seconds duration, smooth camera motion, professional film look.`,
      image: { imageBytes: base64Data, mimeType: 'image/png' },
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
    });
    while (!operation.done) {
      await new Promise(r => setTimeout(r, 5000));
      operation = await ai.operations.getVideosOperation({ operation });
    }
    const link = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!link) throw new Error("影片演算失敗。");
    const res = await fetch(`${link}&key=${process.env.API_KEY}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }
}
