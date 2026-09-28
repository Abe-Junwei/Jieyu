import { useEffect, useState } from 'react';
import { t, useLocale } from '../i18n';
import { ModalPanel, PanelButton } from './ui';
import {
  EAF_TIER_ROLES,
  parseEafTierRole,
  type EafRolePromptTier,
  type EafTierRole,
} from '../utils/eafTierRole';

const ROLE_LABEL_KEY = {
  transcription: 'transcription.importDialog.tierRole.transcription',
  translation: 'transcription.importDialog.tierRole.translation',
  notes: 'transcription.importDialog.tierRole.notes',
  exclude: 'transcription.importDialog.tierRole.exclude',
} as const;

type EafTierRoleDialogProps = {
  isOpen: boolean;
  fileName: string;
  tiers: readonly EafRolePromptTier[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (roles: Record<string, EafTierRole>) => void;
};

export function EafTierRoleDialog({
  isOpen,
  fileName,
  tiers,
  busy = false,
  onClose,
  onConfirm,
}: EafTierRoleDialogProps) {
  const locale = useLocale();
  const [roles, setRoles] = useState<Record<string, EafTierRole>>({});

  useEffect(() => {
    if (!isOpen) return;
    const next: Record<string, EafTierRole> = {};
    for (const tier of tiers) next[tier.tierId] = tier.role;
    setRoles(next);
  }, [isOpen, tiers]);

  if (!isOpen) return null;

  return (
    <ModalPanel
      isOpen={isOpen}
      onClose={onClose}
      className="annotation-import-mismatch-dialog panel-design-match panel-design-match-dialog"
      ariaLabel={t(locale, 'transcription.importDialog.tierRoleTitle')}
      title={t(locale, 'transcription.importDialog.tierRoleTitle')}
      closeLabel={t(locale, 'transcription.importDialog.close')}
      footer={
        <>
          <PanelButton variant="ghost" onClick={onClose} disabled={busy}>
            {t(locale, 'transcription.importDialog.cancel')}
          </PanelButton>
          <PanelButton
            variant="primary"
            disabled={busy}
            onClick={() => {
              const next: Record<string, EafTierRole> = {};
              for (const tier of tiers) next[tier.tierId] = roles[tier.tierId] ?? tier.role;
              onConfirm(next);
            }}
          >
            {busy
              ? t(locale, 'transcription.importDialog.importing')
              : t(locale, 'transcription.importDialog.confirmImport')}
          </PanelButton>
        </>
      }
    >
      <div data-testid="eaf-tier-role-dialog">
        <p className="small-text">{fileName}</p>
        <p className="small-text">{t(locale, 'transcription.importDialog.tierRoleHint')}</p>
        {tiers.map((tier) => (
          <label key={tier.tierId} className="small-text">
            <span>{tier.tierId}</span>
            <select
              data-testid={`eaf-tier-role-${tier.tierId}`}
              value={roles[tier.tierId] ?? tier.role}
              disabled={busy}
              onChange={(event) => {
                const role = parseEafTierRole(event.target.value);
                if (!role) return;
                setRoles((current) => ({ ...current, [tier.tierId]: role }));
              }}
            >
              {EAF_TIER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(locale, ROLE_LABEL_KEY[role])}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </ModalPanel>
  );
}
