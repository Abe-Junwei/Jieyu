import { memo } from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { PanelButton } from '../ui';
import { JIEYU_MATERIAL_PANEL } from '../../utils/jieyuMaterialIcon';
import { getOrthographyBuilderMessages } from '../../i18n/messages';
import type { Locale } from '../../i18n';
import type { LayerActionPopoverMessages } from '../../i18n/messages';
import type { UseOrthographyPickerResult } from '../../hooks/orthography/useOrthographyPicker';
import type { LayerMetadataUpdateInput } from '../../types/layerMetadata';
import type { LayerActionType } from '../layerActionPopoverHelpers';

export type LayerActionPopoverCreateFooterProps = {
  action: LayerActionType;
  label: string;
  isLoading: boolean;
  orthographyPicker: UseOrthographyPickerResult;
  hasValidLanguage: boolean;
  customLanguageError: string;
  orthographySelectionError: string;
  translationCreateDisabledReason: string;
  transcriptionCreateDisabledReason: string;
  onCreate: () => void;
};

export const LayerActionPopoverCreateFooter = memo(function LayerActionPopoverCreateFooter({
  action,
  label,
  isLoading,
  orthographyPicker,
  hasValidLanguage,
  customLanguageError,
  orthographySelectionError,
  translationCreateDisabledReason,
  transcriptionCreateDisabledReason,
  onCreate,
}: LayerActionPopoverCreateFooterProps) {
  return (
    <PanelButton
      variant="primary"
      disabled={
        action === 'create-translation'
          ? isLoading ||
            orthographyPicker.submitting ||
            orthographyPicker.isCreating ||
            !hasValidLanguage ||
            Boolean(customLanguageError) ||
            Boolean(orthographySelectionError) ||
            translationCreateDisabledReason.length > 0
          : isLoading ||
            orthographyPicker.submitting ||
            orthographyPicker.isCreating ||
            !hasValidLanguage ||
            Boolean(customLanguageError) ||
            Boolean(orthographySelectionError) ||
            transcriptionCreateDisabledReason.length > 0
      }
      onClick={onCreate}
    >
      {label}
    </PanelButton>
  );
});

export type LayerActionPopoverBuilderBreadcrumbTitleProps = {
  locale: Locale;
  label: string;
  orthographyPicker: UseOrthographyPickerResult;
};

export const LayerActionPopoverBuilderBreadcrumbTitle = memo(
  function LayerActionPopoverBuilderBreadcrumbTitle({
    locale,
    label,
    orthographyPicker,
  }: LayerActionPopoverBuilderBreadcrumbTitleProps) {
    const builderMessages = getOrthographyBuilderMessages(locale);
    return (
      <span className="dialog-breadcrumb-title">
        <button
          type="button"
          className="dialog-breadcrumb-back"
          onClick={orthographyPicker.cancelCreate}
          aria-label={label}
        >
          <MaterialSymbol name="chevron_left" className={JIEYU_MATERIAL_PANEL} />
          <span>{label}</span>
        </button>
        <span className="dialog-breadcrumb-separator">/</span>
        <span className="dialog-breadcrumb-current">{builderMessages.panelTitle}</span>
      </span>
    );
  },
);

export type LayerActionPopoverBuilderFooterProps = {
  locale: Locale;
  orthographyPicker: UseOrthographyPickerResult;
};

export const LayerActionPopoverBuilderFooter = memo(function LayerActionPopoverBuilderFooter({
  locale,
  orthographyPicker,
}: LayerActionPopoverBuilderFooterProps) {
  const builderMessages = getOrthographyBuilderMessages(locale);
  return (
    <>
      <PanelButton
        variant="ghost"
        disabled={orthographyPicker.submitting}
        onClick={orthographyPicker.cancelCreate}
      >
        {builderMessages.cancelCreate}
      </PanelButton>
      <PanelButton
        variant="primary"
        disabled={orthographyPicker.submitting}
        onClick={() => {
          void orthographyPicker.createOrthography();
        }}
      >
        {orthographyPicker.submitting
          ? builderMessages.creating
          : orthographyPicker.requiresRenderWarningConfirmation
            ? builderMessages.confirmRiskAndCreate
            : builderMessages.createAndSelect}
      </PanelButton>
    </>
  );
});

export type LayerActionPopoverDeleteFooterProps = {
  deleteConfirm: { layerId: string; layerName: string; textCount: number } | null;
  isLoading: boolean;
  deleteLayerId: string;
  actionMessages: LayerActionPopoverMessages;
  onClose: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onDelete: () => void;
};

export const LayerActionPopoverDeleteFooter = memo(function LayerActionPopoverDeleteFooter({
  deleteConfirm,
  isLoading,
  deleteLayerId,
  actionMessages,
  onClose,
  onCancelDelete,
  onConfirmDelete,
  onDelete,
}: LayerActionPopoverDeleteFooterProps) {
  return (
    <>
      <PanelButton
        variant="ghost"
        onClick={deleteConfirm ? onCancelDelete : onClose}
        disabled={isLoading}
      >
        {actionMessages.cancel}
      </PanelButton>
      <PanelButton
        variant="danger"
        disabled={deleteConfirm ? isLoading : !deleteLayerId || isLoading}
        onClick={deleteConfirm ? onConfirmDelete : onDelete}
      >
        {deleteConfirm ? actionMessages.confirmDelete : actionMessages.deleteAction}
      </PanelButton>
    </>
  );
});

export type LayerActionPopoverEditFooterProps = {
  isLoading: boolean;
  layerId: string | undefined;
  updateLayerMetadata?: (layerId: string, input: LayerMetadataUpdateInput) => Promise<boolean>;
  actionMessages: LayerActionPopoverMessages;
  onClose: () => void;
  onSaveMetadata: () => void;
};

export const LayerActionPopoverEditFooter = memo(function LayerActionPopoverEditFooter({
  isLoading,
  layerId,
  updateLayerMetadata,
  actionMessages,
  onClose,
  onSaveMetadata,
}: LayerActionPopoverEditFooterProps) {
  return (
    <>
      <PanelButton variant="ghost" onClick={onClose} disabled={isLoading}>
        {actionMessages.cancel}
      </PanelButton>
      <PanelButton
        variant="primary"
        disabled={isLoading || !layerId || !updateLayerMetadata}
        onClick={onSaveMetadata}
      >
        {actionMessages.saveMetadata}
      </PanelButton>
    </>
  );
});
