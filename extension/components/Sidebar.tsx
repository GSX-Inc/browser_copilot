
import React from 'react';
import { ViewMode } from '../types.ts';
import { DebugIcon, LogoIcon, CanvasIcon, FilmIcon, SpeedometerIcon, ShieldIcon, TabIcon } from './icons.tsx';

interface SidebarProps {
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
}

const NavButton = ({
  label,
  icon,
  isActive,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    aria-label={`Switch to ${label} view`}
    aria-pressed={isActive}
    className={`flex items-center justify-start w-full p-3 my-1 rounded-lg transition-all duration-200 ease-in-out ${
      isActive
        ? 'bg-indigo-600 text-white shadow-lg'
        : 'text-gray-400 hover:bg-gray-700 hover:text-white'
    }`}
  >
    {icon}
    <span className="ml-4 font-medium">{label}</span>
  </button>
);

export default function Sidebar({ currentView, setCurrentView }: SidebarProps) {
  return (
    <aside className="w-64 bg-gray-800 p-4 flex flex-col border-r border-gray-700">
      <div className="flex items-center mb-8">
        <LogoIcon />
        <h1 className="text-xl font-bold ml-2 text-white">AI Co-pilot</h1>
      </div>
      <nav>
        <NavButton
          label="Network Analysis"
          icon={<DebugIcon />}
          isActive={currentView === 'network'}
          onClick={() => setCurrentView('network')}
        />
        <NavButton
          label="Context Builder"
          icon={<TabIcon />}
          isActive={currentView === 'context-builder'}
          onClick={() => setCurrentView('context-builder')}
        />
        <NavButton
          label="Canvas"
          icon={<CanvasIcon />}
          isActive={currentView === 'canvas'}
          onClick={() => setCurrentView('canvas')}
        />
        <NavButton
          label="Kino"
          icon={<FilmIcon />}
          isActive={currentView === 'kino'}
          onClick={() => setCurrentView('kino')}
        />
        <NavButton
          label="Nexus"
          icon={<SpeedometerIcon />}
          isActive={currentView === 'nexus'}
          onClick={() => setCurrentView('nexus')}
        />
        <NavButton
          label="Aegis"
          icon={<ShieldIcon />}
          isActive={currentView === 'aegis'}
          onClick={() => setCurrentView('aegis')}
        />
      </nav>
      <div className="mt-auto text-xs text-gray-500">
        <p>&copy; {new Date().getFullYear()} AI Co-pilot</p>
        <p>Powered by Gemini</p>
      </div>
    </aside>
  );
}
