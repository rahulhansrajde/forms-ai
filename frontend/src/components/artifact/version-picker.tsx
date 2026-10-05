import type { FormVersionSummary, VersionSource } from '@forms-ai/contracts';
import { useCallback, useState } from 'react';
import { useServices } from '../../state/services-context';
import { useToast } from '../../state/toast-context';
import { errorMessage } from '../../utils/error-messages';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Menu, type MenuItem } from '../ui/menu';

const SOURCE_LABELS: Readonly<Record<VersionSource, string>> = {
  AI: 'AI edit',
  MANUAL: 'Manual edit',
  IMPORT: 'Imported',
  REGENERATION: 'Regenerated',
  SUGGESTION_ACCEPTANCE: 'Suggestions added',
};

interface VersionPickerProps {
  draftId: string;
  currentVersionId: string;
  currentVersionNumber: number;
  viewingVersionNumber: number;
  onSelect(version: FormVersionSummary): void;
}

export function VersionPicker({ draftId, currentVersionId, currentVersionNumber, viewingVersionNumber, onSelect }: VersionPickerProps) {
  const { drafts } = useServices();
  const { notify } = useToast();
  const [versions, setVersions] = useState<FormVersionSummary[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (loadedFor === currentVersionId) {
      return;
    }
    setVersions([]);
    try {
      const page = await drafts.versions(draftId, null);
      setVersions(page.items);
      setLoadedFor(currentVersionId);
    } catch (error) {
      notify(errorMessage(error));
    }
  }, [currentVersionId, draftId, drafts, loadedFor, notify]);

  const items: MenuItem[] = versions.map((version) => ({
    key: version.id,
    label: `Version ${version.versionNumber}${version.id === currentVersionId ? ' (latest)' : ''}`,
    description: `${SOURCE_LABELS[version.source]} · ${new Date(version.createdAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`,
    onSelect: () => onSelect(version),
  }));

  return (
    <Menu
      label="Version history"
      items={items.length > 0 ? items : [{ key: 'loading', label: 'Loading versions…', disabled: true, onSelect: () => undefined }]}
      renderTrigger={({ open, toggle, id, menuId }) => (
        <Button
          id={id}
          variant="secondary"
          size="sm"
          icon={<Icon name="history" size={16} />}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`Version ${viewingVersionNumber} of ${currentVersionNumber}. Open version history`}
          onClick={() => {
            void load();
            toggle();
          }}
        >
          v{viewingVersionNumber}
        </Button>
      )}
    />
  );
}
