"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { StepRenderer } from './components/StepRenderers';
import { FileItem, Message, Step, StepType, ModelItem } from './types';
import { Send, StopCircle, Eraser, Bot } from 'lucide-react';

export default function Home() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [outputs, setOutputs] = useState<FileItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<'idle' | 'busy'>('idle');
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [maxSteps, setMaxSteps] = useState(30);
  const [currentStep, setCurrentStep] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load files, models, and settings on mount
  useEffect(() => {
    fetchFiles();
    fetchOutputs();
    fetchModels();
    
    // Load chat history
    const savedMessages = localStorage.getItem('chat_history');
    if (savedMessages) {
        try {
            setMessages(JSON.parse(savedMessages));
        } catch (e) {
            console.error("Failed to parse chat history", e);
        }
    }

    // Load max steps
    const savedMaxSteps = localStorage.getItem('max_steps');
    if (savedMaxSteps) {
        setMaxSteps(parseInt(savedMaxSteps, 10));
    }
  }, []);

  // Save chat history whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
        localStorage.setItem('chat_history', JSON.stringify(messages));
    }
  }, [messages]);

  // Save max steps whenever it changes
  useEffect(() => {
      localStorage.setItem('max_steps', maxSteps.toString());
  }, [maxSteps]);

  const fetchFiles = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8080/files');
      const data = await res.json();
      setFiles(data);
    } catch (e) {
      console.error("Failed to fetch files", e);
    }
  };

  const fetchOutputs = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8080/outputs');
      const data = await res.json();
      setOutputs(data);
    } catch (e) {
      console.error("Failed to fetch outputs", e);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8080/v1/models');
      const data = await res.json();
      if (data && data.data && Array.isArray(data.data)) {
        setModels(data.data);
        if (data.data.length > 0) {
            setSelectedModel(data.data[0].id);
        }
      }
    } catch (e) {
        console.error("Failed to fetch models", e);
    }
  };

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('http://127.0.0.1:8080/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        fetchFiles();
      }
    } catch (e) {
      console.error("Upload failed", e);
    }
  };

  const handleDeleteFile = async (fileName: string) => {
     try {
       const res = await fetch(`http://127.0.0.1:8080/files/${fileName}`, {
         method: 'DELETE',
       });
       if (res.ok) {
         fetchFiles();
       } else {
         alert("删除失败");
       }
     } catch (e) {
       console.error("Failed to delete file", e);
       alert("删除出错");
     }
  };

  const handleDeleteOutput = async (fileName: string) => {
     try {
       const res = await fetch(`http://127.0.0.1:8080/outputs/${fileName}`, {
         method: 'DELETE',
       });
       if (res.ok) {
         fetchOutputs();
       } else {
         alert("删除失败");
       }
     } catch (e) {
       console.error("Failed to delete output", e);
       alert("删除出错");
     }
  };

  const connectWebSocket = () => {
    if (wsRef.current) return;
    const ws = new WebSocket('ws://127.0.0.1:8080/ws/chat');
    
    ws.onopen = () => {
      console.log('Connected to WS');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'stream_start') {
        setStatus('busy');
        // Create a new empty assistant message if the last one isn't from assistant or is "done"
        setMessages(prev => {
            const last = prev[prev.length - 1];
            if (!last || last.role === 'user') {
                return [...prev, { role: 'assistant', content: '' }];
            }
            return prev;
        });
      } else if (data.type === 'stream_token') {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIdx = newMessages.length - 1;
          const lastMsg = newMessages[lastIdx];
          
          if (lastMsg && lastMsg.role === 'assistant') {
            // Create a new object to avoid mutating the state directly
            newMessages[lastIdx] = {
                ...lastMsg,
                content: lastMsg.content + data.content
            };
          }
          return newMessages;
        });
      } else if (data.type === 'result') {
        // ... (result handling logic)
        setMessages(prev => {
            const newMessages = [...prev];
            const lastIdx = newMessages.length - 1;
            const lastMsg = newMessages[lastIdx];
            
            if (lastMsg && lastMsg.role === 'assistant') {
               // Create a new object
               newMessages[lastIdx] = {
                   ...lastMsg,
                   content: lastMsg.content + `\n<result>\n${data.content}\n</result>\n`
               };
            }
            return newMessages;
        });
      } else if (data.type === 'files_updated') {
          // Real-time refresh of outputs
          fetchOutputs();
          fetchFiles(); 
      } else if (data.type === 'step_update') {
          setCurrentStep(data.current);
      } else if (data.type === 'done') {
        setStatus('idle');
        fetchFiles(); // Refresh file list (maybe new files created)
        fetchOutputs(); // Refresh outputs
      }
    };

    ws.onclose = () => {
      console.log('WS Closed');
      wsRef.current = null;
      // Reconnect after a delay if needed
    };

    wsRef.current = ws;
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
        wsRef.current?.close();
    };
  }, []);

  const handleStop = () => {
    if (wsRef.current) {
        wsRef.current.close(); // Close connection to stop backend processing (effectively)
        setStatus('idle');
        // Optionally reconnect immediately or wait for next user action.
        // Reconnecting is safer to ensure next message works.
        setTimeout(() => connectWebSocket(), 500);
    }
  };

  const sendMessage = () => {
    if (status === 'busy') {
        handleStop();
        return;
    }
    
    if (!input.trim()) return;
    
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setStatus('busy'); // Immediately set status to busy
    
    // Ensure connection is open
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        // Give it a split second to connect if it was closed? 
        // Better to rely on onopen, but for simplicity in this flow:
        setTimeout(() => {
            wsRef.current?.send(JSON.stringify({ message: input, model: selectedModel, max_steps: maxSteps }));
        }, 500);
    } else {
        wsRef.current.send(JSON.stringify({ message: input, model: selectedModel, max_steps: maxSteps }));
    }
    
    setInput("");
    setCurrentStep(0); // Reset step count on new message
  };

  // Parser to convert raw content string into structured Steps
  const parseSteps = (content: string): Step[] => {
    const steps: Step[] = [];
    
    // 简单状态机解析
    let remaining = content;
    let currentStepType: StepType | null = null;
    let stepStartIndex = -1;

    // 查找所有可能的标签位置
     const tags = ['Analyze', 'Understand', 'Code', 'Execute', 'Answer', 'Files'];
     
     // 辅助函数：查找下一个最近的开始标签
     const findNextStartTag = (text: string) => {
         let minIndex = -1;
         let foundTag = null;
         
         for (const tag of tags) {
             const index = text.indexOf(`<${tag}`); // 宽松匹配 <tag...
            if (index !== -1) {
                if (minIndex === -1 || index < minIndex) {
                    minIndex = index;
                    foundTag = tag;
                }
            }
        }
        return { index: minIndex, tag: foundTag };
    };

    // 如果开头有非标签文本（通常是思考过程漏网之鱼，或者是结果反馈），作为 text 渲染
    // 但我们主要关注标签。如果开头就是文本，我们先把它当作 think 或者 text
    
    let loopSafe = 0;
    while (remaining.length > 0 && loopSafe < 1000) {
        loopSafe++;
        
        const { index: nextStartTagIndex, tag: nextStartTag } = findNextStartTag(remaining);
        
        if (nextStartTagIndex === -1) {
            // 没有开始标签了，剩下的都是当前步骤的内容（如果正在标签内）或者普通文本
            // 如果我们之前在解析一个标签，看是否有结束标签
            // 这里简化：如果没有开始标签了，剩下的全部归为上一个步骤，或者作为新的 text 步骤
            if (remaining.trim()) {
                  steps.push({
                     id: `text-${steps.length}`,
                     type: 'Understand', // 默认为 Understand
                     content: remaining.trim(),
                     status: 'done',
                     timestamp: Date.now()
                  });
             }
             break;
         }
         
         // 有开始标签
         // 先处理标签前面的文本（如果有）
         if (nextStartTagIndex > 0) {
             const textBefore = remaining.substring(0, nextStartTagIndex).trim();
             if (textBefore) {
                 steps.push({
                     id: `pre-${steps.length}`,
                     type: 'Understand',
                     content: textBefore,
                     status: 'done',
                     timestamp: Date.now()
                  });
             }
         }
        
        // 处理当前标签
        const tag = nextStartTag!;
        // 寻找结束标签
        const endTagStr = `</${tag}>`;
        const endTagIndex = remaining.indexOf(endTagStr, nextStartTagIndex);
        
        if (endTagIndex !== -1) {
            // 完整标签
            const fullContent = remaining.substring(nextStartTagIndex, endTagIndex + endTagStr.length);
            // 提取内容：去掉 <tag ...> 和 </tag>
            const contentStart = fullContent.indexOf('>') + 1;
            const contentEnd = fullContent.lastIndexOf('<');
            const body = fullContent.substring(contentStart, contentEnd).trim();
            
            steps.push({
                id: `step-${steps.length}`,
                type: tag as StepType,
                content: body,
                status: 'done',
                timestamp: Date.now()
            });
            
            remaining = remaining.substring(endTagIndex + endTagStr.length);
        } else {
            // 标签未闭合（流式传输中）
            // 提取内容：从 <tag...> 之后的所有内容
            const tagContentStart = remaining.indexOf('>', nextStartTagIndex) + 1;
            if (tagContentStart > 0) {
                 const body = remaining.substring(tagContentStart);
                 steps.push({
                    id: `step-streaming-${steps.length}`,
                    type: tag as StepType,
                    content: body,
                    status: 'executing',
                    timestamp: Date.now()
                 });
            }
            // 既然未闭合，说明是最后一个步骤，结束循环
            break;
        }
    }
    
    // 处理 <result> 标签 (这是后端注入的)
    // 上面的逻辑可能把 <result> 当作 text 处理了，或者因为不在 tags 列表里被忽略
    // 实际上后端注入的是 <result>...</result>，我们应该把它作为单独的步骤类型
    // 但 StepType 里定义了 result。
    // 我们可以在上面的 tags 数组里加上 result
    
    return steps;
  };

  // 增强 parseSteps，加入 result 支持
   const parseStepsWithResult = (content: string): Step[] => {
       // 先把 <result> 替换成标准 xml 格式如果它是特殊的，
       // 但目前我们主要解析标准 tags。
       // 我们需要修改上面的 tags 列表，把 result 加进去。
       // 但为了不修改原函数太乱，我重写一下上面的 tags 定义
       
       // 重新实现一个更干净的解析器
       const steps: Step[] = [];
       const tags = ['Analyze', 'Understand', 'Code', 'Execute', 'Answer', 'Files'];
       
       let cursor = 0;
       while (cursor < content.length) {
           // 寻找下一个标签开始
           let bestTag = null;
           let bestIndex = -1;
           
           for (const tag of tags) {
               const startStr = `<${tag}`;
               const idx = content.indexOf(startStr, cursor);
               if (idx !== -1) {
                   if (bestIndex === -1 || idx < bestIndex) {
                       bestIndex = idx;
                       bestTag = tag;
                   }
               }
           }
           
           if (bestIndex === -1) {
               // 没有更多标签了，剩下的都是文本
               const text = content.substring(cursor).trim();
               if (text) {
                   // 只有当不是单纯的空白时才添加
                   // 如果是在 result 之后的换行，可能不需要
                   steps.push({
                       id: `text-${cursor}`,
                       type: 'Understand', // 默认归类
                       content: text,
                       status: 'done',
                       timestamp: Date.now()
                   });
               }
               break;
           }
           
           // 处理标签前的文本
           if (bestIndex > cursor) {
               const text = content.substring(cursor, bestIndex).trim();
               if (text) {
                   steps.push({
                       id: `text-${cursor}`,
                       type: 'Understand',
                       content: text,
                       status: 'done',
                       timestamp: Date.now()
                   });
               }
           }
          
          // 处理标签内容
          const tag = bestTag!;
          // 找到开始标签的结束 '>'
          const startTagEnd = content.indexOf('>', bestIndex);
          if (startTagEnd === -1) {
              // 只有半个开始标签，例如 <co
              break; 
          }
          
          const endTagStr = `</${tag}>`;
          const endTagIndex = content.indexOf(endTagStr, startTagEnd);
          
          if (endTagIndex !== -1) {
              // 完整闭合标签
              const body = content.substring(startTagEnd + 1, endTagIndex).trim();
              steps.push({
                  id: `step-${bestIndex}`,
                  type: tag as StepType,
                  content: body,
                  status: 'done',
                  timestamp: Date.now()
              });
              cursor = endTagIndex + endTagStr.length;
          } else {
              // 未闭合标签（流式）
              const body = content.substring(startTagEnd + 1); // 保留空格，因为可能是代码
              steps.push({
                  id: `step-${bestIndex}-streaming`,
                  type: tag as StepType,
                  content: body, // 不 trim，保留打字机效果
                  status: 'executing',
                  timestamp: Date.now()
              });
              cursor = content.length; // 结束
          }
      }
      return steps;
  };

  return (
    <div className="flex h-screen w-full bg-white text-slate-900 font-sans">
      <Sidebar 
        files={files} 
        outputs={outputs}
        onUpload={handleUpload} 
        onDelete={handleDeleteFile} 
        onDeleteOutput={handleDeleteOutput}
      />
      
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <header className="h-14 border-b flex items-center px-6 justify-between bg-white dark:bg-slate-950">
            <div className="flex items-center gap-2">
                <Bot className="text-blue-600" />
                <h1 className="font-bold text-lg">DataSight Agent</h1>
            </div>
            
            {/* Max Steps Control */}
            <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Steps:</span>
                <span className="font-mono font-bold text-blue-600 w-6 text-right">{currentStep}</span>
                <span className="text-gray-400">/</span>
                <input 
                    type="number" 
                    min="5" 
                    max="100"
                    value={maxSteps}
                    onChange={(e) => setMaxSteps(parseInt(e.target.value) || 30)}
                    disabled={status === 'busy'}
                    className="w-16 border rounded px-1 py-0.5 text-center font-mono focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                    title="最大循环步数 (Max Steps)"
                />
            </div>

            <div className="flex items-center gap-4">
                <select 
                    className="border rounded p-1 text-sm bg-gray-50 max-w-[200px]"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                >
                    {models.length > 0 ? (
                        models.map((model) => (
                            <option key={model.id} value={model.id}>
                                {model.id}
                            </option>
                        ))
                    ) : (
                         <option value="loading" disabled>Loading models...</option>
                    )}
                </select>
                <div className={`w-3 h-3 rounded-full ${status === 'busy' ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} title={status}></div>
            </div>
        </header>

        {/* Chat Stream */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
            {messages.map((msg, idx) => (
                <div key={idx} className={`mb-6 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                    {msg.role === 'user' ? (
                        <div className="bg-blue-600 text-white px-4 py-2 rounded-lg max-w-2xl shadow-sm whitespace-pre-wrap break-words">
                            {msg.content}
                        </div>
                    ) : (
                        <div className="w-full max-w-4xl overflow-hidden">
                            {parseStepsWithResult(msg.content).map((step, stepIdx, allSteps) => (
                                <StepRenderer 
                                  key={step.id} 
                                  step={step} 
                                  isLast={stepIdx === allSteps.length - 1}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ))}
            <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t bg-white dark:bg-slate-950">
            <div className="max-w-4xl mx-auto flex gap-2">
                <button 
                    onClick={() => {
                        setMessages([]);
                        localStorage.removeItem('chat_history');
                    }}
                    className="p-3 text-gray-500 hover:bg-gray-100 rounded-lg"
                    title="清除对话"
                >
                    <Eraser size={20} />
                </button>
                <div className="flex-1 relative">
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                        placeholder="输入你的数据分析需求... (例如: 分析 sales.csv 的销售趋势)"
                        className="w-full border rounded-lg p-3 pr-12 resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none h-[52px] max-h-32"
                    />
                </div>
                <button 
                    onClick={sendMessage}
                    disabled={status === 'idle' && !input.trim()}
                    className={`p-3 rounded-lg text-white transition-colors ${status === 'idle' && !input.trim() ? 'bg-blue-300 cursor-not-allowed' : status === 'busy' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                    title={status === 'busy' ? "停止生成" : "发送消息"}
                >
                    {status === 'busy' ? <StopCircle size={20} /> : <Send size={20} />}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}
