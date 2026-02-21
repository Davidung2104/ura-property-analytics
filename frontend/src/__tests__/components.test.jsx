import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ProjectSearch from '../components/shared/ProjectSearch';
import { StatCard, Card, SectionHeader, NoteText } from '../components/ui';

const PROJ_LIST = ['RIVIERE', 'MARINA ONE', 'PARC CLEMATIS', 'THE SAIL', 'REFLECTIONS AT KEPPEL BAY'];
const PROJ_INDEX = {
  'RIVIERE': { psf: 2200, dist: 'D03', seg: 'CCR', n: 150, yield: '2.8' },
  'MARINA ONE': { psf: 2500, dist: 'D01', seg: 'CCR', n: 300, yield: '2.5' },
  'PARC CLEMATIS': { psf: 1500, dist: 'D05', seg: 'RCR', n: 200, yield: '3.2' },
};
const CMP_POOL = [
  { name: 'RIVIERE', psf: 2200, dist: 'D03', street: 'JIAK KIM', segment: 'CCR', units: 150, yield: '2.8' },
];

describe('ProjectSearch', () => {
  it('renders hero mode with search input and button', () => {
    render(<ProjectSearch value="" projList={PROJ_LIST} cmpPool={CMP_POOL} projIndex={PROJ_INDEX} onChange={() => {}} hero />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('renders compact mode', () => {
    render(<ProjectSearch value="RIVIERE" projList={PROJ_LIST} cmpPool={CMP_POOL} projIndex={PROJ_INDEX} onChange={() => {}} compact />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('shows dropdown on focus', () => {
    render(<ProjectSearch value="" projList={PROJ_LIST} cmpPool={CMP_POOL} projIndex={PROJ_INDEX} onChange={() => {}} hero />);
    fireEvent.focus(screen.getByRole('searchbox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('filters results as user types', () => {
    render(<ProjectSearch value="" projList={PROJ_LIST} cmpPool={CMP_POOL} projIndex={PROJ_INDEX} onChange={() => {}} hero />);
    const input = screen.getByRole('searchbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'riv' } });

    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('RIVIERE');
  });

  it('calls onChange when project is selected', () => {
    const onChange = vi.fn();
    render(<ProjectSearch value="" projList={PROJ_LIST} cmpPool={CMP_POOL} projIndex={PROJ_INDEX} onChange={onChange} hero />);
    const input = screen.getByRole('searchbox');
    fireEvent.focus(input);

    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    fireEvent.click(options[0]);

    expect(onChange).toHaveBeenCalledWith('RIVIERE');
  });

  it('has correct ARIA attributes', () => {
    render(<ProjectSearch value="" projList={PROJ_LIST} cmpPool={CMP_POOL} projIndex={PROJ_INDEX} onChange={() => {}} hero />);
    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-haspopup', 'listbox');
    expect(combobox).toHaveAttribute('aria-label', 'Search projects');
  });

  it('handles empty project list', () => {
    render(<ProjectSearch value="" projList={[]} cmpPool={[]} projIndex={{}} onChange={() => {}} hero />);
    const input = screen.getByRole('searchbox');
    fireEvent.focus(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports keyboard enter to select', () => {
    const onChange = vi.fn();
    render(<ProjectSearch value="" projList={PROJ_LIST} cmpPool={CMP_POOL} projIndex={PROJ_INDEX} onChange={onChange} hero />);
    const input = screen.getByRole('searchbox');
    fireEvent.focus(input);

    const listbox = screen.getByRole('listbox');
    const first = within(listbox).getAllByRole('option')[0];
    fireEvent.keyDown(first, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('RIVIERE');
  });
});

describe('UI Components', () => {
  describe('StatCard', () => {
    it('renders label, value, and sub', () => {
      render(<StatCard label="Avg PSF" value="$2,200" sub="D03 CCR" />);
      expect(screen.getByText('Avg PSF')).toBeInTheDocument();
      expect(screen.getByText('$2,200')).toBeInTheDocument();
      expect(screen.getByText('D03 CCR')).toBeInTheDocument();
    });

    it('renders without sub', () => {
      render(<StatCard label="Count" value="500" />);
      expect(screen.getByText('Count')).toBeInTheDocument();
      expect(screen.getByText('500')).toBeInTheDocument();
    });
  });

  describe('Card', () => {
    it('renders children', () => {
      render(<Card><span>Card content</span></Card>);
      expect(screen.getByText('Card content')).toBeInTheDocument();
    });
  });

  describe('SectionHeader', () => {
    it('renders title and subtitle', () => {
      render(<SectionHeader title="Market Overview" sub="Key metrics" />);
      expect(screen.getByText('Market Overview')).toBeInTheDocument();
      expect(screen.getByText('Key metrics')).toBeInTheDocument();
    });

    it('renders without subtitle', () => {
      render(<SectionHeader title="Title Only" />);
      expect(screen.getByText('Title Only')).toBeInTheDocument();
    });
  });

  describe('NoteText', () => {
    it('renders children text', () => {
      render(<NoteText>Some helpful note</NoteText>);
      expect(screen.getByText('Some helpful note')).toBeInTheDocument();
    });
  });
});
