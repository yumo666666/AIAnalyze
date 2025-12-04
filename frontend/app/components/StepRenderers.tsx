import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Step } from '../types';
import { Brain, Code, Terminal, FileText, Search, ChevronDown, ChevronRight, CheckCircle, AlertCircle, Image as ImageIcon, FolderOpen } from 'lucide-react';
import clsx from 'clsx';

interface StepRendererProps {
  step: Step;
  isLast: boolean;
}

export const StepRenderer: React.FC<StepRendererProps> = ({ step, isLast }) => {
  const [expanded, setExpanded] = useState(isLast);
  const contentRef = useRef<HTMLPreElement>(null);
  const prevStatusRef = useRef(step.status);

  useEffect(() => {
      if (isLast) {
          setExpanded(true);
      } else {
          setExpanded(false);
      }
  }, [isLast]);

  // Auto-scroll to bottom when content updates and is executing
  useEffect(() => {
      if (expanded && contentRef.current) {
          const isExecuting = step.status === 'executing';
          const justFinished = prevStatusRef.current === 'executing' && step.status === 'done';

          if (isExecuting || justFinished) {
              contentRef.current.scrollTop = contentRef.current.scrollHeight;
          }
      }
      prevStatusRef.current = step.status;
  }, [step.content, expanded, step.status]);

  const getIcon = () => {
    switch (step.type) {
      case 'Analyze': return <Search size={18} />;
      case 'Understand': return <Brain size={18} />;
      case 'Code': return <Code size={18} />;
      case 'Execute': return <Terminal size={18} />;
      case 'Answer': return <FileText size={18} />;
      case 'Files': return <FolderOpen size={18} />;
      default: return <Search size={18} />;
    }
  };

  const getTitle = () => {
    switch (step.type) {
      case 'Analyze': return '需求分析 (Analyze)';
      case 'Understand': return '思考规划 (Understand)';
      case 'Code': return '生成代码 (Code)';
      case 'Execute': return '执行结果 (Execute)';
      case 'Answer': return '最终报告 (Answer)';
      case 'Files': return '生成产物 (Files)';
      default: return '步骤';
    }
  };

  const getColor = () => {
    switch (step.type) {
      case 'Analyze': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'Understand': return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'Code': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'Execute': return 'text-slate-600 bg-slate-50 border-slate-200';
      case 'Answer': return 'text-green-600 bg-green-50 border-green-200';
      case 'Files': return 'text-pink-600 bg-pink-50 border-pink-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const renderFiles = (content: string) => {
      const files = content.split('\n').filter(line => line.trim() !== '');
      return (
          <div className="grid grid-cols-2 gap-4">
              {files.map((file, idx) => {
                  const cleanPath = file.trim();
                  const fileName = cleanPath.split('/').pop() || cleanPath;
                  const isImage = /\.(png|jpg|jpeg|gif|svg)$/i.test(fileName);
                  // Adjust path to be accessible via API
                  const url = `http://127.0.0.1:8080/${cleanPath}`;
                  
                  if (isImage) {
                      return (
                          <div key={idx} className="border rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                              <img src={url} alt={fileName} className="w-full h-auto object-contain max-h-[300px]" />
                              <div className="p-2 text-xs text-center truncate" title={fileName}>{fileName}</div>
                          </div>
                      );
                  }
                  return (
                      <a 
                        key={idx} 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 border rounded bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                          <FileText size={16} />
                          <span className="truncate text-sm">{fileName}</span>
                      </a>
                  );
              })}
          </div>
      );
  };

  return (
    <div className="mb-4 last:mb-0 w-full max-w-full">
      <div 
        className={clsx(
          "flex items-center justify-between p-3 rounded-t border cursor-pointer transition-colors w-full",
          getColor(),
          !expanded && "rounded-b"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 font-medium">
          {getIcon()}
          <span>{getTitle()}</span>
          {step.status === 'executing' && <span className="animate-pulse text-xs ml-2">(执行中...)</span>}
        </div>
        <div className="flex items-center gap-2">
            {step.status === 'done' && <CheckCircle size={14} className="text-green-500"/>}
            {step.status === 'error' && <AlertCircle size={14} className="text-red-500"/>}
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>
      
      {expanded && (
        <div className="border-x border-b rounded-b bg-white dark:bg-slate-950">
          <div className="p-4 overflow-x-auto max-w-full">
            {step.type === 'Code' ? (
               <pre 
                         ref={contentRef}
                         className="text-sm bg-slate-100 dark:bg-slate-900 p-3 rounded font-mono whitespace-pre-wrap break-all max-h-[500px] overflow-y-auto"
                       >
                 <code>{step.content}</code>
               </pre>
            ) : step.type === 'Answer' ? (
               <div className="prose dark:prose-invert max-w-none overflow-hidden break-words">
                  <ReactMarkdown>{step.content}</ReactMarkdown>
               </div>
            ) : step.type === 'Execute' ? (
               <pre 
                         ref={contentRef}
                         className="text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto"
                       >
                  {step.content}
               </pre>
            ) : step.type === 'Files' ? (
                renderFiles(step.content)
            ) : (
               <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 overflow-hidden">
                  {step.content}
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
