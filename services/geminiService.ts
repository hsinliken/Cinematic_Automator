
import { GoogleGenAI, Type, Modality } from "@google/genai";

export class GeminiService {
  private ai: GoogleGenAI;
  private audioContext: AudioContext;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }

  async planScript(theme: string, n: number): Promise<{imagePrompt: string, dialogue: string}[]> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `你是一位專業電影導演。請為主題 "${theme}" 規劃一個 ${n} 幕的電影片段。
      每一幕需要包含：
      1. imagePrompt: 視覺場景描述（請用英文，描述光影、構圖、畫質）。
      2. dialogue: 角色對白（請用台灣在地口語，語氣要自然且富有情感，使用繁體中文）。
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
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: `Cinematic movie scene, professional photography, high dynamic range, 8k resolution, artistic masterpiece: ${prompt}` }] },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });
    const part = response.candidates[0].content.parts.find(p => p.inlineData);
    if (!part) throw new Error("Image generation failed");
    return `data:image/png;base64,${part.inlineData.data}`;
  }

  async generateSpeech(text: string): Promise<AudioBuffer> {
    // Ensuring the prompt emphasizes emotional Taiwanese Mandarin
    const prompt = `請以「台灣在地口語」且「充滿劇情情感」的語氣，朗讀以下對白：\n"${text}"`;
    
    const response = await this.ai.models.generateContent({
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
    if (!base64Audio) throw new Error("Audio generation failed");
    
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
    const base64Data = imageBase64.split(',')[1];
    let operation = await this.ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: `Cinematic professional camera movement, slow motion, shallow depth of field.`,
      image: { imageBytes: base64Data, mimeType: 'image/png' },
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
    });
    while (!operation.done) {
      await new Promise(r => setTimeout(r, 5000));
      operation = await this.ai.operations.getVideosOperation({ operation });
    }
    const link = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!link) throw new Error("Video operation failed");
    const res = await fetch(`${link}&key=${process.env.API_KEY}`);
    return URL.createObjectURL(await res.blob());
  }
}
