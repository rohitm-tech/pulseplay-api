import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config/env';

/**
 * Gemini text + JSON helpers — same stack as HackAIBengaluru (`@google/genai`).
 * Instantiate only when GEMINI_API_KEY is set.
 */
class GeminiService {
  private ai: GoogleGenAI | null = null;
  private readonly model: string;

  constructor() {
    this.model = config.GEMINI_MODEL;
  }

  isConfigured(): boolean {
    return Boolean(config.GEMINI_API_KEY?.trim());
  }

  private getClient(): GoogleGenAI {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    }
    return this.ai;
  }

  async generateText(
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      systemInstruction?: string;
    }
  ): Promise<string> {
    try {
      const response = await this.getClient().models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 2048,
          ...(options?.systemInstruction && {
            systemInstruction: options.systemInstruction,
          }),
        },
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('No text generated from Gemini');
      }
      return text;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Gemini text generation error:', error);
      throw new Error(`Failed to generate text: ${message}`);
    }
  }

  private convertSchemaToTypeSchema(schema: unknown): unknown {
    if (Array.isArray(schema) && schema.length > 0) {
      const itemSchema = schema[0] as unknown;
      if (
        typeof itemSchema === 'string' &&
        (itemSchema === 'string' || itemSchema === 'number' || itemSchema === 'integer')
      ) {
        if (itemSchema === 'number' || itemSchema === 'integer') {
          return { type: Type.ARRAY, items: { type: Type.NUMBER } };
        }
        return { type: Type.ARRAY, items: { type: Type.STRING } };
      }
      return {
        type: Type.ARRAY,
        items: this.convertObjectSchemaToTypeSchema(itemSchema as Record<string, unknown>),
      };
    }
    if (typeof schema === 'object' && schema !== null) {
      return this.convertObjectSchemaToTypeSchema(schema as Record<string, unknown>);
    }
    return schema;
  }

  private convertObjectSchemaToTypeSchema(schema: Record<string, unknown>): {
    type: typeof Type.OBJECT;
    properties: Record<string, unknown>;
    required: string[];
  } {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(schema)) {
      if (typeof value === 'string' && value.includes('(optional)')) {
        continue;
      }
      required.push(key);

      if (typeof value === 'string') {
        if (value === 'number' || value === 'integer') {
          properties[key] = { type: Type.NUMBER };
        } else if (value.includes('|')) {
          const enumValues = value.split('|').map((v) => v.trim());
          properties[key] = { type: Type.STRING, enum: enumValues };
        } else if (value === 'string') {
          properties[key] = { type: Type.STRING };
        } else {
          properties[key] = { type: Type.STRING, enum: [value] };
        }
      } else if (Array.isArray(value)) {
        if (value.length > 0 && value[0] === 'string') {
          properties[key] = { type: Type.ARRAY, items: { type: Type.STRING } };
        } else {
          properties[key] = { type: Type.ARRAY, items: { type: Type.STRING } };
        }
      } else if (typeof value === 'object' && value !== null) {
        const nested = this.convertObjectSchemaToTypeSchema(value as Record<string, unknown>);
        properties[key] = {
          type: Type.OBJECT,
          properties: nested.properties,
        };
      }
    }

    return { type: Type.OBJECT, properties, required };
  }

  async generateJSON<T>(prompt: string, schema?: unknown): Promise<T> {
    try {
      const enhancedPrompt = schema
        ? `${prompt}\n\nIMPORTANT: You must respond with valid JSON that strictly matches the provided schema. Do not include any additional text, explanations, or markdown formatting. Return only the JSON object or array.`
        : `${prompt}\n\nIMPORTANT: You must respond with valid JSON only. Do not include any additional text, explanations, or markdown formatting. Return only the JSON object or array.`;

      const genConfig: Record<string, unknown> = {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      };

      if (schema) {
        try {
          genConfig.responseSchema = this.convertSchemaToTypeSchema(schema);
        } catch (schemaError) {
          console.warn('Schema conversion warning:', schemaError);
        }
      }

      const response = await this.getClient().models.generateContent({
        model: this.model,
        contents: enhancedPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK config shape varies by model/features
        config: genConfig as any,
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('No JSON generated from Gemini');
      }

      let jsonText = text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      return JSON.parse(jsonText) as T;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('JSON')) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error('Gemini JSON generation error:', error);
      throw new Error(`Failed to generate JSON: ${message}`);
    }
  }
}

export const geminiService = new GeminiService();
