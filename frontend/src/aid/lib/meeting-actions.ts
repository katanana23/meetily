// Действия со встречей для списка и страницы встречи: те же команды ядра,
// что вызывает сайдбар оригинала (api_save_meeting_title, api_delete_meeting,
// open_meeting_folder). Удаление кладёт встречу и папку записи в корзину на 7 дней
// (meeting-trash.ts); строки базы стираются по сроку.
'use client';

import { invoke } from '@tauri-apps/api/core';
import { restoreMeeting, trashMeeting } from './meeting-trash';
import { aidToast } from './toasts';
import { t } from '@/aid/strings';

export async function renameMeeting(meetingId: string, title: string) {
  await invoke('api_save_meeting_title', { meetingId, title });
}

/** Удаление человеком: в корзину на 7 дней, оттуда можно вернуть (meeting-trash.ts). */
export async function deleteMeeting(meetingId: string) {
  await trashMeeting(meetingId);
}

/** Уведомление после удаления: «Встреча в корзине» и «Вернуть» прямо в нём. */
export function toastTrashed(meetingId: string) {
  aidToast.success(t('deleted'), {
    description: t('deletedHint'),
    action: {
      label: t('undoDelete'),
      onClick: () =>
        void restoreMeeting(meetingId).then(
          () => aidToast.success(t('restored')),
          (error) => aidToast.error(t('restoreFailed'), { description: String(error) }),
        ),
    },
  });
}

export async function openMeetingFolder(meetingId: string) {
  await invoke('open_meeting_folder', { meetingId });
}
