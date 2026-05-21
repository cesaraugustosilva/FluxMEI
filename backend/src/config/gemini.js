import './env.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;

export const geminiModel = apiKey
  ? new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'gemini-1.5-flash' })
  : null;
