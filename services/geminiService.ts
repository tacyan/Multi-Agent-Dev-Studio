import { GoogleGenAI } from "@google/genai";
import { AgentRole, AgentState, ChatMessage, ProjectFile } from '../types';
import { AGENT_SYSTEM_PROMPTS } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_CONFIG: Record<AgentRole, string> = {
  [AgentRole.PDM]: 'gemini-3-pro-preview',
  [AgentRole.ARCHITECT]: 'gemini-3-pro-preview',
  [AgentRole.DESIGNER]: 'gemini-2.5-flash',
  [AgentRole.FRONTEND]: 'gemini-3-pro-preview',
  [AgentRole.BACKEND]: 'gemini-3-pro-preview',
  [AgentRole.QA]: 'gemini-2.5-flash',
  [AgentRole.DOCS]: 'gemini-2.5-flash',
  [AgentRole.REVIEWER]: 'gemini-2.5-flash',
};

export interface AgentContext {
  messages: ChatMessage[];
  projectType: string;
  agents: Record<AgentRole, AgentState>;
  files: ProjectFile[];
}

export const runAgent = async (
  role: AgentRole,
  context: AgentContext,
  onStream?: (chunk: string) => void
): Promise<string> => {
  const modelName = MODEL_CONFIG[role];
  const systemInstruction = AGENT_SYSTEM_PROMPTS[role];

  // 1. Build Conversation History Context
  let promptContext = `Project Type: ${context.projectType}\n\n`;
  
  promptContext += `--- CONVERSATION HISTORY ---\n`;
  // Limit history to last 10 messages to save context window
  context.messages.slice(-10).forEach(msg => {
    promptContext += `${msg.role.toUpperCase()}: ${msg.content}\n`;
  });
  promptContext += `\n`;

  // 2. Provide Existing Files (so they can be edited)
  if (context.files.length > 0) {
    promptContext += `--- EXISTING PROJECT FILES ---\n`;
    context.files.forEach(f => {
      promptContext += `File: ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\`\n\n`;
    });
  }

  // 3. Provide Cross-Agent Context (Inter-agent communication)
  // The PM always speaks first, so everyone sees PM output
  if (role !== AgentRole.PDM && context.agents[AgentRole.PDM].output) {
    promptContext += `--- PRODUCT MANAGER DIRECTIVE ---\n${context.agents[AgentRole.PDM].output}\n\n`;
  }

  // Frontend/Backend/QA/Docs see Arch & Design
  if ([AgentRole.FRONTEND, AgentRole.BACKEND, AgentRole.QA, AgentRole.DOCS, AgentRole.REVIEWER].includes(role)) {
    if (context.agents[AgentRole.ARCHITECT].output) {
      promptContext += `--- ARCHITECT OUTPUT ---\n${context.agents[AgentRole.ARCHITECT].output}\n\n`;
    }
    if (context.agents[AgentRole.DESIGNER].output) {
      promptContext += `--- DESIGNER OUTPUT ---\n${context.agents[AgentRole.DESIGNER].output}\n\n`;
    }
  }

  // QA/Docs/Reviewer see Code
  if ([AgentRole.QA, AgentRole.DOCS, AgentRole.REVIEWER].includes(role)) {
    if (context.agents[AgentRole.FRONTEND].output) {
      promptContext += `--- FRONTEND CHANGES ---\n${context.agents[AgentRole.FRONTEND].output}\n\n`;
    }
    if (context.agents[AgentRole.BACKEND].output) {
      promptContext += `--- BACKEND CHANGES ---\n${context.agents[AgentRole.BACKEND].output}\n\n`;
    }
  }

  const userMessage = `
    Perform your role as ${role} for the latest user request.
    If you are generating code, return the COMPLETE file content for any file you touch.
  `;

  try {
    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [{ text: promptContext + userMessage }]
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    let fullText = '';
    for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          fullText += text;
          if (onStream) {
              onStream(text);
          }
        }
    }
    return fullText;
  } catch (error: any) {
    console.error(`Error running agent ${role}:`, error);
    return `Error: ${error.message}`;
  }
};