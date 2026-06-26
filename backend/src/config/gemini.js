import './env.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
export const geminiModelName = 'gemini-1.5-flash';

export const geminiModel = provider === 'gemini' && apiKey
  ? new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: geminiModelName })
  : null;

export const aiProvider = provider;
