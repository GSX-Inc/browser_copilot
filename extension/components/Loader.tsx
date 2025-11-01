
import React from 'react';

interface LoaderProps {
  text?: string;
}

export default function Loader({ text = 'Thinking...' }: LoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <div className="w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-gray-400 text-sm">{text}</p>
    </div>
  );
}
