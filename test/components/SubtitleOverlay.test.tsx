import { render, screen } from '@testing-library/react';
import SubtitleOverlay from '../../components/SubtitleOverlay';

describe('SubtitleOverlay', () => {
  it('renders source and target text correctly', () => {
    render(<SubtitleOverlay sourceText="Hello" targetText="Hola" />);
    
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hola')).toBeInTheDocument();
  });

  it('applies correct styling based on properties', () => {
    const { container } = render(
      <SubtitleOverlay 
        sourceText="Test" 
        targetText="Test" 
        isFetchingSubtitles={true}
      />
    );
    
    const overlay = container.querySelector('[style*="position:absolute"]');
    expect(overlay).toBeInTheDocument();
  });

  it('shows loading indicator when isFetchingSubtitles is true', () => {
    render(<SubtitleOverlay sourceText="" targetText="" isFetchingSubtitles={true} />);
    
    // Check for loading indicator
    expect(screen.getByText('Fetching subtitles...')).toBeInTheDocument();
  });

  it('applies correct font sizes', () => {
    render(<SubtitleOverlay sourceText="Source" targetText="Target" />);
    
    const sourceDiv = screen.getByText('Source');
    const targetDiv = screen.getByText('Target');
    
    expect(sourceDiv).toHaveStyle({
      fontSize: '22px'
    });
    
    expect(targetDiv).toHaveStyle({
      fontSize: '16px'
    });
  });
});