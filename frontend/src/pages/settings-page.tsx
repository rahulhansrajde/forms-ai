import { useEffect, useState, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleSection, PreferencesSection, ProfileSection, SecuritySection } from '../components/settings/settings-sections';
import { Button } from '../components/ui/button';
import { Icon } from '../components/ui/icon';
import { WorkspaceLayout } from '../layouts/workspace-layout';
import { useToast } from '../state/toast-context';
import { googleReturnMessage } from '../utils/google-return';
import styles from './settings-page.module.css';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'google', label: 'Google Forms' },
  { id: 'preferences', label: 'Preferences' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

function isSectionId(value: string | null): value is SectionId {
  return SECTIONS.some((section) => section.id === value);
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const requested = searchParams.get('section');
  const googleReturn = searchParams.get('google');
  const active: SectionId = googleReturn ? 'google' : isSectionId(requested) ? requested : 'profile';

  useEffect(() => {
    if (googleReturn) {
      notify(googleReturnMessage(googleReturn));
      setSearchParams({ section: 'google' }, { replace: true });
    }
  }, [googleReturn, notify, setSearchParams]);

  const select = (section: SectionId) => setSearchParams({ section }, { replace: true });

  const goBack = () => {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (historyIndex > 0) {
      navigate(-1);
    } else {
      navigate('/chat', { replace: true });
    }
  };

  const handleTabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = SECTIONS.findIndex((section) => section.id === active);
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = SECTIONS[(index + step + SECTIONS.length) % SECTIONS.length];
    if (next) {
      select(next.id);
      document.getElementById(`settings-tab-${next.id}`)?.focus();
    }
  };

  return (
    <WorkspaceLayout
      sidebarOpen={sidebarOpen}
      onSidebarChange={setSidebarOpen}
      onNewChat={() => navigate('/chat')}
      activeConversationId={null}
    >
      <div className={styles.page}>
        <div className={styles.content}>
          <Button variant="secondary" size="sm" icon={<Icon name="chevronLeft" size={16} />} className={styles.back} onClick={goBack}>
            Back
          </Button>
          <h1 className={styles.title}>Settings</h1>
          <div className={styles.layout}>
            <div className={styles.tabs} role="tablist" aria-label="Settings sections" aria-orientation="vertical" onKeyDown={handleTabKeys}>
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  id={`settings-tab-${section.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active === section.id}
                  aria-controls={`settings-panel-${section.id}`}
                  tabIndex={active === section.id ? 0 : -1}
                  className={styles.tab}
                  onClick={() => select(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </div>
            <div id={`settings-panel-${active}`} role="tabpanel" aria-labelledby={`settings-tab-${active}`} className={styles.panel} key={active}>
              {active === 'profile' ? <ProfileSection /> : null}
              {active === 'security' ? <SecuritySection /> : null}
              {active === 'google' ? <GoogleSection /> : null}
              {active === 'preferences' ? <PreferencesSection /> : null}
            </div>
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
