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
  { label: 'RealSense RGB (/camera/camera/color/image_raw)', topic: '/camera/camera/color/image_raw' },
  { label: 'RealSense Depth (/camera/camera/depth/image_rect_raw)', topic: '/camera/camera/depth/image_rect_raw' },
  { label: 'RGB Camera (/camera/color/image_raw)', topic: '/camera/color/image_raw' },
  { label: 'Camera Raw (/image_raw)', topic: '/image_raw' },
  { label: 'USB Camera (/usb_cam/image_raw)', topic: '/usb_cam/image_raw' },
];

export default function CameraPanel({ backendConnected }) {
  const [topic, setTopic] = useState(TOPIC_PRESETS[0].topic);
  const [customTopic, setCustomTopic] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [transport, setTransport] = useState('raw');
  const [playerMode, setPlayerMode] = useState('img'); // 'img' | 'iframe'
  const [streamKey, setStreamKey] = useState(0); // increment to remount <img> or <iframe>
  const [streamStatus, setStreamStatus] = useState('live'); // 'loading' | 'live' | 'error'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [quality, setQuality] = useState(70);
  const [fps, setFps] = useState(15);

  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const loadTimerRef = useRef(null);

  const activeTopic = useCustom && customTopic.trim() ? customTopic.trim() : topic;

  // Map raw 16-bit depth topic (16UC1) to colorized depth stream (bgr8) for web_video_server
  const streamTopic = activeTopic === '/camera/camera/depth/image_rect_raw'
    ? '/camera/camera/depth/image_rect_raw/color'
    : activeTopic;

  // Build MJPEG stream URL: web_video_server requires raw unescaped topic paths
  const streamUrl = `${VIDEO_SERVER_URL}/stream?topic=${streamTopic}&quality=${quality}&default_transport=${transport}&framerate=${fps}`;
  const streamViewerUrl = `${VIDEO_SERVER_URL}/stream_viewer?topic=${streamTopic}`;

  const reload = useCallback(() => {
    setStreamStatus(playerMode === 'iframe' ? 'live' : 'loading');
    setStreamKey((k) => k + 1);
  }, [playerMode]);

  // Frame arrival detector & error handling
  useEffect(() => {
    if (playerMode === 'iframe') {
      setStreamStatus('live');
      return;
    }

    setStreamStatus('loading');
    let isMounted = true;

    // Check if naturalWidth is populated (for img mode)
    const checkInterval = setInterval(() => {
      if (imgRef.current && imgRef.current.naturalWidth > 0) {
        if (isMounted) {
          setStreamStatus('live');
        }
      }
    }, 200);

    // Timeout: only mark as error if after 6s no frame has arrived
    const timeout = setTimeout(() => {
      if (isMounted) {
        setStreamStatus((s) => (s === 'loading' ? 'error' : s));
      }
    }, 6000);

    return () => {
      isMounted = false;
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, [streamKey, activeTopic, quality, fps, transport, playerMode]);

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

          {/* Transport & Player Mode & Quality sliders */}
          <div className="col-span-1 space-y-2">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Player Mode:
              </label>
              <select
                value={playerMode}
                onChange={(e) => { setPlayerMode(e.target.value); reload(); }}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="iframe">Stream Viewer (Iframe — Guaranteed for Firefox)</option>
                <option value="img">Direct MJPEG Stream (&lt;img&gt;)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Transport:
              </label>
              <select
                value={transport}
                onChange={(e) => { setTransport(e.target.value); reload(); }}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="raw">Raw (Standard sensor_msgs/Image)</option>
                <option value="compressed">Compressed (sensor_msgs/CompressedImage)</option>
              </select>
            </div>
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

          {/* Active URL readout & Direct Stream Viewer Link */}
          <div className="col-span-full flex flex-col md:flex-row items-start md:items-center justify-between gap-2 pt-2 border-t border-slate-800">
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] font-mono text-slate-500 mb-0.5">Active Stream URL</label>
              <code className="text-[11px] font-mono text-cyan-400 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 block truncate">
                {playerMode === 'iframe' ? streamViewerUrl : streamUrl}
              </code>
            </div>
            <a
              href={streamViewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 md:mt-4 text-xs font-mono text-cyan-400 hover:text-cyan-300 underline flex items-center gap-1"
            >
              Open stream_viewer in new tab &rarr;
            </a>
          </div>
        </div>
      )}

      {/* Video Stream Window */}
      <div
        ref={containerRef}
        className={`relative bg-black rounded-xl overflow-hidden flex items-center justify-center w-full transition-all ${
          isFullscreen
            ? 'fixed inset-0 z-50 h-screen w-screen rounded-none border-0'
            : 'border border-slate-800 min-h-[380px] h-[65vh] max-h-[850px]'
        }`}
      >
        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-30 p-2 bg-slate-900/80 hover:bg-slate-800 backdrop-blur border border-slate-700 text-slate-300 hover:text-cyan-400 rounded-lg transition shadow-lg"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>

        {/* Topic label overlay */}
        <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg px-2.5 py-1 shadow-lg">
          <div className={`w-1.5 h-1.5 rounded-full ${streamStatus === 'live' ? 'bg-emerald-400 animate-pulse' : streamStatus === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-rose-400'}`} />
          <span className="text-[11px] font-mono text-slate-300">{activeTopic}</span>
        </div>

        {/* Error Overlay (only when stream is genuinely unavailable) */}
        {streamStatus === 'error' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/95 p-6">
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
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={reload}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-bold hover:bg-cyan-500/20 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Stream
              </button>
              <a
                href={streamViewerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-slate-400 hover:text-slate-200 underline"
              >
                Test in new tab
              </a>
            </div>
          </div>
        )}

        {/* Loading Indicator */}
        {streamStatus === 'loading' && playerMode === 'img' && (!imgRef.current || imgRef.current.naturalWidth === 0) && (
          <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 bg-slate-950">
            <Camera className="w-8 h-8 text-slate-600 animate-pulse" />
            <p className="text-xs text-slate-500 font-mono">Connecting to stream...</p>
          </div>
        )}

        {/* Video Player Display: Iframe or Direct Img */}
        {playerMode === 'iframe' ? (
          <iframe
            key={streamKey}
            src={streamViewerUrl}
            title="Web Video Server Stream"
            className="w-full h-full border-0 rounded-xl bg-slate-950 block z-10"
            onLoad={() => setStreamStatus('live')}
            onError={() => setStreamStatus('error')}
          />
        ) : (
          <img
            key={streamKey}
            ref={imgRef}
            src={streamUrl}
            alt="MJPEG Camera Stream"
            className="w-full h-full object-contain block z-10 select-none"
            onLoad={() => {
              setStreamStatus('live');
            }}
            onError={() => {
              setStreamStatus('error');
            }}
          />
        )}
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
