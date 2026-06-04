import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock rapport-data så testen er uafhængig af det genererede øjebliksbillede
vi.mock('../../data/testReport.json', () => ({
  default: {
    generatedAt: '2026-06-04T10:00:00.000Z',
    totals: { files: 2, tests: 5, passed: 5, failed: 0 },
    suites: [
      { file: 'src/lib/scoring.test.js', area: 'frontend', passed: 3, failed: 0,
        tests: [
          { name: 'scoreMatch › eksakt', status: 'passed' },
          { name: 'scoreMatch › udfald', status: 'passed' },
          { name: 'scoreBonus › korrekt', status: 'passed' },
        ] },
      { file: 'functions/scoring.test.js', area: 'functions', passed: 2, failed: 0,
        tests: [
          { name: 'POINTS', status: 'passed' },
          { name: 'standings', status: 'passed' },
        ] },
    ],
  },
}));

import TestsTab from './TestsTab';

describe('TestsTab', () => {
  it('viser sammenfatning med antal tests og filer', () => {
    render(<TestsTab />);
    expect(screen.getByText('5 tests')).toBeInTheDocument();
    expect(screen.getByText('2 testfiler')).toBeInTheDocument();
    expect(screen.getByText(/Alle 5 bestået/)).toBeInTheDocument();
  });

  it('grupperer efter område (Frontend og Cloud Functions)', () => {
    render(<TestsTab />);
    expect(screen.getByText(/Frontend \(UI\)/)).toBeInTheDocument();
    expect(screen.getByText(/Cloud Functions/)).toBeInTheDocument();
  });

  it('viser de enkelte testfiler og testnavne', () => {
    render(<TestsTab />);
    expect(screen.getByText('src/lib/scoring.test.js')).toBeInTheDocument();
    expect(screen.getByText(/scoreMatch › eksakt/)).toBeInTheDocument();
  });

  it('markerer en fejlende test', () => {
    render(<TestsTab />);
    // alle bestået i mock → ingen ✗
    expect(screen.queryByText('✗', { exact: false })).not.toBeInTheDocument();
  });
});
