import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import IndoorNavGate from './IndoorNavGate.jsx';
import * as context from '../../context/WorkspaceContext.jsx';
import commands from '../../services/RobotCommandService.js';
vi.mock('../maps/SavedMapPreview.jsx',()=>({default:()=>null}));
vi.mock('../../services/MapActivationService.js',()=>({default:{activateMap:vi.fn()}}));
vi.mock('../../services/RobotCommandService.js',()=>({default:{setInitialPose:vi.fn(async()=>({state:'SENT_UNCONFIRMED'}))}}));
vi.mock('../../services/MapStorageService.js',()=>({default:{listMaps:vi.fn(async()=>({status:'empty',maps:[]}))}}));
function workspace(patch={}) {
  const state={selectedMap:null,setSelectedMap:vi.fn(),mapActivation:{status:'unselected'},updateMapActivation:vi.fn(),setOperatingMode:vi.fn(),...patch};
  vi.spyOn(context,'useWorkspace').mockReturnValue(state); return state;
}
it('requires a picker on each unselected entry', async()=>{ workspace(); render(<IndoorNavGate>Navigation</IndoorNavGate>); expect(await screen.findByText(/NO INDOOR MAPS FOUND/)).toBeInTheDocument(); expect(screen.queryByText('Navigation')).toBeNull(); });
it('shows activation instead of goals for locally selected maps',()=>{workspace({selectedMap:{map_id:'map-a'},mapActivation:{status:'validating'}});render(<IndoorNavGate>Navigation</IndoorNavGate>);expect(screen.queryByText('Navigation')).toBeNull();expect(screen.getByText(/Indoor Map Activation Gate/)).toBeInTheDocument();});
it('opens navigation only for ready state',()=>{workspace({selectedMap:{map_id:'map-a'},mapActivation:{status:'ready'}});render(<IndoorNavGate>Navigation</IndoorNavGate>);expect(screen.getByText('Navigation')).toBeInTheDocument();});
it('sending initial pose never changes readiness',async()=>{
 const state=workspace({selectedMap:{map_id:'map-a'},mapActivation:{status:'awaiting_localization'}});
 render(<IndoorNavGate>Navigation</IndoorNavGate>);
 fireEvent.change(screen.getByLabelText('Initial pose X (m)'),{target:{value:'1'}});
 fireEvent.change(screen.getByLabelText('Initial pose Y (m)'),{target:{value:'2'}});
 fireEvent.click(screen.getByRole('button',{name:/Set Initial Pose/i}));
 await waitFor(()=>expect(commands.setInitialPose).toHaveBeenCalled());
 expect(state.updateMapActivation).not.toHaveBeenCalled();expect(screen.queryByText('Navigation')).toBeNull();
});
