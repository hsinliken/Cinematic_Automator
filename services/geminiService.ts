
import { GoogleGenAI, Type, Modality } from "@google/genai";

export class GeminiService {
  private audioContext: AudioContext;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }

  // 確保每次呼叫都能獲取最新的環境變數
  private createClient() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API 金鑰尚未就緒。請確認您已在對話框中選擇金鑰，或稍候片刻讓系統同步。");
    }
    return new GoogleGenAI({ apiKey });
  }

  async planScript(theme: string, n: number): Promise<{imagePrompt: string, dialogue: string}[]> {
    const ai = this.createClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `你是一位專業電影編導。請為主題 "${theme}" 規劃一個 ${n} 幕的短片。
      每一幕需要包含：
      1. imagePrompt: 視覺構圖描述（請用英文，包含光影、鏡頭角度、質感）。
      2. dialogue: 角色台詞（請用繁體中文，語氣需符合台灣在地口語，富有情感）。
      
      【重要限制】：
      - 每一幕的角色台詞（dialogue）長度必須配合「較快語速」下朗讀時間約 8 秒鐘。
      - 字數請控制在 40 至 50 個中文字之間，以確保在語速加快後仍能填滿 8 秒的影片時長。
      
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
  }

  async generateImage(prompt: string): Promise<string> {
    const ai = this.createClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: `Cinematic cinematic lighting, 8k, professional photography: ${prompt}` }] },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });
    const part = response.candidates[0].content.parts.find(p => p.inlineData);
    if (!part) throw new Error("場景影像生成失敗，請重試。");
    return `data:image/png;base64,${part.inlineData.data}`;
  }

  async generateSpeech(text: string): Promise<AudioBuffer> {
    const ai = this.createClient();
    // 透過 Prompt 強調「語速加快」
    const prompt = `請以「台灣在地口語」且「充滿故事感染力」的情感語氣朗讀這段台詞。
    【特別要求】：請使用「較快的語速」朗讀，節奏要緊湊、不拖泥帶水，確保語氣自然但效率高。
    台詞內容：\n"${text}"`;
    
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
      prompt: `Cinematic motion, 8 seconds duration, professional camera movement, slow pan.`,
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
