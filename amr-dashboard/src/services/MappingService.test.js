import { MappingService } from './MappingService.js';
import { mapFixture } from '../test/mapFixtures.js';

describe('MappingService acknowledged lifecycle', () => {
  let bridge, storage, session, service, fixture;
  beforeEach(async () => {
    localStorage.clear(); fixture = await mapFixture();
    bridge = { assertMode: vi.fn(), assertAvailable: vi.fn(), assertIdle: vi.fn(), request: vi.fn(), subscribe: vi.fn(() => () => {}) };
    session = { confirmed: true, getState: () => ({ status: 'ready', session: { schema_version: 1, robot_id: 'robot-1', session_id: 'session-1', started_at: '2026-09-25T10:00:00.000Z', state: 'active' } }) };
    storage = { getRootFolder: vi.fn(async()=>({})), checkPermission: vi.fn(async()=>true), savePackage: vi.fn(async()=>({manifest:fixture.manifest})) };
    service = new MappingService({ bridge, session, storage, transfer: { download: vi.fn(async()=>fixture) } });
  });
  it('never transitions to running due to elapsed time or lack of rejection', async () => {
    let resolve;
    bridge.request.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    const start = service.startMapping();
    await vi.waitFor(()=>expect(service.state.status).toBe('start_pending'));
    expect(service.state.startTime).toBeNull();
    resolve({ run_id: service.state.runId, state:'running' }); await start;
    expect(service.state.status).toBe('running');
  });
  it('surfaces prerequisite failures and does not invent a server session', async () => {
    session.confirmed = false;
    await expect(service.startMapping()).rejects.toThrow(/confirmed/);
    expect(service.state.error).toMatch(/confirmed/); expect(bridge.request).not.toHaveBeenCalled();
  });
  it('does not save a live grid when the server has not finalized an artifact', async () => {
    service.emit({status:'running',runId:'run-1'});
    bridge.request.mockResolvedValue({state:'finalizing'});
    await expect(service.finishAndSave({liveGrid:{hasData:true}})).rejects.toThrow(/finalized/);
    expect(storage.savePackage).not.toHaveBeenCalled();
  });
  it('persists verified server artifact with original session provenance', async () => {
    service.emit({status:'running',runId:'run-1'});
    bridge.request.mockResolvedValueOnce({state:'artifact_ready',manifest:fixture.manifest,source_session:session.getState().session}).mockResolvedValueOnce({});
    await service.finishAndSave();
    expect(storage.savePackage).toHaveBeenCalledWith(expect.objectContaining({sessionFolderName:'2026-09-25T10-00-00.000Z__robot-1__session-1'}));
    expect(service.state.status).toBe('saved');
  });
  it('does not mark canceled before acknowledgement', async () => {
    service.emit({status:'running',runId:'run-1'});
    bridge.request.mockRejectedValue(new Error('timeout'));
    await service.cancel();
    expect(service.state.status).toBe('interrupted'); expect(service.state.runId).toBe('run-1');
  });
});
