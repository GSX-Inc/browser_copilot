
import React, { useState, useMemo, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import NetworkAnalysisView from './components/NetworkAnalysisView';
import ContextBuilderView from './components/ContextBuilderView';
import CanvasView from './components/CanvasView';
import KinoView from './components/KinoView';
import NexusView from './components/NexusView';
import AegisView from './components/AegisView';
import { ViewMode } from './types';
import { auth, signIn } from './firebase'; // Import from central module
import { onAuthStateChanged, User } from 'firebase/auth';

const SignInView = ({ handleSignIn, loading }: { handleSignIn: () => void, loading: boolean }) => (
  <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
    <h1 className="text-3xl font-bold mb-4">AI Browser Co-pilot</h1>
    <p className="mb-8 text-gray-400">Sign in to get started.</p>
    <button
      onClick={handleSignIn}
      disabled={loading}
      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
    >
      {loading ? 'Signing in...' : 'Sign In with Google'}
    </button>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState<ViewMode>('network');

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false); // Stop loading once auth state is confirmed
    });
    return () => unsubscribe(); // Cleanup subscription on unmount
  }, []);

  const handleSignIn = () => {
    setLoading(true);
    signIn().catch(err => {
      console.error("Sign-in failed", err);
      setLoading(false);
    });
  };

  const ActiveView = useMemo(() => {
    switch (currentView) {
      case 'network':
        return <NetworkAnalysisView onAnalysisComplete={() => {}} />;
      case 'context-builder':
        return <ContextBuilderView />;
      case 'canvas':
        return <CanvasView />;
      case 'kino':
        return <KinoView />;
      case 'nexus':
        return <NexusView />;
      case 'aegis':
        return <AegisView />;
      default:
        return <NetworkAnalysisView onAnalysisComplete={() => {}} />;
    }
  }, [currentView]);

  if (!user) {
    return <SignInView handleSignIn={handleSignIn} loading={loading} />;
  }

  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 font-sans">
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {ActiveView}
      </main>
    </div>
  );
}
