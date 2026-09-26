import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import IndoorNavPlanner from './IndoorNavPlanner.jsx';
import * as context from '../../context/WorkspaceContext.jsx';
import commands from '../../services/RobotCommandService.js';
import useGrid from '../../hooks/useOccupancyGrid.js';
import useTF from '../../hooks/useTF.js';
vi.mock('../maps/SavedMapPreview.jsx',()=>({default:()=>null}));
vi.mock('../../services/RobotCommandService.js',()=>({default:{sendIndoorGoal:vi.fn(),stop:vi.fn(async()=>({state:'SENT_UNCONFIRMED'}))}}));
vi.mock('../../hooks/useOccupancyGrid.js',()=>({default:vi.fn()}));
vi.mock('../../hooks/useTF.js',()=>({default:vi.fn()}));
beforeEach(()=>{
 vi.clearAllMocks();
 vi.spyOn(context,'useWorkspace').mockReturnValue({selectedMap:{map_id:'map-a'},mapActivation:{status:'ready'}});
 useGrid.mockReturnValue({hasData:true,width:10,height:10,resolution:1,origin:{position:{x:0,y:0},orientation:{x:0,y:0,z:0,w:1}},data:new Array(100).fill(0)});
 useTF.mockReturnValue({hasData:true,transform:{translation:{x:1,y:1},rotation:{x:0,y:0,z:0,w:1}}});
});
function enterGoal(){const inputs=screen.getAllByRole('spinbutton');fireEvent.change(inputs[0],{target:{value:'1'}});fireEvent.change(inputs[1],{target:{value:'2'}});}
it('requires coordinates and keeps initial pose separate from destination',()=>{render(<IndoorNavPlanner/>);expect(screen.getByRole('button',{name:/Send Goal/})).toBeDisabled();expect(screen.queryByRole('button',{name:/Initial Pose/})).toBeNull();});
it('blocks sending without a live robot pose',()=>{useTF.mockReturnValue({hasData:false});render(<IndoorNavPlanner/>);enterGoal();expect(screen.getByRole('button',{name:/Send Goal/})).toBeDisabled();});
it('blocks occupied destinations',()=>{useGrid.mockReturnValue({hasData:true,width:10,height:10,resolution:1,data:new Array(100).fill(100)});render(<IndoorNavPlanner/>);enterGoal();expect(screen.getByRole('button',{name:/Send Goal/})).toBeDisabled();});
it('forwards failure results without marking arrival',()=>{
 const events={};commands.sendIndoorGoal.mockReturnValue({state:'SENT_UNCONFIRMED',goal:{on:(event,fn)=>{events[event]=fn;},off:vi.fn()}});
 render(<IndoorNavPlanner/>);enterGoal();fireEvent.click(screen.getByRole('button',{name:/Send Goal/}));
 expect(commands.sendIndoorGoal).toHaveBeenCalledWith({x:'1',y:'2',yaw:'0.0',frameId:'map'});
 act(()=>events.result({status:'failed'}));expect(screen.getByText('FAILED')).toBeInTheDocument();expect(screen.queryByText('REACHED')).toBeNull();
});
it('disables actions when disconnected',()=>{render(<IndoorNavPlanner connectionStatus="disconnected"/>);expect(screen.getByRole('button',{name:/Send Goal/})).toBeDisabled();expect(screen.getByRole('button',{name:/Cancel/})).toBeDisabled();});
