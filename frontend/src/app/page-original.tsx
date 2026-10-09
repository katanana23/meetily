'use client';

// Оригинальная главная страница Meetily.
// Используется когда NEXT_PUBLIC_UI=original.

import { TranscriptPanel } from './_components/TranscriptPanel';
import { StatusOverlays } from './_components/StatusOverlays';
import { useState } from 'react';
import { ModalType } from '@/hooks/useModalState';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';

export default function OriginalHome() {
  const [showModal, setShowModal] = useState<ModalType>('errorAlert');
  const { status } = useRecordingState();
  const { isCollapsed } = useSidebar();

  const isProcessingStop = status === RecordingStatus.PROCESSING_TRANSCRIPTS || status === RecordingStatus.STOPPING;
  const isStopping = status === RecordingStatus.STOPPING;
  const isProcessing = status === RecordingStatus.PROCESSING_TRANSCRIPTS;
  const isSaving = status === RecordingStatus.SAVING;
  const sidebarCollapsed = isCollapsed;

  return (
    <>
      <TranscriptPanel
        isProcessingStop={isProcessingStop}
        isStopping={isStopping}
        showModal={setShowModal}
      />
      <StatusOverlays
        isProcessing={isProcessing}
        isSaving={isSaving}
        sidebarCollapsed={sidebarCollapsed}
      />
    </>
  );
}
