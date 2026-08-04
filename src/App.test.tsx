import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

/**
 * Stage 1 smoke test: proves the runner, jsdom environment, JSX transform and
 * testing-library setup are all wired up. Real coverage starts in stage 6.
 */
describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /fencing referee trainer/i })).toBeInTheDocument();
  });
});
