import React, { useState, useEffect } from 'react';
import Loader from './Loader';

// Configuration for the services we can verify
const SERVICE_CONFIG = {
  playstation: {
    name: 'PlayStation',
    loginUrl: 'https://my.playstation.com/',
    verificationTarget: {
      url_contains: '/ssocookie',
      token_name: 'npsso',
    },
  },
  // Future services like Xbox, Steam, etc., can be added here
};

export default function AccountVerifierView() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);
  const [selectedService, setSelectedService] = useState('playstation');

  useEffect(() => {
    const messageListener = (request: any) => {
      if (request.action === "verification-success") {
        setSuccessData(request.data);
        setIsVerifying(false);
      } else if (request.action === "verification-error") {
        setError(request.error || "An unknown error occurred during verification.");
        setIsVerifying(false);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const toggleVerification = () => {
    if (isVerifying) {
      // In this new flow, stop is handled by the service worker automatically
      // or by the user closing the tab. We can just reset the UI.
      setIsVerifying(false);
      setError("Verification stopped by user.");
    } else {
      setSuccessData(null);
      setError(null);
      setIsVerifying(true);
      const config = SERVICE_CONFIG[selectedService];
      chrome.runtime.sendMessage({
        action: "start-verification",
        target: config.verificationTarget,
      });
      // Prompt user to open the login page
      window.open(config.loginUrl, '_blank');
    }
  };

  const service = SERVICE_CONFIG[selectedService];

  return (
    <div className="flex flex-col h-full bg-gray-900 p-6">
      <header className="mb-4">
        <h2 className="text-xl font-semibold">Account Verifier</h2>
        <p className="text-gray-400">Automatically verify account ownership by detecting a successful login.</p>
      </header>
      <div className="flex flex-col flex-1 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="service-select" className="text-sm font-medium text-gray-300">
            Select a service to verify:
          </label>
          <select
            id="service-select"
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-gray-100"
            disabled={isVerifying}
          >
            {Object.entries(SERVICE_CONFIG).map(([key, { name }]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={toggleVerification}
          className={`w-full py-3 px-4 rounded-lg text-white font-semibold transition-colors duration-200 ${
            isVerifying
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500'
          }`}
          disabled={isVerifying}
        >
          {isVerifying ? 'Waiting for login...' : `Start ${service.name} Verification`}
        </button>
        <p className="text-xs text-center text-yellow-400 bg-yellow-900/50 p-2 rounded">
          A new tab will open. Please log in to your {service.name} account. The verification will complete automatically.
        </p>
        
        <div className="bg-gray-800 rounded-lg p-4 flex flex-col flex-1 border border-gray-700 overflow-y-auto">
          <h3 className="font-semibold text-lg mb-2">Verification Status:</h3>
          <div className="text-gray-200 whitespace-pre-wrap">
            {isVerifying && <Loader text={`Listening for a successful ${service.name} login...`} />}
            {error && <p className="text-red-400">{error}</p>}
            {successData && (
              <div className="text-green-400">
                <p className="font-bold text-lg">✅ Success!</p>
                <p>{service.name} account verified.</p>
                <p className="text-xs mt-2 text-gray-400">Extracted Token ({successData.tokenName}): <span className="font-mono bg-gray-900 p-1 rounded">{`${successData.tokenValue.substring(0, 20)}...`}</span></p>
              </div>
            )}
            {!isVerifying && !successData && !error && <p className="text-gray-500">Click "Start" to begin the verification process.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
