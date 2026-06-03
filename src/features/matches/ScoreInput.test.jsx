// Tests for ScoreInput-komponenten.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScoreInput from './ScoreInput';

describe('ScoreInput', () => {
  it('renderer to input-felter og en gem-knap', () => {
    render(<ScoreInput onSave={() => {}} />);
    expect(screen.getByTestId('score-home')).toBeInTheDocument();
    expect(screen.getByTestId('score-away')).toBeInTheDocument();
    expect(screen.getByTestId('score-save')).toBeInTheDocument();
  });

  it('kalder onSave med korrekte numeriske værdier ved klik', () => {
    const onSave = vi.fn();
    render(<ScoreInput onSave={onSave} />);
    fireEvent.change(screen.getByTestId('score-home'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('score-away'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('score-save'));
    expect(onSave).toHaveBeenCalledWith({ home: 2, away: 1 });
  });

  it('deaktiverer gem-knap hvis felterne er tomme', () => {
    render(<ScoreInput onSave={() => {}} />);
    expect(screen.getByTestId('score-save')).toBeDisabled();
  });

  it('viser ikke gem-knap når disabled=true', () => {
    render(<ScoreInput onSave={() => {}} disabled home={1} away={0} />);
    expect(screen.queryByTestId('score-save')).not.toBeInTheDocument();
  });

  it('afviser negative tal (input validering)', () => {
    const onSave = vi.fn();
    render(<ScoreInput onSave={onSave} />);
    // Negative tal starter med '-', som ikke er et ciffer
    const homeInput = screen.getByTestId('score-home');
    fireEvent.change(homeInput, { target: { value: '-1' } });
    // Input bør forblive tomt (ugyldig karakter filtreres)
    expect(homeInput.value).toBe('');
  });

  it('kalder onSave med 0-0 score korrekt', () => {
    const onSave = vi.fn();
    render(<ScoreInput onSave={onSave} />);
    fireEvent.change(screen.getByTestId('score-home'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('score-away'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('score-save'));
    expect(onSave).toHaveBeenCalledWith({ home: 0, away: 0 });
  });

  it('viser initialt inputte værdier', () => {
    render(<ScoreInput home={3} away={2} onSave={() => {}} />);
    expect(screen.getByTestId('score-home').value).toBe('3');
    expect(screen.getByTestId('score-away').value).toBe('2');
  });
});
