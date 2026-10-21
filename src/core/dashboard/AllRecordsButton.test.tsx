import {fireEvent,render,screen} from '@testing-library/react';
import AllRecordsButton from './AllRecordsButton';
test('aggregate navigation is an icon with a tooltip and accessible name',()=>{
  const open=jest.fn();render(<AllRecordsButton onClick={open}/>);
  const button=screen.getByRole('button',{name:'Все записи'});
  expect(button).toHaveAttribute('title','Все записи');
  expect(button.textContent).toBe('');fireEvent.click(button);expect(open).toHaveBeenCalledTimes(1);
});
