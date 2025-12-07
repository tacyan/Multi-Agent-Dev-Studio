import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Sparkles, 
  Send, 
  RotateCcw, 
  Code2, 
  FileText, 
  LayoutDashboard,
  Layers,
  Download,
  MessageSquare,
  Play,
  Mic,
  MicOff
} from 'lucide-react';
import JSZip from 'jszip';
import { 
  AgentRole, 
  AppState, 
  INITIAL_AGENTS_STATE, 
  ProjectFile,
  ChatMessage
} from './types';
import { PROJECT_TYPES } from './constants';
import { runAgent } from './services/geminiService';
import { AgentCard } from './components/AgentCard';
import { FileExplorer } from './components/FileExplorer';

const extractFiles = (text: string): ProjectFile[] => {
  const files: ProjectFile[] = [];
  const regex = /\|\|\|FILE:(.*?)\|\|\|\n([\s\S]*?)\|\|\|ENDFILE\|\|\|/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const path = match[1].trim();
    // Normalize path to remove leading ./ or /
    const cleanPath = path.replace(/^(\.\/|\/)+/, '');
    const content = match[2].trim();
    files.push({ path: cleanPath, content, language: 'typescript' });
  }
  return files;
};

// Simple "Bundler" to make the preview work nicely in an iframe
const generatePreviewDoc = (files: ProjectFile[]): string | null => {
    // Find index.html
    const indexFile = files.find(f => f.path.endsWith('index.html'));
    if (!indexFile) return null;

    let html = indexFile.content;

    // Inline CSS
    const cssMatches = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/g);
    if (cssMatches) {
        cssMatches.forEach(tag => {
            const hrefMatch = tag.match(/href="([^"]+)"/);
            if (hrefMatch) {
                const path = hrefMatch[1];
                // Try to find the file in our virtual filesystem
                // We handle paths vaguely (e.g. ./style.css or style.css)
                const cssFile = files.find(f => f.path.endsWith(path.replace(/^\.\//, '')));
                if (cssFile) {
                    html = html.replace(tag, `<style>\n${cssFile.content}\n</style>`);
                }
            }
        });
    }

    // Inline JS
    const jsMatches = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/g);
    if (jsMatches) {
        jsMatches.forEach(tag => {
            const srcMatch = tag.match(/src="([^"]+)"/);
            if (srcMatch) {
                const path = srcMatch[1];
                const jsFile = files.find(f => f.path.endsWith(path.replace(/^\.\//, '')));
                if (jsFile) {
                    html = html.replace(tag, `<script>\n${jsFile.content}\n</script>`);
                }
            }
        });
    }

    return html;
};

export default function App() {
  const [userInput, setUserInput] = useState('');
  const [state, setState] = useState<AppState>({
    messages: [],
    projectType: PROJECT_TYPES[0],
    agents: INITIAL_AGENTS_STATE,
    files: [],
    isRunning: false,
    activeTab: 'chat', 
  });
  const [isListening, setIsListening] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const originalInputRef = useRef('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [state.messages, state.isRunning]);

  const updateAgentState = (role: AgentRole, updates: Partial<typeof INITIAL_AGENTS_STATE[AgentRole]>) => {
    setState(prev => ({
      ...prev,
      agents: {
        ...prev.agents,
        [role]: { ...prev.agents[role], ...updates }
      }
    }));
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language; // Use browser language
    recognition.continuous = true;
    recognition.interimResults = true;

    // Capture the current input so we can append to it
    originalInputRef.current = userInput;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      
      // Append transcript to the text that was there before we started listening
      const prefix = originalInputRef.current;
      setUserInput(prefix + (prefix && transcript ? ' ' : '') + transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
         alert("Microphone access denied. Please allow microphone access in your browser settings to use voice input.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || state.isRunning) return;

    // Stop listening if sending
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const newMessage: ChatMessage = {
      role: 'user',
      content: userInput,
      timestamp: Date.now()
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, newMessage],
      isRunning: true,
      activeTab: prev.messages.length === 0 ? 'agents' : prev.activeTab
    }));
    
    setUserInput('');

    try {
      // 1. Product Manager Plans
      updateAgentState(AgentRole.PDM, { status: 'running', output: '' });
      
      const contextBase = {
        messages: [...state.messages, newMessage],
        projectType: state.projectType,
        files: state.files,
        agents: state.agents
      };

      let pdmOutput = '';
      await runAgent(AgentRole.PDM, { ...contextBase, agents: state.agents }, (chunk) => {
        pdmOutput += chunk;
        updateAgentState(AgentRole.PDM, { output: pdmOutput });
      });
      
      updateAgentState(AgentRole.PDM, { status: 'done', output: pdmOutput });

      const agentsWithPM = {
        ...state.agents,
        [AgentRole.PDM]: { ...state.agents[AgentRole.PDM], status: 'done', output: pdmOutput }
      };

      // 2. Parallel Execution
      const parallelRoles = [
        AgentRole.ARCHITECT,
        AgentRole.DESIGNER,
        AgentRole.FRONTEND,
        AgentRole.BACKEND,
        AgentRole.QA,
        AgentRole.DOCS
      ];

      parallelRoles.forEach(role => updateAgentState(role, { status: 'running', output: '' }));

      const parallelPromises = parallelRoles.map(role => {
        let agentOutput = '';
        return runAgent(role, { 
            ...contextBase, 
            agents: agentsWithPM as any 
        }, (chunk) => {
            agentOutput += chunk;
            updateAgentState(role, { output: agentOutput });
        }).then(output => ({ role, output }));
      });

      const results = await Promise.all(parallelPromises);

      // Process Results
      const newFiles: ProjectFile[] = [];
      const updatedAgents = { ...agentsWithPM };

      results.forEach(({ role, output }) => {
        updatedAgents[role] = { ...updatedAgents[role], status: 'done', output };
        const extracted = extractFiles(output);
        newFiles.push(...extracted);
      });

      // Merge files
      const mergedFiles = [...state.files];
      newFiles.forEach(nf => {
        const index = mergedFiles.findIndex(f => f.path === nf.path);
        if (index >= 0) {
          mergedFiles[index] = nf;
        } else {
          mergedFiles.push(nf);
        }
      });

      setState(prev => ({
        ...prev,
        agents: updatedAgents as any,
        files: mergedFiles
      }));

      // 3. Reviewer
      updateAgentState(AgentRole.REVIEWER, { status: 'running', output: '' });
      let revOutput = '';
      await runAgent(AgentRole.REVIEWER, {
        ...contextBase,
        agents: updatedAgents as any,
        files: mergedFiles
      }, (chunk) => {
        revOutput += chunk;
        updateAgentState(AgentRole.REVIEWER, { output: revOutput });
      });
      updateAgentState(AgentRole.REVIEWER, { status: 'done', output: revOutput });

      setState(prev => ({
        ...prev,
        messages: [
            ...prev.messages, 
            { role: 'assistant', content: 'Team finished iteration. Check the "Team View" or "Project Files" tabs.', timestamp: Date.now() }
        ],
        isRunning: false
      }));

    } catch (error) {
      console.error("Orchestration error:", error);
      setState(prev => ({ ...prev, isRunning: false }));
    }
  };

  const handleDownloadZip = async () => {
    if (state.files.length === 0) return;
    const zip = new JSZip();
    state.files.forEach(file => {
      // Clean path just in case
      const path = file.path.replace(/^(\.\/|\/)+/, '');
      zip.file(path, file.content);
    });
    
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project-files.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const readmeFile = state.files.find(f => f.path.toLowerCase().includes('readme'));
  const previewDoc = generatePreviewDoc(state.files);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900 shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Bot size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              Multi-Agent Dev Studio
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-400">
               <span>Virtual Product Team</span>
               <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
               <span>Powered by Gemini</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
             <select
                value={state.projectType}
                onChange={(e) => setState(prev => ({ ...prev, projectType: e.target.value }))}
                className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-md text-xs focus:ring-1 focus:ring-blue-500 outline-none"
              >
                {PROJECT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
             {state.files.length > 0 && (
                <button 
                    onClick={handleDownloadZip}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20"
                >
                    <Download size={14} /> Download ZIP
                </button>
             )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Side: Chat Interface */}
        <div className="w-1/3 min-w-[350px] max-w-[500px] flex flex-col border-r border-slate-800 bg-slate-950">
            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {state.messages.length === 0 ? (
                    <div className="text-center text-slate-500 mt-20 px-6">
                        <Sparkles size={48} className="mx-auto mb-4 opacity-30" />
                        <h3 className="text-lg font-medium text-slate-300 mb-2">Start a New Project</h3>
                        <p className="text-sm">Describe your idea (e.g., "A kanban board for personal tasks") and the AI team will build it for you.</p>
                    </div>
                ) : (
                    state.messages.map((msg, idx) => (
                        <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                msg.role === 'user' 
                                ? 'bg-blue-600 text-white rounded-br-none' 
                                : 'bg-slate-800 text-slate-200 rounded-bl-none'
                            }`}>
                                {msg.content}
                            </div>
                            <span className="text-[10px] text-slate-600 mt-1 px-1">
                                {msg.role === 'user' ? 'You' : 'System'}
                            </span>
                        </div>
                    ))
                )}
                {state.isRunning && (
                    <div className="flex items-center gap-2 text-slate-500 text-sm ml-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-75"></span>
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-150"></span>
                        Team is working...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-slate-900 border-t border-slate-800">
                <div className="relative">
                    <textarea 
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={(e) => {
                            // Fix for IME (Japanese, Chinese, etc.) inputs
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        placeholder="Describe features or changes..."
                        className="w-full bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl pl-4 pr-24 py-3 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none resize-none h-24"
                    />
                    
                    <div className="absolute right-3 bottom-3 flex items-center gap-2">
                        <button 
                            onClick={toggleListening}
                            disabled={state.isRunning}
                            className={`p-2 rounded-lg transition-all duration-300 ${
                                isListening 
                                ? 'bg-red-500 text-white animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]' 
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                            }`}
                            title={isListening ? "Stop recording" : "Start voice input"}
                        >
                            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                        </button>

                        <button 
                            onClick={handleSendMessage}
                            disabled={!userInput.trim() || state.isRunning}
                            className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
                        >
                            {state.isRunning ? <Sparkles size={16} className="animate-spin" /> : <Send size={16} />}
                        </button>
                    </div>
                </div>
                <div className="text-center mt-2">
                     <p className="text-[10px] text-slate-500">
                        Agents run in parallel. Project state is maintained in-browser.
                     </p>
                </div>
            </div>
        </div>

        {/* Right Side: Visualizers */}
        <div className="flex-1 flex flex-col bg-slate-900/30 overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center border-b border-slate-800 bg-slate-950 px-4 pt-2 gap-1 overflow-x-auto">
                <button
                    onClick={() => setState(prev => ({ ...prev, activeTab: 'agents' }))}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
                        state.activeTab === 'agents' 
                        ? 'bg-slate-900 text-blue-400 border-t border-x border-slate-800' 
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'
                    }`}
                >
                    <LayoutDashboard size={16} /> Team View
                </button>
                <button
                    onClick={() => setState(prev => ({ ...prev, activeTab: 'files' }))}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
                        state.activeTab === 'files' 
                        ? 'bg-slate-900 text-emerald-400 border-t border-x border-slate-800' 
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'
                    }`}
                >
                    <Layers size={16} /> Files
                    {state.files.length > 0 && (
                        <span className="bg-slate-800 text-xs px-1.5 py-0.5 rounded-full text-slate-300">{state.files.length}</span>
                    )}
                </button>
                 <button
                    onClick={() => setState(prev => ({ ...prev, activeTab: 'preview' }))}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
                        state.activeTab === 'preview' 
                        ? 'bg-slate-900 text-purple-400 border-t border-x border-slate-800' 
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'
                    }`}
                >
                    <Play size={16} /> Preview
                </button>
                <button
                    onClick={() => setState(prev => ({ ...prev, activeTab: 'readme' }))}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 transition-colors whitespace-nowrap ${
                        state.activeTab === 'readme' 
                        ? 'bg-slate-900 text-amber-400 border-t border-x border-slate-800' 
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'
                    }`}
                >
                    <FileText size={16} /> README
                </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden relative bg-slate-900">
                {state.activeTab === 'agents' && (
                    <div className="absolute inset-0 overflow-y-auto p-6">
                         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
                            {/* PM takes full width on top */}
                            <div className="col-span-1 md:col-span-2 xl:col-span-3 2xl:col-span-4">
                                <AgentCard agent={state.agents[AgentRole.PDM]} />
                            </div>
                            
                            <AgentCard agent={state.agents[AgentRole.ARCHITECT]} />
                            <AgentCard agent={state.agents[AgentRole.DESIGNER]} />
                            <AgentCard agent={state.agents[AgentRole.FRONTEND]} />
                            <AgentCard agent={state.agents[AgentRole.BACKEND]} />
                            <AgentCard agent={state.agents[AgentRole.QA]} />
                            <AgentCard agent={state.agents[AgentRole.DOCS]} />
                            
                            {/* Reviewer takes full width at bottom */}
                            <div className="col-span-1 md:col-span-2 xl:col-span-3 2xl:col-span-4">
                                <AgentCard agent={state.agents[AgentRole.REVIEWER]} />
                            </div>
                        </div>
                    </div>
                )}

                {state.activeTab === 'files' && (
                    <div className="absolute inset-0 p-6">
                        <FileExplorer files={state.files} />
                    </div>
                )}

                {state.activeTab === 'preview' && (
                    <div className="absolute inset-0 p-6 flex flex-col">
                        <div className="flex-1 bg-white rounded-lg border border-slate-700 overflow-hidden relative">
                            {previewDoc ? (
                                <iframe 
                                    srcDoc={previewDoc}
                                    title="Preview"
                                    className="w-full h-full border-none bg-white"
                                    sandbox="allow-scripts"
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900">
                                    <Play size={48} className="mb-4 opacity-50" />
                                    <p>No index.html found to preview.</p>
                                    <p className="text-xs mt-2">Ask the team to build a web app or generate an index.html file.</p>
                                </div>
                            )}
                        </div>
                        <div className="text-center text-xs text-slate-500 mt-2">
                            *Preview runs in a sandboxed iframe. External API calls may be blocked by browser security.
                        </div>
                    </div>
                )}

                {state.activeTab === 'readme' && (
                    <div className="absolute inset-0 overflow-y-auto p-8">
                         <div className="max-w-4xl mx-auto bg-slate-950 p-8 rounded-lg border border-slate-800 min-h-[500px] shadow-xl">
                            {readmeFile ? (
                                <article className="prose prose-invert prose-slate max-w-none whitespace-pre-wrap">
                                    {readmeFile.content}
                                </article>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                                    <FileText size={48} className="mb-4 opacity-50" />
                                    <p>README not generated yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

      </div>
    </div>
  );
}