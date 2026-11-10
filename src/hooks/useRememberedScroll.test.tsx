import React, { useRef } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { resetRememberedScroll, useRememberedScroll } from './useRememberedScroll';

function Box({ scrollKey, ready = true }: { scrollKey: string; ready?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useRememberedScroll(ref, scrollKey, ready);
  return <div data-testid="box" ref={ref} />;
}

beforeEach(() => resetRememberedScroll());

test('returning to the same school tab restores the scroll position', () => {
  const first = render(<Box scrollKey="logistics:EDI" />);
  const box = first.getByTestId('box');
  box.scrollTop = 420;
  fireEvent.scroll(box);
  first.unmount();

  const again = render(<Box scrollKey="logistics:EDI" />);
  expect(again.getByTestId('box').scrollTop).toBe(420);
  again.unmount();

  const other = render(<Box scrollKey="logistics:TIS" />);
  expect(other.getByTestId('box').scrollTop).toBe(0);
});

test('position is restored only after the data is drawn', () => {
  const first = render(<Box scrollKey="k" />);
  first.getByTestId('box').scrollTop = 300;
  fireEvent.scroll(first.getByTestId('box'));
  first.unmount();

  const view = render(<Box scrollKey="k" ready={false} />);
  expect(view.getByTestId('box').scrollTop).toBe(0);
  view.rerender(<Box scrollKey="k" ready />);
  expect(view.getByTestId('box').scrollTop).toBe(300);
});
