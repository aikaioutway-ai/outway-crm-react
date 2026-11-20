import { fireEvent, render, screen } from '@testing-library/react';
import { Sheet } from './ui';
test('record sheet has an accessible title, traps focus, closes with Escape and restores focus',()=>{
 const launcher=document.createElement('button');document.body.appendChild(launcher);launcher.focus();
 const close=jest.fn();const view=render(<Sheet title="Клиент" onClose={close}><button type="button">Сохранить</button></Sheet>);
 const dialog=screen.getByRole('dialog',{name:'Клиент'});expect(dialog).toHaveFocus();
 const save=screen.getByRole('button',{name:'Сохранить'});save.focus();fireEvent.keyDown(save,{key:'Tab'});
 expect(screen.getByRole('button',{name:'Закрыть'})).toHaveFocus();
 fireEvent.keyDown(dialog,{key:'Escape'});expect(close).toHaveBeenCalledTimes(1);
 view.unmount();expect(launcher).toHaveFocus();launcher.remove();
});
