import React, { useState, useEffect, useRef, useCallback } from 'react';
import rosService from '../services/RosService';
import useRosTopic from '../hooks/useRosTopic';
import { Search, Radio, Terminal, Cpu, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Play, Pause, Trash2, Navigation } from 'lucide-react';

export default function RosGraphPanel({ rosStatus }) {
  const [nodes, setNodes] = useState([]);
  const [topics, setTopics] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [topicSearch, setTopicSearch] = useState('');

  // TF Tree tracking via /tf subscription
  const [tfData, setTfData] = useState({
    odomToBaseLink: { active: false, lastSeen: null, childFrame: 'base_link' },
    mapToOdom: { active: false, lastSeen: null, childFrame: 'odom' },
  });

  // Live /robot_mode topic subscription
  const { data: robotModeData, hasData: hasRobotMode, stale: robotModeStale, hz: robotModeHz } = useRosTopic({
    name: '/robot_mode',
    messageType: 'std_msgs/String',
    throttle_rate: 500,
    staleMs: 4000,
  });

  // Raw Echo Tool State
  const [echoTopic, setEchoTopic] = useState('/odom');
  const [echoType, setEchoType] = useState('nav_msgs/Odometry');
  const [echoActive, setEchoActive] = useState(false);
  const [echoMessages, setEchoMessages] = useState([]);

  // Tick counter to keep TF age display live (updates every second)
  const [tick, setTick] = useState(0);

  // Fetch ROS graph info (nodes, topics, services)
  const refreshGraph = useCallback(async () => {
    if (rosStatus !== 'connected') return;
    // rosStatus intentionally in deps below
    setLoading(true);
    try {
      const [nList, tList, sList] = await Promise.all([
        rosService.getNodes(),
        rosService.getTopicsAndTypes(),
        rosService.getServices(),
      ]);

      setNodes(nList);
      setServices(sList);

      const formattedTopics = (tList.topics || []).map((name, idx) => ({
        name,
        type: tList.types[idx] || 'Unknown',
      }));
      setTopics(formattedTopics);
    } catch (err) {
      console.error('Error refreshing ROS graph:', err);
    } finally {
      setLoading(false);
    }
  }, [rosStatus]);

  useEffect(() => {
    refreshGraph();
    const interval = setInterval(refreshGraph, 5000);
    return () => clearInterval(interval);
  }, [refreshGraph]);

  // Live tick for TF age display
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Subscribe to /tf to track odom->base_link and map->odom
  useEffect(() => {
    if (rosStatus !== 'connected') return undefined;

    const tfTopic = rosService.getTopic({
      name: '/tf',
      messageType: 'tf2_msgs/TFMessage',
      throttle_rate: 100,
    });

    const tfHandler = (msg) => {
      const now = Date.now();
      if (msg.transforms && Array.isArray(msg.transforms)) {
        msg.transforms.forEach((t) => {
          const parent = t.header?.frame_id?.replace(/^\//, '');
          const child = t.child_frame_id?.replace(/^\//, '');

          if (parent === 'odom' && child === 'base_link') {
            setTfData((prev) => ({
              ...prev,
              odomToBaseLink: { active: true, lastSeen: now, childFrame: 'base_link' },
            }));
          } else if (parent === 'map' && child === 'odom') {
            setTfData((prev) => ({
              ...prev,
              mapToOdom: { active: true, lastSeen: now, childFrame: 'odom' },
            }));
          }
        });
      }
    };

    tfTopic.subscribe(tfHandler);
    return () => tfTopic.unsubscribe(tfHandler);
  }, [rosStatus]);

  // Raw topic echo subscription handler
  useEffect(() => {
    if (!echoActive || !echoTopic || !echoType || rosStatus !== 'connected') return undefined;

    const topic = rosService.getTopic({
      name: echoTopic,
      messageType: echoType,
      throttle_rate: 200,
    });

    const handler = (msg) => {
      setEchoMessages((prev) => [
        { time: new Date().toLocaleTimeString(), data: msg },
        ...prev.slice(0, 49),
      ]);
    };

    topic.subscribe(handler);

    return () => {
      topic.unsubscribe(handler);
    };
  }, [echoActive, echoTopic, echoType, rosStatus]);

  // Handle staleness of TF frames — uses tick so re-evaluates every second
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = Date.now();
  const odomStale = !tfData.odomToBaseLink.lastSeen || now - tfData.odomToBaseLink.lastSeen > 3000;
  const mapStale = !tfData.mapToOdom.lastSeen || now - tfData.mapToOdom.lastSeen > 5000;

  const filteredTopics = topics.filter((t) =>
    t.name.toLowerCase().includes(topicSearch.toLowerCase()) ||
    t.type.toLowerCase().includes(topicSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Active ROS 2 Nodes</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{nodes.length}</p>
          </div>
          <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl">
            <Cpu className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Advertised Topics</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{topics.length}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <Radio className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Active Services</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{services.length}</p>
          </div>
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl">
            <Terminal className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* TF Tree Status & /robot_mode Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* TF: odom -> base_link */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">TF: odom &rarr; base_link</span>
            {!odomStale ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Odometry Alive
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> No Odom TF
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-200">Odometry Frame Link</p>
          <p className="text-xs text-slate-400 mt-1">
            Last transform:{' '}
            <span className="font-mono text-slate-300">
              {tfData.odomToBaseLink.lastSeen
                ? `${Math.round((now - tfData.odomToBaseLink.lastSeen) / 1000)}s ago`
                : 'Never received'}
            </span>
          </p>
        </div>

        {/* TF: map -> odom */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">TF: map &rarr; odom</span>
            {!mapStale ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> SLAM Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-semibold">
                <XCircle className="w-3.5 h-3.5" /> No SLAM TF
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-200">Global Map Localization</p>
          <p className="text-xs text-slate-400 mt-1">
            Last transform:{' '}
            <span className="font-mono text-slate-300">
              {tfData.mapToOdom.lastSeen
                ? `${Math.round((now - tfData.mapToOdom.lastSeen) / 1000)}s ago`
                : 'Never received'}
            </span>
          </p>
        </div>

        {/* /robot_mode Live Status Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">Topic: /robot_mode</span>
            {hasRobotMode && !robotModeStale ? (
              <span className="flex items-center gap-1 text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Live · {robotModeHz} Hz
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 font-semibold">
                <XCircle className="w-3.5 h-3.5" /> Not Publishing
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-cyan-400 shrink-0" />
            <p className="text-sm font-semibold text-slate-200">Robot Operating Mode</p>
          </div>
          {hasRobotMode && !robotModeStale ? (
            <div className="mt-2 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 font-mono">
              <span className="text-xs text-slate-500 block">Current Mode</span>
              <span className="text-base font-bold text-cyan-300 tracking-wide">
                {robotModeData?.data || '—'}
              </span>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Subscribed to <code className="text-cyan-500">/robot_mode</code> (std_msgs/String). Waiting for INDOOR / OUTDOOR mode publisher.
            </p>
          )}
        </div>
      </div>

      {/* Raw Topic Echo Tool */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-cyan-400" />
              Raw Topic Echo Console
            </h2>
            <p className="text-xs text-slate-400">Subscribe to any ROS topic and pretty-print incoming payload in real-time</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEchoActive(!echoActive)}
              disabled={rosStatus !== 'connected'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                echoActive
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              }`}
            >
              {echoActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {echoActive ? 'Pause Echo' : 'Start Echo'}
            </button>
            <button
              onClick={() => setEchoMessages([])}
              className="p-1.5 bg-slate-800 text-slate-300 hover:text-rose-400 rounded-lg border border-slate-700 transition"
              title="Clear Messages"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Input Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">Topic Name</label>
            <input
              type="text"
              value={echoTopic}
              onChange={(e) => setEchoTopic(e.target.value)}
              placeholder="/odom or /scan"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">Message Type</label>
            <input
              type="text"
              value={echoType}
              onChange={(e) => setEchoType(e.target.value)}
              placeholder="nav_msgs/Odometry or sensor_msgs/LaserScan"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Console Payload Window */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 h-64 overflow-y-auto font-mono text-xs text-cyan-300 space-y-2">
          {echoMessages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-600 text-xs italic">
              {echoActive ? 'Waiting for incoming messages...' : 'Click "Start Echo" to stream live ROS topic messages.'}
            </div>
          ) : (
            echoMessages.map((msg, i) => (
              <div key={i} className="border-b border-slate-900 pb-2">
                <div className="text-[10px] text-slate-500 flex justify-between">
                  <span>[{msg.time}] Topic: {echoTopic}</span>
                  <span>Payload #{echoMessages.length - i}</span>
                </div>
                <pre className="text-slate-300 mt-1 whitespace-pre-wrap overflow-x-auto text-[11px]">
                  {JSON.stringify(msg.data, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Topics List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400" />
            ROS 2 Topics Registry
          </h2>

          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search topics or types..."
                value={topicSearch}
                onChange={(e) => setTopicSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <button
              onClick={refreshGraph}
              disabled={loading}
              className="p-1.5 bg-slate-800 text-slate-300 hover:text-cyan-400 rounded-lg border border-slate-700 transition"
              title="Refresh Graph"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Topic Name</th>
                <th className="px-4 py-3">Message Type</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {filteredTopics.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500 italic">
                    No ROS 2 topics found matching query.
                  </td>
                </tr>
              ) : (
                filteredTopics.map((t, idx) => (
                  <tr key={idx} className="hover:bg-slate-850/50 transition">
                    <td className="px-4 py-2.5 font-bold text-cyan-400">{t.name}</td>
                    <td className="px-4 py-2.5 text-slate-400">{t.type}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => {
                          setEchoTopic(t.name);
                          setEchoType(t.type);
                          setEchoActive(true);
                        }}
                        className="px-2.5 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 text-[11px] font-sans font-medium transition"
                      >
                        Echo Topic
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
