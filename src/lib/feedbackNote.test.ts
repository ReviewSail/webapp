import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveInternalFeedbackNote } from './feedbackNote';
const mocks = vi.hoisted(() => ({from:vi.fn(),update:vi.fn(),eq:vi.fn(),select:vi.fn(),single:vi.fn(),invoke:vi.fn(),rpc:vi.fn()}));
vi.mock('../integrations/supabase/client',()=>({supabase:{from:mocks.from,functions:{invoke:mocks.invoke},rpc:mocks.rpc}}));
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.from.mockReturnValue({update:mocks.update}); mocks.update.mockReturnValue({eq:mocks.eq});
  mocks.eq.mockReturnValue({select:mocks.select}); mocks.select.mockReturnValue({maybeSingle:mocks.single});
  mocks.single.mockResolvedValue({data:{id:'feedback-a',manager_response:'Check the heater'},error:null});
});
describe('internal note persistence',()=>{
  it('writes only the note field and requires a matching returned row',async()=>{
    expect(await saveInternalFeedbackNote('feedback-a','  Check the heater  ')).toBe('Check the heater');
    expect(mocks.from).toHaveBeenCalledWith('guest_feedback');
    expect(mocks.update).toHaveBeenCalledWith({manager_response:'Check the heater'});
    expect(mocks.eq).toHaveBeenCalledWith('id','feedback-a');
    expect(mocks.select).toHaveBeenCalledWith('id, manager_response');
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    {data:null,error:null},
    {data:{id:'other',manager_response:'Check the heater'},error:null},
    {data:{id:'feedback-a',manager_response:'Different note'},error:null},
    {data:{id:'feedback-a'},error:null},
    {data:{id:'feedback-a',manager_response:'Check the heater'},error:{message:'Denied'}},
  ])('rejects an unconfirmed save %j',async response=>{
    mocks.single.mockResolvedValue(response);
    await expect(saveInternalFeedbackNote('feedback-a','Check the heater')).rejects.toThrow('could not confirm');
  });
  it('propagates a network interruption instead of returning a saved note',async()=>{
    mocks.single.mockRejectedValue(new Error('Network interrupted'));
    await expect(saveInternalFeedbackNote('feedback-a','Check the heater')).rejects.toThrow('Network interrupted');
  });
  it.each(['','   ','x'.repeat(4001)])('rejects invalid text without a write',async text=>{
    await expect(saveInternalFeedbackNote('feedback-a',text)).rejects.toThrow(); expect(mocks.from).not.toHaveBeenCalled();
  });
});
