import React, { useState } from 'react';
import { ProjectFile } from '../types';
import { FolderOpen, FileCode, ChevronRight } from 'lucide-react';

interface FileExplorerProps {
  files: ProjectFile[];
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ files }) => {
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(files.length > 0 ? files[0] : null);

  // Update selected file if files change and current selection is invalid
  React.useEffect(() => {
    if (files.length > 0 && (!selectedFile || !files.find(f => f.path === selectedFile.path))) {
        setSelectedFile(files[0]);
    }
  }, [files, selectedFile]);

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 border border-dashed border-slate-700 rounded-lg">
        <FolderOpen size={48} className="mb-4 opacity-50" />
        <p>No files generated yet.</p>
        <p className="text-xs mt-2">Wait for the coding agents to finish.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[600px] border border-slate-700 rounded-lg overflow-hidden bg-slate-900">
      {/* Sidebar List */}
      <div className="w-1/3 border-r border-slate-700 flex flex-col bg-slate-950">
        <div className="p-3 border-b border-slate-800 bg-slate-900 font-medium text-slate-300 flex items-center gap-2">
            <FolderOpen size={16} /> Project Files
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {files.map((file) => (
            <button
              key={file.path}
              onClick={() => setSelectedFile(file)}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm transition-colors ${
                selectedFile?.path === file.path
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <FileCode size={14} />
              <span className="truncate">{file.path}</span>
              {selectedFile?.path === file.path && <ChevronRight size={14} className="ml-auto" />}
            </button>
          ))}
        </div>
      </div>

      {/* Code Viewer */}
      <div className="w-2/3 flex flex-col bg-[#1e1e1e]">
        {selectedFile ? (
          <>
            <div className="p-3 border-b border-slate-700 bg-slate-800 text-xs font-mono text-slate-300">
              {selectedFile.path}
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="font-mono text-sm text-slate-300 leading-relaxed">
                <code>{selectedFile.content}</code>
              </pre>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            Select a file to view content
          </div>
        )}
      </div>
    </div>
  );
};
