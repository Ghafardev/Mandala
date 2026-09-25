import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { NodeCanvas } from './components/NodeCanvas';
import { TelemetryPanel } from './components/TelemetryPanel';
import { CopilotSidebar } from './components/CopilotSidebar';
import { Mandala3DGraphView } from './components/mandala3d/Mandala3DGraphView';

export default function App() {
  const [activeView, setActiveView] = useState<'workflow' | '3d-mandala'>('workflow');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(true);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(true);
  const [externalPrompt, setExternalPrompt] = useState<string | null>(null);

  const [logs, setLogs] = useState<string[]>([
    `[SYS-INIT] Mandala Low-Code ROCm Studio ready.`,
    `[DEVICE] AMD Instinct MI300X OAM detected (gfx942 - CDNA 3 architecture).`,
    `[ROCm-DRIVER] ROCm 6.2.1 Native runtime loaded. 304 Compute Units, 19,456 Stream Processors.`,
    `[TRITON] Triton JIT Compiler backend active. Wavefront size: 64 threads.`,
    `[LLM] Mandala AI Copilot loaded: Qwen 3.5 (Local).`,
    `[3D-MANDALA] Sacred Geometry Graph Engine compiled & initialized.`,
  ]);

  const addLogMessage = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
  }, []);

  const handleClearLogs = useCallback(() => {
    setLogs([`[CLEAR] Terminal buffer reset at ${new Date().toLocaleTimeString()}`]);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-100 select-none">
      {/* 1. Header.tsx with View Switcher: [ 🎛️ Workflow & Telemetry View | ☸️ 3D Mandala View ] */}
      <Header
        activeView={activeView}
        onToggleView={setActiveView}
        isCompiling={isCompiling}
        isCopilotOpen={isCopilotOpen}
        onToggleCopilot={() => setIsCopilotOpen(!isCopilotOpen)}
        isTelemetryOpen={isTelemetryOpen}
        onToggleTelemetry={() => setIsTelemetryOpen(!isTelemetryOpen)}
      />

      {/* Main Viewport Container with Smooth Transition */}
      <div className="flex flex-1 overflow-hidden relative">
        {activeView === 'workflow' ? (
          /* Workflow View (NodeCanvas 2D + Telemetry) */
          <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
            <main className="flex-1 relative h-full w-full overflow-hidden">
              <NodeCanvas
                onLogMessage={addLogMessage}
                isCompiling={isCompiling}
                setIsCompiling={setIsCompiling}
              />
            </main>

            {/* 3. TelemetryPanel.tsx (in Workflow View) */}
            {isTelemetryOpen && (
              <TelemetryPanel
                logs={logs}
                onClearLogs={handleClearLogs}
              />
            )}
          </div>
        ) : (
          /* 3D Mandala Graph View Page */
          <div className="flex-1 relative h-full w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <Mandala3DGraphView
              onLogMessage={addLogMessage}
              isCompiling={isCompiling}
            />
          </div>
        )}

        {/* 4. CopilotSidebar.tsx (Accessible in both views) */}
        <CopilotSidebar
          isOpen={isCopilotOpen}
          onClose={() => setIsCopilotOpen(false)}
          externalPrompt={externalPrompt}
          onClearExternalPrompt={() => setExternalPrompt(null)}
        />
      </div>
    </div>
  );
}
