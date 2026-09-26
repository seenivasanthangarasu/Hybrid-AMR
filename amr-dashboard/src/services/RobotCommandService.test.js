import { it, expect, beforeEach, vi } from 'vitest';
const rosMock = vi.hoisted(() => ({ status: 'connected', publishes: [], getTopic({ name }) { return { publish: msg => rosMock.publishes.push({name,msg}) }; } }));
const bridge = vi.hoisted(() => ({
  navigationReady: vi.fn(), assertIdle: vi.fn(), assertMode: vi.fn(), request: vi.fn(), subscribe: vi.fn(),
  clientId: 'client-1', selection: { effectiveEnvironment:'indoor', selectedMap:{map_id:'map-1',revision:1,package_sha256:'hash'}, mapActivation:{status:'ready',operationId:'activation-1'} },
}));
vi.mock('./RosConnectionService.js', () => ({default:rosMock}));
vi.mock('./WorkspaceBridge.js', () => ({default:bridge}));
import commands, { CommandError } from './RobotCommandService.js';

beforeEach(() => {
  vi.clearAllMocks(); rosMock.status='connected'; rosMock.publishes=[];
  bridge.request.mockImplementation(async (op,args) => ({acknowledged:true,goal_id:args?.goal_id,status:'accepted'}));
  bridge.subscribe.mockImplementation(() => () => {});
});
it('emergency stop preserves immediate zero velocity and stop interlock without workspace prerequisites', () => {
  expect(commands.emergencyStop()).toEqual({state:'SENT_UNCONFIRMED'});
  expect(rosMock.publishes).toEqual([{name:'/emergency_stop',msg:expect.objectContaining({data:true})},{name:'/cmd_vel',msg:expect.objectContaining({linear:{x:0,y:0,z:0},angular:{x:0,y:0,z:0}})}]);
  expect(bridge.request).not.toHaveBeenCalled();
});
it('emergency stop throws when disconnected', () => { rosMock.status='closed'; expect(()=>commands.emergencyStop()).toThrow(CommandError); expect(rosMock.publishes).toHaveLength(0); });
it('clears emergency stop with existing explicit command', () => { commands.clearEmergencyStop(); expect(rosMock.publishes[0].msg.data).toBe(false); });
it.each(['start','pause','resume','stop','returnHome'])('%s uses acknowledged application bridge, never legacy actions', async command => { await commands[command](); expect(bridge.request).toHaveBeenCalledTimes(1); expect(rosMock.publishes).toHaveLength(0); });
it('refuses navigation until service-level readiness is satisfied', () => { bridge.navigationReady.mockImplementationOnce(()=>{throw new Error('map required');}); expect(()=>commands.sendIndoorGoal({x:1,y:2,yaw:0})).toThrow(/map required/); expect(bridge.request).not.toHaveBeenCalled(); });
it('sends a single correlated indoor command with exact active map identity', () => {
  commands.sendIndoorGoal({x:'1',y:'2',yaw:'0'});
  expect(bridge.request).toHaveBeenCalledWith('navigation.indoor',expect.objectContaining({x:1,y:2,yaw:0,map_id:'map-1',revision:1,package_sha256:'hash',activation_id:'activation-1'}),expect.any(Object));
  expect(rosMock.publishes).toHaveLength(0);
});
it.each([null,undefined,'',' ',NaN,Infinity,true])('rejects invalid indoor coordinate %s', value => { expect(()=>commands.sendIndoorGoal({x:value,y:1,yaw:0})).toThrow(/Coordinates/); });
it('validates geographic ranges but allows zero', () => { expect(()=>commands.sendWaypoints([{latitude:91,longitude:0}])).toThrow(); commands.sendWaypoints([{latitude:0,longitude:0}]); expect(bridge.request).toHaveBeenCalledWith('navigation.outdoor',expect.objectContaining({waypoints:[{latitude:0,longitude:0}]}),expect.any(Object)); });
it('rejects empty routes', () => expect(()=>commands.sendWaypoints([])).toThrow(/No waypoints/));
it('forwards failed/canceled results unchanged rather than inventing arrival', async () => {
  let callback; bridge.subscribe.mockImplementation(fn=>{callback=fn;return ()=>{};});
  const {goal}=commands.sendIndoorGoal({x:1,y:2,yaw:0});
  const listener=vi.fn(); goal.on('result',listener);
  const goalId=bridge.request.mock.calls[0][1].goal_id;
  callback({goal:{goal_id:goalId,client_id:'client-1',status:'failed'}});
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({status:'failed'}));
});
it('initial pose acknowledgement does not change localization readiness', async () => {
  bridge.selection.mapActivation.status='awaiting_localization';
  await commands.setInitialPose({x:0,y:0,yaw:0});
  expect(bridge.selection.mapActivation.status).toBe('awaiting_localization');
  expect(bridge.request).toHaveBeenCalledWith('map.initial_pose',expect.objectContaining({x:0,y:0,yaw:0}));
  bridge.selection.mapActivation.status='ready';
});
