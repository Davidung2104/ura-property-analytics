import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import useAppStore from '../stores/useAppStore';
import { SectionBoundary } from '../components/ErrorBoundary';
import Portfolio from '../components/portfolio/Portfolio';

export default function PortfolioPage() {
  const navigate = useNavigate();
  const { cmpPool, projList, projIndex, portfolio, updatePortfolio, syncStatus } = useAppStore();

  const handleViewProject = useCallback((name) => {
    useAppStore.getState().selectProject(name);
    navigate(`/project/${encodeURIComponent(name)}`);
  }, [navigate]);

  return (
    <SectionBoundary name="Portfolio">
      <section aria-label="Portfolio" style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px 40px' }}>
        <Portfolio
          cmpPool={cmpPool} projList={projList} projIndex={projIndex}
          onViewProject={handleViewProject}
          holdings={portfolio} setHoldings={updatePortfolio}
          syncStatus={syncStatus}
        />
      </section>
    </SectionBoundary>
  );
}
