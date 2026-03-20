import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home page', () => {
  it('should render the platform title', () => {
    render(<Home />);
    expect(screen.getByText('AWS Developer Intelligence Platform')).toBeInTheDocument();
  });
});
