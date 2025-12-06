import React from 'react';
import { AgentRole, AgentState } from '../types';
import { CheckCircle2, Circle, Loader2, AlertCircle, Copy } from 'lucide-react';

interface AgentCardProps {
  agent: AgentState;
}

const STATUS_ICONS = {
  idle: <Circle className="w-5 h-5 text-slate-500" />,
  running: <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />,
  done: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
  error: <AlertCircle className="w-5 h-5 text-red-400" />,
};

const STATUS_COLORS = {
  idle: 'border-slate-800 bg-slate-900/50',
  running: 'border-blue-500/50 bg-blue-950/20',
  done: 'border-emerald-500/50 bg-emerald-950/20',
  error: 'border-red-500/50 bg-red-950/20',
};

const ThinkingAnimation = () => (
  <div className="flex flex-col items-center justify-center h-full min-h-[150px] w-full gap-4">
    <div className="relative w-16 h-16">
      {/* Outer Ring */}
      <div 
        className="absolute inset-0 border-4 border-t-blue-500 border-r-transparent border-b-purple-500 border-l-transparent rounded-full animate-spin" 
        style={{ animationDuration: '3s' }}
      ></div>
      {/* Middle Ring */}
      <div 
        className="absolute inset-2 border-4 border-t-transparent border-r-emerald-400 border-b-transparent border-l-cyan-400 rounded-full animate-spin" 
        style={{ animationDirection: 'reverse', animationDuration: '2s' }}
      ></div>
      {/* Inner Ring */}
      <div 
        className="absolute inset-4 border-4 border-t-pink-500 border-r-transparent border-b-orange-400 border-l-transparent rounded-full animate-spin" 
        style={{ animationDuration: '1.5s' }}
      ></div>
      {/* Center Glow */}
      <div className="absolute inset-[1.2rem] bg-white/20 blur-sm rounded-full animate-pulse"></div>
    </div>
    <p className="text-xs text-slate-500 animate-pulse font-mono tracking-widest uppercase">Thinking</p>
  </div>
);

export const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(agent.output);
  };

  const showLoader = agent.status === 'running' && !agent.output;
  const showOutput = agent.output.length > 0;

  return (
    <div className={`flex flex-col rounded-lg border p-4 transition-all duration-300 ${STATUS_COLORS[agent.status]} h-[400px] shadow-lg`}>
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          {STATUS_ICONS[agent.status]}
          <h3 className="font-semibold text-slate-100 truncate max-w-[150px]" title={agent.role}>{agent.role}</h3>
        </div>
        <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-medium text-slate-500 hidden sm:inline-block">
                {agent.status}
            </span>
            {showOutput && (
                <button 
                    onClick={handleCopy} 
                    className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors"
                    title="Copy output"
                >
                    <Copy size={14} />
                </button>
            )}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto rounded bg-slate-950/50 border border-slate-800 p-3 text-sm font-mono text-slate-300 scrollbar-thin relative">
        {agent.status === 'idle' && (
          <div className="flex h-full items-center justify-center">
             <p className="text-slate-600 italic">Waiting to start...</p>
          </div>
        )}
        
        {showLoader && <ThinkingAnimation />}
        
        {agent.status === 'error' && (
           <div className="text-red-400 flex items-start gap-2">
             <AlertCircle size={16} className="mt-0.5 shrink-0" />
             <p>Error: {agent.error}</p>
           </div>
        )}
        
        {showOutput && (
          <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed break-words">
            {agent.output}
            {agent.status === 'running' && (
              <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-blue-400 animate-pulse rounded-sm" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
