import './env.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
export const geminiModelName = (process.env.GEMINI_MODEL || 'gemini-2.5-flash')
  .replace(/^models\//, '');

export const geminiModel = provider === 'gemini' && apiKey
  ? new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: geminiModelName })
  : null;

export const aiProvider = provider;
