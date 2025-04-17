import React, { useState, useEffect, useRef } from 'react';

export default function Chat({ logs, onSend }) {
  const [input, setInput] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {logs.map((log, idx) => {
          // Use DaisyUI chat classes for styled bubbles
          let containerClass = 'chat';
          // Preserve whitespace in messages (especially for JSON responses)
          let bubbleClass = 'chat-bubble whitespace-pre-wrap';
          switch (log.type) {
            case 'user':
              containerClass += ' chat-end';
              bubbleClass += ' bg-blue-500 text-white';
              break;
            case 'assistant':
              containerClass += ' chat-start';
              bubbleClass += ' bg-gray-200 text-black';
              break;
            case 'loading':
              containerClass += ' chat-center';
              bubbleClass += ' bg-yellow-200 text-black';
              break;
            case 'error':
              containerClass += ' chat-start';
              bubbleClass += ' bg-red-500 text-white';
              break;
            case 'info':
              containerClass += ' chat-start';
              bubbleClass += ' bg-green-200 text-black';
              break;
            default:
              containerClass += ' chat-start';
              bubbleClass += ' bg-gray-100 text-black';
          }
          return (
            <div key={idx} className={containerClass}>
              <div className={bubbleClass}>{log.message}</div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex">
        <input
          type="text"
          className="flex-1 input input-bordered"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="ml-2 btn btn-primary">Send</button>
      </form>
    </div>
  );
}