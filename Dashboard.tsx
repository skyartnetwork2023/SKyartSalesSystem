import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import DashboardContent from './DashboardContent';
import Voucher from './Voucher';
import CashFlows from './CashFlows';
import Opex from './Opex';
import Capex from './Capex';
import Investment from './Investment';
import Visualization from './Visualization';
import Loans from './Loans';
import Planning from './Planning';
import RealtimeDateBar from './RealtimeDateBar';
import CaptivePortal from '../CaptivePortal';
import PortalManagement from './PortalManagement';

const SECTION_ORDER = [
  'Dashboard',
  'Voucher',
  'Cash Flows',
  'Opex',
  'Capex',
  'Investment',
  'Visualization',
  'Loans',
  'Planning',
  'Captive Portal',
  'Portal Management',
] as const;

type Section = (typeof SECTION_ORDER)[number];

const SECTION_ROUTES: Partial<Record<Section, string>> = {
  'Captive Portal': '/captiveportal',
  'Portal Management': '/portal-management',
  'Cash Flows': '/cashflows',
};

interface DashboardProps {
  initialSection?: Section;
}

export default function Dashboard({ initialSection }: DashboardProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const defaultSection: Section = initialSection && SECTION_ORDER.includes(initialSection)
    ? initialSection
    : 'Dashboard';
  const [activeSection, setActiveSection] = useState<Section>(defaultSection);

  useEffect(() => {
    if (initialSection && SECTION_ORDER.includes(initialSection)) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  useEffect(() => {
    const targetRoute = SECTION_ROUTES[activeSection];
    if (targetRoute) {
      if (location.pathname !== targetRoute) {
        navigate(targetRoute, { replace: true });
      }
      return;
    }

    const routedSections = Object.values(SECTION_ROUTES).filter((value): value is string => Boolean(value));
    if (routedSections.includes(location.pathname)) {
      navigate('/', { replace: true });
    }
  }, [activeSection, location.pathname, navigate]);

  const renderContent = () => {
    switch (activeSection) {
      case 'Voucher':
        return <Voucher />;
      case 'Cash Flows':
        return <CashFlows />;
      case 'Opex':
        return <Opex />;
      case 'Capex':
        return <Capex />;
      case 'Investment':
        return <Investment />;
      case 'Visualization':
        return <Visualization />;
      case 'Loans':
        return <Loans />;
      case 'Planning':
        return <Planning />;
      case 'Captive Portal':
        return <CaptivePortal />;
      case 'Portal Management':
        return <PortalManagement />;
      default:
        return <DashboardContent />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 dark:bg-slate-950 overflow-hidden">
      <RealtimeDateBar className="z-40" />
      <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">
        <Sidebar onSectionChange={setActiveSection} activeSection={activeSection} />
        <main className="flex-1 min-h-0 overflow-auto pb-16 md:pb-0">{/* pb-16 for mobile bottom nav */}
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
