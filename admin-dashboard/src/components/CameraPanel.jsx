import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Maximize2, Minimize2, RefreshCw, AlertTriangle, Settings, CheckCircle2, XCircle } from 'lucide-react';

const getVideoServerUrl = () => {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const host = window.location.hostname;
    return `http://${host}:8080`;
  }
  return import.meta.env.VITE_VIDEO_SERVER_URL || 'http://localhost:8080';
};

const VIDEO_SERVER_URL = getVideoServerUrl();

// Common camera topic options for ROS 2 + web_video_server
const TOPIC_PRESETS = [
  { label: 'RGB Camera (compressed)', topic: '/camera/color/image_raw' },
  { label: 'Depth Camera', topic: '/camera/depth/image_raw' },
  { label: 'Camera Raw', topic: '/image_raw' },
  { label: 'USB Camera', topic: '/usb_cam/image_raw' },
];

export default function CameraPanel({ backendConnected }) {
  const [topic, setTopic] = useState(TOPIC_PRESETS[0].topic);
  const [customTopic, setCustomTopic] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [streamKey, setStreamKey] = useState(0); // increment to remount <img>
  const [streamStatus, setStreamStatus] = useState('loading'); // 'loading' | 'live' | 'error'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [quality, setQuality] = useState(70);
  const [fps, setFps] = useState(15);

  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const loadTimerRef = useRef(null);

  const activeTopic = useCustom && customTopic.trim() ? customTopic.trim() : topic;

  // Build MJPEG stream URL: web_video_server format
  const streamUrl = `${VIDEO_SERVER_URL}/stream?topic=${encodeURIComponent(activeTopic)}&quality=${quality}&default_transport=compressed&framerate=${fps}`;

  const reload = useCallback(() => {
    setStreamStatus('loading');
    setStreamKey((k) => k + 1);
  }, []);

  // Stale-load watchdog: if image hasn't loaded within 6s → error
  useEffect(() => {
    setStreamStatus('loading');
    clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {
      setStreamStatus((s) => (s === 'loading' ? 'error' : s));
    }, 6000);
    return () => clearTimeout(loadTimerRef.current);
  }, [streamKey, activeTopic]);

  // Fullscreen handler
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen((f) => !f);
  };

  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const statusBadge = {
    loading: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: <RefreshCw className="w-3 h-3 animate-spin" />, label: 'Connecting...' },
    live:    { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" />, label: `Live · ${fps} fps` },
    error:   { color: 'text-rose-400 bg-rose-500/10 border-rose-500/30', icon: <XCircle className="w-3 h-3" />, label: 'Stream Unavailable' },
  }[streamStatus];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-400" />
            Live Camera Feed
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            MJPEG stream via <code className="font-mono text-cyan-400">{VIDEO_SERVER_URL}</code> (web_video_server)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status badge */}
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${statusBadge.color}`}>
            {statusBadge.icon}
            {statusBadge.label}
          </span>

          {/* Settings toggle */}
          <button
            onClick={() => setShowSettings((s) => !s)}
            className={`p-1.5 rounded-lg border text-xs transition ${showSettings ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
            title="Stream Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Reload button */}
          <button
            onClick={reload}
            className="p-1.5 bg-slate-800 border border-slate-700 text-slate-300 hover:text-cyan-400 rounded-lg transition"
            title="Reload Stream"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Topic Preset Selector */}
          <div className="col-span-1">
            <label className="block text-[11px] font-mono text-slate-400 mb-1">Camera Topic Preset</label>
            <select
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setUseCustom(false); reload(); }}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
            >
              {TOPIC_PRESETS.map((p) => (
                <option key={p.topic} value={p.topic}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Custom Topic Input */}
          <div className="col-span-1">
            <label className="block text-[11px] font-mono text-slate-400 mb-1">Custom Topic (optional)</label>
            <input
              type="text"
              placeholder="/my_camera/image_raw"
              value={customTopic}
              onChange={(e) => { setCustomTopic(e.target.value); setUseCustom(true); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Quality & FPS sliders */}
          <div className="col-span-1 space-y-2">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                JPEG Quality: <span className="text-cyan-400">{quality}%</span>
              </label>
              <input
                type="range" min={10} max={95} step={5} value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                onMouseUp={reload}
                className="w-full accent-cyan-500 h-1.5"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Max FPS: <span className="text-cyan-400">{fps}</span>
              </label>
              <input
                type="range" min={1} max={30} step={1} value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                onMouseUp={reload}
                className="w-full accent-cyan-500 h-1.5"
              />
            </div>
          </div>

          {/* Active URL readout */}
          <div className="col-span-full">
            <label className="block text-[11px] font-mono text-slate-500 mb-1">Active Stream URL</label>
            <code className="text-[11px] font-mono text-cyan-400 bg-slate-950 border border-slate-800 rounded px-3 py-1 block truncate">
              {streamUrl}
            </code>
          </div>
        </div>
      )}

      {/* Video Stream Window */}
      <div
        ref={containerRef}
        className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden"
        style={{ minHeight: '400px' }}
      >
        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-20 p-1.5 bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-300 hover:text-cyan-400 rounded-lg transition"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Topic label overlay */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg px-2.5 py-1">
          <div className={`w-1.5 h-1.5 rounded-full ${streamStatus === 'live' ? 'bg-emerald-400 animate-pulse' : streamStatus === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-rose-400'}`} />
          <span className="text-[11px] font-mono text-slate-300">{activeTopic}</span>
        </div>

        {/* Error Overlay */}
        {streamStatus === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/95">
            <AlertTriangle className="w-10 h-10 text-rose-400" />
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-slate-200">Camera Stream Unavailable</p>
              <p className="text-xs text-slate-400">
                Ensure <code className="font-mono text-cyan-400">web_video_server</code> is running on port <code className="font-mono text-cyan-400">8080</code>
              </p>
              <p className="text-xs text-slate-500 font-mono">
                ros2 run web_video_server web_video_server
              </p>
            </div>
            <button
              onClick={reload}
              className="mt-2 flex items-center gap-2 px-4 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-bold hover:bg-cyan-500/20 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Stream
            </button>
          </div>
        )}

        {/* Loading Overlay */}
        {streamStatus === 'loading' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/90">
            <Camera className="w-8 h-8 text-slate-600 animate-pulse" />
            <p className="text-xs text-slate-500 font-mono">Connecting to stream...</p>
          </div>
        )}

        {/* MJPEG Image Stream */}
        <img
          key={streamKey}
          ref={imgRef}
          src={streamUrl}
          alt="MJPEG Camera Stream"
          className="w-full h-full object-contain"
          style={{ minHeight: '400px', display: 'block' }}
          onLoad={() => {
            clearTimeout(loadTimerRef.current);
            setStreamStatus('live');
          }}
          onError={() => {
            clearTimeout(loadTimerRef.current);
            setStreamStatus('error');
          }}
        />
      </div>

      {/* Quick-switch topic pills */}
      <div className="flex flex-wrap gap-2">
        {TOPIC_PRESETS.map((p) => (
          <button
            key={p.topic}
            onClick={() => { setTopic(p.topic); setUseCustom(false); reload(); }}
            className={`px-3 py-1 rounded-full text-[11px] font-mono border transition ${
              activeTopic === p.topic && !useCustom
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {p.topic}
          </button>
        ))}
      </div>
    </div>
  );
}
