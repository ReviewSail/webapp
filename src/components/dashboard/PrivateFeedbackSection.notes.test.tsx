import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PrivateFeedbackSection } from './PrivateFeedbackSection';
const feedback = {id:'fb-a',requestId:null,guestName:'Synthetic Guest',guestEmail:null,starRating:2,feedbackText:'The heater stopped working.',managerResponse:null as string | null,createdAt:'2026-09-14T12:00:00Z'};
function mount(onSaveNote=vi.fn().mockResolvedValue(undefined), feedbacks=[feedback]) {
  return {...render(<PrivateFeedbackSection feedbacks={feedbacks} reviewRequests={[]} orders={[]} customers={[]} onSaveNote={onSaveNote} />),onSaveNote};
}
function openAndType() {
  fireEvent.click(screen.getByRole('button',{name:'Add internal note'}));
  fireEvent.change(screen.getByLabelText('Internal note (not sent to guest)'),{target:{value:'Check the heater'}});
}
describe('truthful internal-note workflow',()=>{
  it('never offers a send/reply action and explains the separate Booking.com workflow',()=>{
    mount(); expect(screen.getByText(/send a separate message through Booking.com/)).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Send reply|Reply to guest/})).not.toBeInTheDocument();
    expect(screen.queryByText('Guests waiting on a reply')).not.toBeInTheDocument();
  });
  it('waits for acknowledgement, blocks double submit and then says saved internally',async()=>{
    let resolve!:()=>void;
    const save=vi.fn(()=>new Promise<void>(done=>{resolve=done;})); mount(save); openAndType();
    const button=screen.getByRole('button',{name:'Save internal note'});
    fireEvent.click(button); fireEvent.click(button);
    expect(save).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledWith('fb-a','Check the heater');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Cancel'})).toBeDisabled();
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    await act(async()=>{resolve();});
    expect(screen.getByRole('status')).toHaveTextContent('Note saved internally. No guest message was sent.');
    expect(screen.getByText('Internal note — not sent to guest')).toBeInTheDocument();
    expect(screen.queryByText(/Reply sent|You replied/)).not.toBeInTheDocument();
  });
  it('preserves the draft and shows a visible failure, with a usable retry',async()=>{
    const save=vi.fn().mockRejectedValueOnce(new Error('Network')).mockResolvedValueOnce(undefined); mount(save); openAndType();
    fireEvent.click(screen.getByRole('button',{name:'Save internal note'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm');
    expect(screen.getByRole('textbox')).toHaveValue('Check the heater');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Save internal note'}));
    await screen.findByRole('status'); expect(save).toHaveBeenNthCalledWith(2,'fb-a','Check the heater');
  });
  it('labels previously saved manager_response content as an internal note, not delivery',()=>{
    mount(vi.fn(),[{...feedback,managerResponse:'Previously saved text'}]);
    expect(screen.getByText('Previously saved text')).toBeInTheDocument();
    expect(screen.getByText('Internal note — not sent to guest')).toBeInTheDocument();
    expect(screen.queryByText('You replied')).not.toBeInTheDocument(); expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('does not submit a blank note and caps input at the database limit',()=>{
    const {onSaveNote}=mount(); fireEvent.click(screen.getByRole('button',{name:'Add internal note'}));
    expect(screen.getByRole('button',{name:'Save internal note'})).toBeDisabled();
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength','4000'); expect(onSaveNote).not.toHaveBeenCalled();
  });
  it('keeps concurrent drafts separate by feedback row',async()=>{
    const {onSaveNote}=mount(vi.fn().mockResolvedValue(undefined),[feedback,{...feedback,id:'fb-b',guestName:'Second Guest'}]);
    screen.getAllByRole('button',{name:'Add internal note'}).forEach(button=>fireEvent.click(button));
    const fields=screen.getAllByRole('textbox');
    fireEvent.change(fields[0],{target:{value:'First guest note'}}); fireEvent.change(fields[1],{target:{value:'Second guest note'}});
    fireEvent.click(screen.getAllByRole('button',{name:'Save internal note'})[0]); await screen.findByRole('status');
    expect(onSaveNote).toHaveBeenCalledWith('fb-a','First guest note');
    expect(screen.getByRole('textbox')).toHaveValue('Second guest note');
  });
  it('Cancel discards only the unsaved draft without saving anything',()=>{
    const {onSaveNote}=mount(); openAndType(); fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); expect(onSaveNote).not.toHaveBeenCalled();
  });
});
