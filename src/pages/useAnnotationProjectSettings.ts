import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadCharacterVariantLines,
  saveCharacterVariantLines,
} from '../app/languageAssetPageAccess';
import { parseCharacterVariantLines } from './annotation/annotationCharacterVariants';
import {
  EMPTY_ANNOTATION_DOCUMENT_LAYOUT,
  type AnnotationDocumentLayout,
} from './annotation/annotationIgtLines';
import { loadAnnotationDocumentLayout } from './annotation/annotationDocumentLayoutStore';

export function useAnnotationProjectSettings(textId: string) {
  const [variantText, setVariantText] = useState('');
  const [layout, setLayout] = useState<AnnotationDocumentLayout>(EMPTY_ANNOTATION_DOCUMENT_LAYOUT);
  const [layoutReady, setLayoutReady] = useState(false);
  const layoutTextId = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const layoutQuery = useQuery({
    queryKey: ['annotation-document-layout', textId],
    enabled: textId.length > 0,
    queryFn: () => loadAnnotationDocumentLayout(textId),
  });
  const variantQuery = useQuery({
    queryKey: ['project-character-variants', textId],
    enabled: textId.length > 0,
    queryFn: () => loadCharacterVariantLines(textId),
  });
  useEffect(() => {
    if (layoutTextId.current !== textId) {
      layoutTextId.current = textId;
      setLayout(EMPTY_ANNOTATION_DOCUMENT_LAYOUT);
      setLayoutReady(false);
    }
    if (layoutQuery.data === undefined) return;
    setLayout(layoutQuery.data);
    setLayoutReady(true);
  }, [layoutQuery.data, textId]);
  useEffect(() => {
    if (variantQuery.data !== undefined) setVariantText(variantQuery.data);
  }, [variantQuery.data]);
  const variantGroups = useMemo(() => parseCharacterVariantLines(variantText), [variantText]);
  const onVariantBlur = () => {
    if (textId.length === 0) return;
    void saveCharacterVariantLines(textId, variantText).then(() =>
      queryClient.invalidateQueries({ queryKey: ['project-character-variants', textId] }),
    );
  };
  return {
    layout,
    setLayout,
    layoutReady,
    variantText,
    setVariantText,
    variantGroups,
    onVariantBlur,
    invalidateLayout: () =>
      queryClient.invalidateQueries({ queryKey: ['annotation-document-layout', textId] }),
  };
}
