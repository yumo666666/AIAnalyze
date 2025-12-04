import React, { useRef, useState } from 'react';
import { FileText, Upload, Trash2, Eye, Image as ImageIcon, FileBarChart } from 'lucide-react';
import { FileItem } from '../types';
import clsx from 'clsx';

interface SidebarProps {
  files: FileItem[];
  outputs?: FileItem[]; // Make optional to be safe
  onUpload: (file: File) => void;
  onDelete: (fileName: string) => void;
  onDeleteOutput?: (fileName: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ files, outputs = [], onUpload, onDelete, onDeleteOutput }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(file => onUpload(file));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach(file => onUpload(file));
    }
  };

  const isImage = (name: string) => /\.(png|jpg|jpeg|gif|svg)$/i.test(name);

  return (
    <div className="w-1/3 border-r h-full flex flex-col bg-gray-50 dark:bg-slate-900">
      {/* 上半部分：文件输入 */}
      <div className="flex-1 p-4 flex flex-col border-b min-h-0 h-1/2">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="font-semibold text-lg">数据输入区</h2>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
          >
            <Upload size={16} /> 上传
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            multiple
          />
        </div>
        
        <div 
          className={clsx(
            "flex-1 overflow-y-auto space-y-2 transition-colors rounded-lg min-h-0",
            isDragging && "bg-blue-50 border-2 border-dashed border-blue-400"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {files.length === 0 && (
            <div className={clsx(
              "text-center text-gray-400 mt-10 border-2 border-dashed border-gray-300 rounded-lg p-8",
              isDragging && "border-transparent"
            )}>
              <p>暂无文件</p>
              <p className="text-xs mt-2">点击上传或拖拽文件到此处 (支持多文件)</p>
            </div>
          )}
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded border shadow-sm group hover:border-blue-400 transition-all">
              <div className="flex items-center gap-3 overflow-hidden">
                <FileText size={20} className="text-blue-500 flex-shrink-0" />
                <div className="truncate">
                  <p className="font-medium truncate text-sm" title={file.name}>{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a 
                  href={`http://127.0.0.1:8080/uploads/${file.name}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-gray-100 rounded text-gray-600"
                  title="查看/下载"
                >
                  <Eye size={14} />
                </a>
                <button 
                  onClick={() => onDelete(file.name)}
                  className="p-1 hover:bg-red-100 rounded text-red-500"
                  title="删除文件"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 下半部分：分析产物 */}
      <div className="h-1/2 p-4 flex flex-col bg-white dark:bg-slate-900 min-h-0">
        <h2 className="font-semibold text-lg mb-2 flex-shrink-0">分析产物</h2>
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {outputs.length === 0 && (
                <div className="text-center text-gray-400 mt-10">
                    <p>暂无产物</p>
                </div>
            )}
            {outputs.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded border shadow-sm group hover:border-purple-400 transition-all">
                    <div className="flex items-center gap-3 overflow-hidden cursor-pointer" onClick={() => window.open(file.url, '_blank')}>
                        {isImage(file.name) ? <ImageIcon size={20} className="text-purple-500 flex-shrink-0" /> : <FileBarChart size={20} className="text-green-500 flex-shrink-0" />}
                        <div className="truncate">
                            <p className="font-medium truncate text-sm" title={file.name}>{file.name}</p>
                            <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <a 
                            href={file.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-gray-200 rounded text-gray-600"
                            title="查看/下载"
                         >
                            <Eye size={14} />
                         </a>
                         {onDeleteOutput && (
                            <button 
                              onClick={() => onDeleteOutput(file.name)}
                              className="p-1 hover:bg-red-100 rounded text-red-500"
                              title="删除文件"
                            >
                              <Trash2 size={14} />
                            </button>
                         )}
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};
